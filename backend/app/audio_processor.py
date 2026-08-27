import os
import math
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
import soundfile as sf
from pydub import AudioSegment
import imageio_ffmpeg

from app.config import (
    MAX_SEGMENT_DURATION,
    MIN_SEGMENT_DURATION,
    SEGMENT_BUFFER_SEC,
    MAX_SILENCE_SEC
)

# Configure ffmpeg for pydub safely
try:
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    if ffmpeg_exe and Path(ffmpeg_exe).exists():
        AudioSegment.converter = ffmpeg_exe
        AudioSegment.ffmpeg = ffmpeg_exe
        ffmpeg_dir = str(Path(ffmpeg_exe).parent)
        if ffmpeg_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
except Exception:
    pass


def format_timestamp(seconds: float) -> str:
    """Format seconds into HH:MM:SS.mmm string."""
    if seconds < 0:
        seconds = 0.0
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"


def parse_timestamp(timestamp_str: str) -> float:
    """Parse HH:MM:SS.mmm or MM:SS.mmm or pure float seconds string."""
    timestamp_str = timestamp_str.strip()
    try:
        if ":" in timestamp_str:
            parts = timestamp_str.split(":")
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
            elif len(parts) == 2:
                return int(parts[0]) * 60 + float(parts[1])
        return float(timestamp_str)
    except Exception:
        return 0.0


def inspect_audio(audio_path: str) -> Dict[str, Any]:
    """Safely inspect audio properties without throwing unhandled exceptions."""
    filename = Path(audio_path).name
    duration = 0.0
    channels = 1
    sample_rate = 16000
    rms_db = -20.0
    snr_db = 25.0

    # Try soundfile first (pure binary libsndfile, no ffmpeg subprocess needed)
    try:
        sf_info = sf.info(audio_path)
        duration = float(sf_info.duration)
        channels = int(sf_info.channels)
        sample_rate = int(sf_info.samplerate)
    except Exception:
        pass

    # Try pydub if duration not yet determined
    if duration <= 0:
        try:
            sound = AudioSegment.from_file(audio_path)
            duration = float(sound.duration_seconds)
            channels = int(sound.channels)
            sample_rate = int(sound.frame_rate)
            if sound.dBFS != float("-inf"):
                rms_db = float(sound.dBFS)
        except Exception:
            pass

    # Fallback duration estimate from file size if needed
    if duration <= 0:
        try:
            file_size_bytes = Path(audio_path).stat().st_size
            # Rough estimate ~16KB/sec for standard 128kbps audio
            duration = max(1.0, round(file_size_bytes / 16000.0, 2))
        except Exception:
            duration = 10.0

    return {
        "filename": filename,
        "duration": round(duration, 3),
        "channels": channels,
        "sample_rate": sample_rate,
        "rms_db": round(rms_db, 2),
        "snr_db": round(snr_db, 2),
    }


