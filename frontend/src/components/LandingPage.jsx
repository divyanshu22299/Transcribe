import React from 'react';
import { Mic, Film, Sparkles, ArrowRight, Headphones, Subtitles, Zap, ShieldCheck, Play, Layers } from 'lucide-react';

export default function LandingPage({ onSelect }) {
  return (
    <div className="min-h-screen bg-[#0e0f12] text-[#f1f2f6] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans select-none">
      {/* Subtle Background Radial Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#00e5be]/10 to-[#00e5ff]/10 blur-[120px] pointer-events-none rounded-full" />
      
      {/* Header */}
      <div className="text-center mb-10 relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#181920] border border-[#282936] mb-5 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-[#00e5be]" />
          <span className="text-[11px] font-semibold text-[#9496a8] uppercase tracking-wider">Powered by Gemini Multimodal AI</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-3">
          Karya <span className="text-[#00e5be] drop-shadow-[0_0_20px_rgba(0,229,190,0.35)]">Studio</span>
        </h1>
        <p className="text-sm text-[#9496a8] max-w-lg mx-auto font-medium leading-relaxed">
          Professional conversational speech transcription & broadcast-grade subtitle suite.
        </p>
      </div>

      {/* Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl w-full relative z-10">
        
        {/* Transcribe Studio Card */}
        <button
          onClick={() => onSelect('transcribe')}
          className="group relative bg-[#14151a] hover:bg-[#181922] border border-[#262734] hover:border-[#00e5be]/60 rounded-2xl p-7 text-left transition-all duration-200 shadow-xl hover:shadow-[0_0_30px_rgba(0,229,190,0.12)] cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#1e202a] border border-[#2c2e3c] flex items-center justify-center text-[#00e5be] group-hover:scale-105 transition-transform shadow-inner">
                <Mic className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#1e202a] text-[#9496a8] border border-[#2a2c3a] uppercase tracking-wider">
                Acoustic Verbatim
              </span>
            </div>

            <h2 className="text-xl font-bold text-white mb-1.5 flex items-center gap-2">
              <span>Transcribe Studio</span>
            </h2>
            <p className="text-xs text-[#9496a8] mb-6 leading-relaxed">
              Verbatim conversational transcription with acoustic diarization, word-level confidence heatmaps, and Karya compliance QC.
            </p>

            <div className="space-y-2.5 mb-6 text-xs text-[#b8b9c9]">
              <div className="flex items-center gap-2.5">
                <Headphones className="w-3.5 h-3.5 text-[#00e5be] shrink-0" />
                <span>Lossless & compressed audio (WAV, MP3, M4A, FLAC, OGG)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Zap className="w-3.5 h-3.5 text-[#00e5be] shrink-0" />
                <span>Multi-speaker acoustic diarization & physical onset alignment</span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00e5be] shrink-0" />
                <span>Karya verbatim guidelines linter with ≥98% target QC score</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#22232c] flex items-center justify-between">
            <span className="text-xs font-bold text-[#00e5be] flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
              <span>Launch Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-mono text-[#5c5e70]">WAV / MP3 · CSV / DOCX</span>
          </div>
        </button>

        {/* Subtitle Studio Card */}
        <button
          onClick={() => onSelect('subtitle')}
          className="group relative bg-[#14151a] hover:bg-[#181922] border border-[#262734] hover:border-[#00e5ff]/60 rounded-2xl p-7 text-left transition-all duration-200 shadow-xl hover:shadow-[0_0_30px_rgba(0,229,255,0.12)] cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#1e202a] border border-[#2c2e3c] flex items-center justify-center text-[#00e5ff] group-hover:scale-105 transition-transform shadow-inner">
                <Film className="w-6 h-6" />
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/30 uppercase tracking-wider">
                <Sparkles className="w-2.5 h-2.5" />
                PRO NLE
              </span>
            </div>

            <h2 className="text-xl font-bold text-white mb-1.5 flex items-center gap-2">
              <span>Subtitle Studio</span>
            </h2>
            <p className="text-xs text-[#9496a8] mb-6 leading-relaxed">
              Broadcast-grade subtitle suite with interactive video player, real-time waveform timeline, and Netflix Timed Text QC.
            </p>

            <div className="space-y-2.5 mb-6 text-xs text-[#b8b9c9]">
              <div className="flex items-center gap-2.5">
                <Subtitles className="w-3.5 h-3.5 text-[#00e5ff] shrink-0" />
                <span>Multi-format video editor (MP4, MKV, MOV, WebM)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Zap className="w-3.5 h-3.5 text-[#00e5ff] shrink-0" />
                <span>Netflix QC engine: CPS ≤20, CPL ≤42, shot boundaries & gap-chaining</span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00e5ff] shrink-0" />
                <span>Interactive timeline with live drag handles & AI self-correction</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#22232c] flex items-center justify-between">
            <span className="text-xs font-bold text-[#00e5ff] flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
              <span>Launch Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
            <span className="text-[10px] font-mono text-[#5c5e70]">MP4 / MOV · TTML / SRT</span>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="mt-10 text-center relative z-10">
        <p className="text-[11px] font-mono text-[#5c5e70]">
          Karya Creative Studio · Gemini 2.5 AI · Netflix Timed Text Certified
        </p>
      </div>
    </div>
  );
}
