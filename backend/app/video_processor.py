import os
import json
import logging
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional, Set
import imageio_ffmpeg

logger = logging.getLogger(__name__)

def get_ffmpeg_path() -> str:
    """Get FFmpeg binary path using imageio-ffmpeg.
    Fall back to system 'ffmpeg' if imageio-ffmpeg is not available.
    """
    try:
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if ffmpeg_exe and Path(ffmpeg_exe).exists():
            return str(ffmpeg_exe)
    except Exception as e:
        logger.warning(f"imageio_ffmpeg failed to get ffmpeg: {e}")
    
    # Fallback to system ffmpeg
    return "ffmpeg"


def get_video_metadata(video_path: str) -> dict:
    """Use FFprobe to extract metadata from video."""
    default_meta = {
        "duration": 0.0,
        "frame_rate": 24.0,
        "width": 0,
        "height": 0,
        "codec": "unknown",
        "audio_codec": "unknown",
        "audio_channels": 0,
        "audio_sample_rate": 0
    }
    
    ffprobe_exe = "ffprobe"
    try:
        ffmpeg_exe = get_ffmpeg_path()
        if ffmpeg_exe != "ffmpeg":
            ffprobe_dir = Path(ffmpeg_exe).parent
            # Basic ffprobe resolution in the same dir as ffmpeg
            ffprobe_path = ffprobe_dir / "ffprobe"
            if os.name == 'nt':
                ffprobe_path = ffprobe_path.with_suffix('.exe')
            if ffprobe_path.exists():
                ffprobe_exe = str(ffprobe_path)
    except Exception:
        ffprobe_exe = "ffprobe"

    cmd = [
        ffprobe_exe,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        video_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            
            # Duration from format
            if "format" in data and "duration" in data["format"]:
                default_meta["duration"] = float(data["format"]["duration"])
                
            # Stream info
            if "streams" in data:
                for stream in data["streams"]:
                    if stream.get("codec_type") == "video" and default_meta["codec"] == "unknown":
                        default_meta["codec"] = stream.get("codec_name", "unknown")
                        default_meta["width"] = int(stream.get("width", 0))
                        default_meta["height"] = int(stream.get("height", 0))
                        
                        # Frame rate
                        fr_str = stream.get("r_frame_rate", "24/1")
                        try:
                            if "/" in fr_str:
                                num, den = fr_str.split("/")
                                if float(den) != 0:
                                    default_meta["frame_rate"] = float(num) / float(den)
                            else:
                                default_meta["frame_rate"] = float(fr_str)
                        except Exception:
                            pass
                    
                    elif stream.get("codec_type") == "audio" and default_meta["audio_codec"] == "unknown":
                        default_meta["audio_codec"] = stream.get("codec_name", "unknown")
                        default_meta["audio_channels"] = int(stream.get("channels", 0))
                        default_meta["audio_sample_rate"] = int(stream.get("sample_rate", 0))
            default_meta["is_audio"] = (default_meta["width"] == 0 and default_meta["height"] == 0 and (default_meta["audio_channels"] > 0 or default_meta["duration"] > 0))
            return default_meta
    except Exception:
        pass
        
    # Robust fallback using ffmpeg -i directly
    meta = _parse_metadata_via_ffmpeg(video_path, default_meta)
    meta["is_audio"] = (meta.get("width", 0) == 0 and meta.get("height", 0) == 0 and (meta.get("audio_channels", 0) > 0 or meta.get("duration", 0) > 0))
    return meta


def _parse_metadata_via_ffmpeg(video_path: str, default_meta: dict) -> dict:
    """Fallback metadata parser using ffmpeg -i when ffprobe is not installed."""
    import re
    try:
        ffmpeg_exe = get_ffmpeg_path()
        res = subprocess.run([ffmpeg_exe, "-i", video_path], capture_output=True, text=True, timeout=10)
        err = res.stderr or ""
        
        # Parse duration
        dur_m = re.search(r'Duration:\s*(\d+):(\d+):([\d.]+)', err)
        if dur_m:
            h, m, s = dur_m.groups()
            default_meta["duration"] = round(int(h) * 3600 + int(m) * 60 + float(s), 3)

        # Parse resolution
        res_m = re.search(r'Stream.*Video:.*,\s*(\d{2,5})x(\d{2,5})', err)
        if res_m:
            default_meta["width"] = int(res_m.group(1))
            default_meta["height"] = int(res_m.group(2))

        # Parse FPS
        fps_m = re.search(r'([\d.]+)\s*fps', err)
        if fps_m:
            default_meta["frame_rate"] = float(fps_m.group(1))

        # Parse video codec
        codec_m = re.search(r'Video:\s*([a-zA-Z0-9_-]+)', err)
        if codec_m:
            default_meta["codec"] = codec_m.group(1)
            
        # Parse audio channels & sample rate
        audio_m = re.search(r'Audio:.*,\s*(\d+)\s*Hz,\s*([a-zA-Z0-9]+)', err)
        if audio_m:
            default_meta["audio_sample_rate"] = int(audio_m.group(1))
            ch_str = audio_m.group(2).lower()
            default_meta["audio_channels"] = 2 if "stereo" in ch_str else 1
    except Exception:
        pass
    default_meta["is_audio"] = (default_meta["width"] == 0 and default_meta["height"] == 0 and (default_meta["audio_channels"] > 0 or default_meta["duration"] > 0))
    return default_meta


def extract_audio_from_video(video_path: str, output_path: str = None) -> dict:
    """Extract or convert audio track from video/audio to 16kHz mono WAV file using FFmpeg."""
    base_path = os.path.splitext(video_path)[0]
    ext = Path(video_path).suffix.lower()

    if output_path is None:
        if ext == ".wav":
            output_path = f"{base_path}_audio.wav"
        else:
            output_path = f"{base_path}.wav"

    # Avoid FFmpeg crashing if input and output path resolve to the same file
    if os.path.abspath(video_path) == os.path.abspath(output_path):
        output_path = f"{base_path}_16k.wav"
        
    ffmpeg_exe = get_ffmpeg_path()
    
    cmd = [
        ffmpeg_exe,
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "-y",
        output_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            logger.error(f"FFmpeg extract audio error: {result.stderr}")
            return {
                "audio_path": None,
                "duration": 0.0,
                "sample_rate": 0,
                "channels": 0
            }
            
        if Path(output_path).exists():
            duration = get_video_metadata(video_path).get("duration", 0.0)
            return {
                "audio_path": output_path,
                "duration": duration,
                "sample_rate": 16000,
                "channels": 1
            }
            
    except Exception as e:
        logger.error(f"Exception during extract_audio_from_video: {e}")
        
    return {
        "audio_path": None,
        "duration": 0.0,
        "sample_rate": 0,
        "channels": 0
    }


def detect_shot_changes(video_path: str, threshold: float = 0.3) -> List[float]:
    """Use FFmpeg scene detection filter to find shot changes (skipped for audio-only files)."""
    ext = Path(video_path).suffix.lower()
    if ext in get_supported_audio_extensions():
        return []

    meta = get_video_metadata(video_path)
    if meta.get("width", 0) == 0 or meta.get("codec") in ["unknown", "none"]:
        return []

    ffmpeg_exe = get_ffmpeg_path()
    
    cmd = [
        ffmpeg_exe,
        "-i", video_path,
        "-filter:v", f"select='gt(scene,{threshold})',showinfo",
        "-f", "null",
        "-"
    ]
    
    timestamps = []
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        # FFmpeg showinfo filter outputs to stderr
        for line in result.stderr.splitlines():
            if "showinfo" in line and "pts_time:" in line:
                parts = line.split()
                for p in parts:
                    if p.startswith("pts_time:"):
                        try:
                            ts = float(p.split(":")[1])
                            timestamps.append(ts)
                        except Exception:
                            pass
                            
        timestamps.sort()
        return timestamps
    except Exception as e:
        logger.error(f"Exception detecting shot changes: {e}")
        return []


def get_frame_rate(video_path: str) -> float:
    """Extract exact frame rate from video using FFprobe."""
    meta = get_video_metadata(video_path)
    fr = meta.get("frame_rate", 24.0)
    if fr <= 0:
        return 24.0
    return fr


def seconds_to_frames(seconds: float, frame_rate: float) -> int:
    """Convert seconds to frame count."""
    if seconds < 0:
        return 0
    return int(round(seconds * frame_rate))


def frames_to_seconds(frames: int, frame_rate: float) -> float:
    """Convert frame count to seconds."""
    if frames < 0:
        return 0.0
    if frame_rate <= 0:
        return 0.0
    return float(frames) / frame_rate


def generate_video_thumbnail(video_path: str, time_seconds: float, output_path: str = None) -> str:
    """Generate a thumbnail image at a specific timestamp."""
    if output_path is None:
        base_path = os.path.splitext(video_path)[0]
        output_path = f"{base_path}_thumb.jpg"
        
    ffmpeg_exe = get_ffmpeg_path()
    
    cmd = [
        ffmpeg_exe,
        "-ss", str(time_seconds),
        "-i", video_path,
        "-vframes", "1",
        "-q:v", "2",
        "-y",
        output_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and Path(output_path).exists():
            return output_path
        else:
            logger.error(f"FFmpeg thumbnail error: {result.stderr}")
    except Exception as e:
        logger.error(f"Error generating thumbnail: {e}")
        
    return ""


def get_supported_video_extensions() -> set:
    """Return set of supported video extensions."""
    return {'.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.wmv', '.flv'}


def get_supported_audio_extensions() -> set:
    """Return set of supported audio extensions."""
    return {'.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.wma', '.opus'}


def get_supported_media_extensions() -> set:
    """Return union of supported video and audio extensions."""
    return get_supported_video_extensions() | get_supported_audio_extensions()


def validate_media_file(media_path: str) -> dict:
    """Check if file exists, has valid media extension, and has audio or video stream."""
    res = {
        "is_valid": False,
        "has_video": False,
        "has_audio": False,
        "is_audio_only": False,
        "error_message": "",
        "metadata": {}
    }
    
    if not Path(media_path).exists():
        res["error_message"] = "File does not exist."
        return res
        
    ext = Path(media_path).suffix.lower()
    if ext not in get_supported_media_extensions():
        res["error_message"] = f"Unsupported media format {ext}. Supported formats: {', '.join(sorted(get_supported_media_extensions()))}"
        return res
        
    meta = get_video_metadata(media_path)
    res["metadata"] = meta
    
    if meta.get("codec") != "unknown" and meta.get("width", 0) > 0:
        res["has_video"] = True
        
    if (meta.get("audio_codec") != "unknown" and meta.get("audio_channels", 0) > 0) or ext in get_supported_audio_extensions() or meta.get("duration", 0) > 0:
        res["has_audio"] = True
        
    if not res["has_video"] and not res["has_audio"]:
        res["error_message"] = "No valid video or audio stream found in media file."
        return res
        
    res["is_audio_only"] = not res["has_video"] and res["has_audio"]
    meta["is_audio"] = res["is_audio_only"]
    res["is_valid"] = True
    return res


def validate_video_file(video_path: str) -> dict:
    """Check media validity, supporting both video and audio files."""
    return validate_media_file(video_path)

