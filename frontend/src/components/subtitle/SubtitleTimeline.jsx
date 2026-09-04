import React, { useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SubtitleTimeline({
  events = [],
  shotChanges = [],
  activeEventId = null,
  setActiveEventId = () => {},
  currentTime = 0,
  duration = 0,
  onEventTimeChange = () => {},
  onSeek = () => {},
  onAddSubtitleAtTime = null,
}) {
  const [zoomLevel, setZoomLevel] = useState(60); // pixels per second
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  
  // Normalized event getter
  const getStart = (e) => (e.start_time !== undefined ? e.start_time : (e.start !== undefined ? e.start : 0));
  const getEnd = (e) => (e.end_time !== undefined ? e.end_time : (e.end !== undefined ? e.end : 0));
  const getErrors = (e) => e.qc_errors || e.errors || [];

  // Keep active event in view
  useEffect(() => {
    if (activeEventId && scrollRef.current) {
      const activeEvent = events.find(e => (e.id === activeEventId || e.event_id === activeEventId));
      if (activeEvent) {
        const start = getStart(activeEvent);
        const centerPos = (start * zoomLevel) - (scrollRef.current.clientWidth / 2);
        scrollRef.current.scrollTo({
          left: Math.max(0, centerPos),
          behavior: 'smooth'
        });
      }
    }
  }, [activeEventId, zoomLevel, events]);

  const effectiveDuration = Math.max(
    duration || 0,
    events.length > 0 ? Math.max(...events.map(e => getEnd(e))) + 5 : 30
  );

  const timelineWidth = Math.max(effectiveDuration * zoomLevel, scrollRef.current?.clientWidth || 800);

  // Time ruler marks every 5 seconds (or 1s at high zoom)
  const step = zoomLevel > 120 ? 1 : zoomLevel > 50 ? 5 : 10;
  const numMarks = Math.ceil(effectiveDuration / step);
  const marks = Array.from({ length: numMarks + 1 }, (_, i) => i * step);

  const handleTimelineClick = (e) => {
    // If click was on timeline background
    const rect = scrollRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const clickedTime = Math.max(0, Math.min(effectiveDuration, clickX / zoomLevel));
    onSeek(clickedTime);
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds == null) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="bg-[#14151a] border border-[#262734] rounded-2xl flex flex-col w-full text-slate-300 shadow-xl overflow-hidden" ref={containerRef}>
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#262734] bg-[#14151a]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold tracking-wider text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00e5be] shadow-[0_0_8px_rgba(0,229,190,0.8)] animate-pulse"></span>
            TIMELINE TRACK
          </span>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#0e0f12] rounded-lg border border-[#262734]">
            <ZoomOut className="w-3.5 h-3.5 cursor-pointer text-slate-400 hover:text-white transition-colors" onClick={() => setZoomLevel(Math.max(20, zoomLevel - 15))} />
            <input 
              type="range" 
              min="20" max="250" 
              value={zoomLevel} 
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="w-24 h-1 bg-[#262734] rounded-full appearance-none cursor-pointer accent-[#00e5be]"
            />
            <ZoomIn className="w-3.5 h-3.5 cursor-pointer text-slate-400 hover:text-white transition-colors" onClick={() => setZoomLevel(Math.min(250, zoomLevel + 15))} />
          </div>
          <span className="text-[11px] font-mono text-slate-400">{zoomLevel} px/s</span>
          {onAddSubtitleAtTime && (
            <button
              onClick={() => onAddSubtitleAtTime(currentTime)}
              className="px-2.5 py-1 text-xs bg-[#181920] hover:bg-[#22232c] text-[#00e5be] border border-[#262734] rounded-lg font-bold transition-colors cursor-pointer"
            >
              + Add Sub at Cursor
            </button>
          )}
        </div>
        
        <div className="text-xs font-mono bg-[#0e0f12] px-3 py-1 rounded-lg border border-[#262734] flex items-center gap-2">
          <span className="text-[#00e5be] font-bold">{formatTime(currentTime)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{formatTime(effectiveDuration)}</span>
        </div>
      </div>

      {/* Main Timeline Scrollable Area */}
      <div 
        ref={scrollRef}
        className="relative h-36 overflow-x-auto overflow-y-hidden bg-[#0e0f12] select-none cursor-crosshair custom-scrollbar"
        onClick={handleTimelineClick}
      >
        <div 
          className="relative h-full timeline-track"
          style={{ width: `${timelineWidth}px` }}
        >
          {/* Time Ruler */}
          <div className="absolute top-0 left-0 w-full h-6 border-b border-[#262734] pointer-events-none bg-[#14151a]/40">
            {marks.map((time) => (
              <div 
                key={time} 
                className="absolute top-0 h-full border-l border-[#262734] pl-1.5 flex items-center"
                style={{ left: `${time * zoomLevel}px` }}
              >
                <span className="text-[10px] text-slate-500 font-mono font-medium">{formatTime(time)}</span>
              </div>
            ))}
          </div>

          {/* Shot Changes */}
          {shotChanges.map((time, i) => (
            <div 
              key={`shot-${i}`}
              className="absolute top-6 bottom-0 w-px border-l border-dashed border-red-500/60 pointer-events-none z-10"
              style={{ left: `${time * zoomLevel}px` }}
              title={`Shot Change @ ${time.toFixed(2)}s`}
            >
              <div className="text-[8px] text-red-400 font-mono absolute -top-4 -left-3 bg-red-950/80 px-1 rounded border border-red-800/50">
                CUT
              </div>
            </div>
          ))}

          {/* Subtitle Event Blocks */}
          <div className="absolute top-7 w-full h-24 pointer-events-none">
            {events.map((event) => {
              const start = getStart(event);
              const end = getEnd(event);
              const startX = start * zoomLevel;
              const width = Math.max((end - start) * zoomLevel, 14);
              const id = event.id ?? event.event_id;
              const isActive = activeEventId === id;
              const errors = getErrors(event);
              const hasError = errors.some(e => (e.severity === 'error' || !e.severity));
              const hasWarning = errors.some(e => e.severity === 'warning');
              
              return (
                <div
                  key={id}
                  className={`absolute h-20 rounded-xl p-2 flex flex-col pointer-events-auto cursor-pointer transition-all duration-150 overflow-hidden text-xs
                    ${isActive 
                      ? 'ring-2 ring-[#00e5be] z-20 shadow-[0_0_15px_rgba(0,229,190,0.3)] brightness-125 scale-y-[1.03]' 
                      : 'z-10 hover:brightness-110 hover:border-slate-500'
                    }
                    ${hasError 
                      ? 'bg-rose-950/70 border-2 border-rose-500/80 text-rose-100' 
                      : hasWarning
                      ? 'bg-amber-950/70 border-2 border-amber-500/70 text-amber-100'
                      : 'bg-[#181920] border border-[#262734] text-slate-200'
                    }
                  `}
                  style={{ left: `${startX}px`, width: `${width}px` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveEventId(id);
                    onSeek(start);
                  }}
                >
                  <div className="flex items-center justify-between mb-1 opacity-90">
                    <span className="font-mono text-[10px] font-black bg-[#0e0f12] px-1.5 py-0.5 rounded text-[#00e5be] border border-[#262734]">
                      #{id}
                    </span>
                    <div className="flex items-center gap-1">
                      {event.cps && (
                        <span className={`text-[9px] font-mono px-1 rounded ${event.cps > 20 ? 'bg-red-500 text-white' : 'bg-[#0e0f12] text-slate-300 border border-[#262734]'}`}>
                          {event.cps}c/s
                        </span>
                      )}
                      {hasError ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00e5be] shrink-0" />
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] leading-snug line-clamp-2 text-slate-200 font-medium whitespace-pre-wrap">
                    {event.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-[#00e5ff] z-30 pointer-events-none shadow-[0_0_12px_rgba(0,229,255,0.9)]"
            style={{ left: `${currentTime * zoomLevel}px` }}
          >
            <div className="absolute top-0 -left-1.5 w-3 h-3 bg-[#00e5ff] rounded-b shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
          </div>
        </div>
      </div>

      {/* Minimap Overview */}
      <div 
        className="h-6 bg-[#14151a] border-t border-[#262734] relative w-full overflow-hidden cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onSeek(percent * effectiveDuration);
        }}
      >
        {events.map((event) => {
          const start = getStart(event);
          const end = getEnd(event);
          const id = event.id ?? event.event_id;
          const errors = getErrors(event);
          const hasError = errors.some(e => (e.severity === 'error' || !e.severity));
          return (
            <div
              key={`mini-${id}`}
              className={`absolute top-1 bottom-1 rounded-sm opacity-75 ${
                hasError ? 'bg-rose-500' : 'bg-[#00e5be]'
              }`}
              style={{ 
                left: `${(start / (effectiveDuration || 1)) * 100}%`, 
                width: `${Math.max(0.4, ((end - start) / (effectiveDuration || 1)) * 100)}%` 
              }}
            />
          );
        })}
        {/* Minimap Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-[#00e5ff] z-10 shadow-[0_0_6px_rgba(0,229,255,0.8)]"
          style={{ left: `${(currentTime / (effectiveDuration || 1)) * 100}%` }}
        />
        {/* Minimap Viewport Indicator */}
        {scrollRef.current && (
          <div 
            className="absolute top-0 bottom-0 bg-white/10 border-x border-white/40 z-0 pointer-events-none"
            style={{ 
              left: `${(scrollRef.current.scrollLeft / timelineWidth) * 100}%`,
              width: `${(scrollRef.current.clientWidth / timelineWidth) * 100}%`
            }}
          />
        )}
      </div>
    </div>
  );
}
