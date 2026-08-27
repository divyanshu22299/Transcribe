import pytest
import numpy as np
import soundfile as sf
from pathlib import Path
import tempfile
import json

from app.models import Segment, TranscriptionResult, AudioAnalysis
from app.linter_engine import (
    lint_segment, lint_dataset, apply_auto_fixes,
    convert_all_digits_to_words, sanitize_karya_punctuation
)
from app.export_service import (
    export_to_csv, export_to_tsv, export_to_txt,
    export_to_docx, export_to_xlsx, export_to_json, export_to_srt,
    export_rejection_csv
)
from app.rejection_engine import evaluate_audio_quality


def test_digits_and_punctuation_linter():
    # Segment with digits, invalid punctuation (&, %, "), and code-mixing
    seg = Segment(
        segment_id=1,
        speaker="Speaker 1",
        gender="Male",
        start_time=0.5,
        end_time=4.2,
        duration=3.7,
        transcript="वह 3 आम लेकर meeting में 50% late पहुँचा & उसने कहा \"हेलो\"."
    )

    errors = lint_segment(seg, language="Hindi", script="Devanagari")
    err_types = [e.error_type for e in errors]

    assert "DIGITS_DETECTED" in err_types
    assert "DISALLOWED_PUNCTUATION" in err_types
    assert "CODE_MIXED_SCRIPT" in err_types


def test_number_conversion_and_punctuation_autofix():
    hindi_text = "मेरे पास 3 आम और 25 संतरे हैं 100% शुद्ध।"
    fixed_digits = convert_all_digits_to_words(hindi_text, language="Hindi")
    assert "तीन" in fixed_digits
    assert "पच्चीस" in fixed_digits

    sanitized = sanitize_karya_punctuation(fixed_digits, language="Hindi")
    assert "प्रतिशत" in sanitized
    assert "%" not in sanitized


def test_duration_and_overlap_linter():
    # Segment 1: Over 20s
    seg1 = Segment(
        segment_id=1,
        speaker="Speaker 1",
        gender="Male",
        start_time=0.0,
        end_time=25.0,
        duration=25.0,
        transcript="लंबा वाक्य।"
    )
    # Segment 2: Starts before seg1 ends (overlap)
    seg2 = Segment(
        segment_id=2,
        speaker="Speaker 2",
        gender="Female",
        start_time=20.0,
        end_time=22.0,
        duration=2.0,
        transcript="छोटा वाक्य।"
    )

    linted, score, total_errors, total_warnings = lint_dataset([seg1, seg2], language="Hindi")
    
    seg1_err_types = [e.error_type for e in linted[0].qc_errors]
    seg2_err_types = [e.error_type for e in linted[1].qc_errors]

    assert "DURATION_TOO_LONG" in seg1_err_types
    assert "TIMESTAMP_OVERLAP" in seg2_err_types


def test_auto_fix_pipeline():
    seg1 = Segment(
        segment_id=1,
        speaker="Speaker 1",
        gender="Male",
        start_time=0.0,
        end_time=4.0,
        duration=4.0,
        transcript="वह 2 लोग थे & खुश थे;"
    )
    seg2 = Segment(
        segment_id=2,
        speaker="Speaker 2",
        gender="Female",
        start_time=3.5, # Overlap
        end_time=6.0,
        duration=2.5,
        transcript="हाँ, बिल्कुल।"
    )

    fixed = apply_auto_fixes([seg1, seg2], language="Hindi", script="Devanagari")
    
    # Check no overlap
    assert fixed[1].start_time >= fixed[0].end_time
    # Check digits converted
    assert "दो" in fixed[0].transcript
    # Check & sanitized
    assert "&" not in fixed[0].transcript


def test_export_all_formats():
    seg = Segment(
        segment_id=1,
        speaker="Speaker 1",
        gender="Male",
        start_time=0.5,
        end_time=3.5,
        start_time_str="00:00:00.500",
        end_time_str="00:00:03.500",
        duration=3.0,
        transcript="वह काम बहुत जल्द कर दिया।",
        qc_errors=[],
        is_valid=True
    )
    res = TranscriptionResult(
        audio_id="test1234",
        filename="sample_conversation.wav",
        language="Hindi",
        script="Devanagari",
        audio_info=AudioAnalysis(
            filename="sample_conversation.wav",
            duration=3.5,
            sample_rate=16000,
            channels=1,
            rms_db=-18.5,
            snr_db=28.0
        ),
        segments=[seg],
        compliance_score=100.0,
        total_errors=0,
        total_warnings=0
    )

    # 1. CSV
    csv_out = export_to_csv(res)
    assert "sample_conversation.wav" in csv_out
    assert "वह काम बहुत जल्द कर दिया।" in csv_out

    # 2. TSV
    tsv_out = export_to_tsv(res, delimiter="\t")
    assert "\t" in tsv_out

    # 3. TXT
    txt_out = export_to_txt(res)
    assert "KARYA TRANSCRIPTION DELIVERABLE" in txt_out

    # 4. SRT
    srt_out = export_to_srt(res)
    assert "00:00:00,500 --> 00:00:03,500" in srt_out

    # 5. JSON
    json_out = export_to_json(res)
    parsed = json.loads(json_out)
    assert isinstance(parsed, list)
    assert parsed[0]["start_sec"] == 0.5
    assert parsed[0]["end_sec"] == 3.5
    assert parsed[0]["transcription"] == "वह काम बहुत जल्द कर दिया।"
    assert parsed[0]["speaker"] == "Speaker 1"
    assert parsed[0]["gender_label"] == "Male"

    # 6. DOCX & XLSX
    with tempfile.TemporaryDirectory() as tmp_dir:
        docx_path = Path(tmp_dir) / "test.docx"
        xlsx_path = Path(tmp_dir) / "test.xlsx"
        export_to_docx(res, str(docx_path))
        export_to_xlsx(res, str(xlsx_path))
        assert docx_path.exists()
        assert xlsx_path.exists()

    # 7. Rejection CSV
    rej_out = export_rejection_csv([{
        "filename": "bad_audio.wav",
        "rejection_category": "Corrupted audio file",
        "rejection_reason": "Header invalid",
        "duration": 0.0,
        "rms_db": -100.0,
        "snr_db": 0.0
    }])
    assert "bad_audio.wav" in rej_out
    assert "Corrupted audio file" in rej_out


def test_audio_rejection_evaluator():
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        temp_wav = f.name

    try:
        sr = 16000
        samples = np.zeros(int(sr * 1.0), dtype=np.float32)
        sf.write(temp_wav, samples, sr)

        is_rej, cat, reason, info = evaluate_audio_quality(temp_wav)
        # Tool never auto-rejects audio
        assert is_rej is False
        assert info["duration"] > 0
    finally:
        if Path(temp_wav).exists():
            Path(temp_wav).unlink()
