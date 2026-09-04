import { Mic, Film, Sparkles, ArrowRight, Headphones, Subtitles, Zap, Shield } from 'lucide-react';

export default function LandingPage({ onSelect }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-6">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-indigo-300">Powered by Gemini AI</span>
        </div>
        <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
          Karya <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Studio</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-xl mx-auto">
          Professional-grade audio transcription and Netflix-compliant subtitle generation, powered by AI.
        </p>
      </div>

      {/* Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
        {/* Transcribe Card */}
        <button
          onClick={() => onSelect('transcribe')}
          className="group relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 text-left transition-all duration-300 hover:border-indigo-500/50 hover:bg-slate-800/80 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 cursor-pointer"
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="relative">
            <div className="w-14 h-14 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
              <Mic className="w-7 h-7 text-indigo-400" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Transcribe</h2>
            <p className="text-slate-400 mb-6 leading-relaxed">
              Verbatim audio transcription with speaker diarization, word-level confidence scoring, and Karya QC compliance.
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Headphones className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Audio files (MP3, WAV, M4A, FLAC, OGG)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Auto speaker diarization & acoustic alignment</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Shield className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Karya verbatim QC with 98% compliance target</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-indigo-400 font-semibold group-hover:gap-3 transition-all">
              <span>Start Transcribing</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </button>

        {/* Subtitle Card */}
        <button
          onClick={() => onSelect('subtitle')}
          className="group relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 text-left transition-all duration-300 hover:border-emerald-500/50 hover:bg-slate-800/80 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-1 cursor-pointer"
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="relative">
            <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
              <Film className="w-7 h-7 text-emerald-400" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">
              Subtitle
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                New
              </span>
            </h2>
            <p className="text-slate-400 mb-6 leading-relaxed">
              Netflix-grade subtitle generation with CPS/CPL compliance, shot change syncing, and a professional editing studio.
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Subtitles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Video files (MP4, MKV, MOV, AVI, WebM)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Shot detection, CPS ≤20, CPL ≤42, gap chaining</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Netflix Timed Text Style Guide compliance</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-emerald-400 font-semibold group-hover:gap-3 transition-all">
              <span>Start Subtitling</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center">
        <p className="text-xs text-slate-600">
          Karya Studio v2.0 · Gemini AI · Netflix Timed Text Compliant
        </p>
      </div>
    </div>
  );
}
