import React, { useRef } from 'react';
import {
  BookOpen, Sparkles, ShieldCheck, Database, BarChart2,
  Users, Undo2, Redo2, UploadCloud, GitCompare, StickyNote
} from 'lucide-react';

export default function Navbar({
  hasApiKey,
  setShowGuidelines,
  onOpenProjects,
  onOpenStats,
  onOpenSpeakers,
  onOpenDiff,
  onOpenNotes,
  onImportSubtitles,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  currentFilename,
  segmentCount,
  complianceScore,
  totalErrors,
  totalWarnings
}) {
  const isPassing = complianceScore !== null && complianceScore !== undefined && complianceScore >= 98.0;
  const subtitleInputRef = useRef(null);

  const handleSubtitleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onImportSubtitles) {
      onImportSubtitles(file);
      e.target.value = '';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs px-4 sm:px-6 lg:px-8 py-2.5">
      <div className="w-full flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand & Undo/Redo */}
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

          {/* Quick Undo / Redo Controls */}
          {segmentCount > 0 && (
            <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-slate-200">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                title="Undo last edit (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                title="Redo edit (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
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

        {/* Right: Actions, Neon DB & Status */}
        <div className="flex items-center gap-2">
          {/* Subtitle Import Button */}
          <input
            type="file"
            ref={subtitleInputRef}
            onChange={handleSubtitleFileChange}
            accept=".srt,.vtt,text/plain"
            className="hidden"
          />
          <button
            onClick={() => subtitleInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
            title="Import existing .SRT or .VTT subtitles to edit"
          >
            <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Import SRT/VTT</span>
          </button>

          {/* Speakers Management Button */}
          {segmentCount > 0 && onOpenSpeakers && (
            <button
              onClick={onOpenSpeakers}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
              title="Manage and Rename Speakers"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">Speakers</span>
            </button>
          )}

          {/* Stats Button */}
          {segmentCount > 0 && onOpenStats && (
            <button
              onClick={onOpenStats}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
              title="View Transcript Analytics & Distribution"
            >
              <BarChart2 className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">Stats</span>
            </button>
          )}

          {/* Diff View Button */}
          {segmentCount > 0 && onOpenDiff && (
            <button
              onClick={onOpenDiff}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
              title="View side-by-side changes against original AI transcription"
            >
              <GitCompare className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">Diff</span>
            </button>
          )}

          {/* Notes & Tags Button */}
          {segmentCount > 0 && onOpenNotes && (
            <button
              onClick={onOpenNotes}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
              title="Project Notes & Classification Tags"
            >
              <StickyNote className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">Notes</span>
            </button>
          )}

          {/* Neon Cloud Projects Button */}
          <button
            onClick={onOpenProjects}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
            title="Open Neon PostgreSQL Cloud Projects"
          >
            <Database className="w-3.5 h-3.5 text-indigo-600" />
            <span>Projects</span>
          </button>

          {/* Guidelines Button */}
          <button
            onClick={() => setShowGuidelines(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden lg:inline">Guidelines</span>
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
            <span className="font-semibold text-[11px]">{hasApiKey ? 'Gemini 2.0 Flash' : 'API Key Setup'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

