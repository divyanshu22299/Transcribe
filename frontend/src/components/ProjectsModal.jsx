import React, { useState } from 'react';
import {
  Database, Clock, FileAudio, CheckCircle2, AlertTriangle, Trash2, ArrowRight, X, Search, RefreshCw
} from 'lucide-react';

export default function ProjectsModal({
  isOpen,
  onClose,
  projects,
  isLoading,
  onRefresh,
  onLoadProject,
  onDeleteProject
}) {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filtered = (projects || []).filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.filename || '').toLowerCase().includes(q) ||
      (p.language || '').toLowerCase().includes(q) ||
      (p.script || '').toLowerCase().includes(q)
    );
  });

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Neon Cloud Projects Library</h2>
              <p className="text-xs text-slate-500">
                All audio transcriptions & segments saved in your Neon PostgreSQL database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Refresh projects list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by filename, language, or script..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-16 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
              <p className="text-xs font-semibold">Loading projects from Neon DB...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 px-6 bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                <Database className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">No saved projects in Neon DB</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                Transcribe any audio file or click "Save to Neon DB" to store full transcripts, timestamps, and confidence matrices in your PostgreSQL cloud.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Upload New Audio
              </button>
            </div>
          ) : (
            filtered.map((proj) => (
              <div
                key={proj.id}
                className="group p-4 bg-white hover:bg-indigo-50/30 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all shadow-2xs flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl mt-0.5">
                    <FileAudio className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 line-clamp-1">{proj.filename}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                      <span className="font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {proj.language} ({proj.script})
                      </span>
                      <span>•</span>
                      <span>{proj.segment_count} segments</span>
                      <span>•</span>
                      <span>{proj.duration.toFixed(1)}s</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        {formatDate(proj.updated_at || proj.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                    proj.compliance_score >= 95
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {proj.compliance_score.toFixed(0)}% Score
                  </span>

                  <button
                    onClick={() => {
                      onLoadProject(proj.id);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-transform active:scale-95 cursor-pointer"
                  >
                    <span>Open</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onDeleteProject(proj.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete project from Neon DB"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
