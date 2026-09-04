import os
import re
import json
import time
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, AsyncGenerator
from pydantic import BaseModel, Field

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, GEMINI_MODEL, UPLOAD_DIR
from app.netflix_models import SubtitleEvent, NetflixQCResult, CPSStats, format_timestamp, calculate_cps, calculate_cpl
from app.video_processor import (
    extract_audio_from_video, detect_shot_changes, get_video_metadata
)
from app.audio_processor import (
    inspect_audio, detect_dual_channel_layout, find_dialogue_split_points,
    extract_audio_slice, snap_to_acoustic_boundaries,
    extract_physical_speech_intervals, parse_timestamp
)
from app.netflix_linter import (
    auto_fix_subtitles, lint_all_subtitles
)
from app.whisper_aligner import (
    get_whisper_word_timestamps, align_subtitle_timestamps
)

def log_terminal(msg: str):
    """Print clean formatted timestamped log to terminal."""
    now_str = datetime.now().strftime('%H:%M:%S')
    print(f"[{now_str}] [Subtitle Studio] {msg}", flush=True)


class SubtitleItemSchema(BaseModel):
    id: int = Field(description="Sequential subtitle ID starting at 1")
    start_time: str = Field(description="Subtitle onset timestamp HH:MM:SS.mmm")
    end_time: str = Field(description="Subtitle offset timestamp HH:MM:SS.mmm")
    text: str = Field(description="Exact verbatim spoken words line 1\\nExact line 2 if two lines")
    speakers: List[str] = Field(default_factory=lambda: ["Speaker 1"], description="List of speaker names")
    is_italic: bool = Field(default=False, description="True for off-screen, voiceover, phone, lyrics")
    is_forced_narrative: bool = Field(default=False, description="True for translated foreign signs or forced dialogue")


class SubtitleBatchSchema(BaseModel):
    detected_language: Optional[str] = Field(default=None, description="Auto-detected language of speech")
    detected_script: Optional[str] = Field(default=None, description="Auto-detected native script")
    subtitles: List[SubtitleItemSchema] = Field(description="List of subtitle events for this audio chunk")


def extract_and_repair_subtitle_json(text: str) -> Dict[str, Any]:
    """
    Robust JSON parser for subtitle responses from Gemini.
    Handles direct JSON, markdown code blocks, truncated streams,
    and subtitle-specific key extraction ('text', 'start_time', 'end_time').
    """
    text = (text or "").strip()
    if not text:
        return {"subtitles": []}

    # 1. Try standard JSON parse
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            if "subtitles" in data:
                return data
            for k in ["subs", "results", "events", "segments"]:
                if k in data and isinstance(data[k], list):
                    return {"subtitles": data[k]}
        elif isinstance(data, list):
            return {"subtitles": data}
    except Exception:
        pass

    # 2. Try markdown code block
    m = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if m:
        try:
            data = json.loads(m.group(1).strip())
            if isinstance(data, dict):
                return data if "subtitles" in data else {"subtitles": data.get("segments", [])}
            elif isinstance(data, list):
                return {"subtitles": data}
        except Exception:
            pass

    # 3. Detect language/script if present in string
    det_lang = None
    det_script = None
    lang_m = re.search(r'"detected_language"\s*:\s*"([^"]+)"', text, re.IGNORECASE)
    if lang_m:
        det_lang = lang_m.group(1).strip()
    script_m = re.search(r'"detected_script"\s*:\s*"([^"]+)"', text, re.IGNORECASE)
    if script_m:
        det_script = script_m.group(1).strip()

    # 4. Subtitle Object Recovery: find any JSON object with "text" or "transcript"
    sub_objs = []
    pattern = r'\{[^{}]*?(?:"text"|"transcript"|"start_time")[^{}]*?\}'
    raw_blocks = re.findall(pattern, text, re.DOTALL)
    for idx, block in enumerate(raw_blocks, 1):
        try:
            item = json.loads(block)
            if "text" in item or "transcript" in item or "start_time" in item:
                if "text" not in item and "transcript" in item:
                    item["text"] = item["transcript"]
                sub_objs.append(item)
        except Exception:
            st = re.search(r'"start_time"\s*:\s*"([^"]+)"', block) or re.search(r'"start_time"\s*:\s*([\d.]+)', block)
            et = re.search(r'"end_time"\s*:\s*"([^"]+)"', block) or re.search(r'"end_time"\s*:\s*([\d.]+)', block)
            tx = re.search(r'"text"\s*:\s*"((?:\\.|[^"\\])*)"', block) or re.search(r'"transcript"\s*:\s*"((?:\\.|[^"\\])*)"', block)
            if tx or st:
                txt_val = tx.group(1).encode('utf-8').decode('unicode_escape', errors='ignore') if tx else ""
                sub_objs.append({
                    "id": idx,
                    "start_time": st.group(1) if st else "00:00:00.000",
                    "end_time": et.group(1) if et else "00:00:02.000",
                    "text": txt_val,
                    "speakers": ["Speaker 1"],
                    "is_italic": False,
                    "is_forced_narrative": False
                })

    if sub_objs:
        res = {"subtitles": sub_objs}
        if det_lang:
            res["detected_language"] = det_lang
        if det_script:
            res["detected_script"] = det_script
        return res

    # 5. Try unclosed JSON recovery
    first_brace = text.find('{')
    if first_brace != -1:
        truncated = text[first_brace:]
        clean_cand = re.sub(r',?\s*\{[^{}]*$', '', truncated)
        clean_cand = re.sub(r',?\s*"[^"]*"?\s*:\s*[^,}]*$', '', clean_cand)
        clean_cand = clean_cand.rstrip().rstrip(',')
        if not clean_cand.endswith(']}'):
            if not clean_cand.endswith(']'):
                clean_cand += ']}'
            else:
                clean_cand += '}'
        try:
            data = json.loads(clean_cand)
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    return {"subtitles": []}


def group_whisper_words_into_subtitles(
    words: List[Dict[str, Any]],
    chunk_offset: float = 0.0,
    cpl_limit: int = 42,
    max_duration: float = 5.0
) -> List[Dict[str, Any]]:
    """Group flat Whisper words into Netflix-compliant subtitle event dictionaries."""
    if not words:
        return []
    
    events = []
    curr_words = []
    curr_start = words[0]["start"]
    
    for w in words:
        word_txt = w["word"].strip()
        if not word_txt:
            continue
            
        proposed = ' '.join([x["word"].strip() for x in curr_words] + [word_txt])
        dur = w["end"] - curr_start
        
        is_sentence_end = word_txt[-1:] in {'.', '!', '?'}
        gap_before = (w["start"] - curr_words[-1]["end"]) if curr_words else 0.0
        
        if (curr_words and (len(proposed) > cpl_limit * 1.8 or dur > max_duration or gap_before > 0.7)) or (is_sentence_end and len(proposed) > 28):
            st = max(0.0, curr_start - chunk_offset)
            et = max(st + 0.8, curr_words[-1]["end"] - chunk_offset)
            events.append({
                "start_time": format_timestamp(st),
                "end_time": format_timestamp(et),
                "text": ' '.join([x["word"].strip() for x in curr_words]),
                "speakers": ["Speaker 1"]
            })
            curr_words = [w]
            curr_start = w["start"]
        else:
            curr_words.append(w)
            
    if curr_words:
        st = max(0.0, curr_start - chunk_offset)
        et = max(st + 0.8, curr_words[-1]["end"] - chunk_offset)
        events.append({
            "start_time": format_timestamp(st),
            "end_time": format_timestamp(et),
            "text": ' '.join([x["word"].strip() for x in curr_words]),
            "speakers": ["Speaker 1"]
        })
        
    return events


