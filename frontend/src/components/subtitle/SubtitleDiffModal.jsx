import React, { useState, useMemo } from 'react';
import { X, Check, CheckCheck, ArrowRight, AlertTriangle, RotateCcw, Diff, Sparkles } from 'lucide-react';

export default function SubtitleDiffModal({ isOpen, onClose, originalEvents = [], fixedEvents = [], onAcceptAll = () => {}, onAcceptSelective = () => {} }) {
  const [selectedChanges, setSelectedChanges] = useState(new Set());

  // Compute changes between original and fixed events
  const changes = useMemo(() => {
    if (!originalEvents || !fixedEvents) return [];
    const diffs = [];

    for (let i = 0; i < Math.max(originalEvents.length, fixedEvents.length); i++) {
      const orig = originalEvents[i];
      const fixed = fixedEvents[i];

      if (!orig || !fixed) continue;

      const eventChanges = [];

      // Text change
      if (orig.text !== fixed.text) {
        eventChanges.push({
          field: 'text',
          label: 'Dialogue Text',
          from: orig.text,
          to: fixed.text,
        });
      }

      // Start time change
      const origStart = orig.start_time ?? orig.start ?? 0;
      const fixedStart = fixed.start_time ?? fixed.start ?? 0;
      if (Math.abs(origStart - fixedStart) > 0.001) {
        eventChanges.push({
          field: 'start_time',
          label: 'In-Time (Start)',
          from: formatTime(origStart),
          to: formatTime(fixedStart),
        });
      }

      // End time change
      const origEnd = orig.end_time ?? orig.end ?? 0;
      const fixedEnd = fixed.end_time ?? fixed.end ?? 0;
      if (Math.abs(origEnd - fixedEnd) > 0.001) {
        eventChanges.push({
          field: 'end_time',
          label: 'Out-Time (End)',
          from: formatTime(origEnd),
          to: formatTime(fixedEnd),
        });
      }

      if (eventChanges.length > 0) {
        diffs.push({
          eventId: fixed.id ?? fixed.event_id ?? i + 1,
          changes: eventChanges,
        });
      }
    }

    return diffs;
  }, [originalEvents, fixedEvents]);

  // Determine which rules were fixed
  const fixSummary = useMemo(() => {
    const summary = {};
    const origErrors = {};
    const fixedErrors = {};

    (originalEvents || []).forEach(ev => {
      (ev.qc_errors || ev.errors || []).forEach(err => {
        const key = err.rule_id || err.error_type || 'QC';
        origErrors[key] = (origErrors[key] || 0) + 1;
      });
    });

    (fixedEvents || []).forEach(ev => {
      (ev.qc_errors || ev.errors || []).forEach(err => {
        const key = err.rule_id || err.error_type || 'QC';
        fixedErrors[key] = (fixedErrors[key] || 0) + 1;
      });
    });

    for (const [rule, count] of Object.entries(origErrors)) {
      const remaining = fixedErrors[rule] || 0;
      if (remaining < count) {
        summary[rule] = { fixed: count - remaining, remaining };
      }
    }

    return summary;
  }, [originalEvents, fixedEvents]);

  const totalChanges = changes.length;
  const allSelected = selectedChanges.size === totalChanges && totalChanges > 0;

  const toggleChange = (eventId) => {
    setSelectedChanges(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedChanges(new Set());
    } else {
      setSelectedChanges(new Set(changes.map(c => c.eventId)));
    }
  };

  const handleAcceptSelected = () => {
    if (selectedChanges.size === totalChanges) {
      onAcceptAll();
    } else if (onAcceptSelective) {
      onAcceptSelective(Array.from(selectedChanges));
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="bg-[#141824] border border-[#2a344a] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-slate-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232a3d]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center">
              <Diff className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-wider">Netflix Auto-Fix Diff Preview</h2>
              <p className="text-xs text-slate-400">{totalChanges} subtitle event{totalChanges !== 1 ? 's' : ''} corrected</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#202738] text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fix Summary Pills */}
        {Object.keys(fixSummary).length > 0 && (
          <div className="px-6 py-2.5 bg-[#0e121a] border-b border-[#232a3d]">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(fixSummary).map(([rule, { fixed, remaining }]) => (
                <span key={rule} className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                  <Check className="w-3 h-3 text-emerald-400" />
                  {rule}: {fixed} fixed{remaining > 0 ? `, ${remaining} remain` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Select All Row */}
        <div className="px-6 py-2 border-b border-[#232a3d] flex items-center justify-between bg-[#111520]">
          <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer">
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              allSelected ? 'bg-indigo-600 border-indigo-500' : 'border-slate-600 bg-slate-900'
            }`}>
              {allSelected && <Check className="w-3 h-3 text-white" />}
            </div>
            <span>{allSelected ? 'Deselect All' : 'Select All Changes'} ({totalChanges})</span>
          </button>
        </div>

        {/* Changes List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2.5 custom-scrollbar">
          {changes.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <CheckCheck className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p className="text-xs font-bold text-slate-300">No Auto-Fix Adjustments Needed</p>
              <p className="text-[11px] text-slate-500 mt-0.5">All subtitles currently comply with Netflix timing and formatting rules.</p>
            </div>
          ) : (
            changes.map((change) => (
              <div
                key={change.eventId}
                className={`rounded-2xl border p-3 transition-all cursor-pointer ${
                  selectedChanges.has(change.eventId)
                    ? 'border-indigo-500/80 bg-indigo-950/30'
                    : 'border-[#232a3d] bg-[#0e121a] hover:border-[#2f3952]'
                }`}
                onClick={() => toggleChange(change.eventId)}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    selectedChanges.has(change.eventId)
                      ? 'bg-indigo-600 border-indigo-500'
                      : 'border-slate-600 bg-slate-900'
                  }`}>
                    {selectedChanges.has(change.eventId) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-600 text-white text-[10px] font-mono font-black">
                    #{change.eventId}
                  </span>
                  <span className="text-[11px] font-bold text-slate-300">{change.changes.length} change{change.changes.length > 1 ? 's' : ''}</span>
                </div>

                {change.changes.map((ch, idx) => (
                  <div key={idx} className="ml-7 mt-1.5">
                    <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-slate-400">{ch.label}</span>
                    <div className="flex items-start gap-2 mt-0.5">
                      <div className="flex-1 p-2 rounded-xl bg-rose-950/40 text-rose-300 text-xs font-mono whitespace-pre-wrap border border-rose-900/60 line-through opacity-75">
                        {ch.from || '(empty)'}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-2" />
                      <div className="flex-1 p-2 rounded-xl bg-emerald-950/50 text-emerald-300 text-xs font-mono whitespace-pre-wrap border border-emerald-800/80">
                        {ch.to || '(empty)'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#232a3d] bg-[#111520]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-[#1e2536] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => { onAcceptAll(); onClose(); }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700 transition-colors cursor-pointer"
            >
              Accept All ({totalChanges})
            </button>
            <button
              onClick={handleAcceptSelected}
              disabled={selectedChanges.size === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Apply Selected ({selectedChanges.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(secs) {
  if (secs == null || isNaN(secs)) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
