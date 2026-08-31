import os
import asyncio
import shutil
import uuid
import json
import io
import time
from collections import defaultdict
from pathlib import Path
from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from app.config import UPLOAD_DIR, EXPORTS_DIR, GEMINI_API_KEY, GEMINI_MODEL, DEFAULT_LANGUAGE, DEFAULT_SCRIPT
from app.models import (
    TranscriptionResult, Segment, LintRequest, AutoFixRequest, ExportRequest, BatchTask, AudioAnalysis, WordConfidence, QCError
)
from app.gemini_transcriber import process_audio_file
from app.linter_engine import lint_dataset, apply_auto_fixes
from app.rejection_engine import evaluate_audio_quality
from app.export_service import (
    export_to_csv, export_to_tsv, export_to_txt,
    export_to_docx, export_to_xlsx, export_to_json, export_to_srt, export_to_vtt,
    export_rejection_csv
)
from app.batch_runner import batch_manager
from app.db import init_db, get_db_session, DBProject, DBSegment

# In-memory storage for active sessions with TTL eviction (BUG-W2)
active_sessions = {}
SESSION_TTL_SECONDS = 7200  # 2 hours

def _evict_expired_sessions():
    """BUG-W2: Evict expired sessions from memory."""
    now = time.time()
    expired = [
        k for k, v in active_sessions.items()
        if now - v.get("created_at", now) > SESSION_TTL_SECONDS
    ]
    for k in expired:
        active_sessions.pop(k, None)


# BUG-W1: In-memory sliding window rate limiter
_client_request_history = defaultdict(list)
RATE_LIMIT_PER_MINUTE = 30

def _check_rate_limit(client_ip: str):
    """BUG-W1: Enforce sliding window rate limit per client IP."""
    now = time.time()
    history = _client_request_history[client_ip]
    _client_request_history[client_ip] = [t for t in history if now - t < 60]
    if len(_client_request_history[client_ip]) >= RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Maximum 30 requests per minute allowed."
        )
    _client_request_history[client_ip].append(now)


def _cleanup_old_uploads():
    """Remove uploaded audio files older than 24 hours."""
    cutoff = time.time() - 86400  # 24 hours
    for f in UPLOAD_DIR.glob("*"):
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle handler."""
    _cleanup_old_uploads()
    _evict_expired_sessions()
    init_db()
    yield


app = FastAPI(
    title="Karya Conversational Audio Transcription & Segmentation Studio",
    description="Automated verbatim transcription, speaker diarization, QA linter & batch pipeline",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for frontend communication
# BUG-12: In production, set ALLOWED_ORIGINS env var to your frontend domain(s).
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    """REL-07: Add modern security response headers."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    return response


# In-memory storage for active sessions
active_sessions = {}


@app.get("/")
@app.head("/")
def root_endpoint():
    """Root health check for UptimeRobot, Render health checks & load balancers."""
    return {
        "status": "healthy",
        "service": "Karya Conversational Audio Transcription Studio",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health"
    }


@app.get("/api/health")
@app.head("/api/health")
async def health_check():
    has_api_key = bool(GEMINI_API_KEY and len(GEMINI_API_KEY.strip()) > 5)
    return {
        "status": "healthy",
        "has_gemini_api_key": has_api_key,
        "default_model": GEMINI_MODEL,
        "default_language": DEFAULT_LANGUAGE,
        "default_script": DEFAULT_SCRIPT,
        "version": "1.0.0"
    }


MAX_UPLOAD_SIZE_BYTES = 200 * 1024 * 1024  # 200 MB limit


