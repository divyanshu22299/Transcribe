import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Play, Pause, Trash2, Scissors, Merge, RotateCcw,
  AlertTriangle, CheckCircle2, ChevronUp, ChevronDown,
  Italic, Music, Clock, Type, Users, ArrowLeft, ArrowRight,
  Minus, Plus
} from 'lucide-react';

/**
 * Renders subtitle text with <i> tag support and \n line breaks.
 */
function RenderSubtitleText({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-0.5">
      {lines.map((line, idx) => {
        const parts = [];
        let remaining = line;
        let key = 0;
        while (remaining.length > 0) {
          const iStart = remaining.indexOf('<i>');
          if (iStart === -1) {
            parts.push(<span key={key++}>{remaining}</span>);
            break;
          }
          if (iStart > 0) {
            parts.push(<span key={key++}>{remaining.slice(0, iStart)}</span>);
          }
          const iEnd = remaining.indexOf('</i>', iStart);
          if (iEnd === -1) {
            parts.push(<em key={key++} className="text-indigo-300">{remaining.slice(iStart + 3)}</em>);
            break;
          }
          parts.push(<em key={key++} className="text-indigo-300">{remaining.slice(iStart + 3, iEnd)}</em>);
          remaining = remaining.slice(iEnd + 4);
        }
        const isDualSpeaker = line.trim().startsWith('-');
        return (
          <div key={idx} className={isDualSpeaker ? 'pl-0' : ''}>
            {isDualSpeaker && <span className="text-emerald-500 font-bold mr-1">-</span>}
            {parts.length > 0 ? parts : <span>{line}</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Format seconds to HH:MM:SS.mmm
 */
function formatTime(secs) {
  if (secs == null || isNaN(secs)) return '00:00:00.000';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.round((secs % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export default function SubtitleEventCard({
  event,
  isActive,
  onActivate,
  onUpdate,
  onPlay,
  onStop,
  onSplit,
  onMerge,
  onDelete,
  onRebreak,
  contentType = 'adult',
  frameRate = 24,
  showMerge = true,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(event.text || '');
  const textareaRef = useRef(null);
  const nudgeStep = 1 / frameRate; // 1 frame

  // Sync editText when event changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditText(event.text || '');
    }
  }, [event.text, isEditing]);

  const cpsLimit = contentType === 'children' ? 17 : 20;
  const cplLimit = 42;

  // Calculate metrics
  const metrics = useMemo(() => {
    const text = event.text || '';
    const duration = (event.end_time || 0) - (event.start_time || 0);
    const lines = text.split('\n');
    
    // CPS calculation (strip tags, music notes, speaker hyphens)
    let clean = text.replace(/<[^>]+>/g, '').replace(/♪/g, '').trim();
    const cleanLines = clean.split('\n').map(l => {
      let s = l.trim();
      if (s.startsWith('-')) s = s.slice(1).trim();
      return s;
    });
    clean = cleanLines.join(' ').replace(/\s+/g, ' ').trim();
    const charCount = clean.length;
    const cps = duration > 0 ? charCount / duration : 0;

    // CPL per line
    const cpl = lines.map(l => {
      let c = l.replace(/<[^>]+>/g, '').trim();
      if (c.startsWith('-')) c = c.slice(1).trim();
      return c.length;
    });

    const maxCpl = Math.max(...cpl, 0);
    const lineCount = lines.length;

    return { cps: Math.round(cps * 10) / 10, cpl, maxCpl, lineCount, charCount, duration: Math.round(duration * 1000) / 1000 };
  }, [event.text, event.start_time, event.end_time]);

  // CPS color
  const cpsColor = metrics.cps > cpsLimit ? 'text-red-600 bg-red-50 border-red-200' :
    metrics.cps > cpsLimit - 2 ? 'text-amber-600 bg-amber-50 border-amber-200' :
    'text-emerald-600 bg-emerald-50 border-emerald-200';

  // Error/warning counts
  const qcErrors = event.qc_errors || [];
  const errorCount = qcErrors.filter(e => e.severity === 'error').length;
  const warningCount = qcErrors.filter(e => e.severity === 'warning').length;
  const hasIssues = errorCount > 0 || warningCount > 0;

  // Card border color
  const borderColor = !event.is_valid ? 'border-red-300 bg-red-50/30' :
    isActive ? 'border-indigo-400 bg-indigo-50/30' :
    'border-slate-200 bg-white';

  const handleTextChange = useCallback((e) => {
    const newText = e.target.value;
    setEditText(newText);
  }, []);

  const handleTextBlur = useCallback(() => {
    setIsEditing(false);
    if (editText !== event.text) {
      onUpdate(event.id, 'text', editText);
    }
  }, [editText, event.id, event.text, onUpdate]);

  const handleTextFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleTimeNudge = useCallback((field, delta) => {
    const currentVal = field === 'start_time' ? event.start_time : event.end_time;
    const newVal = Math.max(0, Math.round((currentVal + delta) * 1000) / 1000);
    onUpdate(event.id, field, newVal);
  }, [event.id, event.start_time, event.end_time, onUpdate]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      // Auto-break lines on Tab
      if (onRebreak) onRebreak(event.id);
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleTextBlur();
    }
  }, [event.id, onRebreak, handleTextBlur]);

  return (
    <div
      className={`rounded-xl border-2 transition-all duration-200 ${borderColor} ${isActive ? 'shadow-lg ring-2 ring-indigo-200' : 'shadow-sm hover:shadow-md'}`}
      onClick={() => onActivate(event.id)}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {/* Event ID Badge */}
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 text-white text-xs font-bold">
            {event.id}
          </span>

          {/* Play Button */}
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(event.id); }}
            className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
            title="Play this subtitle"
          >
            <Play className="w-4 h-4" />
          </button>

          {/* Timing Controls */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); handleTimeNudge('start_time', -nudgeStep); }} className="p-0.5 rounded hover:bg-slate-100" title="Start -1 frame">
                <Minus className="w-3 h-3 text-slate-400" />
              </button>
              <input
                type="text"
                value={formatTime(event.start_time)}
                readOnly
                className="w-24 text-xs font-mono text-center bg-slate-50 border border-slate-200 rounded px-1 py-0.5"
                title="Start time"
              />
              <button onClick={(e) => { e.stopPropagation(); handleTimeNudge('start_time', nudgeStep); }} className="p-0.5 rounded hover:bg-slate-100" title="Start +1 frame">
                <Plus className="w-3 h-3 text-slate-400" />
              </button>
            </div>

            <span className="text-slate-300 text-xs">→</span>

            <div className="flex items-center gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); handleTimeNudge('end_time', -nudgeStep); }} className="p-0.5 rounded hover:bg-slate-100" title="End -1 frame">
                <Minus className="w-3 h-3 text-slate-400" />
              </button>
              <input
                type="text"
                value={formatTime(event.end_time)}
                readOnly
                className="w-24 text-xs font-mono text-center bg-slate-50 border border-slate-200 rounded px-1 py-0.5"
                title="End time"
              />
              <button onClick={(e) => { e.stopPropagation(); handleTimeNudge('end_time', nudgeStep); }} className="p-0.5 rounded hover:bg-slate-100" title="End +1 frame">
                <Plus className="w-3 h-3 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Duration Badge */}
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
            metrics.duration < 0.833 ? 'text-red-600 bg-red-50 border-red-200' :
            metrics.duration > 7.0 ? 'text-red-600 bg-red-50 border-red-200' :
            'text-slate-500 bg-slate-50 border-slate-200'
          }`}>
            <Clock className="w-3 h-3 inline mr-0.5" />
            {metrics.duration.toFixed(2)}s
          </span>
        </div>

        {/* Right: Metrics + Actions */}
        <div className="flex items-center gap-2">
          {/* CPS Badge */}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cpsColor}`}>
            CPS {metrics.cps}
          </span>

          {/* Line Count */}
          <span className={`text-xs px-1.5 py-0.5 rounded border ${
            metrics.lineCount > 2 ? 'text-red-600 bg-red-50 border-red-200' : 'text-slate-500 bg-slate-50 border-slate-200'
          }`}>
            {metrics.lineCount}L
          </span>

          {/* Speaker count */}
          {(event.speaker_count || 1) > 1 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200">
              <Users className="w-3 h-3 inline mr-0.5" />2
            </span>
          )}

          {/* Italic indicator */}
          {event.is_italic && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
              <Italic className="w-3 h-3 inline" />
            </span>
          )}

          {/* Error/Warning badges */}
          {errorCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
              {errorCount} ⛔
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              {warningCount} ⚠️
            </span>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-0.5 ml-2 border-l border-slate-200 pl-2">
            {onRebreak && (
              <button
                onClick={(e) => { e.stopPropagation(); onRebreak(event.id); }}
                className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                title="Auto-break lines (Tab)"
              >
                <Type className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onSplit(event.id); }}
              className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
              title="Split event"
            >
              <Scissors className="w-3.5 h-3.5" />
            </button>
            {showMerge && (
              <button
                onClick={(e) => { e.stopPropagation(); onMerge(event.id); }}
                className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                title="Merge with next"
              >
                <Merge className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
              title="Delete event"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Body: Text Editor + CPL Sidebar */}
      <div className="flex">
        {/* Text Area */}
        <div className="flex-1 p-3">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={handleTextChange}
              onBlur={handleTextBlur}
              onKeyDown={handleKeyDown}
              className="w-full min-h-[56px] p-2 rounded-lg border border-indigo-300 bg-white text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              spellCheck={false}
              autoFocus
              rows={Math.max(2, (editText.match(/\n/g) || []).length + 1)}
            />
          ) : (
            <div
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              className="min-h-[56px] p-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 cursor-text text-sm transition-colors"
            >
              <RenderSubtitleText text={event.text} />
            </div>
          )}
        </div>

        {/* CPL Sidebar */}
        <div className="w-16 border-l border-slate-100 flex flex-col items-center justify-center gap-1 p-2">
          <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">CPL</span>
          {metrics.cpl.map((count, idx) => (
            <span
              key={idx}
              className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                count > cplLimit ? 'text-red-600 bg-red-50' :
                count > cplLimit - 5 ? 'text-amber-600 bg-amber-50' :
                'text-slate-500 bg-slate-50'
              }`}
            >
              {count}
            </span>
          ))}
        </div>
      </div>

      {/* QC Errors (collapsed by default, expand when active) */}
      {hasIssues && isActive && (
        <div className="px-4 pb-3 space-y-1">
          <div className="border-t border-slate-100 pt-2">
            {qcErrors.map((err, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-xs py-1 ${
                  err.severity === 'error' ? 'text-red-700' : 'text-amber-700'
                }`}
              >
                {err.severity === 'error' ?
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" /> :
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                }
                <div>
                  <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 mr-1.5">
                    {err.rule_id}
                  </span>
                  <span>{err.message}</span>
                  {err.suggested_fix && (
                    <div className="mt-0.5 text-emerald-600 text-[11px]">
                      💡 Suggested: {typeof err.suggested_fix === 'string' ? err.suggested_fix.slice(0, 80) : 'Auto-fix available'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact error indicator when not active */}
      {hasIssues && !isActive && (
        <div className="px-4 pb-2">
          <div className="text-xs text-slate-400">
            {errorCount > 0 && <span className="text-red-500 mr-2">⛔ {errorCount} error{errorCount > 1 ? 's' : ''}</span>}
            {warningCount > 0 && <span className="text-amber-500">⚠️ {warningCount} warning{warningCount > 1 ? 's' : ''}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