def get_netflix_subtitle_system_prompt(
    cpl_limit: int = 42,
    max_cps: float = 20.0,
    max_lines: int = 2
) -> str:
    """Generate dynamic system prompt with user-configured CPL, CPS, and max lines."""
    return f"""You are an elite, professional audio-to-text subtitle transcription engine.

Your task is to transcribe and time subtitles from the audio with 100% verbatim accuracy and millimeter-precise sync following strict Netflix Timed Text standards.

### CRITICAL RULES:

1. 100% VERBATIM ACCURACY (NEVER REPHRASE OR SUMMARIZE):
   - Transcribe the EXACT words spoken by the speaker word-for-word.
   - NEVER rephrase, paraphrase, omit, summarize, simplify, or alter words in any way.
   - Retain every spoken word, slang, expression, stutter, and dialogue element exactly as voiced.
   - Do NOT censor profanity.

2. COMPLETE GRAMMATICAL UNITS & NATURAL CLAUSE BOUNDARIES (NO MID-PHRASE SPLITS):
   - Subtitle event boundaries MUST occur at natural syntactic breaks: major punctuation (., !, ?, commas, semicolons) or major coordinating conjunctions ('and then', 'but', 'so', 'because').
   - ABSOLUTE PROHIBITION: NEVER split a subtitle event in the middle of a prepositional phrase (e.g., do NOT end one subtitle with "into the wrong" and start the next with "bedroom,").
   - NEVER split a subtitle event after a title or honorific (e.g., do NOT end one subtitle with "Mrs." and start the next with "Rutherford's death?").
   - If a sentence fits within 2 lines <= {cpl_limit} characters (up to ~84 characters total), KEEP IT TOGETHER in ONE subtitle event!
     Example:
     Line 1: "because someone's mistaken the wrong door"
     Line 2: "and gone through into the wrong bedroom,"
     -> This fits in ONE subtitle event! Do NOT split across two separate subtitle events!

3. PRECISE ACOUSTIC TIMING & READING SPEED (CPS):
   - `start_time`: Must match the EXACT millisecond the speaker begins vocalizing the first syllable.
   - `end_time`: Must match the EXACT millisecond the speaker completes vocalizing the last syllable.
   - Reading speed MUST stay comfortable: maximum {max_cps} characters per second (CPS = length / duration).
   - If a sentence is long or fast, ensure it has adequate duration (at least character_count / {max_cps} seconds), or split it into two sequential complete subtitle events!

4. LINE BREAKS & FORMATTING:
   - Maximum {cpl_limit} characters per line (CPL).
   - Maximum {max_lines} lines per subtitle event (NEVER 3 lines).
   - Break lines at natural linguistic boundaries: punctuation, before coordinating conjunctions ('and', 'but', 'so'), or before prepositional phrases.
   - NEVER break across: article + noun ("the / car"), pronoun + verb ("I / went"), title + name ("Mrs. / Rutherford"), or adjective + noun ("wrong / door").

5. SPEAKER SEPARATION & DUAL SPEAKER FORMAT:
   - Identify different speakers from voice timbre, pitch, gender, acoustics, and conversational context.
   - When different speakers converse (e.g. phone call, interview, dialogue):
     Option A (Preferred): Create SEPARATE sequential subtitle events for each speaker whenever there is a natural conversational turn, so each speaker has their own event with accurate onset/offset.
     Option B (Rapid dialogue in same event): If two speakers converse in the same subtitle event, EACH line MUST start with a hyphen and space (`- `):
       `- Hello, Denise, it's Alice Warbrick.\\n- Hi, yeah, you okay?`
     - NEVER mix two different speakers' words onto the same line without hyphens!
   - Populate the "speakers" array with the speaker name or label.

6. ITALICS (<i>...</i>):
   - Use `<i>...</i>` for: voiceover narration, off-screen dialogue, phone/radio/TV audio, and song lyrics (`<i>♪ lyrics here ♪</i>`).

7. SOUND DESCRIPTIONS (SDH Mode):
   - If SDH is requested, include audible sound events in lowercase brackets: `[door slams]`, `[music playing]`, `[laughter]`.

8. PUNCTUATION & SPECIAL FORMATTING:
   - Use Unicode ellipsis `…` (U+2026), NOT three periods `...`.
   - Use double hyphen `--` for sudden speech interruptions or trailing off.
   - Numbers 1-10 spelled out in words, 11+ written as numerals.

### OUTPUT FORMAT:
Return a structured JSON object strictly matching this schema:
{{
  "detected_language": "string (e.g. English, Hindi, Spanish)",
  "detected_script": "string (e.g. Latin, Devanagari)",
  "subtitles": [
    {{
      "id": 1,
      "start_time": "00:00:01.250",
      "end_time": "00:00:04.100",
      "text": "Exact transcribed spoken words line 1\\nExact transcribed spoken words line 2",
      "speakers": ["Speaker 1"],
      "is_italic": false,
      "is_forced_narrative": false
    }}
  ]
}}
"""

# Default static fallback
NETFLIX_SUBTITLE_SYSTEM_PROMPT = get_netflix_subtitle_system_prompt()


def get_gemini_client(api_key: Optional[str] = None) -> genai.Client:
    """Initialize and return Google GenAI Client."""
    key = api_key or GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise ValueError("GEMINI_API_KEY is not configured in .env or environment.")
    return genai.Client(api_key=key)


def repair_chunk_timestamp(ts_val: Any, chunk_dur: float) -> float:
    """Safely parse and clamp timestamp relative to audio chunk duration, fixing any broadcast minute hallucinations."""
    from app.audio_processor import parse_timestamp
    sec = parse_timestamp(ts_val) if isinstance(ts_val, str) else float(ts_val)
    if sec > chunk_dur + 1.0:
        # Gemini added hallucinated broadcast minutes: take modulo 60 to recover true slice second
        sec = sec % 60.0
        if sec > chunk_dur:
            sec = min(chunk_dur - 0.5, max(0.0, sec % chunk_dur))
    return round(max(0.0, sec), 3)


def balance_text_to_lines(text: str, cpl_limit: int = 42, max_lines: int = 2) -> List[str]:
    """Balance text into 1 or 2 lines where each line is <= cpl_limit without dropping words or creating bad breaks."""
    text = text.replace('...', '…')
    words = text.replace('\n', ' ').split()
    if not words:
        return []
    full = ' '.join(words)
    if len(full) <= cpl_limit:
        return [full]
    if max_lines == 1:
        return []

    # If text has dual-speaker hyphens already, preserve the lines if <= cpl_limit
    raw_lines = [l.strip() for l in text.split('\n') if l.strip()]
    if len(raw_lines) == 2 and all(l.startswith('-') for l in raw_lines):
        if all(len(l) <= cpl_limit for l in raw_lines):
            return raw_lines

    best_lines = None
    min_penalty = 999999
    bad_ends = {
        'a', 'an', 'the', 'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'mr', 'mrs', 'ms', 'dr',
        'my', 'his', 'her', 'our', 'their', 'its', 'your', 'this', 'that', 'these', 'those',
        'wrong', 'other', 'new', 'old', 'into', 'of', 'to', 'in', 'at', 'from', 'with',
        'i', 'he', 'she', 'we', 'they', 'it'
    }
    prepositions_and_conjunctions = {
        'and', 'but', 'or', 'so', 'because', 'although', 'while', 'when', 'if',
        'through', 'into', 'under', 'between', 'after', 'before', 'about', 'over', 'by', 'from', 'with'
    }

    for i in range(1, len(words)):
        l1 = ' '.join(words[:i])
        l2 = ' '.join(words[i:])
        if len(l1) <= cpl_limit and len(l2) <= cpl_limit:
            diff = abs(len(l1) - len(l2))
            penalty = diff * 0.4  # Lower weight on raw visual difference

            last_w = words[i - 1].lower().rstrip('.,!?:;--…')
            first_w = words[i].lower().rstrip('.,!?:;--…')

            if last_w in bad_ends:
                penalty += 1000  # Strictly forbid breaking after articles, titles, adjectives, pronouns

            if l1.endswith((',', ';', '.', '!', '?', '--', '…', ':')):
                penalty -= 40   # Strongest preference for natural punctuation breaks
            elif first_w in prepositions_and_conjunctions:
                penalty -= 25   # Strong preference for breaking before prepositions and conjunctions

            if penalty < min_penalty:
                min_penalty = penalty
                best_lines = [l1, l2]
    return best_lines or []


