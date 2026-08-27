import React, { useState } from 'react';
import {
  X, Download, FileSpreadsheet, FileText, Code2, Film, Check, CheckSquare, Square, Package
} from 'lucide-react';

export default function ExportModal({
  isOpen,
  onClose,
  transcriptionResult
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState(['csv', 'docx', 'xlsx', 'srt']);

  if (!isOpen || !transcriptionResult) return null;

  const formats = [
    {
      id: 'csv',
      title: 'CSV Deliverable',
      ext: '.csv',
      desc: 'Standard Karya tabular format (Filename, Speaker, Gender, In/Out (s), Transcript, QC).',
      icon: FileSpreadsheet,
      badge: 'Official CSV'
    },
    {
      id: 'docx',
      title: 'Word Document',
      ext: '.docx',
      desc: 'Microsoft Word deliverable with metadata table and verbatim conversation lines.',
      icon: FileText,
      badge: 'Word'
    },
    {
      id: 'xlsx',
      title: 'Excel Workbook',
      ext: '.xlsx',
      desc: 'Multi-sheet workbook with full transcription and acoustic quality audit sheet.',
      icon: FileSpreadsheet,
      badge: 'Excel'
    },
    {
      id: 'srt',
      title: 'Subtitles (SRT)',
      ext: '.srt',
      desc: 'Standard subtitle file with millisecond timestamps for media playback.',
      icon: Film,
      badge: 'SRT'
    },
    {
      id: 'txt',
      title: 'Plain Text (TXT)',
      ext: '.txt',
      desc: 'Human-readable verbatim script with timestamps and speaker tags.',
      icon: FileText,
      badge: 'TXT'
    },
    {
      id: 'json',
      title: 'Karya Standard JSON',
      ext: '.json',
      desc: 'JSON array of segments with start_sec, end_sec, transcription, speaker, and gender_label.',
      icon: Code2,
      badge: 'JSON'
    }
  ];

  const toggleFormat = (id) => {
    if (selectedFormats.includes(id)) {
      if (selectedFormats.length > 1) {
        setSelectedFormats(selectedFormats.filter((f) => f !== id));
      }
    } else {
      setSelectedFormats([...selectedFormats, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedFormats.length === formats.length) {
      setSelectedFormats(['csv']);
    } else {
      setSelectedFormats(formats.map((f) => f.id));
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedFormats.length === 0) return;
    setIsExporting(true);

    try {
      const res = await fetch('/api/export/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: transcriptionResult,
          formats: selectedFormats
        })
      });

      if (res.ok) {
        const blob = await res.blob();
        const baseName = transcriptionResult.filename.replace(/\.[^/.]+$/, "");
        const disposition = res.headers.get('Content-Disposition') || '';
        let filename = `${baseName}_deliverables.zip`;
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Failed to export deliverables');
      }
    } catch (err) {
      console.error('Export multi error:', err);
      alert('Export failed: ' + err);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadSingle = async (formatId) => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/export/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: transcriptionResult,
          formats: [formatId]
        })
      });

      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        let filename = `${transcriptionResult.filename}_karya.${formatId}`;
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Single export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Multi-Select Deliverables Export
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select one or more deliverable formats to download for <span className="text-indigo-700 font-semibold">{transcriptionResult.filename}</span>
          </p>
        </div>

        {/* Multi-Select Action Bar */}
        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200 mb-4">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            {selectedFormats.length === formats.length ? (
              <CheckSquare className="w-4 h-4 text-indigo-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>Select All ({selectedFormats.length}/{formats.length})</span>
          </button>

          <span className="text-xs text-slate-500 font-medium">
            {selectedFormats.length > 1 ? 'Will download as a single ZIP bundle' : 'Will download directly'}
          </span>
        </div>

        {/* Formats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {formats.map((fmt) => {
            const isSelected = selectedFormats.includes(fmt.id);
            const Icon = fmt.icon;

            return (
              <div
                key={fmt.id}
                onClick={() => toggleFormat(fmt.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-50/50 border-indigo-500 ring-1 ring-indigo-500 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${
                        isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-sm text-slate-800">{fmt.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {fmt.ext}
                      </span>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded accent-indigo-600 h-4 w-4 pointer-events-none"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{fmt.desc}</p>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadSingle(fmt.id);
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    Download only this
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer with Big Multi-Download Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Cancel
          </button>

          <button
            onClick={handleDownloadSelected}
            disabled={isExporting || selectedFormats.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>
              {isExporting
                ? 'Preparing Download...'
                : `Download Selected Formats (${selectedFormats.length})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
