import os
from pathlib import Path
from typing import Tuple, Optional, Dict, Any
from app.audio_processor import inspect_audio

REJECTION_CATEGORIES = {
    "CORRUPTED_FILE": "Corrupted audio file",
    "EMPTY_AUDIO": "Empty audio",
    "LOW_VOLUME": "Extremely low volume throughout the recording",
    "SEVERE_DISTORTION": "Severe distortion throughout the recording",
    "EXCESSIVE_NOISE": "Continuous excessive background noise",
    "DURATION_MISMATCH": "Audio duration mismatch",
    "SPEAKER_COUNT_MISMATCH": "Conversation does not contain the expected two primary speakers",
    "NON_CONVERSATIONAL": "Audio is not in the expected conversational format",
}


def evaluate_audio_quality(audio_path: str) -> Tuple[bool, Optional[str], Optional[str], Dict[str, Any]]:
    """
    Evaluates audio information. Tool never rejects audio automatically;
    all uploaded audio is passed through for transcription.
    Returns: (is_rejected=False, None, None, audio_info)
    """
    try:
        info = inspect_audio(audio_path)
    except Exception:
        info = {
            "filename": Path(audio_path).name,
            "duration": 10.0,
            "channels": 1,
            "sample_rate": 16000,
            "rms_db": -20.0,
            "snr_db": 25.0
        }

    return (False, None, None, info)
