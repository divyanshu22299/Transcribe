import React from 'react';
import { BookOpen, Sparkles, FileAudio, ShieldCheck, Database } from 'lucide-react';

export default function Navbar({
  hasApiKey,
  setShowGuidelines,
  onOpenProjects,
  currentFilename,
  segmentCount,
  complianceScore,
  totalErrors,
  totalWarnings
}) {
  const isPassing = complianceScore !== null && complianceScore !== undefined && complianceScore >= 98.0;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs px-4 sm:px-6 lg:px-8 py-2.5">
      <div className="w-full flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-slate-900 tracking-tight">Karya Transcribe</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Verbatim AI
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">Conversational Speech Segmentation & QA Studio</p>
          </div>
        </div>

        {/* Center: Sleek Compact Compliance Score Badge */}
        {segmentCount > 0 && complianceScore !== null && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all ${
            isPassing
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : complianceScore >= 80
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <ShieldCheck className={`w-4 h-4 ${isPassing ? 'text-emerald-600' : 'text-amber-600'}`} />
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm">{complianceScore}%</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-white/80 border border-slate-200/60">
                {isPassing ? 'PASSED (≥98%)' : 'NEEDS QA'}
              </span>
              <span className="text-slate-500 font-medium ml-1">
                ({totalErrors} Err • {totalWarnings} Warn)
              </span>
            </div>
          </div>
        )}

        {/* Right: Guidelines, Neon DB & Status */}
        <div className="flex items-center gap-2.5">
          {/* Neon Cloud Projects Button */}
          <button
            onClick={onOpenProjects}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
            title="Open Neon PostgreSQL Cloud Projects"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            <span>Neon Projects</span>
          </button>

          {/* Guidelines Button */}
          <button
            onClick={() => setShowGuidelines(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span>Karya Guidelines</span>
          </button>

          {/* API Key Status Indicator */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              hasApiKey
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                hasApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="font-semibold text-[11px]">{hasApiKey ? 'Gemini 3.6 Active' : 'API Key Setup'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
