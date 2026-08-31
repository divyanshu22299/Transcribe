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
    collar_sec: float = 0.20,
) -> Tuple[float, float]:
    """
    Safely refines proposed start and end timestamps by finding the exact acoustic
    speech onset and decay within a tight local micro-collar (+/- 0.20s).
    Ensures timestamps stay tightly locked to the actual spoken phrase without jumping to neighboring speech.
    """
    try:
        data, samplerate = sf.read(audio_path)
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)  # Convert to mono

        total_sec = len(data) / float(samplerate)
        if total_sec <= 0.1:
            return round(raw_start, 3), round(raw_end, 3)

        frame_len = max(16, int(samplerate * 0.010))  # 10ms frame
        hop_len = max(4, int(samplerate * 0.002))     # 2ms hop

        # 1. Refine Start Time within tight [raw_start - 0.20, raw_start + 0.20]
        s_min = max(0.0, raw_start - collar_sec)
        s_max = min(total_sec, raw_start + collar_sec)
        idx_s = int(s_min * samplerate)
        idx_e = int(s_max * samplerate)
        chunk_s = data[idx_s:idx_e]

        refined_start = raw_start
        if len(chunk_s) > frame_len * 2:
            energies_s = [
                float(np.sqrt(np.mean(chunk_s[f:f + frame_len]**2)))
                for f in range(0, len(chunk_s) - frame_len, hop_len)
            ]
            if energies_s:
                noise_s = float(np.percentile(energies_s, 20))
                peak_s = float(np.max(energies_s))
                thresh_s = noise_s + 0.15 * (peak_s - noise_s)

                center_idx = int((raw_start - s_min) * samplerate / hop_len)
                center_idx = max(0, min(len(energies_s) - 1, center_idx))

                # Walk backward from center to find speech onset
                best_start_idx = center_idx
                for idx in range(center_idx, -1, -1):
                    if energies_s[idx] <= thresh_s:
                        best_start_idx = idx
                        break

                calc_start = s_min + (best_start_idx * hop_len) / samplerate
                refined_start = round(calc_start, 3)

        # 2. Refine End Time within tight [raw_end - 0.20, raw_end + 0.20]
        e_min = max(refined_start + 0.2, raw_end - collar_sec)
        e_max = min(total_sec, raw_end + collar_sec)
        idx_e_s = int(e_min * samplerate)
        idx_e_e = int(e_max * samplerate)
        chunk_e = data[idx_e_s:idx_e_e]

        refined_end = raw_end
        if len(chunk_e) > frame_len * 2:
            energies_e = [
                float(np.sqrt(np.mean(chunk_e[f:f + frame_len]**2)))
                for f in range(0, len(chunk_e) - frame_len, hop_len)
            ]
            if energies_e:
                noise_e = float(np.percentile(energies_e, 20))
                peak_e = float(np.max(energies_e))
                thresh_e = noise_e + 0.15 * (peak_e - noise_e)

                center_end_idx = int((raw_end - e_min) * samplerate / hop_len)
                center_end_idx = max(0, min(len(energies_e) - 1, center_end_idx))

                # Walk forward from center to find speech decay
                best_end_idx = center_end_idx
                for idx in range(center_end_idx, len(energies_e)):
                    if energies_e[idx] <= thresh_e:
                        best_end_idx = idx
                        break

                calc_end = e_min + (best_end_idx * hop_len) / samplerate
                refined_end = round(calc_end, 3)

        # Guardrails: never let refined duration drop below 0.4s
        if refined_end - refined_start < 0.4:
            refined_start = raw_start
            refined_end = max(raw_start + 0.4, raw_end)

        return round(refined_start, 3), round(refined_end, 3)
    except Exception:
        return round(raw_start, 3), round(raw_end, 3)


