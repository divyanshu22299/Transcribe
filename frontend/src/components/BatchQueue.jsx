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
    <div className="space-y-4">
      {/* Upload Box & Batch Controls */}
      <div className="bg-[#14151a] border border-[#262734] rounded-lg p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-sm font-bold text-slate-200 tracking-wider uppercase flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#00e5be]" />
              Batch Audio Processing Queue
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload multiple conversational audio files for automated segmentation, transcription, and QA audits.
            </p>
          </div>

          {/* Language & Script Selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-slate-300 font-medium">
              <span className="text-slate-500">Language:</span>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="bg-[#181920] border border-[#262734] text-slate-200 px-2.5 py-1 rounded text-xs font-semibold focus:border-[#00e5be] focus:outline-none cursor-pointer"
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

            <div className="flex items-center gap-1 text-xs text-slate-300 font-medium">
              <span className="text-slate-500">Script:</span>
              <select
                value={targetScript}
                onChange={(e) => setTargetScript(e.target.value)}
                className="bg-[#181920] border border-[#262734] text-slate-200 px-2.5 py-1 rounded text-xs font-semibold focus:border-[#00e5be] focus:outline-none cursor-pointer"
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
        <div className="border border-dashed border-[#262734] hover:border-[#00e5be]/50 bg-[#181920] hover:bg-[#1c1d25] rounded-lg p-6 text-center transition-all">
          <input
            type="file"
            id="batch-file-input"
            multiple
            accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.aac"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="batch-file-input" className="cursor-pointer flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded bg-[#22232c] border border-[#323444] flex items-center justify-center text-[#00e5be] shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} audio file(s) selected`
                  : 'Click to select audio files or drag & drop here'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Supports WAV, MP3, M4A, FLAC, OGG, AAC</p>
            </div>
          </label>

          {selectedFiles.length > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                onClick={handleStartBatch}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 bg-[#00e5be] hover:bg-[#00c9a7] text-black rounded text-xs font-bold shadow-[0_0_12px_rgba(0,229,190,0.25)] transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                Start Processing {selectedFiles.length} Files
              </button>
              <button
                onClick={() => setSelectedFiles([])}
                className="px-3 py-2 bg-[#22232c] hover:bg-[#2c2d38] text-slate-300 rounded text-xs font-semibold cursor-pointer border border-[#323444]"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Queue Status & Actions */}
      <div className="bg-[#14151a] border border-[#262734] rounded-lg p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#262734] mb-3">
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="text-slate-300">Tasks: {tasks.length}</span>
            <span className="text-[#00e5be]">⚡ {processingCount} Active</span>
            <span className="text-emerald-400">✓ {completedCount} Done</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadZip('all')}
              disabled={completedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download All Deliverables (ZIP)
            </button>
            <button
              onClick={clearCompleted}
              className="p-1.5 text-slate-400 hover:text-white bg-[#181920] hover:bg-[#22232c] border border-[#262734] rounded text-xs cursor-pointer"
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
              <tr className="border-b border-[#262734] text-slate-400 font-bold bg-[#181920]">
                <th className="py-2 pl-3">Filename</th>
                <th className="py-2">Status</th>
                <th className="py-2">Language</th>
                <th className="py-2">Segments</th>
                <th className="py-2">Compliance Score</th>
                <th className="py-2">QC Issues</th>
                <th className="py-2 text-right pr-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262734]">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500 font-medium">
                    Queue is empty. Select audio files above to begin batch processing.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => {
                  const isDone = t.status === 'completed';
                  const isProc = t.status === 'processing';
                  const score = t.result ? t.result.compliance_score : null;

                  return (
                    <tr key={t.task_id} className="hover:bg-[#181920]/80">
                      <td className="py-2.5 pl-3 font-semibold text-slate-200 max-w-[200px] truncate">{t.filename}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isDone
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : isProc
                              ? 'bg-[#00e5be]/15 text-[#00e5be] border border-[#00e5be]/30 animate-pulse'
                              : 'bg-[#22232c] text-slate-400 border border-[#323444]'
                          }`}
                        >
                          {isProc && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                          {t.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-400 font-medium">{t.language} ({t.script})</td>
                      <td className="py-2.5 text-slate-200 font-mono font-bold">
                        {t.result ? t.result.segments.length : '--'}
                      </td>
                      <td className="py-2.5">
                        {score !== null ? (
                          <span
                            className={`font-bold font-mono px-1.5 py-0.5 rounded text-[11px] ${
                              score >= 98
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : score >= 80
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {score}%
                          </span>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="py-2.5 text-slate-400 max-w-[250px] truncate font-medium">
                        {isDone && (
                          <span>
                            {t.result?.total_errors || 0} errors, {t.result?.total_warnings || 0} warnings
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right pr-3">
                        {t.result && (
                          <button
                            onClick={() => onLoadIntoStudio(t.result)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#00e5be]/15 hover:bg-[#00e5be] text-[#00e5be] hover:text-black border border-[#00e5be]/30 rounded text-xs font-bold transition-colors cursor-pointer"
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
