import os
import uuid
import zipfile
import io
import threading
import logging
from concurrent.futures import ThreadPoolExecutor, Future
from typing import Dict, List, Optional, Any
from pathlib import Path
from datetime import datetime, timezone

from app.models import BatchTask, TranscriptionResult
from app.gemini_transcriber import process_audio_file
from app.export_service import (
    export_to_csv, export_to_tsv, export_to_txt,
    export_to_docx, export_to_xlsx, export_to_json, export_to_srt, export_to_vtt,
    export_rejection_csv
)
from app.config import EXPORTS_DIR

logger = logging.getLogger(__name__)


class BatchManager:
    """
    Thread-pool-backed batch transcription manager.

    Improvements (BUG-11):
    - Per-task progress stages (queued → uploading → transcribing → exporting → done)
    - started_at / completed_at timestamps on each task dict
    - Per-task Future tracking so individual tasks can be cancelled
    - Graceful shutdown via executor.shutdown(wait=False)
    - Structured logging instead of silent failures
    """

    def __init__(self, max_workers: int = 3):
        self.tasks: Dict[str, dict] = {}          # task_id → enriched task dict
        self.futures: Dict[str, Future] = {}       # task_id → Future (for cancellation)
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="batch_worker")
        self.lock = threading.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_task(self, filename: str, file_path: str, language: str = "Hindi", script: str = "Devanagari") -> dict:
        """Queue a new transcription task and submit it to the thread pool."""
        task_id = str(uuid.uuid4())[:8]
        task = {
            "task_id": task_id,
            "filename": filename,
            "file_path": file_path,
            "language": language,
            "script": script,
            "status": "queued",
            "progress": 0.0,
            "progress_stage": "Queued — waiting for worker",
            "result": None,
            "error_message": None,
            "queued_at": datetime.now(timezone.utc).isoformat(),
            "started_at": None,
            "completed_at": None,
        }
        with self.lock:
            self.tasks[task_id] = task

        future = self.executor.submit(self._run_task, task_id)
        with self.lock:
            self.futures[task_id] = future

        logger.info("Batch task %s queued: %s", task_id, filename)
        return task

    def cancel_task(self, task_id: str) -> bool:
        """Attempt to cancel a queued (not yet running) task. Returns True if cancelled."""
        with self.lock:
            future = self.futures.get(task_id)
            task = self.tasks.get(task_id)
            if future and task and task["status"] == "queued":
                cancelled = future.cancel()
                if cancelled:
                    task["status"] = "cancelled"
                    task["progress"] = 100.0
                    task["progress_stage"] = "Cancelled by user"
                    task["completed_at"] = datetime.now(timezone.utc).isoformat()
                return cancelled
        return False

    def get_task(self, task_id: str) -> Optional[dict]:
        with self.lock:
            return self.tasks.get(task_id)

    def get_all_tasks(self) -> List[dict]:
        with self.lock:
            return list(self.tasks.values())

    def clear_completed(self):
        """Remove finished/failed/cancelled tasks, keep queued and processing."""
        with self.lock:
            active_statuses = {"queued", "processing"}
            self.tasks = {k: v for k, v in self.tasks.items() if v["status"] in active_statuses}
            self.futures = {k: v for k, v in self.futures.items() if k in self.tasks}

    def shutdown(self):
        """Graceful shutdown — stop accepting new tasks, let running ones finish."""
        self.executor.shutdown(wait=False)

    # ------------------------------------------------------------------
    # Internal worker
    # ------------------------------------------------------------------

    def _update_task(self, task_id: str, **kwargs):
        """Thread-safe task field update."""
        with self.lock:
            task = self.tasks.get(task_id)
            if task:
                task.update(kwargs)

    def _run_task(self, task_id: str):
        """Worker function executed in a thread-pool thread."""
        self._update_task(
            task_id,
            status="processing",
            progress=10.0,
            progress_stage="Starting transcription pipeline...",
            started_at=datetime.now(timezone.utc).isoformat(),
        )

        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return
            file_path = task["file_path"]
            language = task["language"]
            script = task["script"]
            filename = task["filename"]

        try:
            # Stage 1: Transcription (10% → 85%)
            self._update_task(task_id, progress=15.0, progress_stage="Uploading audio to Gemini AI engine...")
            result = process_audio_file(
                audio_path=file_path,
                language=language,
                script=script
            )
            self._update_task(task_id, progress=85.0, progress_stage="Transcription complete — running QA linter...")

            # Stage 2: Done
            self._update_task(
                task_id,
                result=result,
                progress=100.0,
                progress_stage="Rejected — see rejection report" if result.is_rejected else "Completed successfully ✓",
                status="rejected" if result.is_rejected else "completed",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
            logger.info("Batch task %s completed: %s (rejected=%s)", task_id, filename, result.is_rejected)

        except Exception as exc:
            logger.error("Batch task %s failed: %s — %s", task_id, filename, exc, exc_info=True)
            self._update_task(
                task_id,
                status="failed",
                error_message=str(exc),
                progress=100.0,
                progress_stage=f"Failed: {str(exc)[:120]}",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )

    # ------------------------------------------------------------------
    # ZIP export
    # ------------------------------------------------------------------

    def create_batch_zip(self, export_format: str = "csv") -> bytes:
        """Create a single ZIP archive containing all completed batch deliverables."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            rejected_items = []

            for task in self.get_all_tasks():
                res = task.get("result")
                if not res:
                    continue

                base_name = Path(res.filename).stem

                if res.is_rejected:
                    rejected_items.append({
                        "filename": res.filename,
                        "rejection_category": res.rejection_category,
                        "rejection_reason": res.rejection_reason,
                        "duration": res.audio_info.duration if res.audio_info else 0,
                        "rms_db": res.audio_info.rms_db if res.audio_info else 0,
                        "snr_db": res.audio_info.snr_db if res.audio_info else 0,
                    })
                    continue

                if export_format in ["csv", "all"]:
                    zf.writestr(f"{base_name}_karya.csv", export_to_csv(res))
                if export_format in ["tsv", "all"]:
                    zf.writestr(f"{base_name}_karya.tsv", export_to_tsv(res, delimiter="\t"))
                if export_format in ["txt", "all"]:
                    zf.writestr(f"{base_name}_transcript.txt", export_to_txt(res))
                if export_format in ["json", "all"]:
                    zf.writestr(f"{base_name}_deliverable.json", export_to_json(res))
                if export_format in ["srt", "all"]:
                    zf.writestr(f"{base_name}.srt", export_to_srt(res))
                if export_format in ["vtt", "all"]:
                    zf.writestr(f"{base_name}.vtt", export_to_vtt(res))
                if export_format in ["xlsx", "all"]:
                    xlsx_file = EXPORTS_DIR / f"{base_name}_karya.xlsx"
                    export_to_xlsx(res, str(xlsx_file))
                    if xlsx_file.exists():
                        zf.write(str(xlsx_file), arcname=f"{base_name}_karya.xlsx")
                if export_format in ["docx", "all"]:
                    docx_file = EXPORTS_DIR / f"{base_name}_karya.docx"
                    export_to_docx(res, str(docx_file))
                    if docx_file.exists():
                        zf.write(str(docx_file), arcname=f"{base_name}_karya.docx")

            if rejected_items:
                zf.writestr("KARYA_REJECTION_REPORT.csv", export_rejection_csv(rejected_items))

        zip_buffer.seek(0)
        return zip_buffer.getvalue()


batch_manager = BatchManager()
