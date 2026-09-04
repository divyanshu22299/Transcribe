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
        target_ffmpeg = bin_dir / "ffmpeg.exe"
        if not target_ffmpeg.exists():
            shutil.copyfile(ffmpeg_bin, target_ffmpeg)
        bin_dir_str = str(bin_dir)
        if bin_dir_str not in os.environ.get("PATH", ""):
            os.environ["PATH"] = bin_dir_str + os.pathsep + os.environ.get("PATH", "")
except Exception:
    pass

# Monkey-patch whisper.audio.load_audio so it uses soundfile directly without ffmpeg subprocess
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
except Exception:
    pass

logger = logging.getLogger(__name__)

# Module-level model cache
_whisper_model = None
_whisper_model_name = None


def log_terminal(msg: str):
    """Print clean formatted timestamped log to terminal."""
    now_str = datetime.now().strftime('%H:%M:%S')
    print(f"[{now_str}] [Whisper Aligner] {msg}", flush=True)


def load_whisper_model(model_name: str = "base"):
    """
    Lazy-load Whisper model and cache it globally.
    The 'base' model is ~140MB and runs at ~2-4x realtime on CPU.
    Downloaded to ~/.cache/whisper/ on first use.
    """
    global _whisper_model, _whisper_model_name

    if _whisper_model is not None and _whisper_model_name == model_name:
        return _whisper_model

    try:
        import whisper
        log_terminal(f"Loading Whisper '{model_name}' model (CPU)...")
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
    model_name: str = "base"
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
    torch.set_num_threads(os.cpu_count() or 8)

    # Fast acoustic alignment transcribe options (greedy search is 3-4x faster on CPU)
    transcribe_opts = {
        "word_timestamps": True,
        "fp16": False,  # CPU mode - no fp16
        "beam_size": 1,
        "best_of": 1,
        "temperature": 0.0,
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
            from scipy.signal import resample
            num_samples = int(len(data) * 16000 / sr)
            data = resample(data, num_samples).astype(np.float32)
        audio_input = data
    except Exception as read_err:
        log_terminal(f"soundfile direct read fallback: {read_err}")
        audio_input = audio_path

    result = model.transcribe(audio_input, **transcribe_opts)

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
    normalized = _normalize_text(text)
    words = normalized.split()

    if not words:
        return ("", "")

    first_words = " ".join(words[:count])
    last_words = " ".join(words[-count:]) if len(words) >= count else " ".join(words)

    return (first_words, last_words)


def _fuzzy_match_score(a: str, b: str) -> float:
    """Return similarity ratio between two strings (0.0 to 1.0)."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


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
    search_radius: float = 3.0
) -> List[Dict[str, Any]]:
    """
    Monotonically aligns Gemini subtitle timestamps to Whisper's acoustic word boundaries.
    Prevents any reverse jumping, false matches, or cascading delay.
    """
    if not whisper_words:
        log_terminal("WARNING: No Whisper words available — keeping Gemini timestamps as fallback.")
        return gemini_events

    from app.netflix_models import format_timestamp as fmt_ts, calculate_cps

    total_events = len(gemini_events)
    total_w = len(whisper_words)
    w_idx = 0
    aligned_count = 0
    prev_end = 0.0

    for event in gemini_events:
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

        # 1. Monotonic search for first spoken word forward from w_idx
        # 1. Search for first spoken word within search_radius of orig_st
        for i in range(w_idx, min(total_w, w_idx + 40)):
            cand = _normalize_text(whisper_words[i]["word"])
            if not cand:
                continue
            time_diff = abs(whisper_words[i]["start"] - orig_st)
            if time_diff > search_radius and i > w_idx + 5:
                continue
            score = _fuzzy_match_score(first_w, cand)
            if score > 0.70 and score > best_s_score:
                best_s_score = score
                best_s_idx = i
                if score == 1.0:
                    break

        matched_start = whisper_words[best_s_idx]["start"] if best_s_idx is not None else orig_st
        s_idx = best_s_idx if best_s_idx is not None else w_idx

        # 2. Monotonic search for last spoken word forward from s_idx
        best_e_idx = None
        best_e_score = 0.0
        expected_len = len(clean_words)

        for j in range(s_idx, min(total_w, s_idx + expected_len + 15)):
            w_end = whisper_words[j]["end"]
            # Guard: cannot exceed 7.0s max subtitle duration or jump outside search radius
            if w_end > matched_start + 7.0:
                break
            if abs(w_end - orig_et) > search_radius + 1.5 and j > s_idx + expected_len:
                continue
            cand = _normalize_text(whisper_words[j]["word"])
            if not cand:
                continue
            score = _fuzzy_match_score(last_w, cand)
            if score > 0.70 and score > best_e_score:
                best_e_score = score
                best_e_idx = j
                if score == 1.0:
                    break

        if best_e_idx is not None:
            matched_end = whisper_words[best_e_idx]["end"]
            w_idx = best_e_idx + 1
            aligned_count += 1
        else:
            matched_end = min(orig_et, matched_start + 7.0)
            if best_s_idx is not None:
                w_idx = best_s_idx + min(len(clean_words), 5)
                aligned_count += 1

        # 3. Monotonic continuity: ensure start >= prev_end + 2-frame gap (0.083s)
        st = round(matched_start, 3)
        if st < prev_end:
            # If the event originally started after prev_end with a silence gap, preserve orig_st
            if orig_st > prev_end:
                st = round(orig_st, 3)
            else:
                st = round(prev_end + 0.083, 3)

        et = round(min(st + 7.0, max(st + 0.833, matched_end)), 3)
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
        f"Monotonic alignment complete: {aligned_count}/{total_events} events "
        f"acoustically locked to Whisper boundaries."
    )
    return gemini_events