@app.post("/api/upload")
async def upload_audio(request: Request, file: UploadFile = File(...)):
    """Upload single audio file and perform initial inspection."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    _check_rate_limit(client_ip)

    # Validate file size
    if file.size and file.size > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum supported audio file size is 200MB."
        )

    unique_prefix = uuid.uuid4().hex[:8]
    safe_filename = f"{unique_prefix}_{file.filename}"
    file_path = UPLOAD_DIR / safe_filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    info = inspect_audio(str(file_path))
    audio_id = Path(safe_filename).stem

    active_sessions[audio_id] = {
        "filename": safe_filename,
        "file_path": str(file_path),
        "info": info,
        "is_rejected": False,
        "rejection_category": None,
        "rejection_reason": None,
        "created_at": time.time()
    }

    return {
        "audio_id": audio_id,
        "filename": safe_filename,
        "audio_info": info,
        "is_rejected": False,
        "rejection_category": None,
        "rejection_reason": None
    }


def _save_transcription_to_db(result: "TranscriptionResult", target_path: str):
    """Synchronous helper: save transcription project & segments to Neon PostgreSQL DB."""
    session = get_db_session()
    if not session:
        return
    try:
        db_proj = session.query(DBProject).filter(DBProject.id == result.audio_id).first()
        if not db_proj:
            db_proj = DBProject(
                id=result.audio_id,
                filename=result.filename,
                audio_path=target_path,
                language=result.language,
                script=result.script,
                duration=result.audio_info.duration if result.audio_info else 0.0,
                compliance_score=result.compliance_score,
                total_errors=result.total_errors,
                total_warnings=result.total_warnings,
                audio_info=result.audio_info.model_dump_json() if result.audio_info else "{}"
            )
            session.add(db_proj)
        else:
            db_proj.filename = result.filename
            db_proj.language = result.language
            db_proj.script = result.script
            db_proj.compliance_score = result.compliance_score
            db_proj.total_errors = result.total_errors
            db_proj.total_warnings = result.total_warnings
            session.query(DBSegment).filter(DBSegment.project_id == db_proj.id).delete()

        for seg in result.segments:
            db_seg = DBSegment(
                project_id=result.audio_id,
                segment_id=seg.segment_id,
                speaker=seg.speaker,
                gender=seg.gender,
                start_time=seg.start_time,
                end_time=seg.end_time,
                duration=seg.duration,
                transcript=seg.transcript,
                confidence=seg.confidence,
                words_data=json.dumps([w.model_dump() for w in seg.words], ensure_ascii=False) if seg.words else "[]",
                qc_errors_data=json.dumps([e.model_dump() for e in seg.qc_errors], ensure_ascii=False) if seg.qc_errors else "[]",
                is_valid=seg.is_valid
            )
            session.add(db_seg)

        session.commit()
    except Exception as db_err:
        session.rollback()
        print(f"Neon DB save warning: {db_err}")
    finally:
        session.close()


@app.post("/api/transcribe")
async def transcribe_audio(
    request: Request,
    file: Optional[UploadFile] = File(None),
    audio_id: Optional[str] = Form(None),
    language: str = Form("Auto-Detect"),
    script: str = Form("Auto-Detect"),
    api_key: Optional[str] = Form(None),
    model_name: Optional[str] = Form(None)
):
    """Transcribe single audio file using Gemini pipeline + Karya linting."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    _check_rate_limit(client_ip)
    if file:
        unique_prefix = uuid.uuid4().hex[:8]
        safe_filename = f"{unique_prefix}_{file.filename}"
        file_path = UPLOAD_DIR / safe_filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        target_path = str(file_path)
    elif audio_id and audio_id in active_sessions:
        target_path = active_sessions[audio_id]["file_path"]
    else:
        raise HTTPException(status_code=400, detail="Audio file or valid audio_id is required.")

    try:
        result = process_audio_file(
            audio_path=target_path,
            language=language,
            script=script,
            api_key=api_key,
            model_name=model_name or GEMINI_MODEL
        )
    except Exception as trans_err:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(trans_err)}"
        )

    active_sessions[result.audio_id] = {
        "filename": result.filename,
        "file_path": target_path,
        "result": result
    }

    # Automatically save transcription project & segments to Neon PostgreSQL DB
    await asyncio.to_thread(_save_transcription_to_db, result, target_path)

    return result


