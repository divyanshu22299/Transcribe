import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Volume2, Split, Plus, AlertCircle, CheckCircle2, GripVertical, FastForward, Sun, Moon } from 'lucide-react';

export default function AudioWaveformTimeline({
  videoUrl = null,
  selectedFile = null,
  videoId = null,
  API_BASE = '',
  events = [],
  shotChanges = [],
  activeEventId = null,
  setActiveEventId = () => {},
  currentTime = 0,
  duration = 0,
  onEventTimeChange = () => {},
  onSeek = () => {},
  onAddSubtitleAtTime = null,
  onShiftAllFollowing = null,
  frameRate = 24.0,
  cpsLimit = 20,
  cplLimit = 42,
  theme = 'dark', // 'dark' | 'light'
}) {
  const [zoomLevel, setZoomLevel] = useState(70); // pixels per second (25 - 250)
  const [waveformPeaks, setWaveformPeaks] = useState([]); // Array of float 0-1
  const [waveformPointsPerSec, setWaveformPointsPerSec] = useState(50);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const lastActiveIdRef = useRef(activeEventId);
  const lastTimeRef = useRef(currentTime);

  // Center-oriented zoom tracking
  const zoomCenterTimeRef = useRef(null);
  const isZoomingRef = useRef(false);

  // Dragging State for Subtitle Blocks
  const [dragState, setDragState] = useState(null);
  const [dragTooltip, setDragTooltip] = useState(null); // { x, timeStr, durStr }

  const isDark = theme === 'dark';

  // Normalized helpers (with pyramid errors purged)
  const getStart = (e) => (e.start_time !== undefined ? e.start_time : (e.start !== undefined ? e.start : 0));
  const getEnd = (e) => (e.end_time !== undefined ? e.end_time : (e.end !== undefined ? e.end : 0));
  const getErrors = (e) => (e.qc_errors || e.errors || []).filter(err => {
    const rid = (err.rule_id || '').toUpperCase();
    const msg = (err.message || '').toLowerCase();
    return !rid.includes('PYRAMID') && !msg.includes('pyramid') && !msg.includes('bottom-heavy');
  });

  const effectiveDuration = Math.max(
    duration || 0,
    events.length > 0 ? Math.max(...events.map(e => getEnd(e))) + 5 : 30
  );

  const timelineWidth = Math.max(effectiveDuration * zoomLevel, scrollRef.current?.clientWidth || 900);

  // ── 1. High-Precision Acoustic Waveform Extraction ──
  useEffect(() => {
    let isCancelled = false;

    const loadWaveform = async () => {
      // Priority 1: Backend Acoustic Peaks Endpoint (100% physically aligned, 0.1s response)
      if (videoId) {
        try {
          setIsAudioLoading(true);
          const base = API_BASE || '';
          const res = await fetch(`${base}/api/subtitle/waveform/${videoId}`);
          if (res.ok) {
            const data = await res.json();
            if (!isCancelled && data.peaks && data.peaks.length > 0) {
              setWaveformPeaks(data.peaks);
              setWaveformPointsPerSec(data.points_per_sec || 50);
              setIsAudioLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn("Backend waveform endpoint check:", err);
        }
      }

      // Priority 2: Web Audio API decoding with Peak + RMS Envelope Dynamics
      if (selectedFile || videoUrl) {
        try {
          setIsAudioLoading(true);
          let arrayBuffer;
          if (selectedFile) {
            arrayBuffer = await selectedFile.arrayBuffer();
          } else {
            const res = await fetch(videoUrl);
            arrayBuffer = await res.arrayBuffer();
          }

          if (isCancelled) return;

          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          const audioCtx = new AudioContextClass();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

          if (isCancelled) return;

          const channelData = audioBuffer.getChannelData(0);
          const pps = 50; // 50 points per second
          const totalPoints = Math.floor(audioBuffer.duration * pps);
          const blockSize = Math.floor(channelData.length / totalPoints);
          const peaks = new Float32Array(totalPoints);

          for (let i = 0; i < totalPoints; i++) {
            const start = i * blockSize;
            let maxVal = 0;
            let sumSq = 0;
            const step = Math.max(1, Math.floor(blockSize / 32));
            let count = 0;
            for (let j = 0; j < blockSize; j += step) {
              const val = Math.abs(channelData[start + j]);
              if (val > maxVal) maxVal = val;
              sumSq += val * val;
              count++;
            }
            const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
            peaks[i] = 0.6 * maxVal + 0.4 * (rms * 2.5);
          }

          let maxObserved = 0.01;
          for (let i = 0; i < totalPoints; i++) {
            if (peaks[i] > maxObserved) maxObserved = peaks[i];
          }
          const norm = maxObserved > 1e-4 ? maxObserved : 1.0;
          const normalized = new Float32Array(totalPoints);
          for (let i = 0; i < totalPoints; i++) {
            normalized[i] = Math.max(0.02, Math.min(1.0, peaks[i] / norm));
          }

          if (!isCancelled) {
            setWaveformPeaks(Array.from(normalized));
            setWaveformPointsPerSec(pps);
          }
          audioCtx.close();
        } catch (err) {
          console.warn("Client audio decoding skipped, waiting for backend waveform:", err);
        } finally {
          if (!isCancelled) setIsAudioLoading(false);
        }
      }
    };

    loadWaveform();
    return () => { isCancelled = true; };
  }, [videoId, videoUrl, selectedFile, API_BASE]);

  // ── 2. Clean Continuous Acoustic Waveform (100% Physically Aligned to Zoom) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = timelineWidth;
    const height = canvas.height;

    canvas.width = width;
    ctx.clearRect(0, 0, width, height);

    if (!waveformPeaks || waveformPeaks.length === 0) return;

    const centerY = height / 2 + 8;
    const maxAmplitude = height * 0.38;

    // Draw center baseline
    ctx.strokeStyle = isDark ? 'rgba(70, 85, 115, 0.35)' : 'rgba(180, 195, 220, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    const totalPoints = waveformPeaks.length;
    const pps = waveformPointsPerSec || 50;

    // Exact physical pixel step per waveform sample: (1 / pps) * zoomLevel
    const stepX = zoomLevel / pps;

    // Upper envelope
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let i = 0; i < totalPoints; i++) {
      const x = i * stepX;
      if (x > width + 50) break;
      const amp = waveformPeaks[i] || 0.02;
      const y = centerY - (amp * maxAmplitude);
      ctx.lineTo(x, y);
    }
    const lastX = Math.min(width, totalPoints * stepX);
    ctx.lineTo(lastX, centerY);

    // Lower envelope (mirrored)
    for (let i = totalPoints - 1; i >= 0; i--) {
      const x = i * stepX;
      if (x > width + 50) continue;
      const amp = waveformPeaks[i] || 0.02;
      const y = centerY + (amp * maxAmplitude);
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Clean gradient fill
    const fillGradient = ctx.createLinearGradient(0, centerY - maxAmplitude, 0, centerY + maxAmplitude);
    if (isDark) {
      fillGradient.addColorStop(0, 'rgba(99, 102, 241, 0.45)');
      fillGradient.addColorStop(0.5, 'rgba(45, 212, 191, 0.55)');
      fillGradient.addColorStop(1, 'rgba(99, 102, 241, 0.45)');
    } else {
      fillGradient.addColorStop(0, 'rgba(79, 70, 229, 0.35)');
      fillGradient.addColorStop(0.5, 'rgba(13, 148, 136, 0.45)');
      fillGradient.addColorStop(1, 'rgba(79, 70, 229, 0.35)');
    }

    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Crisp continuous outline stroke
    ctx.strokeStyle = isDark ? 'rgba(129, 140, 248, 0.90)' : 'rgba(67, 56, 202, 0.90)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }, [waveformPeaks, waveformPointsPerSec, zoomLevel, timelineWidth, isDark]);

  // ── 3. Left-Oriented Zoom Controller (Left edge anchored, right edge expands/contracts) ──
  const handleZoomChange = useCallback((newZoom) => {
    const nextZoom = Math.max(25, Math.min(250, newZoom));
    const scrollElem = scrollRef.current;
    if (scrollElem) {
      // Left-anchored: time at the left edge of the visible screen stays fixed at the left edge
      const leftTime = scrollElem.scrollLeft / zoomLevel;
      zoomCenterTimeRef.current = leftTime;
      isZoomingRef.current = true;
    }
    setZoomLevel(nextZoom);
  }, [zoomLevel]);

  // Synchronous Re-Anchoring after Zoom Level Change
  useLayoutEffect(() => {
    if (!isZoomingRef.current || zoomCenterTimeRef.current === null) return;
    const scrollElem = scrollRef.current;
    if (scrollElem) {
      const leftTime = zoomCenterTimeRef.current;
      const targetScroll = leftTime * zoomLevel;
      scrollElem.scrollLeft = Math.max(0, targetScroll);
    }
    isZoomingRef.current = false;
    zoomCenterTimeRef.current = null;
  }, [zoomLevel]);

  // ── 4. Mouse Wheel: Inverted Scroll & Ctrl+Wheel Left-Anchored Zoom ──
  useEffect(() => {
    const scrollElem = scrollRef.current;
    if (!scrollElem) return;

    const handleWheel = (e) => {
      // Ctrl/Cmd + Wheel = Left-anchored zoom in/out
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 12 : -12;
        handleZoomChange(zoomLevel + zoomDelta);
        return;
      }

      if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
        e.preventDefault();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        // Invert horizontal scroll as requested
        scrollElem.scrollLeft -= delta * 1.5;
      }
    };

    scrollElem.addEventListener('wheel', handleWheel, { passive: false });
    return () => scrollElem.removeEventListener('wheel', handleWheel);
  }, [zoomLevel, handleZoomChange]);

  // ── 5. Smart Viewport Tracking (Smooth playback auto-scroll, zero jumps on click or zoom) ──
  const isInternalSeekRef = useRef(false);

  useEffect(() => {
    const scrollElem = scrollRef.current;
    if (!scrollElem || dragState || isZoomingRef.current) return;

    // If the user clicked inside the timeline or subtitle, keep viewport steady exactly where user clicked!
    if (isInternalSeekRef.current) {
      isInternalSeekRef.current = false;
      lastTimeRef.current = currentTime;
      lastActiveIdRef.current = activeEventId;
      return;
    }

    const clientWidth = scrollElem.clientWidth || 900;
    const playheadX = currentTime * zoomLevel;
    const currentScroll = scrollElem.scrollLeft;
    const prevTime = lastTimeRef.current;
    const activeChanged = activeEventId !== lastActiveIdRef.current;

    lastTimeRef.current = currentTime;
    lastActiveIdRef.current = activeEventId;

    const minVisibleX = currentScroll;
    const maxVisibleX = currentScroll + clientWidth;
    const isInFrame = playheadX >= minVisibleX && playheadX <= maxVisibleX;

    // If active event was changed externally (e.g. from Spreadsheet) and is off-screen -> teleport to it
    if (activeChanged && !isInFrame) {
      scrollElem.scrollLeft = Math.max(0, playheadX - clientWidth * 0.2);
      return;
    }

    // Normal continuous playback: advance viewport when playhead reaches right screen edge
    if (playheadX > maxVisibleX - clientWidth * 0.05) {
      scrollElem.scrollLeft = Math.max(0, playheadX - clientWidth * 0.15);
    }
  }, [currentTime, activeEventId, zoomLevel, dragState]);

  // ── 5. Drag & Drop Handlers for Subtitle Blocks ──
  const handleMouseDown = (e, eventId, actionType) => {
    e.stopPropagation();
    e.preventDefault();

    const targetEvent = events.find(ev => (ev.id === eventId || ev.event_id === eventId));
    if (!targetEvent) return;

    setActiveEventId(eventId);

    const initialStart = getStart(targetEvent);
    const initialEnd = getEnd(targetEvent);
    const initialDuration = initialEnd - initialStart;

    setDragState({
      eventId,
      actionType,
      startX: e.clientX,
      initialStart,
      initialEnd,
      initialDuration,
      hasMoved: false
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragState) return;

    const deltaPx = e.clientX - dragState.startX;
    if (!dragState.hasMoved && Math.abs(deltaPx) < 4) {
      return; // Ignore jitter/small click movements so click-to-seek is snappy
    }
    dragState.hasMoved = true;

    const deltaTime = deltaPx / zoomLevel;

    let newStart = dragState.initialStart;
    let newEnd = dragState.initialEnd;

    if (dragState.actionType === 'move') {
      newStart = Math.max(0, dragState.initialStart + deltaTime);
      newEnd = newStart + dragState.initialDuration;
    } else if (dragState.actionType === 'resize-start') {
      newStart = Math.max(0, Math.min(dragState.initialEnd - 0.2, dragState.initialStart + deltaTime));
    } else if (dragState.actionType === 'resize-end') {
      newEnd = Math.max(dragState.initialStart + 0.2, dragState.initialEnd + deltaTime);
    }

    // Quantize to 1 millisecond
    newStart = Math.round(newStart * 1000) / 1000;
    newEnd = Math.round(newEnd * 1000) / 1000;

    onEventTimeChange(dragState.eventId, newStart, newEnd);

    // Live tooltip
    setDragTooltip({
      x: e.clientX,
      y: e.clientY - 40,
      timeStr: `${formatTime(newStart)} → ${formatTime(newEnd)}`,
      durStr: `${(newEnd - newStart).toFixed(2)}s`
    });
  }, [dragState, zoomLevel, onEventTimeChange]);

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      setDragState(null);
      setDragTooltip(null);
    }
  }, [dragState]);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  // Click on Timeline Track to Pause and Seek
  const handleTrackClick = (e) => {
    if (dragState) return;
    isInternalSeekRef.current = true;
    const rect = scrollRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const clickedTime = Math.max(0, Math.min(effectiveDuration, clickX / zoomLevel));
    onSeek(clickedTime);
  };

  // Helper formatting for timecode
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds == null) return "00:00.000";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // Time ruler marks generator (every 1s major, 0.5s minor)
  const marks = [];
  const step = zoomLevel >= 80 ? 1 : (zoomLevel >= 40 ? 2 : 5);
  for (let t = 0; t <= effectiveDuration; t += step) {
    marks.push(t);
  }

  return (
    <div 
      ref={containerRef}
      className={`rounded-xl border flex flex-col w-full h-full overflow-hidden select-none transition-colors shadow-xs ${
        isDark ? 'bg-[#0b0e17] border-[#202738]' : 'bg-white border-slate-200'
      }`}
    >
      {/* ── Timeline Ribbon Header ── */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between text-xs shrink-0 transition-colors ${
        isDark ? 'bg-[#121623] border-[#202738] text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold font-mono text-[11px]">
            <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>AUDIO WAVEFORM TIMELINE</span>
            {isAudioLoading && (
              <span className="text-[10px] text-amber-400 animate-pulse font-sans font-normal">(Extracting Audio...)</span>
            )}
          </div>

          {/* Left-Oriented Zoom Slider & Buttons */}
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${
            isDark ? 'bg-[#181e2e] border-[#283248]' : 'bg-white border-slate-300'
          }`}>
            <ZoomOut 
              className={`w-3.5 h-3.5 cursor-pointer transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`} 
              onClick={() => handleZoomChange(zoomLevel - 15)} 
              title="Zoom Out (Ctrl+Wheel Down)"
            />
            <input 
              type="range" 
              min="25" 
              max="220" 
              value={zoomLevel} 
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="w-24 h-1 bg-slate-400 rounded-full appearance-none cursor-pointer accent-indigo-600"
            />
            <ZoomIn 
              className={`w-3.5 h-3.5 cursor-pointer transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`} 
              onClick={() => handleZoomChange(zoomLevel + 15)} 
              title="Zoom In (Ctrl+Wheel Up)"
            />
            <span className="text-[10px] font-mono font-semibold opacity-80 pl-1">{zoomLevel} px/s</span>
          </div>

          {/* Subtitle Shift & Add Buttons */}
          <div className="flex items-center gap-1.5">
            {onShiftAllFollowing && (
              <button
                onClick={() => onShiftAllFollowing(activeEventId, currentTime)}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-colors cursor-pointer border flex items-center gap-1.5 ${
                  isDark 
                    ? 'bg-[#1a2130] hover:bg-[#252f45] text-cyan-300 border-[#2b364e]' 
                    : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300'
                }`}
                title="Move active & all following subtitles to playhead preserving relative spacing (Ctrl+Space or Ctrl+Enter)"
              >
                <FastForward size={12} />
                <span>Shift Next (Ctrl+Space)</span>
              </button>
            )}

            {onAddSubtitleAtTime && (
              <button
                onClick={() => onAddSubtitleAtTime(currentTime)}
                className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                title="Add Subtitle at current playhead"
              >
                <Plus size={12} />
                <span>+ Sub at Playhead</span>
              </button>
            )}
          </div>
        </div>

        {/* Timecode Readout */}
        <div className={`text-xs font-mono px-3 py-1 rounded-lg border flex items-center gap-2 ${
          isDark ? 'bg-[#0a0d14] border-[#242c3f]' : 'bg-white border-slate-300'
        }`}>
          <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{formatTime(currentTime)}</span>
          <span className="opacity-40">/</span>
          <span className="opacity-80">{formatTime(effectiveDuration)}</span>
        </div>
      </div>

      {/* ── Continuous Waveform & Precise Subtitle Boxes ── */}
      <div 
        ref={scrollRef}
        className={`relative flex-1 overflow-x-auto overflow-y-hidden cursor-crosshair custom-scrollbar min-h-[140px] ${
          isDark ? 'bg-[#080b11]' : 'bg-slate-100'
        }`}
        onClick={handleTrackClick}
      >
        <div 
          className="relative h-full timeline-track"
          style={{ width: `${timelineWidth}px` }}
        >
          {/* Timecode Ruler Bar */}
          <div className={`absolute top-0 left-0 w-full h-6 border-b pointer-events-none z-10 ${
            isDark ? 'bg-[#0e121b]/90 border-[#1f2638]' : 'bg-white/90 border-slate-200'
          }`}>
            {marks.map((time) => (
              <div 
                key={time} 
                className={`absolute top-0 h-full border-l pl-1 flex items-center ${
                  isDark ? 'border-[#222a3d]' : 'border-slate-300'
                }`}
                style={{ left: `${time * zoomLevel}px` }}
              >
                <span className={`text-[10px] font-mono font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {formatTime(time)}
                </span>
              </div>
            ))}
          </div>

          {/* Clean Continuous Audio Waveform Canvas */}
          <canvas 
            ref={canvasRef}
            height={160}
            className="absolute top-0 left-0 pointer-events-none z-0"
          />

          {/* ── Subtitle Boxes (Minimized Ultra-Clean Borders for Perfect Waveform Sync) ── */}
          <div className="absolute top-6 bottom-0 w-full pointer-events-none z-20">
            {events.map((event) => {
              const start = getStart(event);
              const end = getEnd(event);
              const startX = start * zoomLevel;
              const width = Math.max((end - start) * zoomLevel, 14);
              const id = event.id ?? event.event_id;
              const isActive = activeEventId === id;
              const errors = getErrors(event);
              
              const text = event.text || '';
              const lines = text.split('\n');
              const lineCpl = lines.map(l => l.replace(/<[^>]+>/g, '').trim().length);
              const maxCpl = Math.max(...lineCpl, 0);
              const dur = Math.max(0.1, end - start);
              const calcCps = event.cps ? event.cps : (dur > 0 ? (text.replace(/<[^>]+>/g, '').trim().length / dur) : 0);

              const hasCplError = maxCpl > cplLimit || errors.some(e => (e.rule_id || '').includes('CPL'));
              const hasHardError = errors.some(e => (e.severity === 'error' || !e.severity) && !(e.rule_id || '').includes('CPS'));
              const isRed = hasHardError || hasCplError;
              const isYellow = !isRed && (calcCps > cpsLimit || errors.some(e => (e.rule_id || '').includes('CPS')));
              
              return (
                <div
                  key={id}
                  className={`absolute top-0.5 bottom-0.5 rounded-[4px] flex flex-col pointer-events-auto select-none transition-colors shadow-xs ${
                    isActive 
                      ? isDark 
                        ? 'border-2 border-indigo-400 bg-indigo-950/50 text-white z-30 shadow-md ring-1 ring-indigo-400/50 backdrop-blur-[1px]' 
                        : 'border-2 border-indigo-600 bg-indigo-100/55 text-slate-950 z-30 shadow-md ring-1 ring-indigo-500/50 backdrop-blur-[1px]'
                      : 'z-20 hover:brightness-110'
                  } ${
                    isRed 
                      ? isDark 
                        ? 'bg-rose-950/45 border-2 border-rose-500 text-rose-100 backdrop-blur-[1px]' 
                        : 'bg-rose-100/55 border-2 border-rose-500 text-rose-950 backdrop-blur-[1px]'
                      : isYellow
                      ? isDark
                        ? 'bg-amber-950/45 border-2 border-amber-400 text-amber-100 backdrop-blur-[1px]' 
                        : 'bg-amber-100/55 border-2 border-amber-500 text-amber-950 backdrop-blur-[1px]'
                      : isDark
                        ? 'bg-[#0f172a]/45 border border-slate-500/90 text-slate-100 backdrop-blur-[1px]'
                        : 'bg-white/55 border border-slate-400/90 text-slate-950 backdrop-blur-[1px]'
                  }`}
                  style={{ left: `${startX}px`, width: `${width}px` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    isInternalSeekRef.current = true;
                    const rect = scrollRef.current?.getBoundingClientRect();
                    if (rect) {
                      const clickX = e.clientX - rect.left + scrollRef.current.scrollLeft;
                      const clickedTime = Math.max(0, Math.min(effectiveDuration, clickX / zoomLevel));
                      setActiveEventId(id);
                      onSeek(clickedTime);
                    } else {
                      setActiveEventId(id);
                      onSeek(start);
                    }
                  }}
                >
                  {/* Active Top Glowing Accent Line */}
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,1)] z-30" />
                  )}

                  {/* Left Trim Handle (In-Point) */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, id, 'resize-start')}
                    className={`absolute left-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500 flex items-center justify-center z-30 group/handle ${
                      isDark ? 'bg-black/30 hover:bg-indigo-600' : 'bg-slate-200 hover:bg-indigo-600'
                    }`}
                    title="Drag to trim In-Point"
                  >
                    <div className="w-0.5 h-7 bg-indigo-400 group-hover/handle:bg-white transition-all" />
                  </div>

                  {/* Body Drag Area (Move Entire Subtitle) */}
                  <div 
                    onMouseDown={(e) => handleMouseDown(e, id, 'move')}
                    className="flex-1 px-3 py-1 flex flex-col justify-between cursor-grab active:cursor-grabbing overflow-hidden"
                    title="Click & drag to move subtitle block"
                  >
                    {/* Top Meta Bar */}
                    <div className={`flex items-center justify-between text-[9.5px] font-mono border-b pb-0.5 shrink-0 ${
                      isDark ? 'border-slate-700/60' : 'border-slate-200'
                    }`}>
                      <span className="font-bold px-1.5 py-0.2 rounded bg-indigo-600 text-white font-mono shadow-2xs">
                        #{id}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="font-bold">{dur.toFixed(2)}s</span>
                        {isRed ? (
                          <span className="bg-rose-600 text-white text-[8px] font-bold px-1 rounded shadow-xs">
                            {hasCplError ? `${maxCpl}L` : 'ERR'}
                          </span>
                        ) : isYellow ? (
                          <span className="bg-amber-500 text-slate-950 text-[8px] font-bold px-1 rounded shadow-xs">
                            {calcCps.toFixed(1)} CPS
                          </span>
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Dialogue Line Text in center */}
                    <div className={`text-[11.5px] leading-snug line-clamp-3 font-sans font-bold whitespace-pre-wrap my-auto px-0.5 ${
                      isDark ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]' : 'text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]'
                    }`}>
                      {event.text}
                    </div>

                    {/* Bottom Timecode Readout */}
                    <div className={`text-[9px] font-mono flex justify-between shrink-0 font-bold ${
                      isDark ? 'text-slate-200' : 'text-slate-700'
                    }`}>
                      <span>{formatTime(start)}</span>
                      <span>{formatTime(end)}</span>
                    </div>
                  </div>

                  {/* Right Trim Handle (Out-Point) */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, id, 'resize-end')}
                    className={`absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-indigo-500 flex items-center justify-center z-30 group/handle ${
                      isDark ? 'bg-black/30 hover:bg-indigo-600' : 'bg-slate-200 hover:bg-indigo-600'
                    }`}
                    title="Drag to trim Out-Point"
                  >
                    <div className="w-0.5 h-7 bg-indigo-400 group-hover/handle:bg-white transition-all" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Playhead Scrub Needle (Hardware-Accelerated 60FPS Pivot Motion) ── */}
          <div 
            className="absolute top-0 bottom-0 left-0 w-0.5 bg-amber-500 z-40 pointer-events-none shadow-[0_0_8px_rgba(245,158,11,1)] will-change-transform"
            style={{ 
              transform: `translate3d(${currentTime * zoomLevel}px, 0, 0)`,
              transition: 'none'
            }}
          >
            {/* Playhead Diamond Head */}
            <div className="w-3 h-3 bg-amber-500 transform -translate-x-1.5 -translate-y-1 rotate-45 border border-amber-300 shadow-md" />
            <div className="bg-amber-500 text-black text-[9px] font-mono font-bold px-1 rounded-xs absolute top-2.5 -left-4 shadow-sm">
              {formatTime(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Live Dragging Tooltip HUD */}
      {dragTooltip && (
        <div 
          className="fixed bg-slate-900/95 border border-indigo-500 text-white text-[11px] font-mono px-3 py-1.5 rounded-lg shadow-2xl pointer-events-none z-50 flex items-center gap-2"
          style={{ left: `${dragTooltip.x + 12}px`, top: `${dragTooltip.y}px` }}
        >
          <span className="text-emerald-400 font-bold">{dragTooltip.timeStr}</span>
          <span className="text-slate-400">({dragTooltip.durStr})</span>
        </div>
      )}
    </div>
  );
}
