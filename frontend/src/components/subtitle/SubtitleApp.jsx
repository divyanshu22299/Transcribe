import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, Upload, CheckCircle2, AlertCircle, Sparkles, RefreshCw, 
  FileDown, Sliders, ShieldCheck, Film, Undo2, Redo2, 
  SlidersHorizontal, Search, Split, Merge, Scissors, Trash2, Plus, 
  ChevronDown, X, Play, Clock, Activity, FileText, Check, Settings, 
  Menu, Download, Eye, AlertTriangle, Layers, Type, Sun, Moon, Loader2
} from 'lucide-react';
import { API_BASE } from '../../config';
import VideoPlayer from './VideoPlayer';
import AudioWaveformTimeline from './AudioWaveformTimeline';
import SubtitleGridView from './SubtitleGridView';
import NetflixQCPanel from './NetflixQCPanel';
import SubtitleExportModal from './SubtitleExportModal';
import SubtitleDiffModal from './SubtitleDiffModal';
import SubtitleSettingsModal from './SubtitleSettingsModal';

export default function SubtitleApp({ onBackToHome }) {
  // ── Theme State: Unified Dark Creative Suite ──
  const [theme] = useState('dark');
  const isDark = true;

  // Video & File state
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentVideoId, setCurrentVideoId] = useState(null);

  const isAudioFile = useMemo(() => {
    if (!selectedFile) return false;
    return Boolean(
      selectedFile.type?.startsWith('audio/') || 
      /\.(mp3|wav|m4a|aac|flac|ogg|opus|wma)$/i.test(selectedFile.name || '')
    );
  }, [selectedFile]);

  // Subtitle Dataset State
  const [events, setEvents] = useState([]);
  const [originalEvents, setOriginalEvents] = useState([]);
  const [activeEventId, setActiveEventId] = useState(null);

  // Video playback sync state
  const [currentTime, setCurrentTime] = useState(0);
  const [playTarget, setPlayTarget] = useState(null);

  // Netflix Rules & QC Telemetry
  const [language, setLanguage] = useState('en');
  const [contentType, setContentType] = useState('adult'); // 'adult' (20 CPS) | 'children' (17 CPS)
  const [sdhMode, setSdhMode] = useState(false);
  const [frameRate, setFrameRate] = useState(24.0);
  const [shotChanges, setShotChanges] = useState([]);
  const [complianceScore, setComplianceScore] = useState(100.0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [totalWarnings, setTotalWarnings] = useState(0);
  const [cpsStats, setCpsStats] = useState(null);

  // Generation & Streaming Progress State
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [batchProgress, setBatchProgress] = useState(null); // { current: 1, total: 4 }
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef(null);

  // History for Undo/Redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Modals & Panels UI
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [showQcDrawer, setShowQcDrawer] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [pendingDraft, setPendingDraft] = useState(null); // Previous autosaved draft detection
  const [backendConnected, setBackendConnected] = useState(null); // null = checking, true = online, false = offline

  useEffect(() => {
    let isMounted = true;
    const checkConnection = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`, { method: 'GET' });
        if (isMounted) setBackendConnected(res.ok);
      } catch {
        if (isMounted) setBackendConnected(false);
      }
    };
    checkConnection();
    return () => { isMounted = false; };
  }, []);

  // Resizable Layout Dimensions (Default: Left 480px, Bottom 210px)
  const [leftPanelWidth, setLeftPanelWidth] = useState(480);
  const [bottomTimelineHeight, setBottomTimelineHeight] = useState(210);

  const isResizingLeftRef = useRef(false);
  const isResizingBottomRef = useRef(false);

  // File Inputs
  const fileInputRef = useRef(null);
  const srtImportRef = useRef(null);
  const headerMenuRef = useRef(null);

  // ── Dynamic Subtitle & QC Threshold Settings ──
  const [cplLimit, setCplLimit] = useState(() => {
    try {
      const v = localStorage.getItem('karya_sub_cpl');
      return v ? parseInt(v, 10) : 42;
    } catch {
      return 42;
    }
  });

  const [cpsLimit, setCpsLimit] = useState(() => {
    try {
      const v = localStorage.getItem('karya_sub_cps');
      return v ? parseFloat(v) : 20.0;
    } catch {
      return 20.0;
    }
  });

  const [maxLines, setMaxLines] = useState(() => {
    try {
      const v = localStorage.getItem('karya_sub_max_lines');
      return v ? parseInt(v, 10) : 2;
    } catch {
      return 2;
    }
  });

  const [minDuration, setMinDuration] = useState(() => {
    try {
      const v = localStorage.getItem('karya_sub_min_dur');
      return v ? parseFloat(v) : 0.833;
    } catch {
      return 0.833;
    }
  });

  const [maxDuration, setMaxDuration] = useState(() => {
    try {
      const v = localStorage.getItem('karya_sub_max_dur');
      return v ? parseFloat(v) : 7.0;
    } catch {
      return 7.0;
    }
  });

  const [geminiAutoFix, setGeminiAutoFix] = useState(() => {
    try {
      const v = localStorage.getItem('karya_sub_autofix');
      return v !== null ? v === 'true' : true;
    } catch {
      return true;
    }
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isFixingWithGemini, setIsFixingWithGemini] = useState(false);

  // Sync settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('karya_sub_cpl', cplLimit);
      localStorage.setItem('karya_sub_cps', cpsLimit);
      localStorage.setItem('karya_sub_max_lines', maxLines);
      localStorage.setItem('karya_sub_min_dur', minDuration);
      localStorage.setItem('karya_sub_max_dur', maxDuration);
      localStorage.setItem('karya_sub_autofix', geminiAutoFix);
    } catch {}
  }, [cplLimit, cpsLimit, maxLines, minDuration, maxDuration, geminiAutoFix]);

  // Active Subtitle
  const activeEvent = useMemo(() => {
    return events.find(e => (e.id === activeEventId || e.event_id === activeEventId)) || events[0] || null;
  }, [events, activeEventId]);

  // Sanitize helper to purge any cached/legacy NF-PYRAMID errors
  const sanitizeEvents = useCallback((evs) => {
    if (!evs || !Array.isArray(evs)) return [];
    return evs.map(e => ({
      ...e,
      qc_errors: (e.qc_errors || e.errors || []).filter(err => {
        const rid = (err.rule_id || '').toUpperCase();
        const msg = (err.message || '').toLowerCase();
        return !rid.includes('PYRAMID') && !msg.includes('pyramid') && !msg.includes('bottom-heavy');
      }),
      errors: (e.errors || []).filter(err => {
        const rid = (err.rule_id || '').toUpperCase();
        const msg = (err.message || '').toLowerCase();
        return !rid.includes('PYRAMID') && !msg.includes('pyramid') && !msg.includes('bottom-heavy');
      })
    }));
  }, []);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
        setShowFileDropdown(false);
        setShowSettingsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── 1-Minute Interval Auto-Save to Database / localStorage ──
  useEffect(() => {
    if (!events || events.length === 0) return;
    const interval = setInterval(() => {
      try {
        const fileId = selectedFile?.name || 'draft_subtitle';
        localStorage.setItem(`karya_subtitle_autosave_${fileId}`, JSON.stringify({
          events,
          complianceScore,
          totalErrors,
          totalWarnings,
          settings: { language, contentType, cplLimit, cpsLimit, frameRate, sdhMode },
          timestamp: new Date().toISOString()
        }));
        setAutoSaveStatus('Draft Saved (1m sync) ✓');
        setTimeout(() => setAutoSaveStatus(''), 2500);
      } catch (e) {
        console.warn('Auto-save storage quota exceeded', e);
      }
    }, 60000); // Once every 1 minute
    return () => clearInterval(interval);
  }, [events, complianceScore, totalErrors, totalWarnings, selectedFile, language, contentType, cplLimit, cpsLimit, frameRate, sdhMode]);

  // ── Mouse Drag Splitter Handlers for Resizable Panes ──
  const handleLeftSplitterDown = (e) => {
    e.preventDefault();
    isResizingLeftRef.current = true;
    document.body.style.cursor = 'col-resize';
  };

  const handleBottomSplitterDown = (e) => {
    e.preventDefault();
    isResizingBottomRef.current = true;
    document.body.style.cursor = 'row-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingLeftRef.current) {
        const newWidth = Math.max(260, Math.min(750, e.clientX - 12));
        setLeftPanelWidth(newWidth);
      } else if (isResizingBottomRef.current) {
        const windowHeight = window.innerHeight;
        const newHeight = Math.max(140, Math.min(420, windowHeight - e.clientY - 12));
        setBottomTimelineHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      if (isResizingLeftRef.current || isResizingBottomRef.current) {
        isResizingLeftRef.current = false;
        isResizingBottomRef.current = false;
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Push to undo stack
  const pushToHistory = useCallback((newEvents) => {
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      return [...next, newEvents];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const targetIdx = historyIndex - 1;
      const targetEvents = history[targetIdx];
      setHistoryIndex(targetIdx);
      setEvents(targetEvents);
      handleLint(targetEvents);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const targetIdx = historyIndex + 1;
      const targetEvents = history[targetIdx];
      setHistoryIndex(targetIdx);
      setEvents(targetEvents);
      handleLint(targetEvents);
    }
  };

  // Re-cut / Split active subtitle at current playhead cursor
  const handleSplitAtCursor = (splitTime) => {
    const timeToSplit = splitTime !== undefined ? splitTime : currentTime;
    setEvents(prev => {
      let targetIdx = prev.findIndex(e => {
        const st = e.start_time ?? e.start ?? 0;
        const en = e.end_time ?? e.end ?? 0;
        return timeToSplit >= st && timeToSplit <= en;
      });

      if (targetIdx === -1) {
        targetIdx = prev.findIndex(e => e.id === activeEventId);
      }

      if (targetIdx === -1) return prev;

      const ev = prev[targetIdx];
      const start = ev.start_time ?? ev.start;
      const end = ev.end_time ?? ev.end;

      if (timeToSplit <= start + 0.1 || timeToSplit >= end - 0.1) return prev;

      const text = ev.text || "";
      const mid = Math.floor(text.length / 2);
      const spaceIdx = text.lastIndexOf(" ", mid) > -1 ? text.lastIndexOf(" ", mid) : mid;
      const text1 = text.slice(0, spaceIdx > 0 ? spaceIdx : mid).trim();
      const text2 = text.slice(spaceIdx > 0 ? spaceIdx : mid).trim();

      const newEv1 = { ...ev, end_time: timeToSplit, end: timeToSplit, text: text1 };
      const newEv2 = { ...ev, id: Math.max(...prev.map(p => p.id || 0)) + 1, start_time: timeToSplit + 0.08, start: timeToSplit + 0.08, text: text2 };
      
      const next = [...prev];
      next.splice(targetIdx, 1, newEv1, newEv2);
      pushToHistory(next);
      handleLint(next);
      setActiveEventId(newEv2.id);
      return next;
    });
  };

  // ── Subtitle Edit Feature: Move active and all following subtitles to playhead (preserving spacing) ──
  const handleShiftAllFollowing = (targetId, targetTime) => {
    const pivotTime = targetTime !== undefined ? targetTime : currentTime;
    setEvents(prev => {
      if (!prev || prev.length === 0) return prev;

      let targetIdx = -1;
      if (targetId) {
        targetIdx = prev.findIndex(e => (e.id === targetId || e.event_id === targetId));
      }
      if (targetIdx === -1) {
        targetIdx = prev.findIndex(e => {
          const st = e.start_time ?? e.start ?? 0;
          return st >= pivotTime - 0.5;
        });
      }
      if (targetIdx === -1) {
        targetIdx = prev.length - 1;
      }

      const activeEv = prev[targetIdx];
      const curStart = activeEv.start_time ?? activeEv.start ?? 0;
      const delta = pivotTime - curStart;

      if (Math.abs(delta) < 0.01) return prev;

      const next = prev.map((ev, idx) => {
        if (idx >= targetIdx) {
          const s = Math.max(0, Math.round(((ev.start_time ?? ev.start ?? 0) + delta) * 1000) / 1000);
          const e = Math.max(s + 0.1, Math.round(((ev.end_time ?? ev.end ?? 0) + delta) * 1000) / 1000);
          return {
            ...ev,
            start_time: s,
            end_time: e,
            start: s,
            end: e,
            duration: Math.round((e - s) * 1000) / 1000
          };
        }
        return ev;
      });

      pushToHistory(next);
      handleLint(next);
      console.log(`[Subtitle Studio] Shifted ${next.length - targetIdx} subtitles from #${activeEv.id} by ${delta.toFixed(3)}s`);
      return next;
    });
  };

  // ── Global Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

      // Subtitle Edit Alignment: Shift active & all following subtitles to playhead (Ctrl+Space or Ctrl+Enter)
      if ((e.ctrlKey || e.metaKey) && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        handleShiftAllFollowing(activeEventId, currentTime);
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (!isInput) {
          e.preventDefault();
          handleUndo();
        }
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        if (!isInput) {
          e.preventDefault();
          handleRedo();
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        jumpToNextIssue();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInput && activeEventId) {
          e.preventDefault();
          handleDeleteEvent(activeEventId);
        }
      } else if (e.key === 'ArrowUp' && !isInput && (e.altKey || !e.shiftKey)) {
        e.preventDefault();
        const idx = events.findIndex(ev => ev.id === activeEventId);
        if (idx > 0) {
          const prevId = events[idx - 1].id;
          setActiveEventId(prevId);
          handlePlayEvent(prevId);
        }
      } else if (e.key === 'ArrowDown' && !isInput && (e.altKey || !e.shiftKey)) {
        e.preventDefault();
        const idx = events.findIndex(ev => ev.id === activeEventId);
        if (idx < events.length - 1) {
          const nextId = events[idx + 1].id;
          setActiveEventId(nextId);
          handlePlayEvent(nextId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex, events, activeEventId, currentTime]);

  // Jump to Next QC Issue
  const jumpToNextIssue = () => {
    const issueEvents = events.filter(e => (e.qc_errors || e.errors || []).length > 0);
    if (issueEvents.length === 0) return;

    const curIdx = issueEvents.findIndex(e => e.id === activeEventId);
    const nextEvent = issueEvents[(curIdx + 1) % issueEvents.length];
    if (nextEvent) {
      setActiveEventId(nextEvent.id);
      handlePlayEvent(nextEvent.id);
    }
  };

  // Media File (Video or Audio) Upload Handler
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setCurrentVideoId(null);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);

      const isAudio = Boolean(
        file.type?.startsWith('audio/') || 
        /\.(mp3|wav|m4a|aac|flac|ogg|opus|wma)$/i.test(file.name || '')
      );

      const mediaElem = isAudio ? document.createElement('audio') : document.createElement('video');
      mediaElem.src = url;
      mediaElem.onloadedmetadata = () => {
        setVideoDuration(mediaElem.duration || 0);
      };

      // Upload in background immediately so backend pre-extracts audio and serves true waveform peaks
      const bgUpload = async (f) => {
        try {
          const formData = new FormData();
          formData.append('file', f);
          const res = await fetch(`${API_BASE}/api/subtitle/upload`, {
            method: 'POST',
            body: formData
          });
          if (res.ok) {
            const data = await res.json();
            if (data.video_id) {
              setCurrentVideoId(data.video_id);
            }
          }
        } catch (err) {
          console.warn("Background upload for waveform:", err);
        }
      };
      bgUpload(file);

      // Reset subtitle canvas for clean state
      setEvents([]);
      setComplianceScore(100);
      setTotalErrors(0);
      setTotalWarnings(0);
      setActiveEventId(null);

      // Check if previous autosaved draft exists
      const saved = localStorage.getItem(`karya_subtitle_autosave_${file.name}`);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.events && data.events.length > 0) {
            setPendingDraft(data);
          } else {
            setPendingDraft(null);
          }
        } catch (err) {
          console.error(err);
          setPendingDraft(null);
        }
      } else {
        setPendingDraft(null);
      }
    }
  };

  // Single Subtitle Event Update
  const handleUpdateEvent = (id, field, value) => {
    setEvents(prev => {
      const next = prev.map(e => (e.id === id ? { ...e, [field]: value } : e));
      pushToHistory(next);
      handleLint(next);
      return next;
    });
  };

  // Drag Time Change from Timeline
  const handleEventTimeChange = (id, newStart, newEnd) => {
    setEvents(prev => {
      const next = prev.map(e => {
        if (e.id === id) {
          const dur = Math.max(0.1, newEnd - newStart);
          return {
            ...e,
            start_time: newStart,
            end_time: newEnd,
            start: newStart,
            end: newEnd,
            duration: dur
          };
        }
        return e;
      });
      return next;
    });
  };

  // Seek and Play Subtitle Event
  const handlePlayEvent = (id) => {
    const target = events.find(e => e.id === id);
    if (target) {
      const st = target.start_time !== undefined ? target.start_time : (target.start !== undefined ? target.start : 0);
      const en = target.end_time !== undefined ? target.end_time : (target.end !== undefined ? target.end : 0);
      setCurrentTime(st);
      setPlayTarget({ time: st, endTime: en, pause: false });
    }
  };

  // Split Event
  const handleSplitEvent = (id) => {
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    const st = ev.start_time ?? ev.start ?? 0;
    const en = ev.end_time ?? ev.end ?? 0;
    const midTime = Math.round(((st + en) / 2) * 1000) / 1000;
    handleSplitAtCursor(midTime);
  };

  // Merge Event with Next
  const handleMergeEvents = (id) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx === -1 || idx >= prev.length - 1) return prev;

      const cur = prev[idx];
      const next = prev[idx + 1];

      const mergedText = `${cur.text || ''}\n${next.text || ''}`.trim();
      const mergedEvent = {
        ...cur,
        end_time: next.end_time ?? next.end,
        end: next.end_time ?? next.end,
        text: mergedText,
        lines: mergedText.split('\n'),
      };

      const updated = [...prev];
      updated.splice(idx, 2, mergedEvent);
      pushToHistory(updated);
      handleLint(updated);
      return updated;
    });
  };

  // Delete Event
  const handleDeleteEvent = (id) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx === -1) return prev;
      const updated = prev.filter(e => e.id !== id);
      pushToHistory(updated);
      handleLint(updated);
      if (updated.length > 0) {
        const nextActive = updated[Math.min(idx, updated.length - 1)].id;
        setActiveEventId(nextActive);
      } else {
        setActiveEventId(null);
      }
      return updated;
    });
  };

  // Bulk Delete Multiple Subtitle Events
  const handleBulkDelete = (idsToDelete) => {
    if (!idsToDelete || idsToDelete.length === 0) return;
    const deleteSet = new Set(idsToDelete);
    setEvents(prev => {
      const updated = prev.filter(e => !deleteSet.has(e.id) && !deleteSet.has(e.event_id));
      // Renumber remaining events
      const renumbered = updated.map((e, idx) => ({ ...e, id: idx + 1, event_id: idx + 1 }));
      pushToHistory(renumbered);
      handleLint(renumbered);
      if (renumbered.length > 0) {
        setActiveEventId(renumbered[0].id);
      } else {
        setActiveEventId(null);
      }
      return renumbered;
    });
  };

  // Re-break Event Text
  const handleRebreakEvent = async (id) => {
    const ev = events.find(e => e.id === id);
    if (!ev) return;

    try {
      const res = await fetch(`${API_BASE}/api/subtitle/rebreak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [ev], max_cpl: cplLimit })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.events && data.events[0]) {
          handleUpdateEvent(id, 'text', data.events[0].text);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Manual Subtitle
  const handleAddSubtitle = (atTime = null) => {
    const startTime = atTime !== null ? Math.max(0, atTime) : (events.length > 0 ? events[events.length - 1].end_time + 0.1 : 0);
    const endTime = startTime + 2.4;
    const newId = events.length > 0 ? Math.max(...events.map(e => e.id || 0)) + 1 : 1;

    const newEvent = {
      id: newId,
      start_time: Math.round(startTime * 1000) / 1000,
      end_time: Math.round(endTime * 1000) / 1000,
      start: Math.round(startTime * 1000) / 1000,
      end: Math.round(endTime * 1000) / 1000,
      text: "New dialogue subtitle line",
      lines: ["New dialogue subtitle line"],
      speaker_count: 1,
      speakers: ["Speaker 1"],
      is_italic: false,
      qc_errors: [],
      is_valid: true
    };

    const updated = [...events, newEvent].sort((a, b) => a.start_time - b.start_time);
    setEvents(updated);
    setActiveEventId(newId);
    pushToHistory(updated);
    handleLint(updated);
  };

  // ── Non-Blocking Progressive Batch-Wise Auto-Generate (Streaming SSE) ──
  const handleGenerate = async () => {
    if (!selectedFile) {
      fileInputRef.current?.click();
      return;
    }
    
    // Clear old subtitles and draft for a clean fresh AI generation
    setPendingDraft(null);
    try {
      localStorage.removeItem(`karya_subtitle_autosave_${selectedFile.name}`);
    } catch (_) {}
    setEvents([]);
    setComplianceScore(100);
    setTotalErrors(0);
    setTotalWarnings(0);
    setActiveEventId(null);

    setIsGenerating(true);
    setProgressPercent(5);
    setProgressStage('Uploading Video & Extracting Audio');
    setProgressDetail('Demuxing audio stream via FFmpeg...');
    setBatchProgress(null);
    setElapsedSeconds(0);

    const startTimer = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(parseFloat(((Date.now() - startTimer) / 1000).toFixed(1)));
    }, 200);

    try {
      let videoId = currentVideoId;
      if (!videoId) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        console.log("[Subtitle Studio] Uploading video container to backend...");
        const uploadRes = await fetch(`${API_BASE}/api/subtitle/upload`, {
          method: 'POST',
          body: formData
        });
        
        if (!uploadRes.ok) {
          const errJson = await uploadRes.json().catch(() => null);
          throw new Error(errJson?.detail || `Video upload failed (Status: ${uploadRes.status})`);
        }
        const uploadData = await uploadRes.json();
        videoId = uploadData.video_id;
        setCurrentVideoId(videoId);
      }

      setProgressPercent(20);
      setProgressStage('Starting AI Subtitle Stream');
      setProgressDetail('Connecting to Gemini AI pipeline...');

      console.log(`[Subtitle Studio] Starting batch stream for Video ID: ${videoId}`);
      const streamRes = await fetch(`${API_BASE}/api/subtitle/generate_stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: videoId,
          language,
          content_type: contentType,
          sdh_mode: sdhMode,
          cpl_limit: cplLimit,
          max_cps: cpsLimit,
          max_lines: maxLines,
          min_duration: minDuration,
          max_duration: maxDuration,
          gemini_auto_fix: geminiAutoFix
        })
      });

      if (!streamRes.ok) {
        throw new Error(`Stream request failed (Status: ${streamRes.status})`);
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedEvents = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          try {
            const data = JSON.parse(jsonStr);

            if (data.type === 'init') {
              setShotChanges(data.shot_changes || []);
              setFrameRate(data.frame_rate || 24.0);
              setProgressPercent(30);
              setProgressStage('Analyzing Audio & Dialogue Splits');
              setProgressDetail(`Splitting recording into ${data.total_chunks} audio batches...`);
              setBatchProgress({ current: 0, total: data.total_chunks });
            } else if (data.type === 'progress') {
              const pct = 30 + Math.floor((data.chunk_index / data.total_chunks) * 55);
              setProgressPercent(pct);
              setProgressStage(`Generating Batch ${data.chunk_index} of ${data.total_chunks}`);
              setProgressDetail(`Transcribing dialogue & applying Netflix rules for Batch ${data.chunk_index}...`);
              setBatchProgress({ current: data.chunk_index, total: data.total_chunks });
            } else if (data.type === 'batch') {
              // Append / Merge Batch Events Progressively in Real-Time!
              const newBatchEvents = data.events || [];
              accumulatedEvents = [...accumulatedEvents, ...newBatchEvents];
              setEvents(accumulatedEvents);
              if (!activeEventId && accumulatedEvents.length > 0) {
                setActiveEventId(accumulatedEvents[0].id);
              }
              console.log(`[Subtitle Studio] Ingested Batch ${data.chunk_index}/${data.total_chunks} (${newBatchEvents.length} events). User can edit now!`);
            } else if (data.type === 'complete') {
              const res = data.result || {};
              const finalEvents = (res.events || accumulatedEvents).map(e => ({
                ...e,
                start: e.start_time,
                end: e.end_time
              }));
              setEvents(finalEvents);
              pushToHistory(finalEvents);
              setComplianceScore(res.compliance_score || 100);
              setTotalErrors(res.total_errors || 0);
              setTotalWarnings(res.total_warnings || 0);
              setCpsStats(res.cps_stats || null);
              setProgressPercent(100);
              setProgressStage('Complete');
              setProgressDetail(`All ${finalEvents.length} subtitles generated and audited!`);
              console.log("[Subtitle Studio] Subtitle generation completed successfully!");
            }
          } catch (e) {
            console.warn("SSE parse error:", e, jsonStr);
          }
        }
      }
    } catch (err) {
      console.error("Generation error:", err);
      const isNetwork = err.message?.includes('Failed to fetch') || 
                        err.message?.includes('NetworkError') || 
                        err.message?.includes('Network error') ||
                        err.message?.includes('Load failed');
      if (isNetwork) {
        alert(
          `Network Error: Cannot connect to Backend Server.\n\n` +
          `Current API URL: ${API_BASE || '(relative / localhost)'}\n\n` +
          `If this is a live deployed website, you must configure your live Backend API URL (e.g. Render, Railway, or Cloudflare/Ngrok URL) in Settings ⚙️.`
        );
        setShowSettingsModal(true);
      } else {
        alert(`Error generating subtitles: ${err.message}`);
      }
    } finally {
      setIsGenerating(false);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      setTimeout(() => {
        setProgressPercent(0);
        setBatchProgress(null);
      }, 2500);
    }
  };

  // Linting
  const handleLint = async (updatedEvents) => {
    try {
      const res = await fetch(`${API_BASE}/api/subtitle/lint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: updatedEvents,
          shot_changes: shotChanges,
          frame_rate: frameRate,
          content_type: contentType,
          custom_cpl: cplLimit,
          custom_cps: cpsLimit,
          custom_max_lines: maxLines,
          custom_min_duration: minDuration,
          custom_max_duration: maxDuration
        })
      });
      if (res.ok) {
        const data = await res.json();
        setComplianceScore(data.compliance_score || 100);
        setTotalErrors(data.total_errors || 0);
        setTotalWarnings(data.total_warnings || 0);
        setCpsStats(data.cps_stats || null);
        if (data.events) {
          setEvents(sanitizeEvents(data.events));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Gemini-Coordinated QC Self-Correction Pass ──
  const handleGeminiFix = async () => {
    if (!events || events.length === 0) return;
    setIsFixingWithGemini(true);
    try {
      const res = await fetch(`${API_BASE}/api/subtitle/gemini_fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: events,
          shot_changes: shotChanges,
          frame_rate: frameRate,
          content_type: contentType,
          cpl_limit: cplLimit,
          max_cps: cpsLimit,
          max_lines: maxLines,
          min_duration: minDuration,
          max_duration: maxDuration
        })
      });
      if (res.ok) {
        const data = await res.json();
        setOriginalEvents(events);
        if (data.events) {
          const clean = sanitizeEvents(data.events);
          setEvents(clean);
          pushToHistory(clean);
          handleLint(clean);
          setShowDiffModal(true);
        }
        setComplianceScore(data.compliance_score || 100);
        setTotalErrors(data.total_errors || 0);
        setTotalWarnings(data.total_warnings || 0);
        setCpsStats(data.cps_stats || null);
        setAutoSaveStatus('Gemini Auto-Fix Applied ✓');
        setTimeout(() => setAutoSaveStatus(''), 3000);
      }
    } catch (err) {
      console.error("Gemini fix failed:", err);
    } finally {
      setIsFixingWithGemini(false);
    }
  };

  // Auto-Fix All Issues
  const handleAutoFix = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/subtitle/autofix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: events,
          shot_changes: shotChanges,
          frame_rate: frameRate,
          content_type: contentType,
          custom_cpl: cplLimit,
          custom_cps: cpsLimit,
          custom_max_lines: maxLines,
          custom_min_duration: minDuration,
          custom_max_duration: maxDuration
        })
      });
      if (res.ok) {
        const data = await res.json();
        setOriginalEvents(events);
        setEvents(data.events || []);
        pushToHistory(data.events || []);
        handleLint(data.events || []);
        setShowDiffModal(true);
      }
    } catch (err) {
      console.error(err);
      alert('Auto-fix failed');
    }
  };

  // Import SRT / VTT File
  const handleImportSrt = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (!text) return;

        const blocks = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');
        const parsed = [];
        let idCounter = 1;

        for (const block of blocks) {
          const lines = block.trim().split('\n');
          if (lines.length < 2) continue;

          let timeLine = lines[0].includes('-->') ? lines[0] : lines[1];
          let textLines = lines[0].includes('-->') ? lines.slice(1) : lines.slice(2);

          if (!timeLine || !timeLine.includes('-->')) continue;

          const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
          const parseS = (s) => {
            const clean = s.replace(',', '.');
            const parts = clean.split(':');
            if (parts.length === 3) {
              return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
            }
            return 0;
          };

          const sTime = parseS(startStr);
          const eTime = parseS(endStr);
          const subText = textLines.join('\n').trim();

          parsed.push({
            id: idCounter++,
            start_time: sTime,
            end_time: eTime,
            start: sTime,
            end: eTime,
            text: subText,
            lines: subText.split('\n'),
            speaker_count: subText.includes('-') ? 2 : 1,
            speakers: ['Speaker 1'],
            is_italic: subText.includes('<i>'),
            qc_errors: [],
            is_valid: true
          });
        }

        if (parsed.length > 0) {
          setEvents(parsed);
          pushToHistory(parsed);
          setActiveEventId(parsed[0].id);
          handleLint(parsed);
          alert(`Successfully imported ${parsed.length} subtitles from ${file.name}`);
        }
      } catch (err) {
        console.error(err);
        alert('Failed to parse subtitle file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col font-sans select-none transition-colors duration-150 bg-[#0e0f12] text-[#f1f2f6]">
      {/* Hidden File Upload Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="video/mp4,video/mkv,video/quicktime,video/webm,video/avi,audio/mp3,audio/wav,audio/m4a,audio/aac,audio/flac,audio/ogg,audio/mpeg,audio/opus,.mp4,.mkv,.mov,.webm,.avi,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={srtImportRef} 
        onChange={handleImportSrt} 
        accept=".srt,.vtt,.txt" 
        className="hidden" 
      />

      {/* ── Top Header Bar (Sleek NLE Studio Menu) ── */}
      <nav ref={headerMenuRef} className="border-b border-[#262734] bg-[#121318] px-3 py-1 flex items-center justify-between shadow-xs shrink-0 z-40 transition-colors">
        {/* Left: Brand & Studio Title */}
        <div className="flex items-center gap-2">
          <button 
            onClick={onBackToHome} 
            className="p-1 px-2 rounded transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold border border-[#262734] hover:bg-[#181920] text-slate-300 hover:text-white"
            title="Return to Hub"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#00e5be]" />
            <span>Hub</span>
          </button>
          
          <div className="h-4 w-px bg-[#262734]" />

          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-tr from-[#00e5be] to-[#00b4d8] text-black flex items-center justify-center font-black shadow-xs">
              <Film className="w-3 h-3" />
            </div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-bold tracking-tight uppercase font-mono text-white">
                SUBTITLE STUDIO
              </h1>
              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-[#00e5be]/15 text-[#00e5be] rounded border border-[#00e5be]/40">
                PRO
              </span>
            </div>
          </div>

          {selectedFile && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#262734] truncate max-w-[220px] text-slate-300 bg-[#181920] flex items-center gap-1.5" title={selectedFile.name}>
              <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                isAudioFile ? 'bg-cyan-500/20 text-[#00e5ff] border border-cyan-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}>
                {isAudioFile ? '🎵 AUDIO' : '🎬 VIDEO'}
              </span>
              <span className="truncate">{selectedFile.name}</span>
            </span>
          )}

          {autoSaveStatus && (
            <span className="text-[10px] text-[#00e5be] font-mono font-bold animate-pulse">
              {autoSaveStatus}
            </span>
          )}
        </div>

        {/* Center / Non-Blocking Streaming Indicator Banner */}
        {isGenerating ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[#00e5be]/50 bg-[#181920] text-[#00e5be] shadow-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00e5be]" />
            <span className="text-[11px] font-bold">{progressStage}</span>
            {batchProgress && (
              <span className="text-[10px] font-mono font-black px-1.5 py-0.2 bg-[#00e5be] text-black rounded">
                Batch {batchProgress.current}/{batchProgress.total}
              </span>
            )}
            <span className="text-[10px] font-mono opacity-80">({Math.round(progressPercent)}%)</span>
            <span className="text-[10px] font-mono opacity-60">[{elapsedSeconds}s]</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {/* File Dropdown */}
            <div className="relative">
              <button 
                onClick={() => { setShowFileDropdown(!showFileDropdown); setShowSettingsDropdown(false); }}
                className="px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-[#262734] hover:bg-[#181920] text-slate-300 hover:text-white"
              >
                <span>File</span>
                <ChevronDown size={12} />
              </button>

              {showFileDropdown && (
                <div className="absolute top-full left-0 mt-1 w-56 rounded-lg shadow-xl border border-[#262734] p-1 z-50 animate-in fade-in zoom-in-95 duration-150 bg-[#181920] text-slate-200">
                  <button 
                    onClick={() => { fileInputRef.current?.click(); setShowFileDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 cursor-pointer hover:bg-[#22232c] text-slate-200"
                  >
                    <Upload size={13} className="text-[#00e5be]" />
                    <span>Open Media (Video / Audio)...</span>
                  </button>
                  <button 
                    onClick={() => { srtImportRef.current?.click(); setShowFileDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 cursor-pointer hover:bg-[#22232c] text-slate-200"
                  >
                    <FileText size={13} className="text-emerald-400" />
                    <span>Import Subtitle (SRT/VTT)...</span>
                  </button>
                  <div className="h-px my-1 bg-[#262734]" />
                  <button 
                    onClick={() => { setShowExportModal(true); setShowFileDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 font-bold cursor-pointer hover:bg-[#22232c] text-[#00e5be]"
                  >
                    <Download size={13} />
                    <span>Export Subtitles...</span>
                  </button>
                  <div className="h-px my-1 bg-[#262734]" />
                  <button 
                    onClick={() => {
                      if (window.confirm("Clear all current subtitles and remove any saved draft for this video?")) {
                        try {
                          if (selectedFile?.name) {
                            localStorage.removeItem(`karya_subtitle_autosave_${selectedFile.name}`);
                          }
                        } catch (_) {}
                        setEvents([]);
                        setComplianceScore(100);
                        setTotalErrors(0);
                        setTotalWarnings(0);
                        setActiveEventId(null);
                        setPendingDraft(null);
                      }
                      setShowFileDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 font-medium cursor-pointer text-rose-400 hover:bg-rose-950/40`}
                  >
                    <Trash2 size={13} />
                    <span>Clear Subtitles & Draft</span>
                  </button>
                </div>
              )}
            </div>

            {/* Settings Modal Trigger Button */}
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="px-2 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border hover:bg-[#181920] text-slate-300 border-[#262734]"
              title="Configure CPL, CPS, Line Limits & AI Auto-Fix"
            >
              <Settings size={13} className="text-[#00e5be]" />
              <span>Settings</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#00e5be]/15 text-[#00e5be] border border-[#00e5be]/30">
                {cplLimit} CPL · {cpsLimit} CPS
              </span>
            </button>

            {/* Undo / Redo */}
            <div className="flex items-center border border-[#262734] bg-[#14151a] rounded overflow-hidden">
              <button 
                onClick={handleUndo} 
                disabled={historyIndex <= 0}
                className="p-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#1f2638] text-slate-300 hover:text-white"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={13} />
              </button>
              <button 
                onClick={handleRedo} 
                disabled={historyIndex >= history.length - 1}
                className="p-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border-l border-[#262734] hover:bg-[#1f2638] text-slate-300 hover:text-white"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Right Menu Strip (CapCut Aesthetic) */}
        <div className="flex items-center gap-1.5">
          {/* Auto-Fix Button */}
          <button 
            onClick={handleAutoFix}
            disabled={isGenerating || events.length === 0}
            className="px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-emerald-500/40 bg-[#181920] hover:bg-[#22232c] text-emerald-400 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            title="Auto-Fix Netflix Compliance Rules"
          >
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>Auto-Fix</span>
          </button>

          {/* Auto-Generate AI Button */}
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-3 py-1 rounded text-xs font-semibold bg-[#22232c] hover:bg-[#2c2d38] border border-[#00e5be]/50 text-[#00e5be] flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Run Gemini AI Netflix Subtitle Pipeline"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00e5be]" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-[#00e5be]" />
                <span>Auto-Generate</span>
              </>
            )}
          </button>

          {/* Export Button (CapCut Signature Neon Turquoise Action) */}
          <button 
            onClick={() => setShowExportModal(true)}
            disabled={events.length === 0}
            className="px-3.5 py-1 rounded text-xs font-bold bg-[#00e5be] hover:bg-[#00c9a7] text-black flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,229,190,0.25)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export TTML / SRT / VTT"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          {/* Netflix QC Score Capsule */}
          <button 
            onClick={() => setShowQcDrawer(!showQcDrawer)}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              complianceScore >= 98 
                ? 'bg-[#181920] border-emerald-500/50 text-emerald-400' 
                : complianceScore >= 80 
                ? 'bg-[#181920] border-amber-500/50 text-amber-400' 
                : 'bg-[#181920] border-rose-500/50 text-rose-400'
            }`}
            title="Open Netflix Quality Control Dashboard"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>QC: {complianceScore}%</span>
            {totalErrors > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[9px] font-black">
                {totalErrors}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Backend Connection Warning Banner */}
      {backendConnected === false && (
        <div className="px-4 py-2 flex items-center justify-between border-b border-amber-800 bg-amber-950/80 text-amber-200 text-xs shrink-0 z-30 transition-all">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Backend Disconnected:</strong> Could not reach backend at <code className="bg-black/30 px-1 py-0.5 rounded font-mono text-[11px]">{API_BASE || '(relative / localhost)'}</code>. If this is a live deployed website, configure your live Backend API URL.
            </span>
          </div>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            Configure API URL
          </button>
        </div>
      )}

      {/* Draft Restore Notification Banner */}
      {pendingDraft && (
        <div className="px-4 py-2 flex items-center justify-between border-b border-[#262734] bg-[#181920] text-slate-200 text-xs shrink-0 z-30 transition-all">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00e5be] shrink-0" />
            <span>
              Found an earlier saved draft for <strong>{selectedFile?.name}</strong> with {pendingDraft.events?.length || 0} subtitles ({pendingDraft.timestamp ? new Date(pendingDraft.timestamp).toLocaleTimeString() : 'autosaved'}).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEvents(pendingDraft.events || []);
                setComplianceScore(pendingDraft.complianceScore || 100);
                setTotalErrors(pendingDraft.totalErrors || 0);
                setTotalWarnings(pendingDraft.totalWarnings || 0);
                setActiveEventId(pendingDraft.events?.[0]?.id || null);
                setPendingDraft(null);
              }}
              className="px-3 py-1 bg-[#00e5be] hover:bg-[#00c9a7] text-black rounded font-bold cursor-pointer transition-colors shadow-xs"
            >
              Restore Draft
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem(`karya_subtitle_autosave_${selectedFile?.name}`);
                } catch (_) {}
                setPendingDraft(null);
              }}
              className="px-3 py-1 rounded cursor-pointer transition-colors bg-[#22232c] hover:bg-[#2c2d38] text-slate-300"
            >
              Discard & Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* Slim Real-Time Progress Line during Streaming */}
      {isGenerating && (
        <div className="w-full h-1 bg-[#181920] overflow-hidden shrink-0">
          <div 
            className="h-full bg-gradient-to-r from-[#00e5be] via-[#00c9a7] to-[#00b4d8] shadow-[0_0_8px_rgba(0,229,190,0.5)] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* ── Resizable Subtitle Studio Workstation ── */}
      <div className="flex-1 min-h-0 flex flex-col p-1.5 gap-1.5 w-full mx-auto overflow-hidden relative select-none">
        
        {/* Top Resizable Split Area (Left: Subtitle Sheet vs Right: Video + Inspector) */}
        <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">
          
          {/* Left Panel: Subtitle List / Spreadsheet View (Resizable Width) */}
          <div 
            style={{ width: `${leftPanelWidth}px` }} 
            className="shrink-0 flex flex-col h-full overflow-hidden rounded-lg border border-[#262734] bg-[#14151a] shadow-sm transition-colors"
          >
            <SubtitleGridView 
              events={events}
              activeEventId={activeEventId}
              setActiveEventId={setActiveEventId}
              onPlayEvent={handlePlayEvent}
              onUpdateEvent={handleUpdateEvent}
              onDeleteEvent={handleDeleteEvent}
              onBulkDelete={handleBulkDelete}
              onSplitEvent={handleSplitEvent}
              onMergeEvent={handleMergeEvents}
              onRebreakEvent={handleRebreakEvent}
              onAddSubtitle={() => handleAddSubtitle(currentTime)}
              onJumpNextIssue={jumpToNextIssue}
              cplLimit={cplLimit}
              cpsLimit={cpsLimit}
              frameRate={frameRate}
              theme={theme}
            />
          </div>

          {/* ── Vertical Resizer Splitter (Left Subtitles vs Right Video) ── */}
          <div 
            onMouseDown={handleLeftSplitterDown}
            className="w-2 hover:w-2.5 hover:bg-[#00e5be]/40 cursor-col-resize flex items-center justify-center transition-all group z-30 shrink-0"
            title="Drag to resize Subtitle Sheet width"
          >
            <div className="w-0.5 h-10 bg-[#262734] rounded-full group-hover:bg-[#00e5be] transition-colors" />
          </div>

          {/* Right Panel: Full Video Player Viewport */}
          <div className="flex-1 min-w-0 h-full overflow-hidden bg-black rounded-lg border border-[#262734]">
            <VideoPlayer 
              videoUrl={videoUrl}
              events={events}
              activeEventId={activeEventId}
              setActiveEventId={setActiveEventId}
              playTarget={playTarget}
              onTimeUpdate={(t) => setCurrentTime(t)}
              frameRate={frameRate}
              theme={theme}
              isAudio={isAudioFile}
            />
          </div>
        </div>

        {/* ── Horizontal Resizer Splitter (Top Panels vs Bottom Timeline) ── */}
        <div 
          onMouseDown={handleBottomSplitterDown}
          className="h-2 hover:h-2.5 hover:bg-[#00e5be]/40 cursor-row-resize flex items-center justify-center transition-all group z-30 w-full shrink-0"
          title="Drag to resize Timeline height"
        >
          <div className="h-0.5 w-16 bg-[#262734] rounded-full group-hover:bg-[#00e5be] transition-colors" />
        </div>

        {/* Bottom Row: Audio Waveform Timeline with Clean Continuous Waveform & Rectangular Subtitle Boxes */}
        <div style={{ height: `${bottomTimelineHeight}px` }} className="w-full shrink-0 overflow-hidden">
          <AudioWaveformTimeline 
            videoUrl={videoUrl}
            selectedFile={selectedFile}
            videoId={currentVideoId}
            API_BASE={API_BASE}
            isAudio={isAudioFile}
            events={events} 
            shotChanges={shotChanges} 
            duration={videoDuration}
            currentTime={currentTime}
            activeEventId={activeEventId} 
            setActiveEventId={setActiveEventId}
            onEventTimeChange={handleEventTimeChange}
            onSeek={(t) => {
              setCurrentTime(t);
              setPlayTarget({ time: t, pause: true });
            }}
            onAddSubtitleAtTime={handleAddSubtitle}
            onShiftAllFollowing={handleShiftAllFollowing}
            frameRate={frameRate}
            cpsLimit={cpsLimit}
            cplLimit={cplLimit}
            theme={theme}
          />
        </div>

        {/* ── Slide-Over Netflix QC Panel Drawer ── */}
        {showQcDrawer && (
          <div className="fixed inset-y-0 right-0 z-50 w-80 md:w-96 shadow-2xl border-l border-[#262734] bg-[#14151a] text-slate-200 p-4 flex flex-col animate-in slide-in-from-right duration-200">
            <NetflixQCPanel 
              complianceScore={complianceScore}
              totalErrors={totalErrors}
              totalWarnings={totalWarnings}
              totalEvents={events.length}
              cpsStats={cpsStats}
              events={events}
              contentType={contentType}
              cplLimit={cplLimit}
              cpsLimit={cpsLimit}
              onAutoFix={handleAutoFix}
              onGeminiFix={handleGeminiFix}
              isFixingWithGemini={isFixingWithGemini}
              onExport={() => setShowExportModal(true)}
              onJumpToEvent={(id) => {
                setActiveEventId(id);
                handlePlayEvent(id);
                setShowQcDrawer(false);
              }}
              onClose={() => setShowQcDrawer(false)}
            />
          </div>
        )}
      </div>

      {/* ── Subtitle & QC Settings Modal ── */}
      <SubtitleSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        isDark={isDark}
        cplLimit={cplLimit}
        setCplLimit={setCplLimit}
        cpsLimit={cpsLimit}
        setCpsLimit={setCpsLimit}
        maxLines={maxLines}
        setMaxLines={setMaxLines}
        minDuration={minDuration}
        setMinDuration={setMinDuration}
        maxDuration={maxDuration}
        setMaxDuration={setMaxDuration}
        language={language}
        setLanguage={setLanguage}
        contentType={contentType}
        setContentType={setContentType}
        sdhMode={sdhMode}
        setSdhMode={setSdhMode}
        geminiAutoFix={geminiAutoFix}
        setGeminiAutoFix={setGeminiAutoFix}
        onApply={() => {
          if (events && events.length > 0) {
            handleLint(events);
          }
        }}
      />

      {/* ── Export Deliverables Modal ── */}
      {showExportModal && (
        <SubtitleExportModal 
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          events={events}
          complianceScore={complianceScore}
          filename={selectedFile?.name || 'subtitles'}
          API_BASE={API_BASE}
        />
      )}

      {/* ── Auto-Fix Diff Comparison Modal ── */}
      {showDiffModal && (
        <SubtitleDiffModal 
          isOpen={showDiffModal}
          onClose={() => setShowDiffModal(false)}
          originalEvents={originalEvents}
          fixedEvents={events}
          onAccept={() => setShowDiffModal(false)}
          onReject={() => {
            setEvents(originalEvents);
            setShowDiffModal(false);
          }}
        />
      )}
    </div>
  );
}
