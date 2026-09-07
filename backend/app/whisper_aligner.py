"""
Whisper-based timestamp alignment for Subtitle Studio.

Runs OpenAI Whisper (base model, CPU) to extract word-level timestamps,
then aligns Gemini-generated subtitle events to precise acoustic boundaries.
Gemini owns the text; Whisper only provides start/end timing.
"""

import os
import re
import shutil
import logging
from pathlib import Path
from difflib import SequenceMatcher
from typing import List, Dict, Any, Optional
from datetime import datetime
import soundfile as sf
import numpy as np

# Ensure ffmpeg executable directory is on PATH for whisper and other tools
try:
    import imageio_ffmpeg
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    if ffmpeg_bin and Path(ffmpeg_bin).exists():
        bin_dir = Path(ffmpeg_bin).parent
        target_name = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
        target_ffmpeg = bin_dir / target_name
        if not target_ffmpeg.exists() and Path(ffmpeg_bin).name != target_name:
            try:
                shutil.copyfile(ffmpeg_bin, target_ffmpeg)
                if os.name != "nt":
                    target_ffmpeg.chmod(0o755)
            except Exception:
                pass
        bin_dir_str = str(bin_dir)
        if bin_dir_str not in os.environ.get("PATH", ""):
            os.environ["PATH"] = bin_dir_str + os.pathsep + os.environ.get("PATH", "")
except Exception:
    pass

logger = logging.getLogger(__name__)

# Module-level model cache
_whisper_model = None
_whisper_model_name = None
_whisper_patched = False


def _ensure_whisper_patched():
    """Monkey-patch whisper.audio.load_audio lazily so it uses soundfile directly without ffmpeg subprocess."""
    global _whisper_patched
    if _whisper_patched:
        return
    try:
        import whisper.audio
        def _safe_whisper_load_audio(file: str, sr: int = 16000):
            try:
                data, file_sr = sf.read(file, dtype="float32")
                if len(data.shape) > 1:
                    data = data.mean(axis=1)
                if file_sr != sr:
                    from scipy.signal import resample
                    num_samples = int(len(data) * sr / file_sr)
                    data = resample(data, num_samples).astype(np.float32)
                return data
            except Exception:
                return _orig_load_audio(file, sr)

        if hasattr(whisper.audio, "load_audio") and not hasattr(whisper.audio, "_orig_load_audio"):
            _orig_load_audio = whisper.audio.load_audio
            whisper.audio._orig_load_audio = _orig_load_audio
            whisper.audio.load_audio = _safe_whisper_load_audio
        _whisper_patched = True
    except Exception:
        pass


def log_terminal(msg: str):
    """Print clean formatted timestamped log to terminal."""
    now_str = datetime.now().strftime('%H:%M:%S')
    print(f"[{now_str}] [Whisper Aligner] {msg}", flush=True)


def load_whisper_model(model_name: Optional[str] = None):
    """
    Lazy-load Whisper model and cache it globally.
    Defaults to 'tiny' on cloud (Render 512MB RAM) and 'base' on local desktop.
    """
    global _whisper_model, _whisper_model_name

    is_cloud = bool(os.getenv("RENDER") or os.getenv("PORT"))
    if not model_name:
        model_name = os.getenv("WHISPER_MODEL", "tiny" if is_cloud else "base")

    if _whisper_model is not None and _whisper_model_name == model_name:
        return _whisper_model

    _ensure_whisper_patched()

    try:
        import whisper
        import torch
        torch.set_num_threads(2 if is_cloud else (os.cpu_count() or 4))

        log_terminal(f"Loading Whisper '{model_name}' model (CPU, is_cloud={is_cloud})...")
        _whisper_model = whisper.load_model(model_name, device="cpu")
        _whisper_model_name = model_name
        log_terminal(f"Whisper '{model_name}' model loaded successfully.")
        return _whisper_model
    except ImportError:
        log_terminal("ERROR: openai-whisper is not installed. Run: pip install openai-whisper")
        raise ImportError(
            "openai-whisper is not installed. "
            "Install it with: pip install openai-whisper"
        )
    except Exception as e:
        log_terminal(f"ERROR loading Whisper model: {e}")
        raise