def detect_speech_boundaries(
    audio_path: str,
    min_silence_len_ms: int = 400,
    silence_thresh_offset_db: float = 16.0,
    max_duration_sec: float = MAX_SEGMENT_DURATION,
    min_duration_sec: float = MIN_SEGMENT_DURATION,
    buffer_sec: float = SEGMENT_BUFFER_SEC,
    max_silence_boundary_sec: float = MAX_SILENCE_SEC
) -> List[Tuple[float, float]]:
    """
    Detect speech intervals complying with Karya segmentation rules:
    - Min duration: 0.5s
    - Max duration: 20.0s
    - Buffer ~0.3s start & end
    - No silence > 4s inside segment
    - Non-overlapping
    """
    try:
        sound = AudioSegment.from_file(audio_path)
        total_duration = sound.duration_seconds
        
        if total_duration < min_duration_sec:
            return [(0.0, total_duration)]

        # Dynamic silence threshold based on average loudness
        avg_db = sound.dBFS
        silence_thresh = avg_db - silence_thresh_offset_db if avg_db > -60 else -40.0

        # Non-silent chunk detection
        from pydub.silence import detect_nonsilent
        nonsilent_ranges = detect_nonsilent(
            sound,
            min_silence_len=min_silence_len_ms,
            silence_thresh=silence_thresh
        )
    except Exception:
        nonsilent_ranges = []
        info = inspect_audio(audio_path)
        total_duration = info.get("duration", 10.0)

    if not nonsilent_ranges:
        # Fallback: divide audio into uniform 10-second segments
        raw_segments = []
        cur = 0.0
        while cur < total_duration:
            end = min(cur + 10.0, total_duration)
            raw_segments.append((round(cur, 3), round(end, 3)))
            cur = end
        return raw_segments if raw_segments else [(0.0, max(5.0, total_duration))]

    # Convert ms ranges to float seconds
    raw_segments: List[Tuple[float, float]] = []
    for start_ms, end_ms in nonsilent_ranges:
        s_sec = max(0.0, start_ms / 1000.0)
        e_sec = min(total_duration, end_ms / 1000.0)
        if e_sec - s_sec >= 0.1:
            raw_segments.append((s_sec, e_sec))

    # Merge very close segments (gap < 0.3s) if merged length <= max_duration_sec
    merged_segments: List[Tuple[float, float]] = []
    if raw_segments:
        cur_s, cur_e = raw_segments[0]
        for s, e in raw_segments[1:]:
            gap = s - cur_e
            # If gap is short and total duration stays under 20s and gap < 4.0s
            if gap < 0.5 and (e - cur_s) <= max_duration_sec and gap < max_silence_boundary_sec:
                cur_e = e
            else:
                merged_segments.append((cur_s, cur_e))
                cur_s, cur_e = s, e
        merged_segments.append((cur_s, cur_e))
    else:
        merged_segments = [(0.0, total_duration)]

    # Split segments longer than max_duration_sec (20.0s)
    split_segments: List[Tuple[float, float]] = []
    for s, e in merged_segments:
        seg_dur = e - s
        if seg_dur > max_duration_sec:
            # Split into chunks of at most 15-18s
            num_splits = math.ceil(seg_dur / 15.0)
            chunk_len = seg_dur / num_splits
            for i in range(num_splits):
                cs = s + (i * chunk_len)
                ce = min(e, s + ((i + 1) * chunk_len))
                if ce - cs >= min_duration_sec:
                    split_segments.append((cs, ce))
        elif seg_dur >= min_duration_sec:
            split_segments.append((s, e))

    if not split_segments:
        split_segments = [(0.0, min(total_duration, 15.0))]

    # Apply ~0.3s buffer at start & end, strictly preventing overlaps
    buffered_segments: List[Tuple[float, float]] = []
    prev_end = 0.0

    for i, (s, e) in enumerate(split_segments):
        # Buffered start: at least prev_end, with up to 0.3s buffer
        buffered_s = max(prev_end, s - buffer_sec)
        buffered_s = max(0.0, buffered_s)
        
        # Next segment start
        next_s = split_segments[i+1][0] if i+1 < len(split_segments) else total_duration
        
        # Buffered end: at most next_s, with up to 0.3s buffer
        buffered_e = min(total_duration, e + buffer_sec)
        if i + 1 < len(split_segments):
            buffered_e = min(buffered_e, (e + next_s) / 2.0)
        
        # Ensure minimum duration
        if buffered_e - buffered_s < min_duration_sec:
            buffered_e = min(total_duration, buffered_s + min_duration_sec)
            
        # Ensure maximum duration
        if buffered_e - buffered_s > max_duration_sec:
            buffered_e = buffered_s + max_duration_sec

        # Ensure no overlap
        buffered_s = round(buffered_s, 3)
        buffered_e = round(buffered_e, 3)
        if buffered_e > buffered_s:
            buffered_segments.append((buffered_s, buffered_e))
            prev_end = buffered_e

    return buffered_segments


