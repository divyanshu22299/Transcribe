import React, { useState } from 'react';
import { Settings, X, RotateCcw, Sparkles, Sliders, ShieldCheck, Check, Globe } from 'lucide-react';
import { setCustomApiBase } from '../../config';

export default function SubtitleSettingsModal({
  isOpen,
  onClose,
  isDark = true,
  cplLimit = 42,
  setCplLimit,
  cpsLimit = 20,
  setCpsLimit,
  maxLines = 2,
  setMaxLines,
  minDuration = 0.833,
  setMinDuration,
  maxDuration = 7.0,
  setMaxDuration,
  language = 'en',
  setLanguage,
  contentType = 'adult',
  setContentType,
  sdhMode = false,
  setSdhMode,
  geminiAutoFix = true,
  setGeminiAutoFix,
  onApply = () => {}
}) {
  const [apiUrl, setApiUrl] = useState(() => {
    try {
      return localStorage.getItem('karya_api_url') || import.meta.env.VITE_API_URL || '';
    } catch {
      return '';
    }
  });
  const [testStatus, setTestStatus] = useState(null);

  if (!isOpen) return null;

  const presets = [
    {
      name: 'Netflix Adult',
      desc: 'Standard 42 CPL · 20 CPS · 2 Lines',
      apply: () => {
        setCplLimit(42);
        setCpsLimit(20);
        setMaxLines(2);
        setMinDuration(0.833);
        setMaxDuration(7.0);
        setContentType('adult');
      }
    },
    {
      name: 'Netflix Kids',
      desc: 'Relaxed 42 CPL · 17 CPS · 2 Lines',
      apply: () => {
        setCplLimit(42);
        setCpsLimit(17);
        setMaxLines(2);
        setMinDuration(0.833);
        setMaxDuration(7.0);
        setContentType('children');
      }
    },
    {
      name: 'Broadcast TV',
      desc: 'Compact 37 CPL · 17 CPS · 2 Lines',
      apply: () => {
        setCplLimit(37);
        setCpsLimit(17);
        setMaxLines(2);
        setMinDuration(1.0);
        setMaxDuration(6.0);
      }
    },
    {
      name: 'Mobile / Reels',
      desc: 'Short 32 CPL · 22 CPS · 1 Line',
      apply: () => {
        setCplLimit(32);
        setCpsLimit(22);
        setMaxLines(1);
        setMinDuration(0.6);
        setMaxDuration(4.5);
      }
    }
  ];

  const handleResetDefaults = () => {
    setCplLimit(42);
    setCpsLimit(20);
    setMaxLines(2);
    setMinDuration(0.833);
    setMaxDuration(7.0);
    setContentType('adult');
    setSdhMode(false);
    setGeminiAutoFix(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isDark ? 'bg-[#121624] border-[#252c3f] text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between ${
          isDark ? 'border-[#202738] bg-[#161c2e]' : 'border-slate-100 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Subtitle Studio QC & Generation Settings</h2>
              <p className="text-xs text-slate-400">Configure reading speeds, character caps, and AI correction rules</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700/30 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar text-xs">
          
          {/* Presets Section */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Industry Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presets.map(p => (
                <button
                  key={p.name}
                  onClick={p.apply}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isDark 
                      ? 'bg-[#181f33] border-[#29344e] hover:border-indigo-500 hover:bg-[#1f2842]' 
                      : 'bg-slate-50 border-slate-200 hover:border-indigo-400 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-xs text-indigo-400">{p.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Core Sliders (CPL & CPS) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Characters Per Line (CPL) */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs">Characters Per Line (CPL)</span>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-indigo-600 text-white">
                  {cplLimit} chars
                </span>
              </div>
              <input
                type="range"
                min="28"
                max="50"
                step="1"
                value={cplLimit}
                onChange={e => setCplLimit(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>28 (Short)</span>
                <span>42 (Netflix Std)</span>
                <span>50 (Wide)</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Maximum characters allowed on a single subtitle line before wrapping.
              </p>
            </div>

            {/* Reading Speed (CPS) */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs">Reading Speed (CPS)</span>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-indigo-600 text-white">
                  {cpsLimit} CPS
                </span>
              </div>
              <input
                type="range"
                min="12"
                max="25"
                step="0.5"
                value={cpsLimit}
                onChange={e => setCpsLimit(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>12 (Slow)</span>
                <span>17 (Kids) · 20 (Adult)</span>
                <span>25 (Fast)</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Maximum characters per second. Subtitles with CPS above this are flagged for reading fatigue.
              </p>
            </div>
          </div>

          {/* Line Count & Duration Limits */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Max Lines */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'}`}>
              <span className="font-bold text-xs block mb-2">Max Lines Per Subtitle</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setMaxLines(1)}
                  className={`py-1.5 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                    maxLines === 1 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : isDark ? 'bg-[#1f2638] text-slate-400 border-transparent' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  1 Line
                </button>
                <button
                  onClick={() => setMaxLines(2)}
                  className={`py-1.5 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                    maxLines === 2 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : isDark ? 'bg-[#1f2638] text-slate-400 border-transparent' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  2 Lines (Std)
                </button>
              </div>
            </div>

            {/* Min Duration */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between mb-1">
                <span className="font-bold text-xs">Min Duration</span>
                <span className="font-mono font-bold text-indigo-400">{minDuration.toFixed(3)}s</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={minDuration}
                onChange={e => setMinDuration(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer mt-1"
              />
              <span className="text-[10px] text-slate-400 block mt-1">Default 5/6 sec (20 frames)</span>
            </div>

            {/* Max Duration */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between mb-1">
                <span className="font-bold text-xs">Max Duration</span>
                <span className="font-mono font-bold text-indigo-400">{maxDuration.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min="3.0"
                max="10.0"
                step="0.5"
                value={maxDuration}
                onChange={e => setMaxDuration(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer mt-1"
              />
              <span className="text-[10px] text-slate-400 block mt-1">Netflix standard: 7.0s</span>
            </div>
          </div>

          {/* AI Self-Correction & Additional Toggles */}
          <div className="space-y-3">
            
            {/* Gemini Multi-Pass Self-Correction Toggle */}
            <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
              geminiAutoFix 
                ? isDark ? 'bg-indigo-950/30 border-indigo-700/60' : 'bg-indigo-50 border-indigo-200'
                : isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 mt-0.5">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                    Gemini AI QC Self-Correction Pass
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold uppercase">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Automatically coordinates linter errors back to Gemini to rewrite line breaks and split dense subtitles before finalizing.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={geminiAutoFix}
                onChange={e => setGeminiAutoFix(e.target.checked)}
                className="rounded accent-indigo-600 w-5 h-5 cursor-pointer"
              />
            </div>

            {/* Language & SDH Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <span className="font-bold text-xs block">Language Target</span>
                  <span className="text-[10px] text-slate-400">Controls terminology & transcription</span>
                </div>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className={`rounded-lg px-2 py-1 text-xs border focus:outline-none ${
                    isDark ? 'bg-[#0e121d] border-[#293247] text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ja">Japanese</option>
                  <option value="zh">Chinese</option>
                </select>
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <span className="font-bold text-xs block">Sound Descriptions (SDH)</span>
                  <span className="text-[10px] text-slate-400">Describe non-speech audio events [door slams]</span>
                </div>
                <input
                  type="checkbox"
                  checked={sdhMode}
                  onChange={e => setSdhMode(e.target.checked)}
                  className="rounded accent-indigo-600 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>

            {/* Backend API URL for Live Website Deployments */}
            <div className={`p-3.5 rounded-xl border space-y-2.5 ${
              isDark ? 'bg-[#161c2e] border-[#252c3f]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <div>
                    <span className="font-bold text-xs block">Backend API Server URL</span>
                    <span className="text-[10px] text-slate-400">
                      Required for live websites (e.g. Render, Railway, Cloud Run or Cloudflare/Ngrok URL)
                    </span>
                  </div>
                </div>
                {testStatus && (
                  <span className={`text-[11px] font-semibold ${testStatus.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {testStatus.message}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://your-backend.onrender.com (or leave empty for localhost)"
                  value={apiUrl}
                  onChange={e => {
                    setApiUrl(e.target.value);
                    setTestStatus(null);
                  }}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-mono border focus:outline-none ${
                    isDark ? 'bg-[#0e121d] border-[#293247] text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const target = (apiUrl || '').trim().replace(/\/+$/, '');
                    if (!target) {
                      setTestStatus({ success: false, message: 'URL is empty (using default proxy)' });
                      return;
                    }
                    setTestStatus({ success: null, message: 'Testing...' });
                    try {
                      const res = await fetch(`${target}/api/health`);
                      if (res.ok) {
                        setTestStatus({ success: true, message: '✓ Connected!' });
                      } else {
                        setTestStatus({ success: false, message: `Status ${res.status}` });
                      }
                    } catch (e) {
                      setTestStatus({ success: false, message: 'Failed: Check URL/HTTPS' });
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${
                    isDark ? 'bg-indigo-950/60 border-indigo-700 text-indigo-300 hover:bg-indigo-900' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                  }`}
                >
                  Test
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${
          isDark ? 'border-[#202738] bg-[#161c2e]' : 'border-slate-100 bg-slate-50'
        }`}>
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                isDark ? 'border-[#2c374e] hover:bg-[#20283d] text-slate-300' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const oldUrl = (localStorage.getItem('karya_api_url') || import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
                const newUrl = (apiUrl || '').trim().replace(/\/+$/, '');
                setCustomApiBase(newUrl);
                onApply();
                onClose();
                if (newUrl !== oldUrl) {
                  window.location.reload();
                }
              }}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Save & Apply Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
