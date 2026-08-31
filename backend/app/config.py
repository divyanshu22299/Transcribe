import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend directory or root directory
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
DATABASE_URL = os.getenv("DATABASE_URL", "")
DEFAULT_LANGUAGE = os.getenv("DEFAULT_LANGUAGE", "Auto-Detect")
DEFAULT_SCRIPT = os.getenv("DEFAULT_SCRIPT", "Auto-Detect")

# Audio processing constants based on Karya guidelines
MAX_SEGMENT_DURATION = float(os.getenv("MAX_SEGMENT_DURATION", "20.0"))
MIN_SEGMENT_DURATION = float(os.getenv("MIN_SEGMENT_DURATION", "0.5"))
SEGMENT_BUFFER_SEC = float(os.getenv("SEGMENT_BUFFER_SEC", "0.3"))
MAX_SILENCE_SEC = float(os.getenv("MAX_SILENCE_SEC", "4.0"))

UPLOAD_DIR = BASE_DIR / "uploads"
EXPORTS_DIR = BASE_DIR / "exports"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
