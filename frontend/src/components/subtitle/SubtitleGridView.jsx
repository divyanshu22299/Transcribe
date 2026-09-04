import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertCircle, CheckCircle2, AlertTriangle, Clock, Trash2, CheckSquare, Square, MinusSquare
} from 'lucide-react';

export default function SubtitleGridView({
  events = [],
  activeEventId = null,
  setActiveEventId = () => {},
  onPlayEvent = () => {},
  onBulkDelete = () => {},
  cplLimit = 42,
  cpsLimit = 20,
  frameRate = 24.0,
  theme = 'dark', // 'dark' | 'light'
}) {
  const isDark = theme === 'dark';
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Toggle single selection
  const handleToggleSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle Select All
  const handleToggleSelectAll = useCallback(() => {
    if (selectedIds.size === events.length && events.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(events.map(e => e.id ?? e.event_id)));
    }
  }, [events, selectedIds]);

  // Bulk Delete Selected
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds, onBulkDelete]);

  // Keyboard shortcut for Ctrl+A (Select All) and Delete (Bulk Delete)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(events.map(ev => ev.id ?? ev.event_id)));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [events, selectedIds, handleDeleteSelected]);

  const formatSMPTE = (seconds) => {
    if (isNaN(seconds) || seconds == null) return "00:00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * frameRate);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  const allSelected = events.length > 0 && selectedIds.size === events.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < events.length;

  return (
    <div className={`rounded-xl border overflow-hidden flex flex-col w-full h-full transition-colors ${
      isDark ? 'bg-[#121622] border-[#232838]' : 'bg-white border-slate-200 shadow-sm'
    }`}>
      {/* Table Header / Bulk Action Bar */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between text-xs font-bold shrink-0 transition-colors ${
        selectedIds.size > 0 
          ? isDark ? 'bg-indigo-950/80 border-indigo-800 text-indigo-200' : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          : isDark ? 'bg-[#181e2b] border-[#232838] text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleToggleSelectAll}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
            title="Select All (Ctrl+A)"
          >
            {allSelected ? (
              <CheckSquare size={14} className="text-indigo-500" />
            ) : someSelected ? (
              <MinusSquare size={14} className="text-indigo-400" />
            ) : (
              <Square size={14} className="opacity-40" />
            )}
            <span className="uppercase tracking-wider text-[11px] font-mono">
              {selectedIds.size > 0 ? `${selectedIds.size}/${events.length} SELECTED` : `SUBTITLES (${events.length})`}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {selectedIds.size > 0 ? (
            <>
              <button
                onClick={handleDeleteSelected}
                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                title="Delete all selected subtitles (Delete key)"
              >
                <Trash2 size={11} />
                <span>Delete ({selectedIds.size})</span>
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                  isDark ? 'bg-[#1e2436] hover:bg-[#28324a] text-slate-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                Cancel
              </button>
            </>
          ) : (
            <span className="text-[10px] opacity-60 font-mono">Ctrl+A to Select All</span>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-hidden flex-1 overflow-y-auto custom-scrollbar">
        <table className={`w-full text-left text-xs border-collapse table-fixed ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
          <thead className={`text-[10px] uppercase font-bold sticky top-0 z-10 border-b ${
            isDark ? 'bg-[#151a26] text-slate-400 border-[#232838]' : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            <tr>
              <th className="py-1.5 px-1.5 w-7 text-center">
                <input 
                  type="checkbox" 
                  checked={allSelected}
                  onChange={handleToggleSelectAll}
                  className="rounded cursor-pointer accent-indigo-600 w-3 h-3"
                  title="Select All (Ctrl+A)"
                />
              </th>
              <th className="py-1.5 px-1 w-7 text-center font-mono">#</th>
              <th className="py-1.5 px-2 w-28">Time (In / Out)</th>
              <th className="py-1.5 px-2 w-20 text-center">Dur / CPS</th>
              <th className="py-1.5 px-3">Dialogue Text</th>
            </tr>
          </thead>
          <tbody className={`divide-y font-sans ${isDark ? 'divide-[#1e2434]' : 'divide-slate-200'}`}>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400 text-xs">
                  No subtitle events in dataset. Click "+ Sub" or "Auto-Generate (AI)".
                </td>
              </tr>
            ) : (
              events.map((event) => {
                const id = event.id ?? event.event_id;
                const isSelected = selectedIds.has(id);
                const isActive = activeEventId === id;
                const start = event.start_time !== undefined ? event.start_time : (event.start !== undefined ? event.start : 0);
                const end = event.end_time !== undefined ? event.end_time : (event.end !== undefined ? event.end : 0);
                const duration = Math.max(0, end - start);
                const errors = (event.qc_errors || event.errors || []).filter(err => {
                  const rid = (err.rule_id || '').toUpperCase();
                  const msg = (err.message || '').toLowerCase();
                  return !rid.includes('PYRAMID') && !msg.includes('pyramid') && !msg.includes('bottom-heavy');
                });

                const text = event.text || '';
                const lines = text.split('\n');
                const lineCpl = lines.map(l => l.replace(/<[^>]+>/g, '').trim().length);
                const maxCpl = Math.max(...lineCpl, 0);
                const calculatedCps = event.cps ? event.cps : (duration > 0 ? (text.replace(/<[^>]+>/g, '').trim().length / duration) : 0);
                const isOverCps = calculatedCps > cpsLimit;
                const isOverCpl = maxCpl > cplLimit;

                const hasCplError = isOverCpl || errors.some(e => (e.rule_id || '').includes('CPL'));
                const hasHardError = errors.some(e => (e.severity === 'error' || !e.severity) && !(e.rule_id || '').includes('CPS'));
                const isRed = hasHardError || hasCplError;
                const isYellow = !isRed && (isOverCps || errors.some(e => (e.rule_id || '').includes('CPS')));

                return (
                  <tr
                    key={id}
                    onClick={() => {
                      setActiveEventId(id);
                      onPlayEvent(id);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? isDark ? 'bg-indigo-900/40' : 'bg-indigo-100/60'
                        : isActive 
                        ? isDark ? 'bg-indigo-950/70 font-semibold' : 'bg-indigo-50 font-semibold'
                        : isDark ? 'hover:bg-[#181f2f]' : 'hover:bg-slate-50'
                    } ${
                      isRed 
                        ? isDark ? 'border-l-4 border-l-rose-500 bg-rose-950/20' : 'border-l-4 border-l-rose-600 bg-rose-50/40' 
                        : isYellow
                        ? isDark ? 'border-l-4 border-l-amber-500 bg-amber-950/20' : 'border-l-4 border-l-amber-500 bg-amber-50/40'
                        : isSelected
                        ? 'border-l-4 border-l-indigo-400'
                        : isActive
                        ? 'border-l-4 border-l-indigo-500'
                        : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Checkbox Column */}
                    <td 
                      className="py-2 px-1.5 text-center"
                      onClick={(e) => handleToggleSelect(id, e)}
                    >
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={(e) => handleToggleSelect(id, e)}
                        className="rounded cursor-pointer accent-indigo-600 w-3 h-3"
                      />
                    </td>

                    {/* Index */}
                    <td className="py-2 px-1 text-center font-mono text-[11px] opacity-75">
                      #{id}
                    </td>

                    {/* Stacked Start & End Timecode Column */}
                    <td className="py-1.5 px-2 font-mono text-[11px] leading-tight">
                      <div className={`font-bold flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        <span className="text-[9px] opacity-60 uppercase font-sans">IN</span>
                        <span>{formatSMPTE(start)}</span>
                      </div>
                      <div className={`text-[10px] flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span className="text-[9px] opacity-60 uppercase font-sans">OUT</span>
                        <span>{formatSMPTE(end)}</span>
                      </div>
                    </td>

                    {/* Stacked Duration & CPS Column */}
                    <td className="py-1.5 px-2 text-center font-mono text-[10px] leading-tight">
                      <div className="font-semibold flex items-center justify-center gap-1">
                        <span>{duration.toFixed(2)}s</span>
                        {isOverCpl ? (
                          <span className="bg-rose-600 text-white text-[8px] font-bold px-1 rounded shadow-xs" title={`CPL violation: ${maxCpl}/${cplLimit}`}>
                            {maxCpl}L
                          </span>
                        ) : hasHardError ? (
                          <AlertCircle size={10} className="text-rose-500 shrink-0" title={errors[0]?.message} />
                        ) : isYellow ? (
                          <AlertTriangle size={10} className="text-amber-500 shrink-0" title={errors[0]?.message} />
                        ) : (
                          <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                        )}
                      </div>
                      <div className="mt-0.5">
                        <span className={`px-1 py-0.2 rounded font-bold ${
                          isOverCps 
                            ? isDark 
                              ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60' 
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                            : isDark ? 'bg-[#1c2233] text-slate-300' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {calculatedCps.toFixed(1)} CPS
                        </span>
                      </div>
                    </td>

                    {/* Full-Width Dialogue Text Column */}
                    <td className="py-2 px-3 text-xs">
                      <div className="font-sans whitespace-pre-wrap line-clamp-2 leading-snug">
                        {text}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