def get_whisper_word_timestamps(
    audio_path: str,
    language: Optional[str] = None,
    model_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Run Whisper on the full audio file and extract word-level timestamps.

    Args:
        audio_path: Path to the WAV audio file.
        language: Optional language code (e.g. 'hi', 'en', 'ta') for better accuracy.
        model_name: Whisper model size ('tiny', 'base', 'small').

    Returns:
        Flat list of word dicts: [{"word": "hello", "start": 0.52, "end": 0.88}, ...]
    """
    model = load_whisper_model(model_name)

    log_terminal(f"Running Whisper on audio: {audio_path} (language={language or 'auto'})...")

    import torch
    is_cloud = bool(os.getenv("RENDER") or os.getenv("PORT"))
    torch.set_num_threads(1 if is_cloud else min(4, os.cpu_count() or 4))

    # Fast acoustic alignment transcribe options (greedy search is 3-4x faster on CPU)
    transcribe_opts = {
        "word_timestamps": True,
        "fp16": False,  # CPU mode - no fp16
        "beam_size": 1,
        "best_of": 1,
        "temperature": 0.0,
        "condition_on_previous_text": False,
    }
    if language:
        # Map common language names to Whisper language codes
        lang_code = _map_language_to_whisper_code(language)
        if lang_code:
            transcribe_opts["language"] = lang_code

    # Read audio directly using soundfile - avoids subprocess ffmpeg call completely!
    try:
        data, sr = sf.read(audio_path, dtype="float32")
        if len(data.shape) > 1:
            data = data.mean(axis=1)  # downmix stereo to mono
        if sr != 16000:
            new_samples = int(len(data) * 16000 / sr)
            data = np.interp(
                np.linspace(0, len(data), new_samples, endpoint=False),
                np.arange(len(data)),
                data
            ).astype(np.float32)
        audio_input = data
    except Exception as read_err:
        log_terminal(f"soundfile direct read fallback: {read_err}")
        audio_input = audio_path

    try:
        result = model.transcribe(audio_input, **transcribe_opts)
    finally:
        import gc
        gc.collect()

    # Extract flat word list from all segments
    words = []
    for segment in result.get("segments", []):
        for word_info in segment.get("words", []):
            words.append({
                "word": word_info.get("word", "").strip(),
                "start": round(float(word_info.get("start", 0.0)), 3),
                "end": round(float(word_info.get("end", 0.0)), 3),
            })

    log_terminal(f"Whisper extracted {len(words)} words with timestamps.")
    return words


def _map_language_to_whisper_code(language: str) -> Optional[str]:
    """
    Map user-facing language names to Whisper's ISO 639-1 codes.
    Returns None if not recognized (Whisper will auto-detect).
    """
    lang_map = {
        # Full names (as used in the Subtitle Studio UI)
        "english": "en",
        "hindi": "hi",
        "bengali": "bn",
        "tamil": "ta",
        "telugu": "te",
        "marathi": "mr",
        "gujarati": "gu",
        "kannada": "kn",
        "malayalam": "ml",
        "punjabi": "pa",
        "urdu": "ur",
        "odia": "or",
        "assamese": "as",
        "nepali": "ne",
        "spanish": "es",
        "french": "fr",
        "german": "de",
        "japanese": "ja",
        "korean": "ko",
        "chinese": "zh",
        "arabic": "ar",
        "portuguese": "pt",
        "russian": "ru",
        "italian": "it",
        "dutch": "nl",
        "turkish": "tr",
        "thai": "th",
        "vietnamese": "vi",
        "indonesian": "id",
        "malay": "ms",
    }

    lang_lower = language.lower().strip()

    # Direct match on full name
    if lang_lower in lang_map:
        return lang_map[lang_lower]

    # Already a 2-letter code
    if len(lang_lower) <= 3 and lang_lower.isalpha():
        return lang_lower

    return None


def _normalize_text(text: str) -> str:
    """Normalize text for fuzzy matching: lowercase, strip punctuation, collapse spaces."""
    text = text.lower().strip()
    # Remove common subtitle formatting
    text = re.sub(r'</?i>', '', text)
    text = re.sub(r'♪', '', text)
    # Remove punctuation but keep word characters and spaces
    text = re.sub(r'[^\w\s]', ' ', text)
    # Collapse multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _extract_boundary_words(text: str, count: int = 3) -> tuple:
    """
    Extract the first N and last N words from subtitle text.
    Returns (first_words_str, last_words_str).
    """
    words = text.replace('\n', ' ').split()
    if not words:
        return "", ""
    first_n = ' '.join(words[:count])
    last_n = ' '.join(words[-count:])
    return first_n, last_n


def _fuzzy_match_score(word_a: str, word_b: str) -> float:
    """Fuzzy similarity score between two normalized words."""
    if not word_a or not word_b:
        return 0.0
    if word_a == word_b:
        return 1.0
    if word_a in word_b or word_b in word_a:
        return 0.85
    return SequenceMatcher(None, word_a, word_b).ratio()


def _find_best_word_match(
    target_text: str,
    whisper_words: List[Dict[str, Any]],
    search_start: float,
    search_end: float,
    window_size: int = 3,
    boundary: str = "start"
) -> Optional[Dict[str, Any]]:
    """
    Find the Whisper word sequence that best matches the target text
    within the given time window.

    Args:
        target_text: Normalized text to match (first/last N words of subtitle).
        whisper_words: Full list of Whisper word timestamps.
        search_start: Start of time window to search (seconds).
        search_end: End of time window to search (seconds).
        window_size: Number of consecutive Whisper words to consider as a group.
        boundary: 'start' or 'end' — determines which word's timestamp to return.

    Returns:
        The best matching Whisper word dict, or None if no confident match found.
    """
    if not target_text or not whisper_words:
        return None

    # Filter words within search window
    candidates = [
        (i, w) for i, w in enumerate(whisper_words)
        if w["start"] >= search_start - 0.5 and w["end"] <= search_end + 0.5
    ]

    if not candidates:
        return None

    best_score = 0.0
    best_word = None

    for idx, (global_i, _) in enumerate(candidates):
        # Build a window of consecutive words
        end_idx = min(idx + window_size, len(candidates))
        window_words = [candidates[j][1] for j in range(idx, end_idx)]
        window_text = _normalize_text(" ".join(w["word"] for w in window_words))

        score = _fuzzy_match_score(target_text, window_text)

        if score > best_score:
            best_score = score
            if boundary == "start":
                best_word = window_words[0]  # First word in the matched window
            else:
                best_word = window_words[-1]  # Last word in the matched window

    # Minimum confidence threshold — below this, we don't trust the match
    if best_score < 0.35:
        return None

    return best_word


def align_subtitle_timestamps(
    gemini_events: List[Dict[str, Any]],
    whisper_words: List[Dict[str, Any]],
    search_radius: float = 8.0,
    prev_batch_end: float = 0.0
) -> List[Dict[str, Any]]:
    """
    Aligns Gemini subtitle timestamps against Whisper acoustic word boundaries.
    CRITICAL: Preserves OVERLAPPING dialogues so both speakers' dialogues are retained!
    """
    if not gemini_events or not whisper_words:
        return gemini_events

    from app.netflix_models import format_timestamp as fmt_ts, calculate_cps

    total_events = len(gemini_events)
    total_w = len(whisper_words)
    w_idx = 0
    aligned_count = 0
    prev_end = prev_batch_end

    for ev_idx, event in enumerate(gemini_events):
        text = event.get("text", "")
        clean_words = [_normalize_text(w) for w in text.replace('\n', ' ').split() if _normalize_text(w)]
        
        orig_st = float(event.get("start_time", 0.0))
        orig_et = float(event.get("end_time", orig_st + 2.0))

        if not clean_words:
            event["start_time"] = orig_st
            event["end_time"] = orig_et
            continue

        first_w = clean_words[0]
        last_w = clean_words[-1]

        best_s_idx = None
        best_s_score = 0.0

        # Candidate search range in whisper_words around orig_st
        # Look backwards and forwards around orig_st to find the acoustic onset
        c_start = 0
        for k in range(max(0, w_idx - 40), total_w):
            if whisper_words[k]["start"] >= orig_st - search_radius:
                c_start = k
                break
        c_end = min(total_w, c_start + 60)

        for i in range(c_start, c_end):
            cand = _normalize_text(whisper_words[i]["word"])
            if not cand:
                continue
            time_diff = abs(whisper_words[i]["start"] - orig_st)
            if time_diff > search_radius + 2.0:
                continue
            score = _fuzzy_match_score(first_w, cand)
            # Weight score by temporal proximity to orig_st
            time_penalty = min(0.15, time_diff * 0.02)
            adj_score = score - time_penalty
            if score > 0.65 and adj_score > best_s_score:
                best_s_score = adj_score
                best_s_idx = i
                if score == 1.0 and time_diff < 1.0:
                    break

        matched_start = whisper_words[best_s_idx]["start"] if best_s_idx is not None else orig_st
        s_idx = best_s_idx if best_s_idx is not None else c_start

        # Search for last spoken word forward from s_idx
        best_e_idx = None
        best_e_score = 0.0
        expected_len = len(clean_words)

        for j in range(s_idx, min(total_w, s_idx + expected_len + 15)):
            w_end = whisper_words[j]["end"]
            if w_end > matched_start + 7.5:
                break
            cand = _normalize_text(whisper_words[j]["word"])
            if not cand:
                continue
            score = _fuzzy_match_score(last_w, cand)
            if score > 0.65 and score > best_e_score:
                best_e_score = score
                best_e_idx = j
                if score == 1.0:
                    break

        if best_e_idx is not None:
            matched_end = whisper_words[best_e_idx]["end"]
            aligned_count += 1
        else:
            matched_end = min(orig_et, matched_start + 7.0)
            if best_s_idx is not None:
                aligned_count += 1

        min_gap = 0.083  # Minimum 2 frames @ 24fps

        st = round(matched_start, 3)
        et = round(min(st + 7.0, max(st + 0.833, matched_end)), 3)

        # Strictly enforce non-overlapping timeline (st >= prev_end + min_gap)
        if st < prev_end + min_gap:
            # Check if previous event has room to be trimmed without violating min duration
            if ev_idx > 0:
                prev_ev = gemini_events[ev_idx - 1]
                prev_st = float(prev_ev.get("start_time", 0.0))
                can_trim_prev = (st - min_gap) - prev_st >= 0.833
                if can_trim_prev:
                    prev_ev["end_time"] = round(st - min_gap, 3)
                    prev_ev["end"] = prev_ev["end_time"]
                    prev_ev["duration"] = round(prev_ev["end_time"] - prev_st, 3)
                    prev_ev["end_time_str"] = fmt_ts(prev_ev["end_time"])
                    prev_end = prev_ev["end_time"]
                else:
                    st = round(prev_end + min_gap, 3)
                    et = round(min(st + 7.0, max(st + 0.833, matched_end)), 3)
            else:
                st = round(prev_end + min_gap, 3)
                et = round(min(st + 7.0, max(st + 0.833, matched_end)), 3)

        if best_e_idx is not None:
            w_idx = max(w_idx, best_e_idx + 1)

        dur = max(0.01, round(et - st, 3))

        event["start_time"] = st
        event["end_time"] = et
        event["start"] = st
        event["end"] = et
        event["start_time_str"] = fmt_ts(st)
        event["end_time_str"] = fmt_ts(et)
        event["duration"] = dur
        event["cps"] = calculate_cps(text, dur)
        prev_end = et

    log_terminal(
        f"Acoustic alignment complete: {aligned_count}/{total_events} events "
        f"locked to Whisper boundaries (strictly non-overlapping)."
    )
    return gemini_events
