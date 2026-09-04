import React, { useState, useMemo } from 'react';
import { X, Download, FileText, FileCode, File, Globe, Check, AlertTriangle } from 'lucide-react';
import { API_BASE } from '../../config';

const EXPORT_FORMATS = [
  {
    key: 'ttml',
    name: 'Netflix TTML / DFXP',
    ext: '.ttml',
    icon: FileCode,
    description: 'Netflix primary delivery format with styling cues, regions, and XML namespace.',
    badge: 'Netflix Standard',
    badgeColor: 'bg-red-950 text-red-400 border-red-800',
  },
  {
    key: 'srt',
    name: 'SubRip Subtitle',
    ext: '.srt',
    icon: FileText,
    description: 'Universal standard subtitle format with millisecond timecodes and styling.',
    badge: 'Universal',
    badgeColor: 'bg-indigo-950 text-indigo-300 border-indigo-800',
  },
  {
    key: 'vtt',
    name: 'WebVTT',
    ext: '.vtt',
    icon: Globe,
    description: 'Web-native format with HTML5 video player integration and line positioning.',
    badge: 'Web Native',
    badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  },
  {
    key: 'txt',
    name: 'Plain Text Transcript',
    ext: '.txt',
    icon: File,
    description: 'Clean dialogue text without timecodes for review and print deliverables.',
    badge: 'Dialogue Text',
    badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
  },
];

export default function SubtitleExportModal({ isOpen, onClose, events = [], filename = 'subtitles', complianceScore = 100 }) {
  const [selectedFormat, setSelectedFormat] = useState('ttml');
  const [isExporting, setIsExporting] = useState(false);
  const [customFilename, setCustomFilename] = useState('');

  const exportFilename = customFilename.trim() || filename.replace(/\.[^/.]+$/, '') || 'subtitles';
  const selectedFormatInfo = EXPORT_FORMATS.find(f => f.key === selectedFormat);
  const isPassing = complianceScore >= 98;

  const srtPreview = useMemo(() => {
    if (!events || events.length === 0) return '';
    return events.slice(0, 3).map((ev, idx) => {
      const start = formatSrtTime(ev.start_time ?? ev.start);
      const end = formatSrtTime(ev.end_time ?? ev.end);
      return `${idx + 1}\n${start} --> ${end}\n${ev.text || ''}`;
    }).join('\n\n');
  }, [events]);

  const handleExport = async () => {
    if (!events || events.length === 0) return;
    setIsExporting(true);

    try {
      const response = await fetch(`${API_BASE}/api/subtitle/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: events,
          filename: exportFilename,
          format: selectedFormat,
          language: 'en',
        }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportFilename}${selectedFormatInfo?.ext || '.srt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed. Please verify the backend connection.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="bg-[#141824] border border-[#2a344a] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden text-slate-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232a3d]">
          <div>
            <h2 className="text-base font-bold text-white uppercase tracking-wider">Export Timed Text Deliverables</h2>
            <p className="text-xs text-slate-400 mt-0.5">{events.length} subtitle events · {exportFilename}{selectedFormatInfo?.ext}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#202738] text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compliance Alert */}
        {!isPassing && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-amber-950/40 border border-amber-800/80 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-300">Netflix QC Compliance: {complianceScore}%</p>
              <p className="text-[11px] text-amber-200/80 mt-0.5">Netflix requires ≥98% compliance. You can still export, or run Auto-Fix first.</p>
            </div>
          </div>
        )}

        {/* Filename Input */}
        <div className="px-6 pt-4">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Output Filename</label>
          <input
            type="text"
            value={customFilename}
            onChange={e => setCustomFilename(e.target.value)}
            placeholder={filename.replace(/\.[^/.]+$/, '')}
            className="w-full mt-1 px-3 py-2 rounded-xl bg-[#0d1017] border border-[#283045] text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>

        {/* Format Selector */}
        <div className="px-6 pt-4 space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deliverable Format</label>
          {EXPORT_FORMATS.map(fmt => {
            const Icon = fmt.icon;
            const isSelected = selectedFormat === fmt.key;
            return (
              <button
                key={fmt.key}
                onClick={() => setSelectedFormat(fmt.key)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-950/40 shadow-md'
                    : 'border-[#222838] bg-[#0f121a] hover:border-[#2d374d] hover:bg-[#161a24]'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-[#1c2233] text-slate-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>{fmt.name}</span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded border ${fmt.badgeColor}`}>{fmt.badge}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{fmt.description}</p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* SRT Preview */}
        {srtPreview && (
          <div className="px-6 pt-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sample Preview</label>
            <pre className="mt-1 p-2.5 rounded-xl bg-[#0a0c12] border border-[#22283a] text-emerald-400 text-[10px] font-mono max-h-20 overflow-auto">
              {srtPreview}
            </pre>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 mt-3 border-t border-[#232a3d]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-[#1e2536] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || !events || events.length === 0}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            {isExporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Compiling...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Export {selectedFormatInfo?.ext}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSrtTime(secs) {
  if (secs == null || isNaN(secs)) return '00:00:00,000';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