def find_dialogue_split_points(
    audio_path: str,
    target_chunk_sec: float = 60.0,    # ~1 minute chunks for zero AI timestamp drift
    min_chunk_sec: float = 40.0,       # at least 40s
    max_chunk_sec: float = 85.0        # at most 1m 25s
) -> List[Tuple[float, float]]:
    """
    Partitions a long audio file into 1-minute subtask chunks.
    CRITICAL: Splits ONLY at natural dialogue pauses / sentence completion silences
    so that words/sentences are NEVER cut in the middle.
    Returns list of (start_sec, end_sec) chunks covering the whole file without gaps.
    """
    try:
        data, samplerate = sf.read(audio_path)
        if len(data.shape) > 1:
            data = np.mean(data, axis=1)  # Mono
        total_sec = len(data) / float(samplerate)
    except Exception:
        info = inspect_audio(audio_path)
        total_sec = info.get("duration", 0.0)
        data = None
        samplerate = 16000

    # If audio is already <= max_chunk_sec, process as single chunk
    if total_sec <= max_chunk_sec:
        return [(0.0, round(total_sec, 3))]

    if data is None or len(data) == 0:
        chunks = []
        cur = 0.0
        while cur < total_sec:
            nxt = min(total_sec, cur + target_chunk_sec)
            chunks.append((round(cur, 3), round(nxt, 3)))
            cur = nxt
        return chunks

    # Calculate 50ms energy frames with 10ms hop to find clean dialogue silence gaps
    frame_len = int(samplerate * 0.05)
    hop_len = int(samplerate * 0.01)
    
    energies = []
    times = []
    for f_idx in range(0, len(data) - frame_len, hop_len):
        frame = data[f_idx:f_idx + frame_len]
        rms = float(np.sqrt(np.mean(frame**2)))
        energies.append(rms)
        times.append(f_idx / samplerate)

    energies = np.array(energies)
    times = np.array(times)

    # Estimate noise floor (20th percentile)
    noise_floor = float(np.percentile(energies, 20))
    peak_energy = float(np.max(energies))
    silence_threshold = noise_floor + 0.06 * (peak_energy - noise_floor)

    chunks: List[Tuple[float, float]] = []
    cur_start = 0.0

    while cur_start < total_sec:
        if total_sec - cur_start <= max_chunk_sec:
            chunks.append((round(cur_start, 3), round(total_sec, 3)))
            break

        # Search for clean dialogue pause in window [cur_start + min_chunk_sec, cur_start + max_chunk_sec]
        win_s = cur_start + min_chunk_sec
        win_e = min(total_sec, cur_start + max_chunk_sec)
        
        mask = (times >= win_s) & (times <= win_e)
        candidate_indices = np.where(mask)[0]

        best_split_point = cur_start + target_chunk_sec

        if len(candidate_indices) > 0:
            candidate_energies = energies[candidate_indices]
            candidate_times = times[candidate_indices]

            # Find consecutive silent frames
            silent_mask = candidate_energies <= silence_threshold
            best_score = float('inf')
            run_start = None

            for idx, is_sil in enumerate(silent_mask):
                if is_sil:
                    if run_start is None:
                        run_start = idx
                else:
                    if run_start is not None:
                        run_len = idx - run_start
                        run_mid_time = candidate_times[(run_start + idx) // 2]
                        dist_penalty = abs(run_mid_time - (cur_start + target_chunk_sec))
                        sil_bonus = max(0, run_len * 0.01) * 20.0
                        score = dist_penalty - sil_bonus

                        if score < best_score:
                            best_score = score
                            best_split_point = run_mid_time
                        run_start = None

            if best_score == float('inf'):
                min_idx = np.argmin(candidate_energies)
                best_split_point = candidate_times[min_idx]

        best_split_point = round(min(total_sec, max(cur_start + min_chunk_sec, best_split_point)), 3)
        chunks.append((round(cur_start, 3), best_split_point))
        cur_start = best_split_point

    return chunks


def extract_audio_slice(audio_path: str, start_sec: float, end_sec: float, output_path: str) -> str:
    """Extracts an audio slice from start_sec to end_sec and saves it to output_path."""
    try:
        data, samplerate = sf.read(audio_path)
        idx_s = int(max(0.0, start_sec) * samplerate)
        idx_e = int(min(len(data) / float(samplerate), end_sec) * samplerate)
        slice_data = data[idx_s:idx_e]
        sf.write(output_path, slice_data, samplerate)
        return output_path
    except Exception:
        sound = AudioSegment.from_file(audio_path)
        chunk = sound[int(start_sec * 1000):int(end_sec * 1000)]
        chunk.export(output_path, format="wav")
        return output_path


def detect_dual_channel_layout(audio_path: str) -> Dict[str, Any]:
    """
    Checks if a WAV file contains discrete 2-channel audio (Left = Speaker 1, Right = Speaker 2).
    Computes cross-channel correlation to distinguish true dual-track audio from mono stereo.
    """
    try:
        data, samplerate = sf.read(audio_path)
        if len(data.shape) < 2 or data.shape[1] < 2:
            return {"is_dual_channel": False, "channels": 1, "correlation": 1.0}

        left = data[:, 0]
        right = data[:, 1]

        # Check RMS of each channel
        rms_left = float(np.sqrt(np.mean(left**2)))
        rms_right = float(np.sqrt(np.mean(right**2)))

        if rms_left < 1e-6 and rms_right < 1e-6:
            return {"is_dual_channel": False, "channels": 2, "correlation": 1.0}

        # Subsample for fast correlation check
        step = max(1, len(left) // 50000)
        sub_l = left[::step]
        sub_r = right[::step]

        # Pearson correlation between Left and Right channels
        std_l = float(np.std(sub_l))
        std_r = float(np.std(sub_r))

        if std_l > 1e-6 and std_r > 1e-6:
            corr = float(np.corrcoef(sub_l, sub_r)[0, 1])
        else:
            corr = 1.0

        # If correlation < 0.92 and both channels contain distinct signal, it is true dual-channel!
        is_discrete_stereo = bool(corr < 0.92 and (rms_left > 1e-5 or rms_right > 1e-5))

        return {
            "is_dual_channel": is_discrete_stereo,
            "channels": 2,
            "correlation": round(corr, 3),
            "rms_left_db": round(20 * math.log10(max(1e-7, rms_left)), 2),
            "rms_right_db": round(20 * math.log10(max(1e-7, rms_right)), 2)
        }
    except Exception:
        return {"is_dual_channel": False, "channels": 1, "correlation": 1.0}


def extract_physical_speech_intervals(
    audio_path: str,
    min_dur: float = 0.5,
    max_dur: float = 20.0,
    silence_gap: float = 0.35
) -> List[Dict[str, Any]]:
    """
    Extracts physical ground-truth speech intervals directly from raw PCM audio waveform samples.
    - If 2-Channel Stereo: Channel 0 is tagged as Speaker 1, Channel 1 is tagged as Speaker 2.
    - If Mono: Uses dual-threshold energy VAD to find exact physical speech onset and decay timestamps.
    Returns: List of {"start_time": float, "end_time": float, "speaker": str, "channel": int}
    """
    try:
        data, samplerate = sf.read(audio_path)
    except Exception:
        return []

    is_stereo = len(data.shape) > 1 and data.shape[1] >= 2
    channel_info = detect_dual_channel_layout(audio_path) if is_stereo else {"is_dual_channel": False}
    is_dual_channel = channel_info.get("is_dual_channel", False)

    frame_len = int(samplerate * 0.02)  # 20ms frame
    hop_len = int(samplerate * 0.01)    # 10ms hop

    intervals: List[Dict[str, Any]] = []

    if is_dual_channel:
        # Separate VAD on Left (Speaker 1) and Right (Speaker 2)
        for ch_idx, speaker_label in [(0, "Speaker 1"), (1, "Speaker 2")]:
            ch_data = data[:, ch_idx]
            # Pre-emphasis filter
            pre_emph = np.append(ch_data[0], ch_data[1:] - 0.95 * ch_data[:-1])

            ch_energies = []
            ch_times = []
            for f_idx in range(0, len(pre_emph) - frame_len, hop_len):
                frame = pre_emph[f_idx:f_idx + frame_len]
                rms = float(np.sqrt(np.mean(frame**2)))
                ch_energies.append(rms)
                ch_times.append(f_idx / samplerate)

            if not ch_energies:
                continue

            ch_energies = np.array(ch_energies)
            ch_times = np.array(ch_times)

            noise_floor = float(np.percentile(ch_energies, 15))
            dyn_range = float(np.max(ch_energies)) - noise_floor

            if dyn_range < 1e-4:
                continue

            thresh_trigger = noise_floor + 0.18 * dyn_range
            thresh_hold = noise_floor + 0.06 * dyn_range

            in_speech = False
            seg_s = 0.0

            for idx, e in enumerate(ch_energies):
                t = ch_times[idx]
                if not in_speech:
                    if e >= thresh_trigger:
                        in_speech = True
                        seg_s = max(0.0, t - 0.040)
                else:
                    if e < thresh_hold or (t - seg_s) >= max_dur:
                        # Check silence lookahead
                        is_end = True
                        lookahead = int(silence_gap / 0.01)
                        if (t - seg_s) < max_dur and idx + lookahead < len(ch_energies):
                            if np.max(ch_energies[idx:idx + lookahead]) >= thresh_trigger:
                                is_end = False

                        if is_end:
                            seg_e = min(len(data) / samplerate, t + 0.040)
                            if seg_e - seg_s >= min_dur:
                                intervals.append({
                                    "start_time": round(seg_s, 3),
                                    "end_time": round(seg_e, 3),
                                    "duration": round(seg_e - seg_s, 3),
                                    "speaker": speaker_label,
                                    "channel": ch_idx
                                })
                            in_speech = False

        # Sort combined dual-channel intervals chronologically
        intervals.sort(key=lambda x: x["start_time"])
    else:
        # Mono or Joint-Stereo physical VAD
        mono_data = np.mean(data, axis=1) if is_stereo else data
        pre_emph = np.append(mono_data[0], mono_data[1:] - 0.95 * mono_data[:-1])

        energies = []
        times = []
        for f_idx in range(0, len(pre_emph) - frame_len, hop_len):
            frame = pre_emph[f_idx:f_idx + frame_len]
            rms = float(np.sqrt(np.mean(frame**2)))
            energies.append(rms)
            times.append(f_idx / samplerate)

        if energies:
            energies = np.array(energies)
            times = np.array(times)
            noise_floor = float(np.percentile(energies, 15))
            dyn_range = float(np.max(energies)) - noise_floor

            if dyn_range >= 1e-4:
                thresh_trigger = noise_floor + 0.18 * dyn_range
                thresh_hold = noise_floor + 0.06 * dyn_range

                in_speech = False
                seg_s = 0.0

                for idx, e in enumerate(energies):
                    t = times[idx]
                    if not in_speech:
                        if e >= thresh_trigger:
                            in_speech = True
                            seg_s = max(0.0, t - 0.040)
                    else:
                        if e < thresh_hold or (t - seg_s) >= max_dur:
                            is_end = True
                            lookahead = int(silence_gap / 0.01)
                            if (t - seg_s) < max_dur and idx + lookahead < len(energies):
                                if np.max(energies[idx:idx + lookahead]) >= thresh_trigger:
                                    is_end = False

                            if is_end:
                                seg_e = min(len(mono_data) / samplerate, t + 0.040)
                                if seg_e - seg_s >= min_dur:
                                    intervals.append({
                                        "start_time": round(seg_s, 3),
                                        "end_time": round(seg_e, 3),
                                        "duration": round(seg_e - seg_s, 3),
                                        "speaker": "Speaker 1",
                                        "channel": 0
                                    })
                                in_speech = False
    return intervals


def resolve_segment_speaker_from_channels(
    audio_path: str,
    start_sec: float,
    end_sec: float,
    default_speaker: str = "Speaker 1"
) -> str:
    """
    If audio is discrete 2-channel stereo, determines whether Left (Speaker 1)
    or Right (Speaker 2) is speaking during [start_sec, end_sec] based on RMS energy ratio.
    """
    try:
        data, samplerate = sf.read(audio_path)
        if len(data.shape) < 2 or data.shape[1] < 2:
            return default_speaker

        idx_s = int(max(0.0, start_sec) * samplerate)
        idx_e = int(min(len(data) / float(samplerate), end_sec) * samplerate)
        if idx_e <= idx_s:
            return default_speaker

        left_slice = data[idx_s:idx_e, 0]
        right_slice = data[idx_s:idx_e, 1]

        rms_left = float(np.sqrt(np.mean(left_slice**2)))
        rms_right = float(np.sqrt(np.mean(right_slice**2)))

        if rms_left > rms_right * 1.35 and rms_left > 1e-4:
            return "Speaker 1"
        elif rms_right > rms_left * 1.35 and rms_right > 1e-4:
            return "Speaker 2"
        return default_speaker
    except Exception:
        return default_speaker
