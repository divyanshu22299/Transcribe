import React from 'react';
import {
  ShieldCheck, Download, Volume2, AlertCircle, AlertTriangle, CheckCircle2, FileText
} from 'lucide-react';

export default function QAPanel({
  complianceScore,
  totalErrors,
  totalWarnings,
  audioInfo,
  onOpenExport,
  segments
}) {
  const isPassing = complianceScore >= 98.0;

  // Collect unique error categories for clear summary
  const issueSummary = React.useMemo(() => {
    const issues = [];
    if (!segments) return issues;
    segments.forEach((seg) => {
      if (seg.qc_errors) {
        seg.qc_errors.forEach((err) => {
          issues.push({
            segmentId: seg.segment_id,
            speaker: seg.speaker,
            message: err.message,
            severity: err.severity,
            errorType: err.error_type
          });
        });
      }
    });
    return issues;
  }, [segments]);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col gap-4 sticky top-[180px]">
      {/* Compliance Scorecard */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Karya Compliance Score</h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">Target: ≥ 98%</span>
        </div>

        {/* Score Progress Box */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isPassing
            ? 'bg-emerald-50/80 border-emerald-200'
            : complianceScore >= 80
            ? 'bg-amber-50/80 border-amber-200'
            : 'bg-rose-50/80 border-rose-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-black ${
                  isPassing ? 'text-emerald-700' : complianceScore >= 80 ? 'text-amber-700' : 'text-rose-700'
                }`}>
                  {complianceScore !== null ? `${complianceScore}%` : '--'}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  isPassing
                    ? 'bg-emerald-100 text-emerald-800'
                    : complianceScore >= 80
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {isPassing ? 'PASSED (≥98%)' : 'NEEDS QA'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 font-semibold">
                {totalErrors} Errors • {totalWarnings} Warnings
              </p>
            </div>

            {isPassing ? (
              <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QC Issues Summary List */}
      {issueSummary.length > 0 && (
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Compliance Issues ({issueSummary.length})
            </span>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {issueSummary.slice(0, 15).map((item, idx) => (
              <div
                key={idx}
                className={`p-2 rounded-xl border flex items-start gap-2 ${
                  item.severity === 'error'
                    ? 'bg-rose-50/60 border-rose-200 text-rose-800'
                    : 'bg-amber-50/60 border-amber-200 text-amber-800'
                }`}
              >
                <span className="font-mono font-bold text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                  Seg #{item.segmentId}
                </span>
                <span className="text-[11px] font-medium leading-tight">{item.message}</span>
              </div>
            ))}
            {issueSummary.length > 15 && (
              <p className="text-[11px] text-slate-400 text-center font-medium">
                + {issueSummary.length - 15} more issues in segments
              </p>
            )}
          </div>
        </div>
      )}

      {/* Acoustic Audio Specs */}
      {audioInfo && (
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
            <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
            Acoustic Analysis
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-slate-500 block font-medium">Duration</span>
              <span className="font-mono font-bold text-slate-800">{audioInfo.duration}s</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-slate-500 block font-medium">Volume</span>
              <span className="font-mono font-bold text-slate-800">{audioInfo.rms_db} dB</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-slate-500 block font-medium">Noise (SNR)</span>
              <span className="font-mono font-bold text-slate-800">{audioInfo.snr_db} dB</span>
            </div>
          </div>
        </div>
      )}

      {/* Export Deliverables Button */}
      <button
        onClick={onOpenExport}
        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer text-xs"
      >
        <Download className="w-4 h-4" />
        Export Deliverables (CSV, DOCX, XLSX, SRT)
      </button>
    </div>
  );
}
