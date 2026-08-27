import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import {
  Play, Pause, Square, RotateCcw, RotateCw, Volume2, VolumeX, ZoomIn, ZoomOut, Repeat, MoveHorizontal
} from 'lucide-react';

export default function AudioWaveform({
  audioUrl,
  segments,
  currentSegmentId,
  onSegmentClick,
  onSegmentTimeChange,
  onTimeUpdate,
  playTargetTime
}) {
  const containerRef = useRef(null);
  const scrollWrapperRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsPluginRef = useRef(null);
  const activeLoopRef = useRef(null);
  const isUpdatingRegionsFromProps = useRef(false);

  // Stale closure guards for external event listeners
  const onSegmentTimeChangeRef = useRef(onSegmentTimeChange);
  onSegmentTimeChangeRef.current = onSegmentTimeChange;

  const onSegmentClickRef = useRef(onSegmentClick);
  onSegmentClickRef.current = onSegmentClick;

  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const currentSegmentIdRef = useRef(currentSegmentId);
  currentSegmentIdRef.current = currentSegmentId;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [zoomLevel, setZoomLevel] = useState(30);
  const [isLoopingSegment, setIsLoopingSegment] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [activeLoopDisplay, setActiveLoopDisplay] = useState(null);
  const [draggedRegionInfo, setDraggedRegionInfo] = useState(null);

  // Core loop enforcer function
  const enforceLoop = useCallback((time) => {
    const loop = activeLoopRef.current;
    if (!loop || !loop.isLooping || !wavesurferRef.current) return;
    
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

  // Handle external play/stop requests
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

  // Initialize WaveSurfer & Regions
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    setIsReady(false);
    if (wavesurferRef.current) {
      try {
        wavesurferRef.current.destroy();
      } catch (e) {}
    }

    const wsRegions = RegionsPlugin.create();
    regionsPluginRef.current = wsRegions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(99, 102, 241, 0.45)',    // Continuous Indigo wavelength
      progressColor: '#4338ca',                 // Deep Indigo progress fill
      cursorColor: '#ef4444',                   // Bright Red cursor line
      cursorWidth: 2,
      height: 76,
      normalize: true,
      autoScroll: true,
      autoCenter: true,
      minPxPerSec: zoomLevel,
      url: audioUrl,
      plugins: [wsRegions]
    });

    // Handle Region drag & resize events
    const handleRegionUpdate = (region) => {
      if (isUpdatingRegionsFromProps.current) return;
      const segId = parseInt(region.id, 10);
      if (isNaN(segId)) return;

      const newStart = Math.max(0, Math.round(region.start * 1000) / 1000);
      const newEnd = Math.max(newStart + 0.1, Math.round(region.end * 1000) / 1000);

      setDraggedRegionInfo({
        segId: segId,
        start: newStart,
        end: newEnd,
        duration: Math.round((newEnd - newStart) * 1000) / 1000
      });

      if (onSegmentTimeChangeRef.current) {
        onSegmentTimeChangeRef.current(segId, newStart, newEnd);
      }
    };

    wsRegions.on('region-updated', handleRegionUpdate);

    wsRegions.on('region-update-end', (region) => {
      handleRegionUpdate(region);
      setTimeout(() => setDraggedRegionInfo(null), 1500);
    });

    wsRegions.on('region-clicked', (region, e) => {
      e.stopPropagation();
      const segId = parseInt(region.id, 10);
      if (onSegmentClickRef.current && segmentsRef.current) {
        const seg = segmentsRef.current.find((s) => s.segment_id === segId);
        if (seg) onSegmentClickRef.current(seg);
      }
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
      regionsPluginRef.current = null;
    };
  }, [audioUrl, enforceLoop]);

  // Synchronize on-waveform shaded regions with latest segments data
  useEffect(() => {
    const wsRegions = regionsPluginRef.current;
    if (!isReady || !wsRegions || !segments || segments.length === 0) return;

    isUpdatingRegionsFromProps.current = true;
    try {
      const existingRegions = wsRegions.getRegions() || [];
      const existingMap = new Map();
      existingRegions.forEach((r) => existingMap.set(String(r.id), r));

      segments.forEach((seg) => {
        const segIdStr = String(seg.segment_id);
        const isCurrent = seg.segment_id === currentSegmentId;
        const isSpeaker1 = seg.speaker === 'Speaker 1';

        let shadowColor = 'rgba(59, 130, 246, 0.22)'; // Blue shadow for Speaker 1
        if (isCurrent) {
          shadowColor = 'rgba(245, 158, 11, 0.42)'; // Highlighted Amber shadow for active
        } else if (!isSpeaker1) {
          shadowColor = 'rgba(16, 185, 129, 0.22)'; // Emerald shadow for Speaker 2
        }

        const contentStr = `#${seg.segment_id} ${seg.speaker || ''}`;
        const existing = existingMap.get(segIdStr);

        if (existing) {
          // If existing region needs updating
          if (Math.abs(existing.start - seg.start_time) > 0.005) {
            existing.start = seg.start_time;
          }
          if (Math.abs(existing.end - seg.end_time) > 0.005) {
            existing.end = seg.end_time;
          }
          existing.setOptions({
            color: shadowColor,
            content: contentStr,
            drag: true,
            resize: true
          });
          existingMap.delete(segIdStr);
        } else {
          // Add new region
          wsRegions.addRegion({
            id: segIdStr,
            start: Math.max(0, seg.start_time),
            end: Math.max(seg.start_time + 0.1, seg.end_time),
            content: contentStr,
            color: shadowColor,
            drag: true,
            resize: true,
          });
        }
      });

      // Remove deleted regions
      existingMap.forEach((r) => r.remove());
    } catch (err) {
      console.error("Failed to sync shaded regions:", err);
    } finally {
      setTimeout(() => {
        isUpdatingRegionsFromProps.current = false;
      }, 50);
    }
  }, [segments, currentSegmentId, isReady]);

  // Zoom control
  useEffect(() => {
    if (isReady && wavesurferRef.current) {
      try {
        wavesurferRef.current.zoom(zoomLevel);
      } catch (e) {}
    }
  }, [zoomLevel, isReady]);

  // Playback rate
  useEffect(() => {
    if (isReady && wavesurferRef.current) {
      try {
        wavesurferRef.current.setPlaybackRate(playbackRate);
      } catch (e) {}
    }
  }, [playbackRate, isReady]);

  // Mute control
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

  // 1. PLAY BUTTON: Plays the ENTIRE audio continuously
  const toggleGlobalPlay = () => {
    if (isReady && wavesurferRef.current) {
      activeLoopRef.current = null;
      setActiveLoopDisplay(null);
      setIsLoopingSegment(false);

      try {
        wavesurferRef.current.playPause();
      } catch (e) {}
    }
  };

  // Dedicated Stop Button: Pauses and teleports marker to 00:00.000 (Start of entire audio)
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

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };

  const handleWaveformWheel = (e) => {
    if (scrollWrapperRef.current) {
      scrollWrapperRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-xs transition-all">
      {/* Waveform Canvas Container with Interactive Drag Shadow Overlays & Horizontal Scroll */}
      <div 
        ref={scrollWrapperRef}
        onWheel={handleWaveformWheel}
        className="relative bg-slate-950/5 rounded-xl p-2 border border-slate-200/80 mb-2 overflow-x-auto shadow-inner select-none"
      >
        {/* Live Drag & Edit Tooltip */}
        {draggedRegionInfo && (
          <div className="absolute top-2 right-3 z-30 bg-slate-900/90 text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-md shadow-lg border border-slate-700 flex items-center gap-2 pointer-events-none animate-in fade-in">
            <MoveHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span>#{draggedRegionInfo.segId}</span>
            <span className="text-amber-300">{formatTime(draggedRegionInfo.start)}</span>
            <span className="text-slate-400">➔</span>
            <span className="text-amber-300">{formatTime(draggedRegionInfo.end)}</span>
            <span className="bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded text-[10px]">
              {draggedRegionInfo.duration.toFixed(3)}s
            </span>
          </div>
        )}

        <div ref={containerRef} className="cursor-pointer min-w-full" />
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
          {/* Scroll / Zoom Controls */}
          <div className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
            <button 
              onClick={() => setZoomLevel(Math.max(10, zoomLevel - 10))}
              title="Zoom Out (Scroll wider)"
              className="hover:text-slate-900 cursor-pointer"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <input
              type="range"
              min="10"
              max="150"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="w-16 accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded"
              title={`Zoom: ${zoomLevel}px/s (Use mouse wheel to scroll horizontally)`}
            />
            <button 
              onClick={() => setZoomLevel(Math.min(150, zoomLevel + 10))}
              title="Zoom In (Scroll closer)"
              className="hover:text-slate-900 cursor-pointer"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <span className="font-mono text-[10px] text-slate-400 pl-0.5">{zoomLevel}x</span>
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
