# Karya Conversational Speech Transcription & Segmentation Studio

An AI-powered web studio and high-throughput batch processing pipeline designed to ingest conversational audio files (2 speakers, mono-channel), automatically perform voice activity detection (VAD), speaker diarization (Speaker 1, Speaker 2), gender tagging, and generate 100% compliant Full Verbatim segmented transcriptions matching **Karya Quality Guidelines** ($\ge 98\%$ target acceptance accuracy).

---

## Key Features

- **Gemini 2.5 Multimodal AI Pipeline**: Direct acoustic-to-verbatim transcription with strict adherence to Karya rules (fillers, stutters with hyphens `म-म-मैं`, false starts, repetitions, numbers in words).
- **Universal Multilingual Support**: Select any source language and target script (Hindi/Devanagari, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, English, etc.).
- **Pure Script Enforcement (No Code-Mixing)**: Automatically transliterates foreign/English words into the target script (e.g. "meeting" $\rightarrow$ `मीटिंग`, "late" $\rightarrow$ `लेट`).
- **Punctuation Whitelist Enforcement**: Only `. , ? ! - _ ' ।` permitted. Disallowed characters and symbols are flagged and sanitized.
- **Numbers in Words (Rule 6.10)**: Strict prevention of digits (`0-9` or `०-९`). Converts numbers to full spoken words (e.g., `तीन`, `पच्चीस`, `एक सौ`).
- **Precise Millisecond Segmentation (Rule 5)**:
  - Min segment duration: `0.5s`
  - Max segment duration: `20.0s`
  - ~0.3s start & end buffers without cutting phonemes
  - Continuous silence or noise > 4.0s treated as segmentation boundaries
  - Non-overlapping timestamps (`End_Time[n] <= Start_Time[n+1]`)
- **Audio Rejection Engine (Rule 3)**: Automatically evaluates audio quality and generates Rejection Reports for corrupt, empty, low volume, distorted, or noisy audio.
- **Karya QA Compliance Linter & 1-Click Auto-Fixer**: Real-time compliance score (0–100%) with 1-click fixes for numbers, symbols, tags, and timestamp overlaps.
- **Interactive WaveSurfer Studio**: Waveform visualizer with segment timeline regions, speed controls (0.5x–2.0x), loop segment, split & merge tools.
- **Batch Processing Queue**: Bulk upload dozens/hundreds of audio files with concurrent workers, live progress, and 1-click consolidated ZIP export.
- **Universal Multi-Format Exporters**:
  1. **CSV** (Official Karya table)
  2. **TSV** (Tab-separated values)
  3. **TXT** (Human-readable conversation transcript)
  4. **Word (.docx)** (Formatted audit document with metadata & table)
  5. **Excel (.xlsx)** (Multi-sheet with summary & segments)
  6. **JSON** (Full structured dataset)
  7. **SRT** (Subtitles for video verification)
  8. **Rejection Report CSV** (Detailed rejection logs)

---

## Quick Start Guide

### 1. Configure Gemini API Key
Open `backend/.env` (or set the system environment variable `GEMINI_API_KEY`):
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
DEFAULT_LANGUAGE=Hindi
DEFAULT_SCRIPT=Devanagari
```

### 2. Launch the Application
Simply double-click `run_app.bat` or run:

**Backend:**
```bash
cd backend
venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm run dev
```

Open your browser at: **http://localhost:5173**

---

## Running Automated Tests

```bash
cd backend
venv\Scripts\python -m pytest tests/ -v
```