def snap_to_acoustic_boundaries(
    audio_path: str,
    raw_start: float,
    raw_end: float,
    window_sec: float = 1.2,
) -> Tuple[float, float]:
    """
    Refines a proposed start and end timestamp by snapping to the exact physical
    vocal tract acoustic energy onset and decay points in the audio waveform (millisecond accuracy).
    Uses high-frequency pre-emphasis, local adaptive noise floor estimation, and dual-threshold VAD.
    """
    try:
        data, samplerate = sf.read(audio_path)
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)  # Convert to mono
        
        total_sec = len(data) / float(samplerate)
        if total_sec <= 0.1:
            return round(raw_start, 3), round(raw_end, 3)

        # Apply pre-emphasis filter to boost speech formants and unvoiced consonants
        pre_emph = np.append(data[0], data[1:] - 0.95 * data[:-1])

        frame_len = max(16, int(samplerate * 0.015))  # 15ms frame
        hop_len = max(4, int(samplerate * 0.003))     # 3ms hop

        # 1. Refine Start Time: search in [raw_start - window_sec, raw_start + window_sec]
        search_s = max(0.0, raw_start - window_sec)
        search_e = min(total_sec, raw_start + window_sec)
        idx_s = int(search_s * samplerate)
        idx_e = int(search_e * samplerate)
        chunk_start = pre_emph[idx_s:idx_e]

        refined_start = raw_start
        if len(chunk_start) > frame_len * 3:
            energies = []
            for f_idx in range(0, len(chunk_start) - frame_len, hop_len):
                frame = chunk_start[f_idx:f_idx + frame_len]
                rms = float(np.sqrt(np.mean(frame**2)))
                energies.append(rms)
            
            if energies:
                # Estimate local background noise floor (15th percentile)
                noise_floor = float(np.percentile(energies, 15))
                peak_energy = float(np.max(energies))
                dynamic_range = peak_energy - noise_floor

                if dynamic_range > 1e-4:
                    t_trigger = noise_floor + 0.22 * dynamic_range
                    t_onset = noise_floor + 0.08 * dynamic_range

                    for i in range(len(energies) - 2):
                        if energies[i] >= t_trigger and energies[i+1] >= t_trigger:
                            onset_idx = i
                            while onset_idx > 0 and energies[onset_idx] >= t_onset:
                                onset_idx -= 1
                            
                            first_speech_time = search_s + (onset_idx * hop_len) / samplerate
                            refined_start = round(max(0.0, first_speech_time - 0.030), 3)
                            break

        # 2. Refine End Time: search in [raw_end - window_sec, raw_end + window_sec]
        search_end_s = max(refined_start + 0.2, raw_end - window_sec)
        search_end_e = min(total_sec, raw_end + window_sec)
        idx_end_s = int(search_end_s * samplerate)
        idx_end_e = int(search_end_e * samplerate)
        chunk_end = pre_emph[idx_end_s:idx_end_e]

        refined_end = raw_end
        if len(chunk_end) > frame_len * 3:
            energies_end = []
            for f_idx in range(0, len(chunk_end) - frame_len, hop_len):
                frame = chunk_end[f_idx:f_idx + frame_len]
                rms = float(np.sqrt(np.mean(frame**2)))
                energies_end.append(rms)

            if energies_end:
                noise_floor_end = float(np.percentile(energies_end, 15))
                peak_end = float(np.max(energies_end))
                dynamic_range_end = peak_end - noise_floor_end

                if dynamic_range_end > 1e-4:
                    t_trigger_end = noise_floor_end + 0.20 * dynamic_range_end
                    t_decay_end = noise_floor_end + 0.07 * dynamic_range_end

                    for i in range(len(energies_end) - 1, 1, -1):
                        if energies_end[i] >= t_trigger_end and energies_end[i-1] >= t_trigger_end:
                            decay_idx = i
                            while decay_idx < len(energies_end) - 1 and energies_end[decay_idx] >= t_decay_end:
                                decay_idx += 1
                            
                            last_speech_time = search_end_s + (decay_idx * hop_len + frame_len) / samplerate
                            refined_end = round(min(total_sec, last_speech_time + 0.040), 3)
                            break

        if refined_end <= refined_start:
            refined_end = round(refined_start + 0.5, 3)

        return round(refined_start, 3), round(refined_end, 3)
    except Exception:
        return round(raw_start, 3), round(raw_end, 3)
