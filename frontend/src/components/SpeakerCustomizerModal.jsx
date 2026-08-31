import React, { useState, useMemo } from 'react';
import { X, Users, Check, ArrowLeftRight, UserCheck } from 'lucide-react';

export default function SpeakerCustomizerModal({ isOpen, onClose, segments, onUpdateSegments }) {
  const uniqueSpeakers = useMemo(() => {
    if (!segments) return [];
    const names = new Set(segments.map(s => s.speaker).filter(Boolean));
    return Array.from(names).sort();
  }, [segments]);

  const [renameMap, setRenameMap] = useState({});
  const [swapFrom, setSwapFrom] = useState('');
  const [swapTo, setSwapTo] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const handleRename = (oldName) => {
    const newName = (renameMap[oldName] || '').trim();
    if (!newName || newName === oldName) return;

    const updated = segments.map(seg => {
      if (seg.speaker === oldName) {
        return { ...seg, speaker: newName };
      }
      return seg;
    });

    onUpdateSegments(updated);
    setRenameMap(prev => ({ ...prev, [oldName]: '' }));
    showToast(`Renamed "${oldName}" → "${newName}" across all segments ✓`);
  };

  const handleSwapSpeakers = () => {
    if (!swapFrom || !swapTo || swapFrom === swapTo) return;

    const updated = segments.map(seg => {
      if (seg.speaker === swapFrom) {
        return { ...seg, speaker: swapTo };
      } else if (seg.speaker === swapTo) {
        return { ...seg, speaker: swapFrom };
      }
      return seg;
    });

    onUpdateSegments(updated);
    showToast(`Swapped "${swapFrom}" ↔ "${swapTo}" across all segments ✓`);
  };

  const getSpeakerThemeDot = (speakerName) => {
    const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-cyan-500', 'bg-pink-500', 'bg-orange-500'];
    let hash = 0;
    for (let i = 0; i < (speakerName || '').length; i++) hash = speakerName.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Speaker Management & Renaming</h2>
              <p className="text-xs text-slate-500">Bulk rename or swap speaker diarization tags across all segments</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div className="mb-4 p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{toastMsg}</span>
          </div>
        )}

        <div className="space-y-5">
          {/* Section 1: Rename Individual Speakers */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Rename Speakers & Themes</span>
            </h3>

            <div className="space-y-2">
              {uniqueSpeakers.map((spk) => {
                const count = segments.filter(s => s.speaker === spk).length;
                return (
                  <div key={spk} className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="min-w-[125px] flex items-center gap-1.5 text-xs font-bold text-slate-800 truncate">
                      <span className={`w-2.5 h-2.5 rounded-full ${getSpeakerThemeDot(spk)} shrink-0`} title="Waveform Theme Color" />
                      <span className="truncate">{spk}</span>
                      <span className="text-[10px] text-slate-400 font-normal ml-0.5">({count})</span>
                    </div>
                    <span className="text-slate-400 text-xs">➔</span>
                    <input
                      type="text"
                      placeholder={`New name for ${spk}...`}
                      value={renameMap[spk] || ''}
                      onChange={(e) => setRenameMap({ ...renameMap, [spk]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(spk);
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                    />
                    <button
                      onClick={() => handleRename(spk)}
                      disabled={!(renameMap[spk] || '').trim()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Rename
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Swap Two Speakers */}
          {uniqueSpeakers.length >= 2 && (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
                <span>Bulk Swap Speaker Labels</span>
              </h3>

              <div className="flex flex-wrap items-center gap-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                <select
                  value={swapFrom}
                  onChange={(e) => setSwapFrom(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <option value="">Select Speaker A...</option>
                  {uniqueSpeakers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <ArrowLeftRight className="w-4 h-4 text-indigo-600 shrink-0" />

                <select
                  value={swapTo}
                  onChange={(e) => setSwapTo(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <option value="">Select Speaker B...</option>
                  {uniqueSpeakers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <button
                  onClick={handleSwapSpeakers}
                  disabled={!swapFrom || !swapTo || swapFrom === swapTo}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Swap All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