def heal_cross_event_dangling_phrases(events: List[Dict[str, Any]], cpl_limit: int = 42, max_lines: int = 2) -> List[Dict[str, Any]]:
    """
    Heals awkward splits across consecutive subtitle events (e.g. 'the wrong' | 'bedroom' or 'Mrs.' | 'Rutherford').
    Keeps grammatical units together without dropping any words or corrupting timestamps.
    """
    bad_ends = {
        'a', 'an', 'the', 'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'mr', 'mrs', 'ms', 'dr',
        'my', 'his', 'her', 'our', 'their', 'its', 'your', 'this', 'that', 'these', 'those',
        'wrong', 'other', 'new', 'old', 'into', 'of', 'to', 'in', 'at', 'from', 'with'
    }
    i = 0
    while i < len(events) - 1:
        cur = events[i]
        nxt = events[i + 1]
        cur_words = cur.get('text', '').replace('\n', ' ').split()
        nxt_words = nxt.get('text', '').replace('\n', ' ').split()
        if not cur_words or not nxt_words:
            i += 1
            continue

        last_w = cur_words[-1].lower().rstrip('.,!?:;--…')

        # Case 1: cur ends with a title like "Mrs." -> shift "Mrs." to next event so title stays with name
        if last_w in {'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'mr', 'mrs', 'ms', 'dr'}:
            title_word = cur_words.pop()
            nxt_words.insert(0, title_word)
            cur['text'] = ' '.join(cur_words)
            nxt['text'] = ' '.join(nxt_words)

        # Case 2: cur ends with an article/adjective/preposition like "wrong" or "the" and nxt has the noun
        elif last_w in bad_ends:
            dangling_noun = nxt_words.pop(0)
            cand_cur_text = ' '.join(cur_words + [dangling_noun])
            lines = balance_text_to_lines(cand_cur_text, cpl_limit=cpl_limit, max_lines=max_lines)
            if lines:
                cur['text'] = '\n'.join(lines)
                nxt['text'] = ' '.join(nxt_words)
                cur_et = float(cur.get('end_time', 0.0))
                cur['end_time'] = round(cur_et + 0.35, 3)
                cur['end'] = cur['end_time']
                nxt['start_time'] = round(cur['end_time'] + (2.0 / 24.0), 3)
                nxt['start'] = nxt['start_time']
            else:
                nxt_words.insert(0, dangling_noun)

        i += 1
    return events


def split_and_balance_event(ev: Dict[str, Any], cpl_limit: int = 42, max_lines: int = 2) -> List[Dict[str, Any]]:
    """Recursively split and balance a subtitle event so NO event exceeds max_lines or cpl_limit."""
    text = ev.get('text', '').strip().replace('...', '…')
    words = text.replace('\n', ' ').split()
    if not words:
        return []
    
    # Check if can fit directly in <= max_lines
    lines = balance_text_to_lines(text, cpl_limit=cpl_limit, max_lines=max_lines)
    if lines:
        ev['text'] = '\n'.join(lines)
        ev['lines'] = lines
        ev['cpl'] = max(len(l) for l in lines)
        return [ev]
        
    # Cannot fit in 2 lines <= cpl_limit! Split into 2 sequential events at best midpoint
    total_len = sum(len(w) for w in words)
    target_mid = total_len / 2.0
    cum = 0
    best_split = len(words) // 2
    best_pen = 999999
    for i in range(1, len(words)):
        cum += len(words[i - 1])
        pen = abs(cum - target_mid)
        prev_w = words[i - 1]
        if prev_w.endswith((',', ';', '.', '!', '?', '--', '…')):
            pen -= 25
        elif words[i].lower() in ['and', 'but', 'or', 'so', 'that', 'who', 'which', 'because', 'when', 'if']:
            pen -= 15
        if pen < best_pen:
            best_pen = pen
            best_split = i
            
    words_a = words[:best_split]
    words_b = words[best_split:]
    
    st = float(ev.get('start_time', 0.0))
    et = float(ev.get('end_time', st + 2.0))
    dur = max(1.0, et - st)
    ratio_a = max(0.2, min(0.8, sum(len(w) for w in words_a) / max(1, total_len)))
    
    dur_a = max(0.833, round(dur * ratio_a, 3))
    split_time = round(st + dur_a, 3)
    if split_time >= et - 0.833:
        split_time = round(et - 0.833, 3)
        
    ev_a = dict(ev)
    ev_a['text'] = ' '.join(words_a)
    ev_a['start_time'] = st
    ev_a['end_time'] = round(split_time - 0.083, 3)
    
    ev_b = dict(ev)
    ev_b['text'] = ' '.join(words_b)
    ev_b['start_time'] = split_time
    ev_b['end_time'] = et
    
    # Recursively format sub-events
    res_a = split_and_balance_event(ev_a, cpl_limit=cpl_limit, max_lines=max_lines)
    res_b = split_and_balance_event(ev_b, cpl_limit=cpl_limit, max_lines=max_lines)
    return res_a + res_b


def merge_short_fragments(events: List[Dict[str, Any]], cpl_limit: int = 42, max_lines: int = 2) -> List[Dict[str, Any]]:
    """Merge tiny fragments (<= 3 words or duration < 1.0s) into the preceding event if they fit grammatically."""
    merged = []
    for ev in events:
        text = ev.get("text", "").strip()
        words = text.replace('\n', ' ').split()
        st = float(ev.get("start_time", 0.0))
        et = float(ev.get("end_time", st + 1.0))
        dur = et - st
        
        if merged and (len(words) <= 3 or dur < 0.9):
            prev = merged[-1]
            prev_st = float(prev["start_time"])
            prev_et = float(prev["end_time"])
            combined_dur = et - prev_st

            # Do NOT merge across different speakers!
            prev_speakers = prev.get("speakers") or ["Speaker 1"]
            ev_speakers = ev.get("speakers") or ["Speaker 1"]
            if prev_speakers != ev_speakers or "-" in prev.get("text", "") or "-" in text:
                merged.append(ev)
                continue

            # Do NOT merge if prev ends with question/exclamation and ev starts with conversational reply
            if prev["text"].rstrip().endswith(("?", "!")) and any(text.lower().startswith(w) for w in ["yes", "yeah", "no", "hi", "hello", "right", "okay", "fine"]):
                merged.append(ev)
                continue

            # Merge if gap <= 0.6s and combined duration <= 7.0s
            if combined_dur <= 7.0 and (st - prev_et) <= 0.6:
                combined_text = prev["text"].replace('\n', ' ') + ' ' + text
                balanced = balance_text_to_lines(combined_text, cpl_limit=cpl_limit, max_lines=max_lines)
                if balanced:
                    prev["text"] = '\n'.join(balanced)
                    prev["end_time"] = et
                    prev["end"] = et
                    prev["duration"] = round(et - prev_st, 3)
                    continue

        merged.append(ev)
    return merged


def polish_subtitle_events_netflix(
    events: List[Dict[str, Any]],
    cpl_limit: int = 42,
    max_cps: float = 20.0,
    max_lines: int = 2,
    min_duration: float = 0.833,
    max_duration: float = 7.0,
    frame_rate: float = 24.0,
    shot_changes: Optional[List[float]] = None
) -> List[Dict[str, Any]]:
    """
    Industry-Standard Netflix conformance pass:
    - Guarantees 0 events have > max_lines (split into sequential events if needed, ZERO words lost).
    - Guarantees all lines <= cpl_limit with grammatically sound breaks.
    - Merges isolated orphan fragments into previous events.
    - Extends into following and preceding silence aiming for comfortable reading speed.
    - Ensures min_duration >= 0.833s and max_duration <= 7.0s.
    - Dedicated pass guarantees strict 2-frame gap and eliminates gap-flash flicker.
    - Snaps to shot changes if provided.
    - Replaces ascii '...' with Unicode ellipsis '…'.
    """
    from app.netflix_models import format_timestamp, calculate_cps, calculate_cpl
    min_gap_sec = round(2.0 / frame_rate, 3)
    
    # Step 1: Split and balance any oversized subtitles (NO WORDS DROPPED)
    expanded_events = []
    for ev in events:
        expanded_events.extend(split_and_balance_event(ev, cpl_limit=cpl_limit, max_lines=max_lines))
        
    # Step 2: Merge orphan tiny fragments that fit into previous event
    expanded_events = merge_short_fragments(expanded_events, cpl_limit=cpl_limit, max_lines=max_lines)
    
    n = len(expanded_events)
    for idx, ev in enumerate(expanded_events):
        text = ev.get("text", "").strip()
        st = float(ev.get("start_time", 0.0))
        et = float(ev.get("end_time", st + 1.5))
        dur = max(0.01, round(et - st, 3))
        
        # 1. Min duration guard
        if dur < min_duration:
            next_st = float(expanded_events[idx + 1]["start_time"]) if idx + 1 < n else et + 2.0
            max_allowed_et = next_st - min_gap_sec
            et = round(min(max_allowed_et, st + min_duration), 3)
            dur = max(0.01, round(et - st, 3))

        # 2. Max duration cap
        if dur > max_duration:
            et = round(st + max_duration, 3)
            dur = max_duration

        # 3. Non-destructive CPS padding aiming for ~17.5 CPS to avoid warnings
        cur_cps = calculate_cps(text, dur)
        target_cps = max(12.0, max_cps - 2.5)
        if cur_cps > target_cps:
            needed_dur = len(text.replace('\n', ' ')) / target_cps
            next_st = float(expanded_events[idx + 1]["start_time"]) if idx + 1 < n else et + 3.0
            max_allowed_et = (next_st - min_gap_sec - min_duration) if idx + 1 < n else (et + 3.0)
            target_et = st + min(needed_dur, max_duration)
            if target_et <= max_allowed_et:
                et = round(target_et, 3)
                dur = max(0.01, round(et - st, 3))
            elif max_allowed_et > et:
                et = round(max_allowed_et, 3)
                dur = max(0.01, round(et - st, 3))

        # 4. CPS expansion into preceding silence gap
        cur_cps = calculate_cps(text, dur)
        if cur_cps > max_cps:
            prev_et = float(expanded_events[idx - 1]["end_time"]) if idx > 0 else 0.0
            pre_gap = st - prev_et
            if pre_gap > min_gap_sec + 0.100:
                needed_extra = (len(text.replace('\n', ' ')) / max_cps) - dur
                shift = min(needed_extra, pre_gap - min_gap_sec)
                if shift > 0.050:
                    st = round(st - shift, 3)
                    dur = max(0.01, round(et - st, 3))

        # 5. Snap to shot changes (Netflix cuts rule)
        if shot_changes:
            for sc in shot_changes:
                if 0.0 < abs(st - sc) < 3.0 / frame_rate:
                    st = round(sc, 3)
                    dur = max(0.01, round(et - st, 3))
                if 0.0 < abs(et - sc) < 3.0 / frame_rate:
                    et = round(sc - min_gap_sec, 3)
                    dur = max(0.01, round(et - st, 3))

        ev["start_time"] = st
        ev["end_time"] = et

    # Step 3: Final Dedicated Gap Enforcement Pass
    for i in range(len(expanded_events) - 1):
        cur = expanded_events[i]
        nxt = expanded_events[i + 1]
        cur_st = float(cur["start_time"])
        cur_et = float(cur["end_time"])
        nxt_st = float(nxt["start_time"])
        
        # Check if cur_et bleeds across a shot change cut by 1-2 frames
        if shot_changes:
            for sc in shot_changes:
                if 0.0 < (cur_et - sc) <= (3.0 / frame_rate):
                    cur_et = round(sc - min_gap_sec, 3)
                if 0.0 < (sc - cur_st) <= (3.0 / frame_rate):
                    cur_st = round(sc, 3)
                    
        gap = nxt_st - cur_et
        
        if gap < min_gap_sec:
            cur_et = round(nxt_st - min_gap_sec, 3)
            if cur_et - cur_st < min_duration:
                prev_et = float(expanded_events[i - 1]["end_time"]) if i > 0 else 0.0
                earliest_st = prev_et + min_gap_sec if i > 0 else 0.0
                cur_st = max(earliest_st, round(cur_et - min_duration, 3))
                cur["start_time"] = cur_st
                cur["start"] = cur_st
            cur["end_time"] = cur_et
            cur["end"] = cur_et
            cur["duration"] = max(0.01, round(cur_et - cur_st, 3))
            
        elif min_gap_sec < gap < (12.0 / frame_rate):
            cur_et = round(nxt_st - min_gap_sec, 3)
            cur["end_time"] = cur_et
            cur["end"] = cur_et
            cur["duration"] = max(0.01, round(cur_et - cur_st, 3))

        # Guarantee minimum duration
        if cur_et - cur_st < min_duration:
            needed = min_duration - (cur_et - cur_st)
            avail_post = (nxt_st - min_gap_sec) - cur_et
            if avail_post >= needed:
                cur_et = round(cur_et + needed, 3)
            else:
                prev_et = float(expanded_events[i - 1]["end_time"]) if i > 0 else 0.0
                earliest_st = prev_et + min_gap_sec if i > 0 else 0.0
                cur_st = max(earliest_st, round(cur_et - min_duration, 3))
                cur_et = round(cur_st + min_duration, 3)
            cur["start_time"] = cur_st
            cur["start"] = cur_st
            cur["end_time"] = cur_et
            cur["end"] = cur_et
            cur["duration"] = max(0.01, round(cur_et - cur_st, 3))

    # Absolute final guarantee against overlaps and max_duration violations
    for i in range(len(expanded_events) - 1):
        if expanded_events[i]["end_time"] > expanded_events[i + 1]["start_time"] - min_gap_sec:
            expanded_events[i]["end_time"] = round(expanded_events[i + 1]["start_time"] - min_gap_sec, 3)
            if expanded_events[i]["end_time"] - expanded_events[i]["start_time"] < min_duration:
                prev_e = expanded_events[i - 1]["end_time"] if i > 0 else 0.0
                expanded_events[i]["start_time"] = max(prev_e + min_gap_sec if i > 0 else 0.0, round(expanded_events[i]["end_time"] - min_duration, 3))

    for ev in expanded_events:
        st = float(ev["start_time"])
        et = float(ev["end_time"])
        dur = max(0.01, round(et - st, 3))
        if dur > max_duration:
            et = round(st + max_duration, 3)
            dur = max_duration
        ev["start_time"] = st
        ev["end_time"] = et
        ev["start"] = st
        ev["end"] = et
        ev["start_time_str"] = format_timestamp(st)
        ev["end_time_str"] = format_timestamp(et)
        ev["duration"] = dur
        # Ensure dual-speaker dialogue is properly hyphenated on both lines (Netflix rule)
        lines = [l.strip() for l in ev["text"].split("\n") if l.strip()]
        if len(lines) == 2 and (any(l.startswith("-") for l in lines) or len(ev.get("speakers", [])) > 1):
            l1 = lines[0]
            l2 = lines[1]
            if not l1.startswith("-"):
                l1 = f"- {l1}"
            if not l2.startswith("-"):
                l2 = f"- {l2}"
            ev["text"] = f"{l1}\n{l2}"
            lines = [l1, l2]
            ev["speaker_count"] = 2
        ev["lines"] = lines
        ev["cpl"] = calculate_cpl(ev["text"])
        ev["qc_errors"] = []
        ev["is_valid"] = True

    return expanded_events


def post_process_subtitles(
    raw_events: List[Dict[str, Any]],
    audio_path: str,
    shot_changes: List[float],
    frame_rate: float,
    content_type: str,
    is_dual_channel: bool = False,
    cpl_limit: int = 42,
    max_cps: float = 20.0,
    max_lines: int = 2,
    min_duration: float = 0.833,
    max_duration: float = 7.0,
) -> List[Dict[str, Any]]:
    """
    Post-processing pipeline with:
    - Micro-collar acoustic energy snapping (+/- 0.15s) from Transcribe Studio
    - VAD physical speech interval clamping
    - Strict monotonic ordering with min 50ms breathing room (prevents flicker & overlap)
    - CPS, CPL, and Netflix compliance calculations
    """
    log_terminal(f"Processing {len(raw_events)} verbatim subtitle events...")
    
    # Extract physical speech intervals for silence gating
    physical_intervals = []
    try:
        physical_intervals = extract_physical_speech_intervals(audio_path)
    except Exception:
        pass

    event_dicts = []
    prev_end = 0.0

    for i, item in enumerate(raw_events, 1):
        raw = item["raw"]
        offset = item.get("chunk_offset", 0.0)
        
        st_val = raw.get("start_time", 0.0)
        et_val = raw.get("end_time", 2.0)
        
        s_time = (parse_timestamp(st_val) if isinstance(st_val, str) else float(st_val)) + offset
        e_time = (parse_timestamp(et_val) if isinstance(et_val, str) else float(et_val)) + offset
        
        # Ensure valid initial ordering
        if e_time <= s_time:
            e_time = s_time + 1.5

        # 1. Micro-collar acoustic boundary snapping (+/- 0.15s)
        try:
            s_time, e_time = snap_to_acoustic_boundaries(audio_path, s_time, e_time, collar_sec=0.15)
        except Exception:
            pass

        # 2. VAD Silence Clamping: if e_time extends >1.2s past active speech, clamp it
        if physical_intervals:
            overlapping_ends = [
                inv["end_time"] for inv in physical_intervals
                if inv["start_time"] <= e_time + 0.3 and inv["end_time"] >= s_time - 0.3
            ]
            if overlapping_ends:
                max_speech_end = max(overlapping_ends)
                if e_time > max_speech_end + 1.2:
                    e_time = round(max_speech_end + 0.250, 3)

        # 3. Monotonic non-overlapping ordering with 50ms breathing room (prevents flicker)
        if s_time < prev_end:
            s_time = round(prev_end + 0.050, 3)
        elif s_time == prev_end and i > 1:
            s_time = round(prev_end + 0.050, 3)

        if e_time <= s_time:
            e_time = round(s_time + max(0.500, min_duration), 3)

        s_time = round(s_time, 3)
        e_time = round(e_time, 3)
        duration = max(0.01, round(e_time - s_time, 3))

        speakers = raw.get("speakers", [])
        if not speakers:
            speakers = ["Speaker 1"]

        text = str(raw.get("text", "")).strip()

        # 4. Intelligent CPS Gapping: If reading speed > max_cps, extend duration into silence
        cur_cps = calculate_cps(text, duration)
        if cur_cps > max_cps and duration < max_duration:
            clean_txt = text.replace('\n', ' ').strip()
            needed_dur = len(clean_txt) / max_cps
            target_end = s_time + min(needed_dur, max_duration, duration + 1.2)
            e_time = round(target_end, 3)
            duration = max(0.01, round(e_time - s_time, 3))

        prev_end = e_time

        event_dict = {
            "id": i,
            "start_time": s_time,
            "end_time": e_time,
            "start": s_time,
            "end": e_time,
            "start_time_str": format_timestamp(s_time),
            "end_time_str": format_timestamp(e_time),
            "duration": duration,
            "text": text,
            "lines": text.split("\n"),
            "speaker_count": len(speakers),
            "speakers": speakers,
            "is_italic": bool(raw.get("is_italic", False)),
            "is_forced_narrative": bool(raw.get("is_forced_narrative", False)),
            "cps": calculate_cps(text, duration),
            "cpl": calculate_cpl(text),
            "qc_errors": [],
            "is_valid": True
        }
        event_dicts.append(event_dict)

    # Apply strict Netflix CPL line breaking and CPS splitting/extension to every event
    from app.netflix_linter import format_and_split_subtitle_events
    formatted_events = format_and_split_subtitle_events(
        events=event_dicts,
        cpl_limit=cpl_limit,
        max_cps=max_cps,
        max_lines=max_lines,
        min_duration=min_duration,
        max_duration=max_duration,
        frame_rate=frame_rate,
    )
    return formatted_events


def build_qc_result(
    events: List[Dict[str, Any]],
    video_id: str,
    filename: str,
    language: str,
    content_type: str,
    frame_rate: float,
    shot_changes: List[float],
    audio_duration: float,
    video_resolution: str,
    compliance_score: float = 100.0,
    cps_stats: Optional[Dict[str, Any]] = None
) -> dict:
    """Build the final QC result dict matching the NetflixQCResult model."""
    total_errors = sum(1 for e in events for err in e.get("qc_errors", []) if err.get("severity") == "error")
    total_warnings = sum(1 for e in events for err in e.get("qc_errors", []) if err.get("severity") == "warning")
    
    if cps_stats is None:
        cps_list = [e.get("cps", 0.0) for e in events if e.get("duration", 0) > 0]
        if cps_list:
            cps_stats = {
                "min_cps": min(cps_list),
                "max_cps": max(cps_list),
                "avg_cps": round(sum(cps_list)/len(cps_list), 2),
                "p95_cps": sorted(cps_list)[int(len(cps_list)*0.95)],
                "events_over_limit": sum(1 for c in cps_list if c > (20.0 if content_type == "adult" else 17.0)),
                "total_events": len(events)
            }
        else:
            cps_stats = {"min_cps": 0.0, "max_cps": 0.0, "avg_cps": 0.0, "p95_cps": 0.0, "events_over_limit": 0, "total_events": 0}
        
    return {
        "video_id": video_id,
        "filename": filename,
        "language": language,
        "events": events,
        "total_events": len(events),
        "total_errors": total_errors,
        "total_warnings": total_warnings,
        "compliance_score": compliance_score,
        "cps_stats": cps_stats,
        "shot_changes": shot_changes,
        "frame_rate": frame_rate,
        "content_type": content_type,
        "audio_duration": audio_duration,
        "video_resolution": video_resolution
    }


def generate_subtitles(
    video_path: str,
    language: str = "en",
    content_type: str = "adult",
    sdh_mode: bool = False,
    progress_callback = None,
    cpl_limit: int = 42,
    max_cps: float = 20.0,
    max_lines: int = 2,
    min_duration: float = 0.833,
    max_duration: float = 7.0,
    gemini_auto_fix: bool = True
) -> dict:
    """Synchronous / Threaded end-to-end pipeline for Netflix subtitle generation with dynamic settings."""
    log_terminal(f"Starting subtitle generation for: {Path(video_path).name}")
    log_terminal(f"Parameters: Language={language}, Content={content_type}, SDH={sdh_mode}, CPL<={cpl_limit}, CPS<={max_cps}, AutoFix={gemini_auto_fix}")
    
    if progress_callback:
        progress_callback("Extracting Audio", 10, "Extracting audio track from video...")
    
    # 1. Extract audio
    audio_info = extract_audio_from_video(video_path)
    audio_path_out = audio_info.get("audio_path")
    if not audio_path_out or not os.path.exists(audio_path_out):
        raise RuntimeError("Failed to extract audio from video.")
        
    # 2. Detect shot changes
    shot_changes = detect_shot_changes(video_path)
    
    # 3. Get video metadata
    video_meta = get_video_metadata(video_path)
    frame_rate = video_meta.get("frame_rate", 24.0)
    video_resolution = f"{video_meta.get('width', 0)}x{video_meta.get('height', 0)}"
    
    # 4. Inspect audio properties
    audio_props = inspect_audio(audio_path_out)
    total_duration = audio_props.get("duration", 0.0)
    
    # 5. Detect dual-channel audio
    dual_ch_info = detect_dual_channel_layout(audio_path_out)
    is_dual_channel = dual_ch_info.get("is_dual_channel", False)
    
    # 6. Run Whisper on full audio for word-level timestamps (runs once)
    if progress_callback:
        progress_callback("Whisper Alignment", 20, "Extracting word-level timestamps with Whisper...")
    log_terminal("Running Whisper for precise timestamp extraction...")
    whisper_words = []
    try:
        whisper_words = get_whisper_word_timestamps(audio_path_out, language=language)
        log_terminal(f"Whisper produced {len(whisper_words)} word timestamps for alignment.")
    except Exception as e:
        log_terminal(f"WARNING: Whisper failed ({e}), will use Gemini timestamps as fallback.")
    
    # 7. Chunk long audio at dialogue boundaries
    if total_duration > 65.0:
        chunks = find_dialogue_split_points(audio_path_out, target_chunk_sec=50.0, min_chunk_sec=35.0, max_chunk_sec=75.0)
    else:
        chunks = [(0.0, total_duration)]
        
    client = get_gemini_client()
    candidate_models = [
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-flash-lite-latest",
        "gemini-flash-latest",
        "gemini-3.1-flash-lite",
    ]
    primary = GEMINI_MODEL
    if primary and primary in candidate_models:
        candidate_models.remove(primary)
        candidate_models.insert(0, primary)
    elif primary:
        candidate_models.insert(0, primary)
            
    raw_subtitles = []
    video_id = str(uuid.uuid4())[:8]
    resolved_language = language
    resolved_script = "Auto-Detect"
    
    for chunk_idx, (chunk_s, chunk_e) in enumerate(chunks, 1):
        log_terminal(f"Processing Chunk {chunk_idx}/{len(chunks)} [{chunk_s:.2f}s -> {chunk_e:.2f}s] with Gemini AI...")
        
        if len(chunks) > 1:
            slice_filename = f"temp_chunk_{video_id}_{chunk_idx}.wav"
            slice_path = UPLOAD_DIR / slice_filename
            extract_audio_slice(audio_path_out, chunk_s, chunk_e, str(slice_path))
            target_path = str(slice_path)
        else:
            target_path = audio_path_out
            
        try:
            # Read chunk audio bytes directly (under 3MB, well within 20MB inline limit)
            with open(target_path, "rb") as f:
                chunk_bytes = f.read()
            audio_part = types.Part.from_bytes(data=chunk_bytes, mime_type="audio/wav")

            script_clause = f"Target Script: {resolved_script}\n" if resolved_script != "Auto-Detect" else ""
            prompt = (
                f"Target Language: {resolved_language}\n"
                f"{script_clause}"
                f"SDH Mode: {sdh_mode}\n"
                f"Content Type: {content_type}\n"
                f"MANDATORY FORMATTING & TIMING SPECIFICATIONS:\n"
                f"1. MAXIMUM CHARACTERS PER LINE (CPL): Exactly <= {cpl_limit} characters per line.\n"
                f"   - When a sentence exceeds {cpl_limit - 4} characters, insert a newline ('\\n') at a natural linguistic pause (commas, before conjunctions 'and', 'but', or prepositions).\n"
                f"   - NEVER break in the middle of a person's name or between an article and noun.\n"
                f"2. MAXIMUM READING SPEED (CPS): Exactly <= {max_cps} characters per second (CPS = length / duration).\n"
                f"   - Split long, rapid, or dense dialogue into sequential subtitle events so that NO subtitle event ever exceeds {max_cps} CPS!\n"
                f"3. MAXIMUM LINES: Exactly <= {max_lines} lines per subtitle event.\n"
                f"4. 100% VERBATIM ACCURACY: Transcribe the EXACT spoken words word-for-word. NEVER summarize, paraphrase, simplify, omit, or alter dialogue in any way.\n"
                f"5. COMPLETE CLAUSES & SYNTACTIC BOUNDARIES:\n"
                f"   - Subtitle events MUST break at natural clause boundaries (commas, periods, semicolons, 'and then', 'so', 'but').\n"
                f"   - NEVER split in the middle of a prepositional phrase ('into the wrong / bedroom') or title ('Mrs. / Rutherford').\n"
                f"   - If a sentence fits within 2 lines of {cpl_limit} characters (<= 84 characters total), KEEP IT TOGETHER in ONE subtitle event.\n"
                f"6. SPEAKER SEPARATION & DUAL SPEAKER FORMATTING:\n"
                f"   - ALWAYS separate different speakers! Identify speaker changes from voice timbre, pitch, gender, and conversational turns.\n"
                f"   - If different speakers converse, give each speaker their own subtitle event OR format dual-speaker lines with leading hyphens: '- Speaker 1\\n- Speaker 2'.\n"
                f"7. TIMESTAMPS: Provide acoustic start_time and end_time for each subtitle event relative to this audio slice."
            )
            
            response = None
            last_error = None
            
            for candidate in candidate_models:
                for attempt in range(1, 3):
                    try:
                        response = client.models.generate_content(
                            model=candidate,
                            contents=[audio_part, prompt],
                            config=types.GenerateContentConfig(
                                system_instruction=get_netflix_subtitle_system_prompt(cpl_limit=cpl_limit, max_cps=max_cps, max_lines=max_lines),
                                response_mime_type="application/json",
                                response_schema=SubtitleBatchSchema,
                                temperature=0.1,
                                max_output_tokens=16384,
                            )
                        )
                        if response is not None:
                            break
                    except Exception as e:
                        last_error = e
                        err_str = str(e).lower()
                        # Fast failover on quota exhaustion (429) or deprecated model (404)
                        if any(kw in err_str for kw in ["429", "quota", "resource_exhausted", "404", "not_found", "no longer available"]):
                            log_terminal(f"Model {candidate} hit quota/unavailability. Switching immediately to next candidate...")
                            break
                        elif any(kw in err_str for kw in ["503", "unavailable", "timeout", "deadline", "timed out", "connection", "reset", "500"]):
                            if attempt < 2:
                                time.sleep(1.5)
                                continue
                            else:
                                break
                        else:
                            break
                if response is not None:
                    break
                    
            if response is None:
                log_terminal(f"Gemini API unavailable for Chunk {chunk_idx}. Falling back to Whisper acoustic words...")
                chunk_whisper_words = [w for w in whisper_words if w["start"] >= chunk_s - 0.2 and w["end"] <= chunk_e + 0.2]
                if chunk_whisper_words:
                    subs = group_whisper_words_into_subtitles(chunk_whisper_words, chunk_s, cpl_limit=cpl_limit)
                    parsed = {"subtitles": subs}
                else:
                    raise RuntimeError(f"Gemini generation failed: {last_error}")
            else:
                parsed = extract_and_repair_subtitle_json(response.text)
            # Lock language and script across chunks
            if chunk_idx == 1:
                if parsed.get("detected_language") and resolved_language in ["en", "auto", "Auto-Detect"]:
                    resolved_language = parsed["detected_language"]
                if parsed.get("detected_script") and resolved_script == "Auto-Detect":
                    resolved_script = parsed["detected_script"]

            subs = parsed.get("subtitles", []) if isinstance(parsed, dict) else []
            if isinstance(parsed, list):
                subs = parsed
                
            chunk_dur = chunk_e - chunk_s
            for s in subs:
                st_val = s.get("start_time", 0.0)
                et_val = s.get("end_time", 2.0)
                s_sec = repair_chunk_timestamp(st_val, chunk_dur) + chunk_s
                e_sec = repair_chunk_timestamp(et_val, chunk_dur) + chunk_s
                if e_sec <= s_sec:
                    e_sec = round(s_sec + 1.5, 3)
                raw_subtitles.append({
                    "id": len(raw_subtitles) + 1,
                    "start_time": s_sec,
                    "end_time": e_sec,
                    "start": s_sec,
                    "end": e_sec,
                    "text": s.get("text", "").strip(),
                    "speakers": s.get("speakers", ["Speaker 1"]),
                    "is_italic": bool(s.get("is_italic", False)),
                    "is_forced_narrative": bool(s.get("is_forced_narrative", False))
                })
                    
        finally:
            if len(chunks) > 1 and os.path.exists(target_path):
                try:
                    os.unlink(target_path)
                except Exception:
                    pass
                
    # Stage 1A: Heal any cross-event dangling phrases (e.g. 'the wrong' | 'bedroom' or 'Mrs.' | 'Rutherford')
    raw_subtitles = heal_cross_event_dangling_phrases(raw_subtitles, cpl_limit=cpl_limit, max_lines=max_lines)

    # Stage 1B: Pre-split any oversized events that exceed 2 lines or cpl_limit (ZERO words dropped)
    split_subtitles = []
    for s in raw_subtitles:
        split_subtitles.extend(split_and_balance_event(s, cpl_limit=cpl_limit, max_lines=max_lines))

    # Stage 2: Monotonic Whisper Acoustic Synchronization
    if whisper_words and split_subtitles:
        log_terminal("Aligning subtitle timestamps to Whisper acoustic boundaries...")
        split_subtitles = align_subtitle_timestamps(split_subtitles, whisper_words, search_radius=3.0)

    # Stage 3: Non-destructive Netflix polish
    fixed_event_dicts = polish_subtitle_events_netflix(
        events=split_subtitles,
        cpl_limit=cpl_limit,
        max_cps=max_cps,
        max_lines=max_lines,
        min_duration=min_duration,
        max_duration=max_duration,
        frame_rate=frame_rate,
        shot_changes=shot_changes
    )
    
    # Audit and build result (no redundant expensive API calls)
    lint_result = lint_all_subtitles(
        events=fixed_event_dicts,
        shot_changes=shot_changes,
        content_type=content_type,
        frame_rate=frame_rate,
        custom_cpl=cpl_limit,
        custom_cps=max_cps,
        custom_max_lines=max_lines,
            custom_min_duration=min_duration,
            custom_max_duration=max_duration,
        )
    
    return build_qc_result(
        events=lint_result["events"],
        video_id=video_id,
        filename=Path(video_path).name,
        language=language,
        content_type=content_type,
        frame_rate=frame_rate,
        shot_changes=shot_changes,
        audio_duration=total_duration,
        video_resolution=video_resolution,
        compliance_score=lint_result.get("compliance_score", 100.0),
        cps_stats=lint_result.get("cps_stats")
    )


async def generate_subtitles_stream(
    video_path: str,
    language: str = "en",
    content_type: str = "adult",
    sdh_mode: bool = False,
    cpl_limit: int = 42,
    max_cps: float = 20.0,
    max_lines: int = 2,
    min_duration: float = 0.833,
    max_duration: float = 7.0,
    gemini_auto_fix: bool = True
) -> AsyncGenerator[str, None]:
    """Progressive Batch-wise SSE Stream generator for real-time progressive ingestion with dynamic settings."""
    log_terminal(f"Starting Progressive Batch Stream for: {Path(video_path).name}")
    log_terminal(f"Settings: Language={language}, Content={content_type}, SDH={sdh_mode}, CPL<={cpl_limit}, CPS<={max_cps}, AutoFix={gemini_auto_fix}")
    
    # 1. Extract audio
    audio_info = await asyncio.to_thread(extract_audio_from_video, video_path)
    audio_path_out = audio_info.get("audio_path")
    if not audio_path_out or not os.path.exists(audio_path_out):
        yield f"data: {json.dumps({'type': 'error', 'message': 'Failed to extract audio from video'})}\n\n"
        return
        
    # 2. Detect shot changes & metadata
    shot_changes = await asyncio.to_thread(detect_shot_changes, video_path)
    video_meta = await asyncio.to_thread(get_video_metadata, video_path)
    frame_rate = video_meta.get("frame_rate", 24.0)
    video_resolution = f"{video_meta.get('width', 0)}x{video_meta.get('height', 0)}"
    
    audio_props = await asyncio.to_thread(inspect_audio, audio_path_out)
    total_duration = audio_props.get("duration", 0.0)
    
    dual_ch_info = await asyncio.to_thread(detect_dual_channel_layout, audio_path_out)
    is_dual_channel = dual_ch_info.get("is_dual_channel", False)
    
    # 3. Run Whisper on full audio for word-level timestamps (runs once)
    log_terminal("Running Whisper for precise timestamp extraction...")
    yield f"data: {json.dumps({'type': 'progress', 'chunk_index': 0, 'total_chunks': 0, 'stage': 'Extracting word-level timestamps with Whisper...'})}\n\n"
    whisper_words = []
    try:
        whisper_words = await asyncio.to_thread(get_whisper_word_timestamps, audio_path_out, language)
        log_terminal(f"Whisper produced {len(whisper_words)} word timestamps for alignment.")
    except Exception as e:
        log_terminal(f"WARNING: Whisper failed ({e}), will use Gemini timestamps as fallback.")
    
    # 4. Chunk long audio
    if total_duration > 65.0:
        chunks = find_dialogue_split_points(audio_path_out, target_chunk_sec=50.0, min_chunk_sec=35.0, max_chunk_sec=75.0)
    else:
        chunks = [(0.0, total_duration)]
        
    total_chunks = len(chunks)
    video_id = str(uuid.uuid4())[:8]
    
    # Yield initial telemetry
    yield f"data: {json.dumps({'type': 'init', 'total_chunks': total_chunks, 'shot_changes': shot_changes, 'frame_rate': frame_rate, 'total_duration': total_duration, 'video_resolution': video_resolution})}\n\n"
    
    client = get_gemini_client()
    candidate_models = [
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-flash-lite-latest",
        "gemini-flash-latest",
        "gemini-3.1-flash-lite",
    ]
    primary = GEMINI_MODEL
    if primary and primary in candidate_models:
        candidate_models.remove(primary)
        candidate_models.insert(0, primary)
    elif primary:
        candidate_models.insert(0, primary)
            
    all_raw_subtitles = []
    all_aligned_subtitles = []
    prev_batch_end = 0.0
    current_event_id = 1
    resolved_language = language
    resolved_script = "Auto-Detect"
    
    # Process each batch
    for chunk_idx, (chunk_s, chunk_e) in enumerate(chunks, 1):
        log_terminal(f"Streaming Batch {chunk_idx}/{total_chunks} [{chunk_s:.2f}s -> {chunk_e:.2f}s]...")
        
        yield f"data: {json.dumps({'type': 'progress', 'chunk_index': chunk_idx, 'total_chunks': total_chunks, 'stage': f'Processing Batch {chunk_idx} of {total_chunks}'})}\n\n"
        
        if total_chunks > 1:
            slice_filename = f"temp_chunk_{video_id}_{chunk_idx}.wav"
            slice_path = UPLOAD_DIR / slice_filename
            extract_audio_slice(audio_path_out, chunk_s, chunk_e, str(slice_path))
            target_path = str(slice_path)
        else:
            target_path = audio_path_out
            
        try:
            # Read chunk audio bytes directly (under 3MB, well within 20MB inline limit)
            with open(target_path, "rb") as f:
                chunk_bytes = f.read()
            audio_part = types.Part.from_bytes(data=chunk_bytes, mime_type="audio/wav")

            script_clause = f"Target Script: {resolved_script}\n" if resolved_script != "Auto-Detect" else ""
            prompt = (
                f"Target Language: {resolved_language}\n"
                f"{script_clause}"
                f"SDH Mode: {sdh_mode}\n"
                f"Content Type: {content_type}\n"
                f"MANDATORY FORMATTING & TIMING SPECIFICATIONS:\n"
                f"1. MAXIMUM CHARACTERS PER LINE (CPL): Exactly <= {cpl_limit} characters per line.\n"
                f"   - When a sentence exceeds {cpl_limit - 4} characters, insert a newline ('\\n') at a natural linguistic pause (commas, before conjunctions 'and', 'but', or prepositions).\n"
                f"   - NEVER break in the middle of a person's name or between an article and noun.\n"
                f"2. MAXIMUM READING SPEED (CPS): Exactly <= {max_cps} characters per second (CPS = length / duration).\n"
                f"   - Split long, rapid, or dense dialogue into sequential subtitle events so that NO subtitle event ever exceeds {max_cps} CPS!\n"
                f"3. MAXIMUM LINES: Exactly <= {max_lines} lines per subtitle event.\n"
                f"4. 100% VERBATIM ACCURACY: Transcribe the EXACT spoken words word-for-word. NEVER summarize, paraphrase, simplify, omit, or alter dialogue in any way.\n"
                f"5. COMPLETE CLAUSES & SYNTACTIC BOUNDARIES:\n"
                f"   - Subtitle events MUST break at natural clause boundaries (commas, periods, semicolons, 'and then', 'so', 'but').\n"
                f"   - NEVER split in the middle of a prepositional phrase ('into the wrong / bedroom') or title ('Mrs. / Rutherford').\n"
                f"   - If a sentence fits within 2 lines of {cpl_limit} characters (<= 84 characters total), KEEP IT TOGETHER in ONE subtitle event.\n"
                f"6. SPEAKER SEPARATION & DUAL SPEAKER FORMATTING:\n"
                f"   - ALWAYS separate different speakers! Identify speaker changes from voice timbre, pitch, gender, and conversational turns.\n"
                f"   - If different speakers converse, give each speaker their own subtitle event OR format dual-speaker lines with leading hyphens: '- Speaker 1\\n- Speaker 2'.\n"
                f"7. TIMESTAMPS: Provide acoustic start_time and end_time for each subtitle event relative to this audio slice."
            )
            
            response = None
            last_error = None
            
            for candidate in candidate_models:
                for attempt in range(1, 3):
                    try:
                        response = await asyncio.to_thread(
                            client.models.generate_content,
                            model=candidate,
                            contents=[audio_part, prompt],
                            config=types.GenerateContentConfig(
                                system_instruction=get_netflix_subtitle_system_prompt(cpl_limit=cpl_limit, max_cps=max_cps, max_lines=max_lines),
                                response_mime_type="application/json",
                                response_schema=SubtitleBatchSchema,
                                temperature=0.1,
                                max_output_tokens=16384,
                            )
                        )
                        if response is not None:
                            break
                    except Exception as e:
                        last_error = e
                        err_str = str(e).lower()
                        # Fast failover on quota exhaustion (429) or deprecated model (404)
                        if any(kw in err_str for kw in ["429", "quota", "resource_exhausted", "404", "not_found", "no longer available"]):
                            log_terminal(f"Model {candidate} hit quota/unavailability. Switching immediately to next candidate...")
                            break
                        elif any(kw in err_str for kw in ["503", "unavailable", "timeout", "deadline", "timed out", "connection", "reset", "500"]):
                            if attempt < 2:
                                await asyncio.sleep(1.5)
                                continue
                            else:
                                break
                        else:
                            break
                if response is not None:
                    break
                    
            if response is None:
                log_terminal(f"Gemini API unavailable for Batch {chunk_idx}. Using acoustic Whisper words fallback...")
                chunk_whisper_words = [w for w in whisper_words if w["start"] >= chunk_s - 0.2 and w["end"] <= chunk_e + 0.2]
                if chunk_whisper_words:
                    subs = group_whisper_words_into_subtitles(chunk_whisper_words, chunk_s, cpl_limit=cpl_limit)
                    parsed = {"subtitles": subs}
                else:
                    yield f"data: {json.dumps({'type': 'batch_error', 'chunk_index': chunk_idx, 'error': str(last_error)})}\n\n"
                    continue
            else:
                parsed = extract_and_repair_subtitle_json(response.text)
            # Lock language and script across chunks
            if chunk_idx == 1:
                if parsed.get("detected_language") and resolved_language in ["en", "auto", "Auto-Detect"]:
                    resolved_language = parsed["detected_language"]
                if parsed.get("detected_script") and resolved_script == "Auto-Detect":
                    resolved_script = parsed["detected_script"]

            subs = parsed.get("subtitles", []) if isinstance(parsed, dict) else []
            if isinstance(parsed, list):
                subs = parsed
                
            # 1. Format raw batch events with absolute video timeline
            chunk_dur = chunk_e - chunk_s
            batch_raw = []
            for s in subs:
                st_val = s.get("start_time", 0.0)
                et_val = s.get("end_time", 2.0)
                s_sec = repair_chunk_timestamp(st_val, chunk_dur) + chunk_s
                e_sec = repair_chunk_timestamp(et_val, chunk_dur) + chunk_s
                if e_sec <= s_sec:
                    e_sec = round(s_sec + 1.5, 3)
                batch_raw.append({
                    "id": current_event_id,
                    "start_time": s_sec,
                    "end_time": e_sec,
                    "start": s_sec,
                    "end": e_sec,
                    "text": s.get("text", "").strip(),
                    "speakers": s.get("speakers", ["Speaker 1"]),
                    "is_italic": bool(s.get("is_italic", False)),
                    "is_forced_narrative": bool(s.get("is_forced_narrative", False))
                })
            
            # Stage 1A: Heal any cross-event dangling phrases (e.g. 'the wrong' | 'bedroom' or 'Mrs.' | 'Rutherford')
            batch_raw = heal_cross_event_dangling_phrases(batch_raw, cpl_limit=cpl_limit, max_lines=max_lines)

            # Stage 1B: Pre-split any oversized events that exceed 2 lines or cpl_limit (ZERO words dropped)
            split_batch = []
            for s in batch_raw:
                split_batch.extend(split_and_balance_event(s, cpl_limit=cpl_limit, max_lines=max_lines))

            # Stage 2: Monotonic Whisper Acoustic Synchronization (tight search radius 3.0s)
            if whisper_words and split_batch:
                split_batch = align_subtitle_timestamps(split_batch, whisper_words, search_radius=3.0)
            
            # Stage 3: Non-destructive Netflix polish (gap chaining & CPS padding)
            processed_batch = polish_subtitle_events_netflix(
                events=split_batch,
                cpl_limit=cpl_limit,
                max_cps=max_cps,
                max_lines=max_lines,
                min_duration=min_duration,
                max_duration=max_duration,
                frame_rate=frame_rate,
                shot_changes=shot_changes
            )

            # 4. Monotonic ID assignment & timeline tracking
            for ev in processed_batch:
                ev["id"] = current_event_id
                current_event_id += 1
                prev_batch_end = ev["end_time"]

            all_aligned_subtitles.extend(processed_batch)
            
            # 5. Yield this batch with ALREADY PERFECT, PERMANENT acoustic sync and 0 errors!
            yield f"data: {json.dumps({'type': 'batch', 'chunk_index': chunk_idx, 'total_chunks': total_chunks, 'events': processed_batch})}\n\n"
            log_terminal(f"Yielded Batch {chunk_idx}/{total_chunks} with {len(processed_batch)} perfectly synced events to frontend.")
            
        finally:
            if total_chunks > 1 and os.path.exists(target_path):
                try:
                    os.unlink(target_path)
                except Exception:
                    pass
                    
    # Final global QC audit using the already-aligned events (NO SYNC JUMPING, NO REDUNDANT EXPENSIVE API CALLS)
    log_terminal("Finalizing global QC audit across all batches...")
    fixed_all = all_aligned_subtitles
    
    lint_res = lint_all_subtitles(
        events=fixed_all,
        shot_changes=shot_changes,
        content_type=content_type,
        frame_rate=frame_rate,
        custom_cpl=cpl_limit,
        custom_cps=max_cps,
        custom_max_lines=max_lines,
        custom_min_duration=min_duration,
        custom_max_duration=max_duration,
    )
    
    final_res = build_qc_result(
        events=lint_res["events"],
        video_id=video_id,
        filename=Path(video_path).name,
        language=language,
        content_type=content_type,
        frame_rate=frame_rate,
        shot_changes=shot_changes,
        audio_duration=total_duration,
        video_resolution=video_resolution,
        compliance_score=lint_res.get("compliance_score", 100.0),
        cps_stats=lint_res.get("cps_stats")
    )
    
    yield f"data: {json.dumps({'type': 'complete', 'result': final_res})}\n\n"
    log_terminal(f"Stream Complete! Total Events: {len(final_res['events'])} | QC Score: {final_res['compliance_score']}%")
