import os
import uuid
import zipfile
import io
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Any
from pathlib import Path

from app.models import BatchTask, TranscriptionResult
from app.gemini_transcriber import process_audio_file
from app.export_service import (
    export_to_csv, export_to_tsv, export_to_txt,
    export_to_docx, export_to_xlsx, export_to_json, export_to_srt,
    export_rejection_csv
)
from app.config import EXPORTS_DIR

class BatchManager:
    def __init__(self, max_workers: int = 3):
        self.tasks: Dict[str, BatchTask] = {}
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.lock = threading.Lock()

    def add_task(self, filename: str, file_path: str, language: str = "Hindi", script: str = "Devanagari") -> BatchTask:
        task_id = str(uuid.uuid4())[:8]
        task = BatchTask(
            task_id=task_id,
            filename=filename,
            file_path=file_path,
            language=language,
            script=script,
            status="queued",
            progress=0.0
        )
        with self.lock:
            self.tasks[task_id] = task

        # Submit task to worker pool
        self.executor.submit(self._run_task, task_id)
        return task

    def _run_task(self, task_id: str):
        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return
            task.status = "processing"
            task.progress = 20.0

        try:
            # Process audio
            result = process_audio_file(
                audio_path=task.file_path,
                language=task.language,
                script=task.script
            )

            with self.lock:
                task.result = result
                task.progress = 100.0
                if result.is_rejected:
                    task.status = "rejected"
                else:
                    task.status = "completed"

        except Exception as e:
            with self.lock:
                task.status = "failed"
                task.error_message = str(e)
                task.progress = 100.0

    def get_task(self, task_id: str) -> Optional[BatchTask]:
        with self.lock:
            return self.tasks.get(task_id)

    def get_all_tasks(self) -> List[BatchTask]:
        with self.lock:
            return list(self.tasks.values())

    def clear_completed(self):
        with self.lock:
            self.tasks = {k: v for k, v in self.tasks.items() if v.status in ["queued", "processing"]}

    def create_batch_zip(self, export_format: str = "csv") -> bytes:
        """Create a single ZIP archive containing all completed batch deliverables."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            rejected_items = []
            
            for task in self.get_all_tasks():
                if task.result:
                    res = task.result
                    base_name = Path(res.filename).stem

                    if res.is_rejected:
                        rejected_items.append({
                            "filename": res.filename,
                            "rejection_category": res.rejection_category,
                            "rejection_reason": res.rejection_reason,
                            "duration": res.audio_info.duration,
                            "rms_db": res.audio_info.rms_db,
                            "snr_db": res.audio_info.snr_db
                        })
                        continue

                    # Deliverables per format
                    if export_format in ["csv", "all"]:
                        csv_data = export_to_csv(res)
                        zf.writestr(f"{base_name}_karya.csv", csv_data)

                    if export_format in ["tsv", "all"]:
                        tsv_data = export_to_tsv(res, delimiter="\t")
                        zf.writestr(f"{base_name}_karya.tsv", tsv_data)

                    if export_format in ["txt", "all"]:
                        txt_data = export_to_txt(res)
                        zf.writestr(f"{base_name}_transcript.txt", txt_data)

                    if export_format in ["json", "all"]:
                        json_data = export_to_json(res)
                        zf.writestr(f"{base_name}_deliverable.json", json_data)

                    if export_format in ["srt", "all"]:
                        srt_data = export_to_srt(res)
                        zf.writestr(f"{base_name}.srt", srt_data)

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

            # Add rejection report if any rejected
            if rejected_items:
                rej_csv = export_rejection_csv(rejected_items)
                zf.writestr("KARYA_REJECTION_REPORT.csv", rej_csv)

        zip_buffer.seek(0)
        return zip_buffer.getvalue()

batch_manager = BatchManager()
