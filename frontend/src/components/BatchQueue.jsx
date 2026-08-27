import React, { useState, useEffect } from 'react';
import {
  Upload, Layers, Play, CheckCircle2, XCircle, AlertCircle, RefreshCw, Download, Trash2, Eye
} from 'lucide-react';

export default function BatchQueue({
  onLoadIntoStudio,
  targetLanguage,
  setTargetLanguage,
  targetScript,
  setTargetScript
}) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(() => {
      fetchTasks();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/batch/tasks');
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error("Failed to fetch batch tasks:", err);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleStartBatch = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append('files', file);
    });
    formData.append('language', targetLanguage);
    formData.append('script', targetScript);

    try {
      const res = await fetch('/api/batch/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        setSelectedFiles([]);
        fetchTasks();
      }
    } catch (err) {
      console.error("Batch upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const clearCompleted = async () => {
    try {
      await fetch('/api/batch/clear', { method: 'POST' });
      fetchTasks();
    } catch (err) {
      console.error("Clear batch failed:", err);
    }
  };

  const downloadZip = (format = 'all') => {
    window.location.href = `/api/batch/export/zip?format=${format}`;
  };

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const processingCount = tasks.filter((t) => t.status === 'processing' || t.status === 'queued').length;

  return (
    <div className="space-y-6">
      {/* Upload Box & Batch Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              Batch Audio Processing Queue
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload multiple conversational audio files for automated segmentation, transcription, and QA audits.
            </p>
          </div>

          {/* Language & Script Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
              <span className="text-slate-500">Language:</span>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Auto-Detect">⚡ Auto-Detect Language</option>
                <option value="Hindi">Hindi (हिन्दी)</option>
                <option value="English">English</option>
                <option value="Marathi">Marathi (मराठी)</option>
                <option value="Bengali">Bengali (বাংলা)</option>
                <option value="Tamil">Tamil (தமிழ்)</option>
                <option value="Telugu">Telugu (తెలుగు)</option>
                <option value="Gujarati">Gujarati (ગુજરાતી)</option>
                <option value="Kannada">Kannada (ಕನ್ನಡ)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
              <span className="text-slate-500">Script:</span>
              <select
                value={targetScript}
                onChange={(e) => setTargetScript(e.target.value)}
                className="bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Auto-Detect">⚡ Auto-Detect Script</option>
                <option value="Devanagari">Devanagari</option>
                <option value="Latin">Latin / English</option>
                <option value="Bengali">Bengali</option>
                <option value="Tamil">Tamil</option>
                <option value="Telugu">Telugu</option>
                <option value="Gujarati">Gujarati</option>
                <option value="Kannada">Kannada</option>
              </select>
            </div>
          </div>
        </div>

        {/* Drag & Drop Input */}
        <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 hover:bg-indigo-50/60 rounded-2xl p-8 text-center transition-all">
          <input
            type="file"
            id="batch-file-input"
            multiple
            accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.aac"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="batch-file-input" className="cursor-pointer flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} audio file(s) selected`
                  : 'Click to select audio files or drag & drop here'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Supports WAV, MP3, M4A, FLAC, OGG, AAC</p>
            </div>
          </label>

          {selectedFiles.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={handleStartBatch}
                disabled={isUploading}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-transform active:scale-95 disabled:opacity-50"
              >
                {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                Start Processing {selectedFiles.length} Files
              </button>
              <button
                onClick={() => setSelectedFiles([])}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Queue Status & Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="text-slate-800">Tasks: {tasks.length}</span>
            <span className="text-indigo-600">⚡ {processingCount} Active</span>
            <span className="text-emerald-600">✓ {completedCount} Done</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadZip('all')}
              disabled={completedCount === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download All Deliverables (ZIP)
            </button>
            <button
              onClick={clearCompleted}
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs"
              title="Clear completed tasks"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Task Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                <th className="py-2.5 pl-3">Filename</th>
                <th className="py-2.5">Status</th>
                <th className="py-2.5">Language</th>
                <th className="py-2.5">Segments</th>
                <th className="py-2.5">Compliance Score</th>
                <th className="py-2.5">QC Issues</th>
                <th className="py-2.5 text-right pr-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 font-medium">
                    Queue is empty. Select audio files above to begin batch processing.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => {
                  const isDone = t.status === 'completed';
                  const isProc = t.status === 'processing';
                  const score = t.result ? t.result.compliance_score : null;

                  return (
                    <tr key={t.task_id} className="hover:bg-slate-50">
                      <td className="py-3 pl-3 font-semibold text-slate-900 max-w-[200px] truncate">{t.filename}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isDone
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isProc
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isProc && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                          {t.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-slate-600 font-medium">{t.language} ({t.script})</td>
                      <td className="py-3 text-slate-700 font-mono font-bold">
                        {t.result ? t.result.segments.length : '--'}
                      </td>
                      <td className="py-3">
                        {score !== null ? (
                          <span
                            className={`font-bold font-mono px-2 py-0.5 rounded ${
                              score >= 98
                                ? 'bg-emerald-100 text-emerald-800'
                                : score >= 80
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {score}%
                          </span>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="py-3 text-slate-600 max-w-[250px] truncate font-medium">
                        {isDone && (
                          <span>
                            {t.result?.total_errors || 0} errors, {t.result?.total_warnings || 0} warnings
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right pr-3">
                        {t.result && (
                          <button
                            onClick={() => onLoadIntoStudio(t.result)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            Open Studio
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
