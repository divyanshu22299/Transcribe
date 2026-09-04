import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Minimize, 
  StepBack, StepForward, Grid, Eye, EyeOff, RotateCcw, Volume1, Repeat
} from 'lucide-react';

export default function VideoPlayer({
  videoUrl,
  events = [],
  activeEventId = null,
  setActiveEventId = () => {},
  playTarget = null,
  onTimeUpdate = () => {},
  frameRate = 24,
  theme = 'dark', // 'dark' | 'light'
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const loopRef = useRef(null);
  const animFrameRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState(null);
  const [showTitleSafe, setShowTitleSafe] = useState(false);
  const [subtitlePosition, setSubtitlePosition] = useState('bottom'); // 'bottom' | 'top'
  const [subtitleFontSize, setSubtitleFontSize] = useState(24); // px relative
  const [audioLevel, setAudioLevel] = useState(0); // for fake/real VU meter

  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(0);

  const activeEventIdRef = useRef(activeEventId);
  activeEventIdRef.current = activeEventId;

  // Format SMPTE Timecode HH:MM:SS:FF
  const formatSMPTE = useCallback((seconds) => {
    if (isNaN(seconds) || seconds == null) return "00:00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * frameRate);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  }, [frameRate]);

  // Format Milliseconds HH:MM:SS.mmm
  const formatMillis = useCallback((seconds) => {
    if (isNaN(seconds) || seconds == null) return "00:00:00.000";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(e => console.error("Playback failed:", e));
    } else {
      videoRef.current.pause();
    }
  }, []);

  // Global Keyboard Shortcuts (Space, Left/Right 2s, comma/period frame step, L loop)
  const handleKeyDown = useCallback((e) => {
    if (!videoRef.current) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 2);
        break;
      case 'ArrowRight':
        e.preventDefault();
        videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 2);
        break;
      case ',':
      case '<':
        e.preventDefault();
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (1 / frameRate));
        break;
      case '.':
      case '>':
        e.preventDefault();
        videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + (1 / frameRate));
        break;
      case 'l':
      case 'L':
        e.preventDefault();
        if (activeEventId) {
          const ev = events.find(x => (x.id === activeEventId || x.event_id === activeEventId));
          if (ev) {
            const st = ev.start_time ?? ev.start ?? 0;
            const en = ev.end_time ?? ev.end ?? 0;
            videoRef.current.currentTime = st;
            loopRef.current = { start: st, end: en };
            videoRef.current.play().catch(() => {});
          }
        }
        break;
      default:
        break;
    }
  }, [duration, frameRate, togglePlay, activeEventId, events]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 60FPS Continuous Time Update & Meter Loop for Buttery Smooth Motion
  useEffect(() => {
    let animId;
    if (isPlaying) {
      const loop = () => {
        if (videoRef.current) {
          const t = videoRef.current.currentTime;
          setCurrentTime(t);
          onTimeUpdate(t);

          // Audio Meter jitter
          setAudioLevel(0.25 + Math.random() * 0.65);

          // Enforce Loop Mode
          if (loopRef.current && loopRef.current.end !== undefined) {
            if (t >= loopRef.current.end) {
              videoRef.current.currentTime = loopRef.current.start || 0;
            }
          }

          // Active subtitle lookup
          if (events && events.length > 0) {
            const active = events.find(e => {
              const st = e.start_time !== undefined ? e.start_time : (e.start !== undefined ? e.start : 0);
              const en = e.end_time !== undefined ? e.end_time : (e.end !== undefined ? e.end : 0);
              return t >= st && t <= en;
            });
            setCurrentSubtitle(active || null);
            if (active) {
              const aId = active.id ?? active.event_id;
              if (aId !== activeEventIdRef.current) {
                setActiveEventId(aId);
              }
            }
          }
        }
        animId = requestAnimationFrame(loop);
      };
      animId = requestAnimationFrame(loop);
    } else {
      setAudioLevel(0);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, events, onTimeUpdate, setActiveEventId]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    onTimeUpdate(t);

    if (events && events.length > 0) {
      const active = events.find(e => {
        const st = e.start_time !== undefined ? e.start_time : (e.start !== undefined ? e.start : 0);
        const en = e.end_time !== undefined ? e.end_time : (e.end !== undefined ? e.end : 0);
        return t >= st && t <= en;
      });
      setCurrentSubtitle(active || null);
      if (active) {
        const aId = active.id ?? active.event_id;
        if (aId !== activeEventIdRef.current) {
          setActiveEventId(aId);
        }
      }
    }
  }, [events, onTimeUpdate, setActiveEventId]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  useEffect(() => {
    if (playTarget && videoRef.current) {
      const video = videoRef.current;
      if (playTarget.pause) {
        video.pause();
        if (playTarget.time !== undefined) {
          video.currentTime = playTarget.time;
        }
        loopRef.current = null;
      } else {
        if (playTarget.time !== undefined) {
          video.currentTime = playTarget.time;
        }
        if (playTarget.endTime !== undefined) {
          loopRef.current = { start: playTarget.time || 0, end: playTarget.endTime };
        } else {
          loopRef.current = null;
        }
        video.play().catch(e => console.log('playback error', e));
      }
    }
  }, [playTarget]);

  // Fullscreen support
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const cyclePlaybackRate = () => {
    const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  const handleProgressClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    if (videoRef.current) {
      videoRef.current.currentTime = percentage * duration;
    }
  };

  const handleProgressMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setHoverPosition(x);
    setHoverTime(percentage * duration);
  };

  // Render Netflix Subtitle Typography
  const renderSubtitleText = (text, isHighlighted) => {
    if (!text) return null;
    const lines = text.split('\n');
    return (
      <div 
        className={`text-center transition-all duration-150 select-none ${
          isHighlighted ? 'drop-shadow-[0_0_12px_rgba(52,211,153,0.9)]' : ''
        }`}
        style={{ 
          textShadow: '0 2px 4px rgba(0,0,0,0.95), -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000',
          fontFamily: 'Netflix Sans, Roboto, Helvetica, Arial, sans-serif',
          lineHeight: '1.25',
          fontSize: `${subtitleFontSize}px`
        }}
      >
        {lines.map((line, i) => {
          const isDual = line.trim().startsWith('-');
          const parts = line.split(/(<\/?i>)/i);
          let isItalic = false;
          const renderedParts = parts.map((part, idx) => {
            if (part.toLowerCase() === '<i>') { isItalic = true; return null; }
            if (part.toLowerCase() === '</i>') { isItalic = false; return null; }
            if (!part) return null;
            let textPart = part.replace(/♪/g, ' ♪ ');
            return (
              <span key={idx} style={isItalic ? { fontStyle: 'italic' } : {}}>
                {textPart}
              </span>
            );
          });

          return (
            <div key={i} className={`inline-block mx-auto ${isDual ? 'text-amber-100 font-medium' : 'text-white font-medium'}`}>
              <span className="bg-black/40 px-2 py-0.5 rounded box-decoration-clone">
                {renderedParts}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const isDark = theme === 'dark';
  const isCurrentActive = currentSubtitle && (currentSubtitle.id === activeEventId || currentSubtitle.event_id === activeEventId);

  return (
    <div 
      ref={containerRef}
      tabIndex={0}
      className={`relative rounded-2xl overflow-hidden shadow-sm flex flex-col group focus:outline-none border w-full h-full transition-colors ${
        isDark ? 'bg-[#0d0f15] border-[#232838]' : 'bg-white border-slate-200'
      }`}
    >
      {/* Top Monitor Header HUD */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between text-xs shrink-0 z-20 transition-colors ${
        isDark ? 'bg-[#141824]/90 backdrop-blur border-[#232838] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
      }`}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-bold text-[11px] uppercase tracking-wider font-mono">PROGRAM MONITOR</span>
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
            isDark ? 'text-slate-400 bg-[#1c2233] border-[#2d354d]' : 'text-slate-600 bg-white border-slate-300'
          }`}>
            {frameRate} FPS
          </span>
        </div>

        {/* Safe Area & Position Toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowTitleSafe(!showTitleSafe)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
              showTitleSafe 
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' 
                : isDark ? 'bg-[#181d2c] border-[#2c344a] text-slate-400 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle Netflix 90% Title-Safe Box"
          >
            <Grid className="w-3 h-3" />
            <span>Title Safe</span>
          </button>

          <button
            onClick={() => setSubtitlePosition(subtitlePosition === 'bottom' ? 'top' : 'bottom')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
              isDark ? 'bg-[#181d2c] border-[#2c344a] text-slate-400 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle Subtitle Top/Bottom Screen Position"
          >
            Pos: {subtitlePosition === 'bottom' ? 'Bottom 80%' : 'Top 20%'}
          </button>

          <div className={`flex items-center gap-1 border rounded px-1.5 py-0.5 ${
            isDark ? 'bg-[#181d2c] border-[#2c344a]' : 'bg-white border-slate-300'
          }`}>
            <span className="text-[10px] opacity-60">Size:</span>
            <button onClick={() => setSubtitleFontSize(Math.max(16, subtitleFontSize - 2))} className="opacity-70 hover:opacity-100 text-xs px-0.5 font-bold">-</button>
            <span className="text-[10px] font-mono font-bold">{subtitleFontSize}px</span>
            <button onClick={() => setSubtitleFontSize(Math.min(36, subtitleFontSize + 2))} className="opacity-70 hover:opacity-100 text-xs px-0.5 font-bold">+</button>
          </div>
        </div>
      </div>

      {/* Center Video Stage */}
      <div className="relative w-full flex-grow flex items-center justify-center bg-black min-h-[220px] overflow-hidden select-none">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlay}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); loopRef.current = null; }}
            onVolumeChange={(e) => {
              setIsMuted(e.target.muted);
              setVolume(e.target.volume);
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 gap-2 p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#171b26] border border-[#272e42] flex items-center justify-center text-slate-400">
              <Play className="w-5 h-5 ml-0.5" />
            </div>
            <p className="text-xs font-semibold text-slate-400">No Video Loaded</p>
            <p className="text-[11px] text-slate-600 max-w-xs">Select or drop a video from the top bar to preview real-time Netflix subtitle overlays.</p>
          </div>
        )}

        {/* Netflix Title-Safe Grid Box Overlay */}
        {showTitleSafe && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* 90% Action Safe */}
            <div className="w-[90%] h-[90%] border border-cyan-500/30 border-dashed rounded flex items-center justify-center relative">
              <span className="absolute top-1 left-1.5 text-[8px] font-mono text-cyan-400/60 bg-black/50 px-1 rounded">
                90% ACTION SAFE
              </span>
              {/* 80% Title Safe */}
              <div className="w-[88%] h-[88%] border border-amber-400/40 border-dashed rounded relative">
                <span className="absolute bottom-1 right-1.5 text-[8px] font-mono text-amber-400/70 bg-black/50 px-1 rounded">
                  80% NETFLIX TITLE SAFE
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Live Subtitle Overlay */}
        <div 
          className={`absolute left-0 right-0 px-8 pointer-events-none flex flex-col items-center justify-center z-10 transition-all ${
            subtitlePosition === 'top' ? 'top-[8%]' : 'bottom-[7%]'
          }`}
        >
          {renderSubtitleText(currentSubtitle?.text, isCurrentActive)}
        </div>

        {/* Loop Banner */}
        {loopRef.current && (
          <div className="absolute top-3 left-3 bg-indigo-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md z-20 backdrop-blur-xs">
            <Repeat className="w-3 h-3 animate-spin" />
            <span>LOOPING #{activeEventId}</span>
          </div>
        )}
      </div>

      {/* Pro Transport & Scrub Bar */}
      <div className={`p-2.5 flex flex-col gap-2 relative z-20 shrink-0 border-t transition-colors ${
        isDark ? 'bg-[#121622] text-white border-[#232838]' : 'bg-slate-50 text-slate-800 border-slate-200'
      }`}>
        {/* Scrubber Progress Bar */}
        <div 
          className={`w-full h-2 cursor-pointer relative rounded-full hover:h-2.5 transition-all duration-150 group/progress overflow-hidden ${
            isDark ? 'bg-[#22283a]' : 'bg-slate-200'
          }`}
          onClick={handleProgressClick}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={() => setHoverTime(null)}
        >
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full pointer-events-none transition-all duration-75"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
          {hoverTime !== null && (
            <div 
              className={`absolute -top-7 border text-[10px] font-mono px-2 py-0.5 rounded shadow-lg pointer-events-none transform -translate-x-1/2 whitespace-nowrap hidden group-hover/progress:block z-30 ${
                isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
              }`}
              style={{ left: `${hoverPosition}px` }}
            >
              {formatSMPTE(hoverTime)}
            </div>
          )}
        </div>

        {/* Controls Deck */}
        <div className="flex items-center justify-between">
          {/* Left: Playback Controls */}
          <div className="flex items-center gap-2">
            <button 
              onClick={togglePlay} 
              className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-transform active:scale-95 shadow-md cursor-pointer"
              title="Play / Pause (Space)"
            >
              {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
            </button>
            
            <div className={`flex items-center gap-1 p-1 rounded-xl border ${
              isDark ? 'text-slate-300 bg-[#191e2e] border-[#262e44]' : 'text-slate-700 bg-white border-slate-300'
            }`}>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 2); }} title="Rewind 2s (Left Arrow)" className={`p-1 rounded-lg transition-colors cursor-pointer ${isDark ? 'hover:text-white hover:bg-[#252c42]' : 'hover:bg-slate-100'}`}>
                <SkipBack size={14} />
              </button>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (1/frameRate)); }} title="Step Back 1 Frame (,)" className={`p-1 rounded-lg transition-colors cursor-pointer ${isDark ? 'hover:text-white hover:bg-[#252c42]' : 'hover:bg-slate-100'}`}>
                <StepBack size={14} />
              </button>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + (1/frameRate)); }} title="Step Forward 1 Frame (.)" className={`p-1 rounded-lg transition-colors cursor-pointer ${isDark ? 'hover:text-white hover:bg-[#252c42]' : 'hover:bg-slate-100'}`}>
                <StepForward size={14} />
              </button>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 2); }} title="Forward 2s (Right Arrow)" className={`p-1 rounded-lg transition-colors cursor-pointer ${isDark ? 'hover:text-white hover:bg-[#252c42]' : 'hover:bg-slate-100'}`}>
                <SkipForward size={14} />
              </button>
            </div>

            {/* SMPTE & Milliseconds Timecode Readout */}
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border font-mono text-xs ${
              isDark ? 'bg-[#171c2b] border-[#262e44]' : 'bg-white border-slate-300'
            }`}>
              <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{formatSMPTE(currentTime)}</span>
              <span className="opacity-40 text-[10px]">/</span>
              <span className="opacity-75 text-[11px]">{formatSMPTE(duration)}</span>
            </div>
          </div>

          {/* Right: VU Meter, Rate, Volume, Fullscreen */}
          <div className="flex items-center gap-2.5">
            {/* Audio VU Meter */}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-xl border ${
              isDark ? 'bg-[#171c2b] border-[#262e44]' : 'bg-white border-slate-300'
            }`} title="Audio Peak Level">
              <Volume1 className="w-3.5 h-3.5 opacity-60" />
              <div className={`w-12 h-2 rounded-full overflow-hidden flex gap-0.5 p-0.5 ${isDark ? 'bg-[#252c42]' : 'bg-slate-200'}`}>
                <div 
                  className={`h-full rounded-full transition-all duration-75 ${
                    audioLevel > 0.8 ? 'bg-rose-500' : audioLevel > 0.5 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, audioLevel * 100)}%` }}
                />
              </div>
            </div>

            {/* Playback Speed */}
            <button 
              onClick={cyclePlaybackRate} 
              className={`text-[11px] font-bold border px-2 py-1 rounded-lg text-center transition-colors cursor-pointer ${
                isDark ? 'text-slate-200 hover:text-white bg-[#191e2e] border-[#262e44]' : 'text-slate-700 bg-white hover:bg-slate-100 border-slate-300'
              }`}
              title="Cycle Speed"
            >
              {playbackRate}x
            </button>

            {/* Volume Control */}
            <div className={`flex items-center gap-1.5 border px-2 py-1 rounded-xl ${
              isDark ? 'bg-[#191e2e] border-[#262e44]' : 'bg-white border-slate-300'
            }`}>
              <button onClick={() => { if (videoRef.current) { const m = !isMuted; setIsMuted(m); videoRef.current.muted = m; } }} className="cursor-pointer">
                {isMuted || volume === 0 ? <VolumeX size={14} className="text-rose-400" /> : <Volume2 size={14} />}
              </button>
              <input 
                type="range" 
                min="0" max="1" step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  setIsMuted(v === 0);
                  if (videoRef.current) {
                    videoRef.current.volume = v;
                    videoRef.current.muted = v === 0;
                  }
                }}
                className="w-14 h-1 bg-slate-400 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            {/* Fullscreen */}
            <button 
              onClick={toggleFullscreen} 
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isDark ? 'bg-[#191e2e] border-[#262e44] text-slate-300 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
