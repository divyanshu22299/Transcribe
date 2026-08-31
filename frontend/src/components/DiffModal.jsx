import React, { useMemo } from 'react';
import { X, GitCompare, Check } from 'lucide-react';

export default function DiffModal({ isOpen, onClose, originalSegments, currentSegments }) {
  const diffs = useMemo(() => {
    if (!originalSegments || !currentSegments) return [];

    const origMap = new Map();
    originalSegments.forEach(s => origMap.set(s.segment_id, s));

    const changes = [];

    currentSegments.forEach(curr => {
      const orig = origMap.get(curr.segment_id);
      if (!orig) {
        changes.push({
          type: 'added',
          segment_id: curr.segment_id,
          curr,
          desc: 'Newly added segment'
        });
      } else {
        const textChanged = (orig.transcript || '').trim() !== (curr.transcript || '').trim();
        const speakerChanged = orig.speaker !== curr.speaker;
        const timeChanged = Math.abs(orig.start_time - curr.start_time) > 0.01 || Math.abs(orig.end_time - curr.end_time) > 0.01;

        if (textChanged || speakerChanged || timeChanged) {
          changes.push({
            type: 'modified',
            segment_id: curr.segment_id,
            orig,
            curr,
            textChanged,
            speakerChanged,
            timeChanged
          });
        }
      }
    });

    return changes;
  }, [originalSegments, currentSegments]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Audit Diff View</h2>
                <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold">
                  {diffs.length} changed segments
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Side-by-side comparison of initial AI output vs. current human annotations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Changes List */}
        <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-3">
          {diffs.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <Check className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-60" />
              <p className="font-bold text-slate-700">No edits recorded yet</p>
              <p className="text-slate-400 mt-1">Current segments match the original AI transcription identically.</p>
            </div>
          ) : (
            diffs.map((diff) => (
              <div key={diff.segment_id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold font-mono text-slate-700">Segment #{diff.segment_id}</span>
                  <div className="flex items-center gap-1.5">
                    {diff.textChanged && <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">Text Modified</span>}
                    {diff.speakerChanged && <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">Speaker Changed</span>}
                    {diff.timeChanged && <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">Timing Adjusted</span>}
                  </div>
                </div>

                {diff.orig && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {/* Before (Original AI) */}
                    <div className="p-2.5 bg-rose-50/60 border border-rose-200 rounded-xl">
                      <div className="flex items-center justify-between text-[10px] font-bold text-rose-700 mb-1">
                        <span>ORIGINAL AI</span>
                        <span className="font-mono">{diff.orig.start_time.toFixed(2)}s → {diff.orig.end_time.toFixed(2)}s ({diff.orig.speaker})</span>
                      </div>
                      <p className="text-slate-800 text-xs leading-relaxed font-sans">{diff.orig.transcript || <span className="italic text-slate-400">(Empty)</span>}</p>
                    </div>

                    {/* After (Current Annotated) */}
                    <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                      <div className="flex items-center justify-between text-[10px] font-bold text-emerald-700 mb-1">
                        <span>CURRENT ANNOTATED</span>
                        <span className="font-mono">{diff.curr.start_time.toFixed(2)}s → {diff.curr.end_time.toFixed(2)}s ({diff.curr.speaker})</span>
                      </div>
                      <p className="text-slate-900 text-xs leading-relaxed font-sans font-medium">{diff.curr.transcript || <span className="italic text-slate-400">(Empty)</span>}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            Close Diff View
          </button>
        </div>
      </div>
    </div>
  );
}
