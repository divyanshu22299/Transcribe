import React from 'react';
import { X, BookOpen } from 'lucide-react';

export default function GuidelinesModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 shadow-xl relative max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            Karya Transcription Guidelines Cheatsheet
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Strict project compliance rules. Target overall batch acceptance quality: <strong className="text-indigo-700">≥ 98%</strong>.
          </p>
        </div>

        <div className="space-y-4 text-xs text-slate-700">
          {/* Section 1 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-indigo-700 text-sm mb-2">1. Segmentation Rules (§5)</h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 leading-relaxed">
              <li><strong>Duration:</strong> Minimum <strong>0.5s</strong>, Maximum <strong>20.0s</strong>.</li>
              <li><strong>Buffers:</strong> Maintain approximately <strong>0.3-second buffer</strong> at start and end without cutting off words.</li>
              <li><strong>Silence Limits:</strong> No segment should contain continuous silence/noise longer than <strong>4.0s</strong> (treat as boundary).</li>
              <li><strong>No Overlaps:</strong> <code>End_Time[n] &le; Start_Time[n+1]</code> strictly.</li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-indigo-700 text-sm mb-2">2. Speaker & Gender Tags (§5)</h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 leading-relaxed">
              <li><strong>Speaker 1:</strong> The participant who speaks first in the recording.</li>
              <li><strong>Speaker 2:</strong> The second participant in the conversation.</li>
              <li><strong>Gender:</strong> Allowed values: <code>Male</code>, <code>Female</code>, <code>Unknown</code>.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-indigo-700 text-sm mb-2">3. Full Verbatim Transcription Rules (§6)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-800 block mb-1">Type Exactly as Spoken</span>
                <p className="text-slate-500">Do not fix grammar, slang, or colloquialisms. Never beautify sentences.</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-800 block mb-1">Numbers in Words Only</span>
                <p className="text-slate-500">Never use digits (<code>0-9</code> or <code>०-९</code>). Write <code>तीन</code> or <code>three</code>.</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-800 block mb-1">Punctuation Whitelist</span>
                <p className="text-slate-500">Only <code>. , ? ! - _ ' ।</code> are permitted. No <code>% & ; : "</code>.</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-800 block mb-1">No Code-Mixed Scripts</span>
                <p className="text-slate-500">Transliterate foreign words into target script (e.g. <code>मीटिंग</code>, not <code>meeting</code>).</p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-800 block mb-1">Stutters with Hyphens</span>
                <p className="text-slate-500">Retain repetitions with hyphens: <code>म-म-मैं क-क-कल आऊँगा।</code></p>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-800 block mb-1">Incomplete Sentences</span>
                <p className="text-slate-500">Trailing/unfinished sentences end with double hyphen <code>--</code>.</p>
              </div>
            </div>
          </div>

          {/* Section 4 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="font-bold text-indigo-700 text-sm mb-2">4. Special Acoustic Tags (§6.3)</h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 leading-relaxed">
              <li><code>[unintelligible]</code>: Speech is audible but unintelligible due to accent or pronunciation.</li>
              <li><code>[inaudible]</code>: Speech cannot be heard due to low volume, noise, clipping, or distortion.</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
