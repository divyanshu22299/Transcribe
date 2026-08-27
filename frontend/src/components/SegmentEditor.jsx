import React, { useState, useMemo } from 'react';
import {
  Play, Pause, Square, Plus, Trash2, Split, Merge, AlertCircle, AlertTriangle,
  Search, Filter, User, Check, Sparkles, Volume2, HelpCircle
} from 'lucide-react';

export default function SegmentEditor({
  segments,
  setSegments,
  activeSegmentId,
  setActiveSegmentId,
  onPlaySegment,
  onStopSegment,
  onLintTrigger,
  onStartTranscribe,
  audioLoaded
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSpeaker, setFilterSpeaker] = useState('ALL');
  const [filterErrorsOnly, setFilterErrorsOnly] = useState(false);
  const [showHeatmapGuide, setShowHeatmapGuide] = useState(false);

  const updateSegmentField = (segmentId, field, value) => {
    const updated = segments.map((seg) => {
      if (seg.segment_id === segmentId) {
        const newSeg = { ...seg, [field]: value };
        if (field === 'start_time' || field === 'end_time') {
          newSeg.duration = Math.max(0, parseFloat((newSeg.end_time - newSeg.start_time).toFixed(3)));
        }
        return newSeg;
      }
      return seg;
    });
    setSegments(updated);
    if (onLintTrigger) onLintTrigger(updated);
  };

  const deleteSegment = (segmentId) => {
    const filtered = segments.filter((s) => s.segment_id !== segmentId);
    const reindexed = filtered.map((s, idx) => ({ ...s, segment_id: idx + 1 }));
    setSegments(reindexed);
    if (onLintTrigger) onLintTrigger(reindexed);
  };

  const splitSegment = (segment) => {
    const mid = parseFloat(((segment.start_time + segment.end_time) / 2).toFixed(3));
    const words = (segment.transcript || '').trim().split(/\s+/);
    const half = Math.ceil(words.length / 2);
    const text1 = words.slice(0, half).join(' ');
    const text2 = words.slice(half).join(' ');

    const newSegments = [];
    segments.forEach((s) => {
      if (s.segment_id === segment.segment_id) {
        newSegments.push({
          ...s,
          end_time: mid,
          duration: parseFloat((mid - s.start_time).toFixed(3)),
          transcript: text1,
          words: []
        });
        newSegments.push({
          ...s,
          segment_id: s.segment_id + 0.5,
          start_time: mid,
          end_time: s.end_time,
          duration: parseFloat((s.end_time - mid).toFixed(3)),
          transcript: text2,
          words: []
        });
      } else {
        newSegments.push(s);
      }
    });

    const reindexed = newSegments.map((s, idx) => ({ ...s, segment_id: idx + 1 }));
    setSegments(reindexed);
    if (onLintTrigger) onLintTrigger(reindexed);
  };

  const mergeWithNext = (index) => {
    if (index >= segments.length - 1) return;
    const current = segments[index];
    const next = segments[index + 1];

    const merged = {
      ...current,
      end_time: next.end_time,
      duration: parseFloat((next.end_time - current.start_time).toFixed(3)),
      transcript: `${current.transcript || ''} ${next.transcript || ''}`.trim(),
      words: [...(current.words || []), ...(next.words || [])]
    };

    const newSegments = [...segments];
    newSegments.splice(index, 2, merged);
    const reindexed = newSegments.map((s, idx) => ({ ...s, segment_id: idx + 1 }));
    setSegments(reindexed);
    if (onLintTrigger) onLintTrigger(reindexed);
  };

  const addNewSegmentAtEnd = () => {
    const lastSeg = segments[segments.length - 1];
    const startTime = lastSeg ? lastSeg.end_time : 0.0;
    const endTime = parseFloat((startTime + 3.5).toFixed(3));

    const newSeg = {
      segment_id: segments.length + 1,
      speaker: lastSeg && lastSeg.speaker === 'Speaker 1' ? 'Speaker 2' : 'Speaker 1',
      gender: 'Male',
      start_time: startTime,
      end_time: endTime,
      duration: 3.5,
      transcript: '',
      confidence: 1.0,
      words: [],
      qc_errors: [],
      is_valid: true
    };

    const updated = [...segments, newSeg];
    setSegments(updated);
    setActiveSegmentId(newSeg.segment_id);
    if (onLintTrigger) onLintTrigger(updated);
  };

  // Filtered segments
  const filteredSegments = useMemo(() => {
    return segments.filter((seg) => {
      if (filterSpeaker !== 'ALL' && seg.speaker !== filterSpeaker) return false;
      if (filterErrorsOnly && (!seg.qc_errors || seg.qc_errors.length === 0)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchText = (seg.transcript || '').toLowerCase().includes(q);
        const matchSpeaker = (seg.speaker || '').toLowerCase().includes(q);
        if (!matchText && !matchSpeaker) return false;
      }
      return true;
    });
  }, [segments, filterSpeaker, filterErrorsOnly, searchQuery]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col flex-1 min-h-[500px]">
      {/* Sleek Sub-Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Segments</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
            {filteredSegments.length} of {segments.length}
          </span>

          {/* Confidence Heatmap Legend Trigger */}
          <button
            onClick={() => setShowHeatmapGuide(!showHeatmapGuide)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2 py-0.5 rounded transition-colors cursor-pointer"
            title="Word Confidence Legend"
          >
            <Sparkles className="w-3 h-3 text-indigo-500" />
            <span>Heatmap</span>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* Text Search */}
          <div className="relative">
            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-6 pr-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 text-[11px] w-28 transition-all"
            />
          </div>

          {/* Speaker Filter */}
          <select
            value={filterSpeaker}
            onChange={(e) => setFilterSpeaker(e.target.value)}
            className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Speakers</option>
            <option value="Speaker 1">Speaker 1</option>
            <option value="Speaker 2">Speaker 2</option>
          </select>

          {/* Errors Only Filter */}
          <button
            onClick={() => setFilterErrorsOnly(!filterErrorsOnly)}
            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
              filterErrorsOnly
                ? 'bg-rose-50 text-rose-700 border-rose-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Issues Only
          </button>

          {/* Add Segment Button */}
          <button
            onClick={addNewSegmentAtEnd}
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Heatmap Legend Guide (Collapsible) */}
      {showHeatmapGuide && (
        <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-600" />
              Heatmap Filter:
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-bold">
              🔴 Low (&lt; 50%)
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold">
              🟡 Needs Review (50%–79%)
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
              ✓ High (&ge; 80% - Auto Hidden)
            </span>
          </div>
          <span className="text-slate-500 text-[10px]">
            💡 Only words &lt; 80% appear as clickable chips to save reviewer time!
          </span>
        </div>
      )}

      {/* Scrollable Segments List (Full-Height with Generous pb-36 Bottom Spacer) */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pt-2.5 pr-1 pb-36">
        {filteredSegments.length === 0 ? (
          <div className="text-center py-12 px-4">
            {audioLoaded ? (
              <div className="max-w-md mx-auto bg-indigo-50/50 border border-dashed border-indigo-200 rounded-2xl p-6 shadow-2xs">
                <Sparkles className="w-8 h-8 text-indigo-600 mx-auto mb-2 animate-bounce" />
                <h3 className="text-sm font-bold text-slate-800">Audio Ready for AI Transcription</h3>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  Click the button below to auto-transcribe speakers, verbatim script, and millisecond timestamps.
                </p>
                <button
                  type="button"
                  onClick={onStartTranscribe}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-xs transition-transform active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Start Auto-Transcription Now</span>
                </button>
              </div>
            ) : (
              <div className="py-12 text-slate-400">
                <Volume2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No audio loaded</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Upload an audio file above to start transcription.</p>
              </div>
            )}
          </div>
        ) : (
          filteredSegments.map((seg, idx) => {
            const isActive = seg.segment_id === activeSegmentId;
            const isSpeaker1 = seg.speaker === 'Speaker 1';
            const hasErrors = seg.qc_errors && seg.qc_errors.some((e) => e.severity === 'error');
            const hasWarnings = seg.qc_errors && seg.qc_errors.some((e) => e.severity === 'warning');

            // Word-level confidence items
            const wordsList = (seg.words && seg.words.length > 0)
              ? seg.words
              : (seg.transcript || '').split(/\s+/).filter(Boolean).map((w, wIdx, arr) => {
                  const segDur = Math.max(0.1, seg.end_time - seg.start_time);
                  const wDur = segDur / Math.max(1, arr.length);
                  let conf = seg.confidence || 0.95;
                  if (w.includes('[unintelligible]') || w.includes('[inaudible]')) conf = 0.35;
                  return {
                    word: w,
                    confidence: conf,
                    start_time: parseFloat((seg.start_time + wIdx * wDur).toFixed(3)),
                    end_time: parseFloat((seg.start_time + (wIdx + 1) * wDur).toFixed(3))
                  };
                });

            const hasLowConfidenceWord = wordsList.some((w) => w.confidence < 0.50);

            return (
              <div
                key={seg.segment_id}
                onClick={() => setActiveSegmentId(seg.segment_id)}
                className={`p-3 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-indigo-50/40 border-indigo-500 shadow-sm ring-1 ring-indigo-500/20'
                    : hasErrors
                    ? 'bg-rose-50/20 border-rose-300 hover:border-rose-400 shadow-2xs'
                    : hasWarnings
                    ? 'bg-amber-50/20 border-amber-300 hover:border-amber-400 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                }`}
              >
                {/* Segment Top Control Bar (Compact Single Row) */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  {/* Left: Play/Loop & Stop Buttons, Segment #, Speaker & Gender */}
                  <div className="flex items-center gap-1.5">
                    {/* Play / Loop Segment Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlaySegment(seg.start_time, seg.end_time);
                        setActiveSegmentId(seg.segment_id);
                      }}
                      className={`flex items-center justify-center h-6 w-6 rounded-lg text-white shadow-2xs transition-transform active:scale-95 cursor-pointer ${
                        isSpeaker1
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                      title="Play this segment in continuous loop"
                    >
                      <Play className="w-3 h-3 fill-current ml-0.5" />
                    </button>

                    {/* Stop Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onStopSegment) {
                          onStopSegment(seg.start_time);
                        } else {
                          onPlaySegment(seg.start_time, seg.start_time);
                        }
                        setActiveSegmentId(seg.segment_id);
                      }}
                      className="flex items-center justify-center h-6 w-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-slate-200 transition-colors active:scale-95 cursor-pointer"
                      title="Stop & Reset Marker to Segment Start"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                    </button>

                    <span className="font-mono text-[11px] font-bold text-slate-500 px-1 py-0.2 bg-slate-100 rounded">
                      #{seg.segment_id}
                    </span>

                    {/* Speaker Selector */}
                    <select
                      value={seg.speaker}
                      onChange={(e) => updateSegmentField(seg.segment_id, 'speaker', e.target.value)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer ${
                        isSpeaker1
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      <option value="Speaker 1">Speaker 1</option>
                      <option value="Speaker 2">Speaker 2</option>
                      <option value="Speaker 3">Speaker 3</option>
                    </select>

                    {/* Gender Selector */}
                    <select
                      value={seg.gender}
                      onChange={(e) => updateSegmentField(seg.segment_id, 'gender', e.target.value)}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-slate-700 cursor-pointer"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Unknown">Unknown</option>
                    </select>

                    {/* Low Confidence Indicator Flag */}
                    {hasLowConfidenceWord && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-200">
                        ⚠️ Low Conf
                      </span>
                    )}
                  </div>

                  {/* Right: Millisecond Timestamps & Actions */}
                  <div className="flex items-center gap-1 font-mono text-[11px] text-slate-600">
                    {/* Start Time Input with Micro-Nudge */}
                    <div className="flex items-center gap-0.5 bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-slate-400 text-[9px] font-bold">START</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSegmentField(seg.segment_id, 'start_time', parseFloat(Math.max(0, seg.start_time - 0.05).toFixed(3)));
                        }}
                        className="px-0.5 text-[9px] text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded cursor-pointer"
                        title="Nudge -0.05s"
                      >
                        ◀
                      </button>
                      <input
                        type="number"
                        step="0.001"
                        value={seg.start_time}
                        onChange={(e) => updateSegmentField(seg.segment_id, 'start_time', parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-slate-800 font-bold focus:outline-none text-center font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSegmentField(seg.segment_id, 'start_time', parseFloat((seg.start_time + 0.05).toFixed(3)));
                        }}
                        className="px-0.5 text-[9px] text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded cursor-pointer"
                        title="Nudge +0.05s"
                      >
                        ▶
                      </button>
                      <span className="text-slate-400 text-[9px]">s</span>
                    </div>

                    <span className="text-slate-400">→</span>

                    {/* End Time Input with Micro-Nudge */}
                    <div className="flex items-center gap-0.5 bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-slate-400 text-[9px] font-bold">END</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSegmentField(seg.segment_id, 'end_time', parseFloat(Math.max(seg.start_time + 0.1, seg.end_time - 0.05).toFixed(3)));
                        }}
                        className="px-0.5 text-[9px] text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded cursor-pointer"
                        title="Nudge -0.05s"
                      >
                        ◀
                      </button>
                      <input
                        type="number"
                        step="0.001"
                        value={seg.end_time}
                        onChange={(e) => updateSegmentField(seg.segment_id, 'end_time', parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-slate-800 font-bold focus:outline-none text-center font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSegmentField(seg.segment_id, 'end_time', parseFloat((seg.end_time + 0.05).toFixed(3)));
                        }}
                        className="px-0.5 text-[9px] text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded cursor-pointer"
                        title="Nudge +0.05s"
                      >
                        ▶
                      </button>
                      <span className="text-slate-400 text-[9px]">s</span>
                    </div>

                    {/* Duration Badge */}
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      seg.duration > 20 || seg.duration < 0.5
                        ? 'bg-rose-100 text-rose-700 border border-rose-300'
                        : 'text-slate-500 bg-slate-100'
                    }`}>
                      {seg.duration.toFixed(2)}s
                    </span>

                    {/* Actions: Split / Merge / Delete */}
                    <div className="flex items-center gap-0.5 ml-1 border-l border-slate-200 pl-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          splitSegment(seg);
                        }}
                        title="Split segment"
                        className="p-1 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                      >
                        <Split className="w-3 h-3" />
                      </button>

                      {idx < segments.length - 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            mergeWithNext(idx);
                          }}
                          title="Merge with next"
                          className="p-1 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded cursor-pointer"
                        >
                          <Merge className="w-3 h-3" />
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSegment(seg.segment_id);
                        }}
                        title="Delete segment"
                        className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Visual Word-Level Confidence Heatmap Ribbon (Shows ONLY words < 80% confidence) */}
                {(() => {
                  const lowConfidenceWords = wordsList.filter((w) => w.confidence < 0.80);
                  if (lowConfidenceWords.length === 0) return null;

                  return (
                    <div className="mb-1.5 p-1.5 bg-amber-50/60 rounded-lg border border-amber-200/80 flex flex-wrap items-center gap-1">
                      <span className="text-[9px] font-bold text-amber-800 uppercase tracking-wider mr-0.5 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                        Needs Review (&lt; 80%):
                      </span>
                      {lowConfidenceWords.map((wObj, wIdx) => {
                        const conf = wObj.confidence;
                        const isVeryLow = conf < 0.50;

                        return (
                          <button
                            key={wIdx}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const wStart = wObj.start_time !== undefined ? wObj.start_time : seg.start_time;
                              const wEnd = wObj.end_time !== undefined ? wObj.end_time : seg.end_time;
                              onPlaySegment(wStart, wEnd);
                              setActiveSegmentId(seg.segment_id);
                            }}
                            title={`"${wObj.word}" — Confidence: ${(conf * 100).toFixed(0)}% (Click to loop phrase)`}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[11px] font-semibold transition-all active:scale-95 cursor-pointer shadow-2xs ${
                              isVeryLow
                                ? 'bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-bold'
                                : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                            }`}
                          >
                            <span>{wObj.word}</span>
                            <span className={`text-[8px] font-mono font-bold ${
                              isVeryLow ? 'text-rose-700' : 'text-amber-700'
                            }`}>
                              {(conf * 100).toFixed(0)}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Verbatim Transcript Textarea */}
                <div className="mt-1">
                  <textarea
                    rows={2}
                    value={seg.transcript}
                    onChange={(e) => updateSegmentField(seg.segment_id, 'transcript', e.target.value)}
                    placeholder="Type full verbatim transcription exactly as spoken..."
                    spellCheck={false}
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                    autoCorrect="off"
                    autoCapitalize="off"
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 resize-y leading-relaxed font-sans transition-all"
                  />
                </div>

                {/* QC Rule Violations Badges */}
                {seg.qc_errors && seg.qc_errors.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {seg.qc_errors.map((err, errIdx) => (
                      <div
                        key={errIdx}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                          err.severity === 'error'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {err.severity === 'error' ? (
                          <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                        )}
                        <span>{err.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
