import os
from google import genai
from google.genai import types
from app.config import GEMINI_API_KEY
import soundfile as sf
import numpy as np
from pathlib import Path

client = genai.Client(api_key=GEMINI_API_KEY)

test_wav = "test_speech_quality.wav"
sr = 16000
t = np.linspace(0, 3, sr * 3, endpoint=False)
sig = 0.3 * np.sin(2 * np.pi * 300 * t)
sf.write(test_wav, sig.astype(np.float32), sr)

upload = client.files.upload(file=test_wav, config=dict(mime_type="audio/wav"))
print("Upload successful:", upload.name)

test_models = [
    "gemini-3.5-transcribe",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-flash-latest"
]

working_high_quality = []
for m in test_models:
    try:
        resp = client.models.generate_content(
            model=m,
            contents=[upload, "Transcribe this audio in JSON format: {\"text\": \"string\"}"],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        print(f"[SUCCESS] {m} -> text length: {len(resp.text or '')}")
        working_high_quality.append(m)
    except Exception as e:
        print(f"[FAILED]  {m} -> {str(e)[:120]}")

print("\n--- Summary of High Quality Working Models ---")
print(working_high_quality)

try:
    client.files.delete(name=upload.name)
except Exception:
    pass

if Path(test_wav).exists():
    Path(test_wav).unlink()
