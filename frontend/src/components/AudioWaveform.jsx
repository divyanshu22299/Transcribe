import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import {
  Play, Pause, Square, RotateCcw, RotateCw, Volume2, VolumeX, ZoomIn, ZoomOut, Repeat, Music, X
} from 'lucide-react';

export default function AudioWaveform({
  audioUrl,
  segments,
  currentSegmentId,
  onSegmentClick,
  onTimeUpdate,
  playTargetTime
}) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const activeLoopRef = useRef(null); // { start: number, end: number, isLooping: boolean, segId?: number }

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [zoomLevel, setZoomLevel] = useState(25);
  const [isLoopingSegment, setIsLoopingSegment] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [activeLoopDisplay, setActiveLoopDisplay] = useState(null);

  // Core loop enforcer function (Only active when isLoopingSegment is true)
  const enforceLoop = useCallback((time) => {
    const loop = activeLoopRef.current;
    if (!loop || !loop.isLooping || !wavesurferRef.current) return;
    
    // Strict boundary loop check
    if (time >= loop.end - 0.02 || time < loop.start - 0.2) {
      try {
        wavesurferRef.current.setTime(loop.start);
        if (!wavesurferRef.current.isPlaying()) {
          wavesurferRef.current.play();
        }
      } catch (e) {
        console.error("Loop seek error:", e);
      }
    }
  }, []);

  // Handle external play/stop requests (from segment play buttons or word clicks)
  useEffect(() => {
    if (!playTargetTime || !isReady || !wavesurferRef.current) return;

    try {
      const startTime = parseFloat(playTargetTime.time) || 0;
      const endTime = playTargetTime.endTime !== undefined ? parseFloat(playTargetTime.endTime) : (startTime + 3.0);

      if (playTargetTime.pause) {
        activeLoopRef.current = null;
        setActiveLoopDisplay(null);
        setIsLoopingSegment(false);
        wavesurferRef.current.pause();
        wavesurferRef.current.setTime(startTime);
        setCurrentTime(startTime);
        setIsPlaying(false);
        return;
      }

      // If loop is requested from segment play button
      if (playTargetTime.loop) {
        activeLoopRef.current = {
          start: startTime,
          end: endTime,
          isLooping: true,
          segId: playTargetTime.segId
        };
        setActiveLoopDisplay({
          start: startTime,
          end: endTime,
          segId: playTargetTime.segId
        });
        setIsLoopingSegment(true);
      } else {
        // Global play from specific time
        activeLoopRef.current = null;
        setActiveLoopDisplay(null);
        setIsLoopingSegment(false);
      }

      wavesurferRef.current.setTime(startTime);
      wavesurferRef.current.play();
      setIsPlaying(true);
    } catch (e) {
      console.error("WaveSurfer play error:", e);
    }
  }, [playTargetTime, isReady]);

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    setIsReady(false);
    if (wavesurferRef.current) {
      try {
        wavesurferRef.current.destroy();
      } catch (e) {}
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#cbd5e1',      // Slate-300
      progressColor: '#4f46e5',  // Indigo-600
      cursorColor: '#0f172a',    // Slate-900
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1.5,
      barRadius: 2,
      height: 48,                // Ultra-compact 48px height
      normalize: true,
      minPxPerSec: zoomLevel,
      url: audioUrl,
    });

    ws.on('ready', () => {
      setIsReady(true);
      setDuration(ws.getDuration());
      setIsPlaying(false);
      try {
        ws.zoom(zoomLevel);
        ws.setPlaybackRate(playbackRate);
      } catch (e) {}
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    
    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
      if (onTimeUpdate) onTimeUpdate(time);
      enforceLoop(time);
    });

    ws.on('audioprocess', (time) => {
      enforceLoop(time);
    });

    ws.on('finish', () => {
      if (activeLoopRef.current && activeLoopRef.current.isLooping) {
        try {
          ws.setTime(activeLoopRef.current.start);
          ws.play();
        } catch (e) {
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(false);
      }
    });

    wavesurferRef.current = ws;

    return () => {
      try {
        ws.destroy();
      } catch (e) {}
      wavesurferRef.current = null;
    };
  }, [audioUrl, enforceLoop]);

  useEffect(() => {
    if (isReady && wavesurferRef.current) {
      try {
        wavesurferRef.current.zoom(zoomLevel);
      } catch (e) {}
    }
  }, [zoomLevel, isReady]);

  useEffect(() => {
    if (isReady && wavesurferRef.current) {
      try {
        wavesurferRef.current.setPlaybackRate(playbackRate);
      } catch (e) {}
    }
  }, [playbackRate, isReady]);

  useEffect(() => {
    if (isReady && wavesurferRef.current) {
      try {
        wavesurferRef.current.setMuted(isMuted);
      } catch (e) {}
    }
  }, [isMuted, isReady]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleGlobalPlay();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        stopAndReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReady]);

  // 1. PLAY BUTTON AT BOTTOM OF WAVELENGTH: Plays the ENTIRE audio continuously
  const toggleGlobalPlay = () => {
    if (isReady && wavesurferRef.current) {
      // Clear segment loop mode so it plays the entire audio continuously
      activeLoopRef.current = null;
      setActiveLoopDisplay(null);
      setIsLoopingSegment(false);

      try {
        wavesurferRef.current.playPause();
      } catch (e) {}
    }
  };

  // Dedicated Stop Button on Main Waveform: Pauses and teleports marker to 00:00.000 (Start of entire audio)
  const stopAndReset = () => {
    if (isReady && wavesurferRef.current) {
      try {
        wavesurferRef.current.pause();
        setIsPlaying(false);
        activeLoopRef.current = null;
        setActiveLoopDisplay(null);
        setIsLoopingSegment(false);

        // Teleport marker to beginning of entire audio (0.0s)
        wavesurferRef.current.setTime(0);
        setCurrentTime(0);
      } catch (e) {}
    }
  };

  const clearLoopAndPlayFull = () => {
    activeLoopRef.current = null;
    setActiveLoopDisplay(null);
    setIsLoopingSegment(false);
  };

  const skip = (seconds) => {
    if (isReady && wavesurferRef.current) {
      try {
        const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
        wavesurferRef.current.setTime(newTime);
      } catch (e) {}
    }
  };

  // 2. SEGMENT LOOP PLAY: Plays only this specific segment in continuous loop
  const playSegmentLoop = (start, end, segId) => {
    if (isReady && wavesurferRef.current) {
      try {
        const s = parseFloat(start);
        const e = parseFloat(end);
        activeLoopRef.current = {
          start: s,
          end: e,
          isLooping: true,
          segId: segId
        };
        setActiveLoopDisplay({
          start: s,
          end: e,
          segId: segId
        });
        setIsLoopingSegment(true);
        wavesurferRef.current.setTime(s);
        wavesurferRef.current.play();
        setIsPlaying(true);
      } catch (err) {}
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-xs transition-all">
      {/* Waveform Canvas Container (Ultra Compact) */}
      <div className="relative bg-slate-900/5 rounded-lg p-2 border border-slate-200/80 mb-2 overflow-hidden">
        <div ref={containerRef} className="cursor-pointer" />
        
        {/* Speaker Timeline Ribbon */}
        {duration > 0 && segments && segments.length > 0 && (
          <div className="relative w-full h-2 mt-1.5 flex bg-slate-200 rounded overflow-hidden">
            {segments.map((seg) => {
              const leftPct = (seg.start_time / duration) * 100;
              const widthPct = ((seg.end_time - seg.start_time) / duration) * 100;
              const isCurrent = seg.segment_id === currentSegmentId;
              const isSpeaker1 = seg.speaker === 'Speaker 1';

              return (
                <div
                  key={seg.segment_id}
                  onClick={() => {
                    playSegmentLoop(seg.start_time, seg.end_time, seg.segment_id);
                    if (onSegmentClick) onSegmentClick(seg);
                  }}
                  title={`Segment #${seg.segment_id}: ${seg.speaker} (${formatTime(seg.start_time)} - ${formatTime(seg.end_time)})`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${Math.max(0.5, widthPct)}%`,
                    position: 'absolute'
                  }}
                  className={`h-full cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-amber-500 ring-2 ring-amber-400 z-10'
                      : isSpeaker1
                      ? 'bg-indigo-500 hover:bg-indigo-600'
                      : 'bg-emerald-500 hover:bg-emerald-600'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Transport Controls Bar (Sleek Single Line) */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Left: Global Play (Entire Audio), Stop & Timecode */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => skip(-2)}
            title="Rewind 2s"
            className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* 1. MAIN PLAY BUTTON: Plays the ENTIRE audio continuously */}
          <button
            onClick={toggleGlobalPlay}
            title={isPlaying && !isLoopingSegment ? "Pause (Spacebar)" : "Play Entire Audio (Spacebar)"}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs transition-transform active:scale-95 cursor-pointer font-bold"
          >
            {isPlaying && !isLoopingSegment ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                <span>Play All</span>
              </>
            )}
          </button>

          {/* Dedicated Stop Button */}
          <button
            onClick={stopAndReset}
            title="Stop & Reset to Start of Audio 00:00.000 (Escape)"
            className="flex items-center justify-center p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs transition-transform active:scale-95 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            onClick={() => skip(2)}
            title="Forward 2s"
            className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Compact Timecode */}
          <div className="font-mono text-[11px] text-slate-700 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1 shadow-2xs">
            <span className="text-indigo-600 font-bold">{formatTime(currentTime)}</span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600 font-semibold">{formatTime(duration)}</span>
          </div>

          {/* Segment Loop Active Banner */}
          {activeLoopDisplay && isLoopingSegment && (
            <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg text-[11px] font-bold animate-in fade-in">
              <Repeat className="w-3 h-3 text-amber-600 animate-spin" />
              <span>
                Looping #{activeLoopDisplay.segId || ''} ({formatTime(activeLoopDisplay.start)} - {formatTime(activeLoopDisplay.end)})
              </span>
              <button
                onClick={clearLoopAndPlayFull}
                className="hover:text-rose-600 ml-1 p-0.5 bg-amber-100 rounded text-[10px] px-1 font-semibold cursor-pointer"
                title="Switch to playing entire audio"
              >
                Exit Loop (Play All)
              </button>
            </div>
          )}
        </div>

        {/* Center: Playback Speed */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
          {[0.8, 1.0, 1.25, 1.5].map((rate) => (
            <button
              key={rate}
              onClick={() => setPlaybackRate(rate)}
              className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                playbackRate === rate
                  ? 'bg-white text-indigo-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Right: Zoom & Volume */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
            <ZoomOut className="w-3 h-3 text-slate-400" />
            <input
              type="range"
              min="10"
              max="120"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="w-16 accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded"
              title="Zoom Level"
            />
            <ZoomIn className="w-3 h-3 text-slate-400" />
          </div>

          <button
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