def _list_projects_from_db():
    session = get_db_session()
    if not session:
        return []
    try:
        projects = session.query(DBProject).order_by(DBProject.updated_at.desc()).all()
        result = []
        for p in projects:
            result.append({
                "id": p.id,
                "filename": p.filename,
                "language": p.language,
                "script": p.script,
                "duration": p.duration,
                "compliance_score": p.compliance_score,
                "total_errors": p.total_errors,
                "total_warnings": p.total_warnings,
                "segment_count": len(p.segments),
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None
            })
        return result
    finally:
        session.close()


@app.get("/api/projects")
async def list_projects():
    """List all saved projects from Neon PostgreSQL DB."""
    try:
        projects = await asyncio.to_thread(_list_projects_from_db)
        return {"projects": projects}
    except Exception as e:
        return {"projects": [], "error": str(e)}


def _get_project_details_from_db(project_id: str):
    session = get_db_session()
    if not session:
        raise ValueError("Database not available")
    try:
        proj = session.query(DBProject).filter(DBProject.id == project_id).first()
        if not proj:
            return None

        segments_out = []
        for s in proj.segments:
            words = []
            if s.words_data:
                try:
                    words = json.loads(s.words_data)
                except Exception:
                    pass
            qc_errors = []
            if s.qc_errors_data:
                try:
                    qc_errors = json.loads(s.qc_errors_data)
                except Exception:
                    pass

            segments_out.append({
                "segment_id": s.segment_id,
                "speaker": s.speaker,
                "gender": s.gender,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "duration": s.duration,
                "transcript": s.transcript,
                "confidence": s.confidence,
                "words": words,
                "qc_errors": qc_errors,
                "is_valid": s.is_valid
            })

        audio_info_parsed = {}
        if proj.audio_info:
            try:
                audio_info_parsed = json.loads(proj.audio_info)
            except Exception:
                pass

        return {
            "audio_id": proj.id,
            "filename": proj.filename,
            "language": proj.language,
            "script": proj.script,
            "duration": proj.duration,
            "compliance_score": proj.compliance_score,
            "total_errors": proj.total_errors,
            "total_warnings": proj.total_warnings,
            "audio_info": audio_info_parsed,
            "segments": segments_out
        }
    finally:
        session.close()


