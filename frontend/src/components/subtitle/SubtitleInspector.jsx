import React, { useMemo, useRef } from 'react';
import {
  Split, Merge, Trash2, ChevronLeft, ChevronRight,
  Activity, AlertTriangle, Layers, Type, Sparkles
} from 'lucide-react';

export default function SubtitleInspector({
  activeEvent,
  onUpdateEvent,
  onSplitEvent,
  onMergeEvent,
  onDeleteEvent,
  onRebreakEvent,
  onNavigatePrev,
  onNavigateNext,
  currentTime = 0,
  contentType = 'adult',
  cplLimit = 42,
  cpsLimit = 20,
  frameRate = 24.0,
  theme = 'dark', // 'dark' | 'light'
}) {
  const isDark = theme === 'dark';
  const textareaRef = useRef(null);

  const start = activeEvent?.start_time !== undefined ? activeEvent.start_time : (activeEvent?.start !== undefined ? activeEvent.start : 0);
  const end = activeEvent?.end_time !== undefined ? activeEvent.end_time : (activeEvent?.end !== undefined ? activeEvent.end : 0);
  const duration = Math.max(0, end - start);
  const text = activeEvent?.text || '';
  const lines = text ? text.split('\n') : [];

  // Compute live CPS & CPL
  const metrics = useMemo(() => {
    if (!activeEvent) {
      return { cps: 0, charCount: 0, lineCpl: [], maxCpl: 0, duration: 0, lineCount: 0 };
    }
    let clean = text.replace(/<[^>]+>/g, '').replace(/♪/g, '').trim();
    const cleanLines = clean.split('\n').map(l => {
      let s = l.trim();
      if (s.startsWith('-')) s = s.slice(1).trim();
      return s;
    });
    clean = cleanLines.join(' ').replace(/\s+/g, ' ').trim();
    const charCount = clean.length;
    const cps = duration > 0 ? charCount / duration : 0;

    const lineCpl = lines.map(l => {
      let c = l.replace(/<[^>]+>/g, '').trim();
      if (c.startsWith('-')) c = c.slice(1).trim();
      return c.length;
    });

    return {
      cps: Math.round(cps * 10) / 10,
      charCount,
      lineCpl,
      maxCpl: Math.max(...lineCpl, 0),
      duration: Math.round(duration * 1000) / 1000,
      lineCount: lines.length
    };
  }, [activeEvent, text, duration, lines]);

  if (!activeEvent) {
    return (
      <div className={`rounded-xl border p-6 text-center h-full flex flex-col items-center justify-center transition-colors ${
        isDark ? 'bg-[#141824] border-[#232838] text-slate-500' : 'bg-white border-slate-200 text-slate-500 shadow-sm'
      }`}>
        <Activity className="w-8 h-8 mb-2 animate-pulse opacity-40" />
        <p className="text-xs font-bold">No Subtitle Selected</p>
        <p className="text-[11px] opacity-70 mt-1">Select any subtitle row or timeline box to inspect and edit.</p>
      </div>
    );
  }

  // Handle Ctrl+I for Italics formatting inside Textarea
  const handleTextareaKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const selStart = textarea.selectionStart;
      const selEnd = textarea.selectionEnd;
      const val = textarea.value;

      if (selStart !== selEnd) {
        // Selected text toggle
        const selectedText = val.substring(selStart, selEnd);
        if (selectedText.startsWith('<i>') && selectedText.endsWith('</i>')) {
          const unwrapped = selectedText.slice(3, -4);
          const newText = val.substring(0, selStart) + unwrapped + val.substring(selEnd);
          onUpdateEvent(activeEvent.id, 'text', newText);
        } else {
          const wrapped = `<i>${selectedText}</i>`;
          const newText = val.substring(0, selStart) + wrapped + val.substring(selEnd);
          onUpdateEvent(activeEvent.id, 'text', newText);
        }
      } else {
        // Full text toggle if nothing selected
        if (val.includes('<i>') && val.includes('</i>')) {
          onUpdateEvent(activeEvent.id, 'text', val.replace(/<\/?i>/g, ''));
        } else {
          onUpdateEvent(activeEvent.id, 'text', `<i>${val}</i>`);
        }
      }
    }
  };

  const formatSMPTE = (seconds) => {
    if (isNaN(seconds) || seconds == null) return "00:00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * frameRate);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  const formatSecs = (seconds) => {
    if (isNaN(seconds) || seconds == null) return "0.000";
    return (Math.round(seconds * 1000) / 1000).toFixed(3);
  };

  const errors = (activeEvent.qc_errors || activeEvent.errors || []).filter(err => {
    const rid = (err.rule_id || '').toUpperCase();
    const msg = (err.message || '').toLowerCase();
    return !rid.includes('PYRAMID') && !msg.includes('pyramid') && !msg.includes('bottom-heavy');
  });
  const hasErrors = errors.some(e => (e.severity === 'error' || !e.severity) && !(e.rule_id || '').includes('CPS'));
  const hasWarnings = errors.some(e => e.severity === 'warning' || (e.rule_id || '').includes('CPS'));

  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2.5 shadow-sm h-full transition-colors ${
      isDark ? 'bg-[#141824] border-[#232838] text-slate-200' : 'bg-white border-slate-200 text-slate-800'
    }`}>
      {/* Inspector Header */}
      <div className={`flex items-center justify-between pb-2 border-b shrink-0 ${
        isDark ? 'border-[#232838]' : 'border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-indigo-600 font-mono font-bold text-[11px] text-white flex items-center justify-center">
            #{activeEvent.id}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider font-mono">
            Active Subtitle Inspector
          </span>
        </div>

        {/* Navigation jumpers */}
        <div className="flex items-center gap-1">
          <button 
            onClick={onNavigatePrev}
            className={`p-1 rounded transition-colors cursor-pointer border ${
              isDark ? 'bg-[#1a2030] hover:bg-[#252e45] text-slate-300 border-[#283247]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Previous Subtitle (Up Arrow)"
          >
            <ChevronLeft size={13} />
          </button>
          <button 
            onClick={onNavigateNext}
            className={`p-1 rounded transition-colors cursor-pointer border ${
              isDark ? 'bg-[#1a2030] hover:bg-[#252e45] text-slate-300 border-[#283247]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Next Subtitle (Down Arrow)"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Textarea Editor with Line CPL Badges */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <div className="flex items-center justify-between text-[11px] font-semibold opacity-80 shrink-0">
          <span className="flex items-center gap-1.5">
            <span>Dialogue Text:</span>
            <span className="text-[10px] font-mono opacity-60">(Ctrl+I for Italics)</span>
          </span>
          <div className="flex items-center gap-1.5">
            {metrics.lineCpl.map((count, i) => (
              <span 
                key={i} 
                className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                  count > cplLimit 
                    ? 'bg-rose-600 text-white border border-rose-500 shadow-xs' 
                    : isDark ? 'bg-[#1c2233] text-slate-300 border border-[#2e374f]' : 'bg-slate-100 text-slate-700 border border-slate-300'
                }`}
              >
                L{i+1}: {count}/{cplLimit}
              </span>
            ))}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onUpdateEvent(activeEvent.id, 'text', e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          rows={3}
          spellCheck={false}
          className={`w-full flex-1 border rounded-xl p-3 text-xs font-sans focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none leading-relaxed ${
            isDark ? 'bg-[#0d1017] border-[#283045] text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
          }`}
          placeholder="Type subtitle dialogue (Press Ctrl+I to italicize)..."
        />
      </div>

      {/* Clean Timing & Reading Speed Section */}
      <div className={`p-3 rounded-xl border space-y-2 shrink-0 ${
        isDark ? 'bg-[#181e2b] border-[#232a3d]' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center justify-between text-[11px] font-bold opacity-80">
          <span>TIMING & METRICS</span>
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
              metrics.cps > cpsLimit 
                ? isDark 
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500' 
                  : 'bg-amber-100 text-amber-900 border border-amber-400'
                : isDark ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              CPS: {metrics.cps} (Max {cpsLimit})
            </span>
            <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] ${
              isDark ? 'bg-[#202738] text-slate-300 border border-[#2d374f]' : 'bg-white text-slate-700 border border-slate-300'
            }`}>
              {metrics.duration}s
            </span>
          </div>
        </div>

        {/* Start / End Timecode Displays */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`p-2 rounded-lg border ${
            isDark ? 'bg-[#11141e] border-[#242b3e]' : 'bg-white border-slate-200'
          }`}>
            <span className="text-[10px] opacity-60 font-semibold block mb-0.5">IN-TIME (START)</span>
            <div className={`font-mono font-bold text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              {formatSMPTE(start)}
            </div>
            <span className="text-[10px] font-mono opacity-60 block">
              {formatSecs(start)}s
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${
            isDark ? 'bg-[#11141e] border-[#242b3e]' : 'bg-white border-slate-200'
          }`}>
            <span className="text-[10px] opacity-60 font-semibold block mb-0.5">OUT-TIME (END)</span>
            <div className={`font-mono font-bold text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              {formatSMPTE(end)}
            </div>
            <span className="text-[10px] font-mono opacity-60 block">
              {formatSecs(end)}s
            </span>
          </div>
        </div>
      </div>

      {/* Action Strip (Re-Break / Split / Merge / Delete) */}
      <div className="grid grid-cols-4 gap-1.5 shrink-0">
        <button
          onClick={() => onRebreakEvent(activeEvent.id)}
          className={`py-2 px-2 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer border ${
            isDark ? 'bg-[#1d2333] hover:bg-[#272f45] text-indigo-300 border-[#2b354e]' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
          }`}
          title="Re-Break Line at Linguistic Boundary"
        >
          <Layers size={13} />
          <span>Re-Break</span>
        </button>

        <button
          onClick={() => onSplitEvent(activeEvent.id)}
          className={`py-2 px-2 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer border ${
            isDark ? 'bg-[#1d2333] hover:bg-[#272f45] text-amber-300 border-[#2b354e]' : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
          }`}
          title="Split subtitle into two"
        >
          <Split size={13} />
          <span>Split</span>
        </button>

        <button
          onClick={() => onMergeEvent(activeEvent.id)}
          className={`py-2 px-2 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer border ${
            isDark ? 'bg-[#1d2333] hover:bg-[#272f45] text-emerald-300 border-[#2b354e]' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
          }`}
          title="Merge with next subtitle"
        >
          <Merge size={13} />
          <span>Merge</span>
        </button>

        <button
          onClick={() => onDeleteEvent(activeEvent.id)}
          className={`py-2 px-2 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer border ${
            isDark ? 'bg-[#2a1720] hover:bg-[#3d1e2e] text-rose-400 border-rose-950' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
          }`}
          title="Delete subtitle (Delete key)"
        >
          <Trash2 size={13} />
          <span>Delete</span>
        </button>
      </div>

      {/* QC Status Indicator */}
      {errors.length > 0 && (
        <div className={`border rounded-xl p-2.5 space-y-1 overflow-y-auto max-h-20 custom-scrollbar shrink-0 ${
          isDark ? 'bg-rose-950/40 border-rose-800/60 text-rose-200' : 'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <div className="text-[11px] font-bold flex items-center gap-1">
            <AlertTriangle size={13} />
            <span>Netflix QC Audit Flags ({errors.length}):</span>
          </div>
          {errors.map((err, idx) => (
            <div key={idx} className="text-[10px] leading-tight">
              • <span className="font-mono">{err.rule_id || 'QC'}:</span> {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