@app.get("/api/projects/{project_id}")
async def get_project_details(project_id: str):
    """Retrieve full project details with all segments and word confidence from Neon DB."""
    try:
        data = await asyncio.to_thread(_get_project_details_from_db, project_id)
        if not data:
            raise HTTPException(status_code=404, detail="Project not found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _save_project_to_db(payload: dict):
    session = get_db_session()
    if not session:
        raise ValueError("Database not initialized")
    try:
        project_data = payload.get("result", {})
        proj_id = project_data.get("audio_id") or str(uuid.uuid4())[:8]
        filename = project_data.get("filename") or "audio_transcript.wav"

        db_proj = session.query(DBProject).filter(DBProject.id == proj_id).first()
        if not db_proj:
            db_proj = DBProject(
                id=proj_id,
                filename=filename,
                language=project_data.get("language", "Hindi"),
                script=project_data.get("script", "Devanagari"),
                duration=float(project_data.get("audio_info", {}).get("duration", 0.0)),
                compliance_score=float(project_data.get("compliance_score", 100.0)),
                total_errors=int(project_data.get("total_errors", 0)),
                total_warnings=int(project_data.get("total_warnings", 0)),
                audio_info=json.dumps(project_data.get("audio_info", {}))
            )
            session.add(db_proj)
        else:
            db_proj.filename = filename
            db_proj.language = project_data.get("language", db_proj.language)
            db_proj.script = project_data.get("script", db_proj.script)
            db_proj.compliance_score = float(project_data.get("compliance_score", db_proj.compliance_score))
            db_proj.total_errors = int(project_data.get("total_errors", db_proj.total_errors))
            db_proj.total_warnings = int(project_data.get("total_warnings", db_proj.total_warnings))
            session.query(DBSegment).filter(DBSegment.project_id == db_proj.id).delete()

        raw_segments = project_data.get("segments", [])
        for seg in raw_segments:
            words_data = json.dumps(seg.get("words", []), ensure_ascii=False)
            qc_errors_data = json.dumps(seg.get("qc_errors", []), ensure_ascii=False)
            db_seg = DBSegment(
                project_id=proj_id,
                segment_id=int(seg.get("segment_id", 1)),
                speaker=str(seg.get("speaker", "Speaker 1")),
                gender=str(seg.get("gender", "Male")),
                start_time=float(seg.get("start_time", 0.0)),
                end_time=float(seg.get("end_time", 2.0)),
                duration=float(seg.get("duration", 2.0)),
                transcript=str(seg.get("transcript", "")),
                confidence=float(seg.get("confidence", 1.0)),
                words_data=words_data,
                qc_errors_data=qc_errors_data,
                is_valid=bool(seg.get("is_valid", True))
            )
            session.add(db_seg)

        session.commit()
        return proj_id
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@app.post("/api/projects/save")
async def save_project(payload: dict):
    """Save or update project edits into Neon PostgreSQL DB."""
    try:
        proj_id = await asyncio.to_thread(_save_project_to_db, payload)
        return {"status": "success", "project_id": proj_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def _delete_project_from_db(project_id: str):
    session = get_db_session()
    if not session:
        raise ValueError("Database not available")
    try:
        session.query(DBProject).filter(DBProject.id == project_id).delete()
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete project from Neon DB."""
    try:
        await asyncio.to_thread(_delete_project_from_db, project_id)
        return {"status": "success", "deleted_id": project_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/audio/{filename}")
async def get_audio_stream(filename: str):
    """Stream audio file for WaveSurfer browser player."""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        # Search in uploads directory
        matches = list(UPLOAD_DIR.glob(f"{filename}*"))
        if matches:
            file_path = matches[0]
        else:
            raise HTTPException(status_code=404, detail="Audio file not found.")

    suffix = file_path.suffix.lower()
    media_type = "audio/wav"
    if suffix == ".mp3":
        media_type = "audio/mp3"
    elif suffix in [".m4a", ".aac"]:
        media_type = "audio/mp4"
    elif suffix == ".ogg":
        media_type = "audio/ogg"

    return FileResponse(file_path, media_type=media_type)


@app.post("/api/lint")
async def lint_segments_endpoint(payload: dict):
    """REL-06: Re-lint segment list after manual edits with resilient schema validation."""
    segments_raw = payload.get("segments", [])
    language = payload.get("language", "Hindi")
    script = payload.get("script", "Devanagari")

    clean_segments = []
    for s in segments_raw:
        if isinstance(s, dict):
            try:
                clean_segments.append(Segment(**s))
            except Exception:
                s_time = float(s.get("start_time", 0.0) or 0.0)
                e_time = float(s.get("end_time", s_time + 2.0) or (s_time + 2.0))
                clean_segments.append(Segment(
                    segment_id=int(s.get("segment_id", 1) or 1),
                    speaker=str(s.get("speaker", "Speaker 1") or "Speaker 1"),
                    gender=str(s.get("gender", "Male") or "Male"),
                    start_time=s_time,
                    end_time=e_time,
                    duration=float(s.get("duration", e_time - s_time) or (e_time - s_time)),
                    transcript=str(s.get("transcript", "") or "")
                ))
        elif isinstance(s, Segment):
            clean_segments.append(s)

    linted_segments, score, total_errors, total_warnings = lint_dataset(
        clean_segments, language=language, script=script
    )

    return {
        "segments": linted_segments,
        "compliance_score": score,
        "total_errors": total_errors,
        "total_warnings": total_warnings
    }


@app.post("/api/autofix")
async def autofix_endpoint(payload: dict):
    """REL-06: Apply 1-click auto-fixes on segments with resilient validation."""
    segments_raw = payload.get("segments", [])
    fix_digits = payload.get("fix_digits", True)
    fix_punctuation = payload.get("fix_punctuation", True)
    fix_overlaps = payload.get("fix_overlaps", True)
    fix_tags = payload.get("fix_tags", True)
    language = payload.get("language", "Hindi")
    script = payload.get("script", "Devanagari")

    clean_segments = []
    for s in segments_raw:
        if isinstance(s, dict):
            try:
                clean_segments.append(Segment(**s))
            except Exception:
                s_time = float(s.get("start_time", 0.0) or 0.0)
                e_time = float(s.get("end_time", s_time + 2.0) or (s_time + 2.0))
                clean_segments.append(Segment(
                    segment_id=int(s.get("segment_id", 1) or 1),
                    speaker=str(s.get("speaker", "Speaker 1") or "Speaker 1"),
                    gender=str(s.get("gender", "Male") or "Male"),
                    start_time=s_time,
                    end_time=e_time,
                    duration=float(s.get("duration", e_time - s_time) or (e_time - s_time)),
                    transcript=str(s.get("transcript", "") or "")
                ))
        elif isinstance(s, Segment):
            clean_segments.append(s)

    fixed_segments = apply_auto_fixes(
        segments=clean_segments,
        fix_digits=fix_digits,
        fix_punctuation=fix_punctuation,
        fix_overlaps=fix_overlaps,
        fix_tags=fix_tags,
        language=language,
        script=script
    )

    _, score, total_errors, total_warnings = lint_dataset(
        fixed_segments, language=language, script=script
    )

    return {
        "segments": fixed_segments,
        "compliance_score": score,
        "total_errors": total_errors,
        "total_warnings": total_warnings
    }


def sanitize_transcription_result(data: dict) -> TranscriptionResult:
    """Safely build TranscriptionResult from any incoming client dictionary without failing."""
    if not isinstance(data, dict):
        data = {}

    audio_id = str(data.get("audio_id") or "audio_001")
    filename = str(data.get("filename") or "audio_transcript.wav")
    language = str(data.get("language") or "Hindi")
    script = str(data.get("script") or "Devanagari")
    compliance_score = float(data.get("compliance_score") or 100.0)
    total_errors = int(data.get("total_errors") or 0)
    total_warnings = int(data.get("total_warnings") or 0)

    # Process segments safely
    raw_segs = data.get("segments") or []
    clean_segs = []
    for i, s in enumerate(raw_segs, 1):
        if isinstance(s, dict):
            s_time = float(s.get("start_time") or 0.0)
            e_time = float(s.get("end_time") or (s_time + 2.0))
            clean_segs.append(Segment(
                segment_id=int(s.get("segment_id") or i),
                speaker=str(s.get("speaker") or "Speaker 1"),
                gender=str(s.get("gender") or "Male"),
                start_time=s_time,
                end_time=e_time,
                start_time_str=str(s.get("start_time_str") or f"{s_time:.3f}"),
                end_time_str=str(s.get("end_time_str") or f"{e_time:.3f}"),
                duration=float(s.get("duration") or (e_time - s_time)),
                transcript=str(s.get("transcript") or ""),
                confidence=float(s.get("confidence") or 1.0),
                words=s.get("words") or [],
                qc_errors=[],
                is_valid=bool(s.get("is_valid", True))
            ))

    raw_info = data.get("audio_info") or {}
    audio_info = AudioAnalysis(
        filename=filename,
        duration=float(raw_info.get("duration") or (clean_segs[-1].end_time if clean_segs else 0.0)),
        sample_rate=int(raw_info.get("sample_rate") or 16000),
        channels=int(raw_info.get("channels") or 1),
        rms_db=float(raw_info.get("rms_db") or -20.0),
        snr_db=float(raw_info.get("snr_db") or 25.0)
    )

    return TranscriptionResult(
        audio_id=audio_id,
        filename=filename,
        language=language,
        script=script,
        audio_info=audio_info,
        segments=clean_segs,
        compliance_score=compliance_score,
        total_errors=total_errors,
        total_warnings=total_warnings
    )


@app.post("/api/export")
async def export_deliverable(
    result_data: dict,
    format: str = "csv"
):
    """Generate and return deliverable file in requested format."""
    result = sanitize_transcription_result(result_data)
    base_name = Path(result.filename).stem

    if format == "csv":
        content = export_to_csv(result)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_karya.csv"'}
        )
    elif format == "tsv":
        content = export_to_tsv(result, delimiter="\t")
        return Response(
            content=content,
            media_type="text/tab-separated-values",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_karya.tsv"'}
        )
    elif format == "txt":
        content = export_to_txt(result)
        return Response(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_transcript.txt"'}
        )
    elif format == "json":
        content = export_to_json(result)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_deliverable.json"'}
        )
    elif format == "srt":
        content = export_to_srt(result)
        return Response(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{base_name}.srt"'}
        )
    elif format == "vtt":
        content = export_to_vtt(result)
        return Response(
            content=content,
            media_type="text/vtt; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{base_name}.vtt"'}
        )
    elif format == "docx":
        docx_path = str(EXPORTS_DIR / f"{base_name}_karya.docx")
        export_to_docx(result, docx_path)
        return FileResponse(
            docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"{base_name}_karya.docx"
        )
    elif format == "xlsx":
        xlsx_path = str(EXPORTS_DIR / f"{base_name}_karya.xlsx")
        export_to_xlsx(result, xlsx_path)
        return FileResponse(
            xlsx_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=f"{base_name}_karya.xlsx"
        )
    elif format == "rejection_csv":
        rej_item = [{
            "filename": result.filename,
            "rejection_category": result.rejection_category or "Rejection Category",
            "rejection_reason": result.rejection_reason or "Detailed Reason",
            "duration": result.audio_info.duration,
            "rms_db": result.audio_info.rms_db,
            "snr_db": result.audio_info.snr_db
        }]
        content = export_rejection_csv(rej_item)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_rejection.csv"'}
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{format}'.")


@app.post("/api/export/multi")
async def export_multi_deliverables(payload: dict):
    """Generate and return deliverables for multiple selected formats (direct file or ZIP)."""
    import zipfile
    result_data = payload.get("result", {})
    formats = payload.get("formats", ["csv"])
    if not formats:
        formats = ["csv"]

    result = sanitize_transcription_result(result_data)
    base_name = Path(result.filename).stem

    # If only 1 format is selected, return that single file directly
    if len(formats) == 1:
        fmt = formats[0].lower()
        if fmt == "csv":
            content = export_to_csv(result)
            return Response(content=content, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{base_name}_karya.csv"'})
        elif fmt == "docx":
            docx_path = str(EXPORTS_DIR / f"{base_name}_karya.docx")
            export_to_docx(result, docx_path)
            return FileResponse(docx_path, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename=f"{base_name}_karya.docx")
        elif fmt == "xlsx":
            xlsx_path = str(EXPORTS_DIR / f"{base_name}_karya.xlsx")
            export_to_xlsx(result, xlsx_path)
            return FileResponse(xlsx_path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=f"{base_name}_karya.xlsx")
        elif fmt == "srt":
            content = export_to_srt(result)
            return Response(content=content, media_type="text/plain; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{base_name}.srt"'})
        elif fmt == "vtt":
            content = export_to_vtt(result)
            return Response(content=content, media_type="text/vtt; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{base_name}.vtt"'})
        elif fmt == "txt":
            content = export_to_txt(result)
            return Response(content=content, media_type="text/plain; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{base_name}_transcript.txt"'})
        elif fmt == "json":
            content = export_to_json(result)
            return Response(content=content, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{base_name}_deliverable.json"'})

    # Bundle multiple formats into a single ZIP archive
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for fmt in formats:
            fmt = fmt.lower()
            if fmt == "csv":
                zf.writestr(f"{base_name}_karya.csv", export_to_csv(result))
            elif fmt == "tsv":
                zf.writestr(f"{base_name}_karya.tsv", export_to_tsv(result))
            elif fmt == "txt":
                zf.writestr(f"{base_name}_transcript.txt", export_to_txt(result))
            elif fmt == "srt":
                zf.writestr(f"{base_name}.srt", export_to_srt(result))
            elif fmt == "vtt":
                zf.writestr(f"{base_name}.vtt", export_to_vtt(result))
            elif fmt == "json":
                zf.writestr(f"{base_name}_deliverable.json", export_to_json(result))
            elif fmt == "docx":
                docx_path = str(EXPORTS_DIR / f"{base_name}_temp.docx")
                export_to_docx(result, docx_path)
                with open(docx_path, "rb") as f:
                    zf.writestr(f"{base_name}_karya.docx", f.read())
            elif fmt == "xlsx":
                xlsx_path = str(EXPORTS_DIR / f"{base_name}_temp.xlsx")
                export_to_xlsx(result, xlsx_path)
                with open(xlsx_path, "rb") as f:
                    zf.writestr(f"{base_name}_karya.xlsx", f.read())

    zip_buffer.seek(0)
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base_name}_deliverables.zip"'}
    )


# Batch Processing Endpoints
@app.post("/api/batch/upload")
async def batch_upload(
    files: List[UploadFile] = File(...),
    language: str = Form("Auto-Detect"),
    script: str = Form("Auto-Detect")
):
    """Upload multiple files and queue them for batch processing."""
    tasks = []
    for file in files:
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        task = batch_manager.add_task(
            filename=file.filename,
            file_path=str(file_path),
            language=language,
            script=script
        )
        tasks.append(task)

    return {"tasks": tasks, "total_queued": len(tasks)}


@app.get("/api/batch/tasks")
async def get_batch_tasks():
    """Get all current batch tasks."""
    return {"tasks": batch_manager.get_all_tasks()}


@app.get("/api/batch/export/zip")
async def export_batch_zip(format: str = "all"):
    """Export all completed batch deliverables in a single ZIP."""
    zip_bytes = batch_manager.create_batch_zip(export_format=format)
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="karya_batch_deliverables.zip"'}
    )


@app.post("/api/batch/clear")
async def clear_batch_tasks():
    """Clear completed tasks."""
    batch_manager.clear_completed()
    return {"status": "cleared"}


@app.post("/api/batch/cancel/{task_id}")
async def cancel_batch_task(task_id: str):
    """Cancel a queued (not yet started) batch task."""
    success = batch_manager.cancel_task(task_id)
    if success:
        return {"status": "cancelled", "task_id": task_id}
    return {"status": "not_cancellable", "task_id": task_id,
            "detail": "Task already started or does not exist."}


@app.delete("/api/cleanup/{audio_id}")
async def cleanup_audio_file(audio_id: str):
    """Delete uploaded audio file for a given session to free disk space."""
    session = active_sessions.get(audio_id)
    if session and session.get("file_path"):
        file_path = Path(session["file_path"])
        if file_path.exists():
            try:
                file_path.unlink()
                active_sessions.pop(audio_id, None)
                return {"status": "deleted", "audio_id": audio_id}
            except Exception as e:
                return {"status": "error", "message": str(e)}
    return {"status": "not_found", "audio_id": audio_id}
