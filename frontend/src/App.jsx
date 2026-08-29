import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, FileAudio, Play, Download, AlertCircle,
  CheckCircle2, RefreshCw, Sparkles, BookOpen, Volume2, Package, Check, Layers, Loader2, Database, Save, Timer
} from 'lucide-react';

import Navbar from './components/Navbar';
import AudioWaveform from './components/AudioWaveform';
import SegmentEditor from './components/SegmentEditor';
import ExportModal from './components/ExportModal';
import GuidelinesModal from './components/GuidelinesModal';
import ProjectsModal from './components/ProjectsModal';
import { API_BASE } from './config';

export default function App() {
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Neon DB Project History State
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [dbSaveToast, setDbSaveToast] = useState('');

  const [selectedFile, setSelectedFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [targetLanguage, setTargetLanguage] = useState('Auto-Detect');
  const [targetScript, setTargetScript] = useState('Auto-Detect');
  
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedExportFormats, setSelectedExportFormats] = useState(['csv', 'docx', 'xlsx', 'srt', 'json']);

  // Detailed Progress Bar State with Live Elapsed Time
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [progressStepIndex, setProgressStepIndex] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const progressTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);

  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [segments, setSegments] = useState([]);
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [playTargetTime, setPlayTargetTime] = useState(null);
  const [complianceScore, setComplianceScore] = useState(100.0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [totalWarnings, setTotalWarnings] = useState(0);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (res.ok) {
        const data = await res.json();
        setHasApiKey(data.has_gemini_api_key);
        setTargetLanguage('Auto-Detect');
        setTargetScript('Auto-Detect');
      }
    } catch (err) {
      console.error("Backend connection error:", err);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setTranscriptionResult(null);
      setSegments([]);
      setComplianceScore(100.0);
      setTotalErrors(0);
      setTotalWarnings(0);
      setProgressPercent(0);
    }
  };

  const startProgressSimulation = () => {
    setProgressPercent(5);
    setProgressStage('1. Ingesting & Audio Waveform Inspection');
    setProgressDetail('Reading audio headers, RMS loudness and channel properties...');
    setProgressStepIndex(1);
    setElapsedSeconds(0);

    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

    const startTime = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(parseFloat(((Date.now() - startTime) / 1000).toFixed(1)));
    }, 100);

    progressTimerRef.current = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev < 18) {
          setProgressStage('1. Ingesting Audio & Header Analysis');
          setProgressDetail('Analyzing audio acoustic envelope & format headers...');
          setProgressStepIndex(1);
          return prev + 3;
        } else if (prev < 38) {
          setProgressStage('2. Uploading Stream to Multimodal AI Engine');
          setProgressDetail('Establishing low-latency stream to Gemini multimodal pipeline...');
          setProgressStepIndex(2);
          return prev + 2.5;
        } else if (prev < 65) {
          setProgressStage('3. Acoustic Diarization & Verbatim Transcription');
          setProgressDetail('Distinguishing Speaker 1 vs Speaker 2 & recognizing verbatim phonemes...');
          setProgressStepIndex(3);
          return prev + 1.2;
        } else if (prev < 82) {
          setProgressStage('4. Acoustic Onset / Offset Waveform Calibration');
          setProgressDetail('Snapping segment boundaries to physical RMS energy onset & decay...');
          setProgressStepIndex(4);
          return prev + 0.8;
        } else if (prev < 92) {
          setProgressStage('5. Word-Level Confidence Heatmap Computation');
          setProgressDetail('Evaluating acoustic clarity scores for each transcribed token...');
          setProgressStepIndex(5);
          return prev + 0.5;
        } else if (prev < 98) {
          setProgressStage('6. Karya QA Linter & Final Verification');
          setProgressDetail('Linting script compliance, numbers in words, and punctuation rules...');
          setProgressStepIndex(6);
          return prev + 0.3;
        }
        return prev;
      });
    }, 400);
  };

  const stopProgressSimulation = (success = true) => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (success) {
      setProgressPercent(100);
      setProgressStage('✓ Completed Successfully!');
      setProgressDetail('All segments, confidence heatmap & Karya QA linting ready.');
      setProgressStepIndex(6);
      setTimeout(() => {
        setProgressPercent(0);
      }, 1000);
    } else {
      setProgressPercent(0);
    }
  };

  const handleStartTranscribe = async () => {
    if (!selectedFile) return;
    setIsTranscribing(true);
    startProgressSimulation();

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('language', targetLanguage);
    formData.append('script', targetScript);

    try {
      const res = await fetch(`${API_BASE}/api/transcribe`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setTranscriptionResult(data);
        setSegments(data.segments || []);
        setComplianceScore(data.compliance_score || 100.0);
        setTotalErrors(data.total_errors || 0);
        setTotalWarnings(data.total_warnings || 0);
        if (data.segments && data.segments.length > 0) {
          setActiveSegmentId(data.segments[0].segment_id);
        }
        stopProgressSimulation(true);
      } else {
        stopProgressSimulation(false);
        let errorMsg = 'Failed to process audio';
        try {
          const errData = await res.json();
          errorMsg = errData.detail || errorMsg;
        } catch (e) {
          try {
            const errText = await res.text();
            if (errText) errorMsg = errText;
          } catch (textErr) {}
        }
        alert(`Transcription error: ${errorMsg}`);
      }
    } catch (err) {
      stopProgressSimulation(false);
      console.error("Transcribe failed:", err);
      alert(`Transcription request failed: ${err.message || err}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleLint = async (updatedSegments) => {
    try {
      const res = await fetch(`${API_BASE}/api/lint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: updatedSegments,
          language: transcriptionResult?.language || targetLanguage || 'Hindi',
          script: transcriptionResult?.script || targetScript || 'Devanagari'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSegments(data.segments);
        setComplianceScore(data.compliance_score);
        setTotalErrors(data.total_errors);
        setTotalWarnings(data.total_warnings);

        if (transcriptionResult) {
          setTranscriptionResult({
            ...transcriptionResult,
            segments: data.segments,
            compliance_score: data.compliance_score,
            total_errors: data.total_errors,
            total_warnings: data.total_warnings
          });
        }
      }
    } catch (err) {
      console.error("Lint failed:", err);
    }
  };

  const toggleExportFormat = (fmtId) => {
    if (selectedExportFormats.includes(fmtId)) {
      if (selectedExportFormats.length > 1) {
        setSelectedExportFormats(selectedExportFormats.filter((f) => f !== fmtId));
      }
    } else {
      setSelectedExportFormats([...selectedExportFormats, fmtId]);
    }
  };

  const handleMultiExport = async () => {
    if (segments.length === 0) return;
    setIsExporting(true);

    try {
      const payloadResult = {
        audio_id: transcriptionResult?.audio_id || 'audio_001',
        filename: selectedFile ? selectedFile.name : (transcriptionResult?.filename || 'audio_transcript.wav'),
        language: transcriptionResult?.language || targetLanguage || 'Hindi',
        script: transcriptionResult?.script || targetScript || 'Devanagari',
        segments: segments,
        compliance_score: complianceScore,
        total_errors: totalErrors,
        total_warnings: totalWarnings,
        audio_info: transcriptionResult?.audio_info || {
          filename: selectedFile ? selectedFile.name : 'audio.wav',
          duration: segments.length > 0 ? segments[segments.length - 1].end_time : 0,
          sample_rate: 16000,
          channels: 1,
          rms_db: -20.0,
          snr_db: 25.0
        }
      };

      const res = await fetch(`${API_BASE}/api/export/multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: payloadResult,
          formats: selectedExportFormats
        })
      });

      if (res.ok) {
        const blob = await res.blob();
        const baseName = payloadResult.filename.replace(/\.[^/.]+$/, "");
        const disposition = res.headers.get('Content-Disposition') || '';
        let filename = `${baseName}_deliverables.zip`;
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert("Failed to export deliverables.");
      }
    } catch (err) {
      console.error("Multi export failed:", err);
      alert("Export failed: " + err);
    } finally {
      setIsExporting(false);
    }
  };

  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects`);
      if (res.ok) {
        const data = await res.json();
        setSavedProjects(data.projects || []);
      }
    } catch (err) {
      console.error("Failed to fetch Neon DB projects:", err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleOpenProjects = () => {
    fetchProjects();
    setShowProjectsModal(true);
  };

  const handleSaveToNeonDb = async () => {
    if (segments.length === 0) return;
    setIsSavingToDb(true);
    try {
      const payloadResult = {
        audio_id: transcriptionResult?.audio_id || 'audio_001',
        filename: selectedFile ? selectedFile.name : (transcriptionResult?.filename || 'audio_transcript.wav'),
        language: transcriptionResult?.language || targetLanguage || 'Hindi',
        script: transcriptionResult?.script || targetScript || 'Devanagari',
        segments: segments,
        compliance_score: complianceScore,
        total_errors: totalErrors,
        total_warnings: totalWarnings,
        audio_info: transcriptionResult?.audio_info || {
          filename: selectedFile ? selectedFile.name : 'audio.wav',
          duration: segments.length > 0 ? segments[segments.length - 1].end_time : 0,
          sample_rate: 16000,
          channels: 1,
          rms_db: -20.0,
          snr_db: 25.0
        }
      };

      const res = await fetch(`${API_BASE}/api/projects/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: payloadResult })
      });

      if (res.ok) {
        setDbSaveToast('Saved to Neon PostgreSQL DB!');
        setTimeout(() => setDbSaveToast(''), 3500);
      }
    } catch (err) {
      console.error("Save to Neon DB failed:", err);
    } finally {
      setIsSavingToDb(false);
    }
  };

  const handleLoadProject = async (projectId) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setTranscriptionResult(data);
        setSegments(data.segments || []);
        setTargetLanguage(data.language || 'Auto-Detect');
        setTargetScript(data.script || 'Auto-Detect');
        setComplianceScore(data.compliance_score || 100.0);
        setTotalErrors(data.total_errors || 0);
        setTotalWarnings(data.total_warnings || 0);
        if (data.segments && data.segments.length > 0) {
          setActiveSegmentId(data.segments[0].segment_id);
        }
        if (data.filename) {
          setAudioUrl(`${API_BASE}/api/audio/${data.filename}`);
        }
        setDbSaveToast(`Loaded: ${data.filename}`);
        setTimeout(() => setDbSaveToast(''), 3500);
      }
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm("Are you sure you want to delete this project from Neon DB?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  const handleSegmentTimeChange = (segId, newStart, newEnd) => {
    const formatTimeStr = (secs) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      const ms = Math.floor((secs % 1) * 1000);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    setSegments((prevSegments) => {
      const updated = prevSegments.map((s) => {
        if (s.segment_id === segId) {
          const s_time = Math.max(0, Math.round(newStart * 1000) / 1000);
          const e_time = Math.max(s_time + 0.1, Math.round(newEnd * 1000) / 1000);
          return {
            ...s,
            start_time: s_time,
            end_time: e_time,
            duration: Math.round((e_time - s_time) * 1000) / 1000,
            start_time_str: formatTimeStr(s_time),
            end_time_str: formatTimeStr(e_time)
          };
        }
        return s;
      });

      if (transcriptionResult) {
        setTranscriptionResult((prevRes) => ({
          ...prevRes,
          segments: updated
        }));
      }

      return updated;
    });
  };

  const handleSplitSegmentAtTime = (segId, splitTime) => {
    const formatTimeStr = (secs) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      const ms = Math.floor((secs % 1) * 1000);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    setSegments((prev) => {
      const targetSeg = prev.find((s) => s.segment_id === segId);
      if (!targetSeg) return prev;

      const split = Math.max(
        targetSeg.start_time + 0.1,
        Math.min(targetSeg.end_time - 0.1, splitTime || (targetSeg.start_time + targetSeg.end_time) / 2)
      );
      const words = (targetSeg.transcript || '').trim().split(/\s+/);
      const half = Math.ceil(words.length / 2);
      const text1 = words.slice(0, half).join(' ');
      const text2 = words.slice(half).join(' ');

      const newSegments = [];
      prev.forEach((s) => {
        if (s.segment_id === segId) {
          newSegments.push({
            ...s,
            end_time: split,
            duration: parseFloat((split - s.start_time).toFixed(3)),
            start_time_str: formatTimeStr(s.start_time),
            end_time_str: formatTimeStr(split),
            transcript: text1,
            words: []
          });
          newSegments.push({
            ...s,
            segment_id: s.segment_id + 0.5,
            start_time: parseFloat((split + 0.05).toFixed(3)),
            end_time: s.end_time,
            duration: parseFloat((s.end_time - split - 0.05).toFixed(3)),
            start_time_str: formatTimeStr(split + 0.05),
            end_time_str: formatTimeStr(s.end_time),
            transcript: text2,
            words: []
          });
        } else {
          newSegments.push(s);
        }
      });

      const reindexed = newSegments.map((s, idx) => ({ ...s, segment_id: idx + 1 }));
      if (transcriptionResult) {
        setTranscriptionResult((prevRes) => ({ ...prevRes, segments: reindexed }));
      }
      handleLint(reindexed);
      return reindexed;
    });
  };

  const handleMergeSegmentWithNext = (segId) => {
    const formatTimeStr = (secs) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      const ms = Math.floor((secs % 1) * 1000);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };

    setSegments((prev) => {
      const index = prev.findIndex((s) => s.segment_id === segId);
      if (index === -1 || index >= prev.length - 1) return prev;

      const current = prev[index];
      const next = prev[index + 1];

      const merged = {
        ...current,
        end_time: next.end_time,
        duration: parseFloat((next.end_time - current.start_time).toFixed(3)),
        start_time_str: formatTimeStr(current.start_time),
        end_time_str: formatTimeStr(next.end_time),
        transcript: `${current.transcript || ''} ${next.transcript || ''}`.trim(),
        words: [...(current.words || []), ...(next.words || [])]
      };

      const newSegments = [...prev];
      newSegments.splice(index, 2, merged);
      const reindexed = newSegments.map((s, idx) => ({ ...s, segment_id: idx + 1 }));
      if (transcriptionResult) {
        setTranscriptionResult((prevRes) => ({ ...prevRes, segments: reindexed }));
      }
      handleLint(reindexed);
      return reindexed;
    });
  };

  return (
    <div className="min-h-screen bg-slate-100/60 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar (Ultra Compact) */}
      <Navbar
        hasApiKey={hasApiKey}
        setShowGuidelines={setShowGuidelines}
        onOpenProjects={handleOpenProjects}
        currentFilename={selectedFile ? selectedFile.name : null}
        segmentCount={segments.length}
        complianceScore={segments.length > 0 ? complianceScore : null}
        totalErrors={totalErrors}
        totalWarnings={totalWarnings}
      />

      {/* Main Studio Area (Maximized Screen Height & Space) */}
      <main className="flex-1 w-full px-2 sm:px-4 py-2 space-y-2 flex flex-col">
        {/* Unified Top Control Toolbar (Single Line, Ultra Compact) */}
        <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            
            {/* Group 1: Ingestion & Transcribe */}
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="file"
                id="main-file-input"
                accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.aac"
                onChange={handleFileSelect}
                className="hidden"
              />
              <label
                htmlFor="main-file-input"
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all shadow-2xs active:scale-95 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{selectedFile ? 'Change' : 'Upload Audio'}</span>
              </label>

              {selectedFile && (
                <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 text-[11px] font-bold text-slate-800 max-w-[180px] truncate">
                  <FileAudio className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span className="truncate">{selectedFile.name}</span>
                </div>
              )}

              {/* Language Selector */}
              <div className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-400">Lang:</span>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="bg-slate-50 border border-slate-300 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800 cursor-pointer"
                >
                  <option value="Auto-Detect">⚡ Auto-Detect</option>
                  <option value="Hindi">Hindi (हिन्दी)</option>
                  <option value="English">English</option>
                  <option value="Marathi">Marathi (मराठी)</option>
                  <option value="Bengali">Bengali (বাংলা)</option>
                  <option value="Tamil">Tamil (தமிழ்)</option>
                  <option value="Telugu">Telugu (తెలుగు)</option>
                  <option value="Gujarati">Gujarati (ગુજરાતી)</option>
                  <option value="Kannada">Kannada (ಕನ್ನಡ)</option>
                </select>
              </div>

              {/* Script Selector */}
              <div className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-400">Script:</span>
                <select
                  value={targetScript}
                  onChange={(e) => setTargetScript(e.target.value)}
                  className="bg-slate-50 border border-slate-300 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800 cursor-pointer"
                >
                  <option value="Auto-Detect">⚡ Auto-Detect</option>
                  <option value="Devanagari">Devanagari</option>
                  <option value="Latin">Latin / English</option>
                  <option value="Bengali">Bengali</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Telugu">Telugu</option>
                  <option value="Gujarati">Gujarati</option>
                  <option value="Kannada">Kannada</option>
                </select>
              </div>

              {/* Transcribe Button */}
              <button
                onClick={handleStartTranscribe}
                disabled={!selectedFile || isTranscribing}
                className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-transform active:scale-95 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                {isTranscribing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                    <span>Transcribing ({progressPercent.toFixed(0)}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span>Auto-Transcribe</span>
                  </>
                )}
              </button>
            </div>

            {/* Group 2: Export & Save */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 hidden sm:inline mr-0.5">Export:</span>

              {[
                { id: 'csv', label: 'CSV' },
                { id: 'docx', label: 'DOCX' },
                { id: 'xlsx', label: 'XLSX' },
                { id: 'srt', label: 'SRT' },
                { id: 'json', label: 'JSON' }
              ].map((fmt) => {
                const isSelected = selectedExportFormats.includes(fmt.id);
                return (
                  <button
                    key={fmt.id}
                    onClick={() => toggleExportFormat(fmt.id)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {fmt.label}
                  </button>
                );
              })}

              {/* Download Selected Button */}
              <button
                onClick={handleMultiExport}
                disabled={segments.length === 0 || isExporting}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition-transform active:scale-95 disabled:opacity-40 cursor-pointer ml-1 whitespace-nowrap"
              >
                {isExporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />}
                <span>Download ({selectedExportFormats.length})</span>
              </button>

              {/* Save to Neon DB Button */}
              {segments.length > 0 && (
                <button
                  onClick={handleSaveToNeonDb}
                  disabled={isSavingToDb}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold shadow-2xs transition-transform active:scale-95 cursor-pointer ml-1 whitespace-nowrap"
                  title="Save current edits to Neon PostgreSQL Cloud DB"
                >
                  {isSavingToDb ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  <span>Save to Neon</span>
                </button>
              )}
            </div>
          </div>

          {/* High-Detail Realistic Live Telemetry Progress Bar */}
          {isTranscribing && (
            <div className="mt-2 pt-2 border-t border-slate-200 space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  <span className="font-bold text-slate-900">{progressStage}</span>
                  <span className="text-[11px] text-slate-500 hidden md:inline">— {progressDetail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">
                    <Timer className="w-3 h-3 text-indigo-600" />
                    <span>Elapsed: {elapsedSeconds.toFixed(1)}s</span>
                  </span>
                  <span className="font-mono font-black text-indigo-600 text-xs bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {progressPercent.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Progress Track */}
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 rounded-full transition-all duration-300 ease-out shadow-xs"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* 6-Step Pipeline Badges */}
              <div className="grid grid-cols-6 gap-1 pt-0.5 text-[10px] text-center font-medium">
                {[
                  { step: 1, label: '1. Ingest' },
                  { step: 2, label: '2. Upload' },
                  { step: 3, label: '3. Diarize' },
                  { step: 4, label: '4. Onset Align' },
                  { step: 5, label: '5. Heatmap' },
                  { step: 6, label: '6. QC Lint' }
                ].map((s) => (
                  <div
                    key={s.step}
                    className={`py-0.5 rounded transition-all truncate px-0.5 ${
                      progressStepIndex >= s.step
                        ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                        : 'bg-slate-50 text-slate-400 border border-transparent'
                    }`}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Persistent Sticky Waveform Player Bar */}
        <div className="sticky top-[42px] z-30">
          {audioUrl ? (
            <AudioWaveform
              audioUrl={audioUrl}
              segments={segments}
              currentSegmentId={activeSegmentId}
              setActiveSegmentId={setActiveSegmentId}
              onSegmentClick={(seg) => setActiveSegmentId(seg.segment_id)}
              onSegmentTimeChange={handleSegmentTimeChange}
              onSplitSegment={handleSplitSegmentAtTime}
              onMergeSegment={handleMergeSegmentWithNext}
              playTargetTime={playTargetTime}
            />
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-3 text-center text-slate-400 shadow-2xs">
              <p className="text-xs font-medium">
                Upload an audio file above to load the interactive waveform and player.
              </p>
            </div>
          )}
        </div>

        {/* Full-Width Spacious Conversational Segments Workspace */}
        <div className="flex-1 flex flex-col min-h-0">
          <SegmentEditor
            segments={segments}
            setSegments={setSegments}
            activeSegmentId={activeSegmentId}
            setActiveSegmentId={setActiveSegmentId}
            onPlaySegment={(start, end) => {
              setPlayTargetTime({ time: start, endTime: end, loop: true, ts: Date.now() });
            }}
            onStopSegment={(start) => {
              setPlayTargetTime({ time: start, endTime: start, loop: false, pause: true, ts: Date.now() });
            }}
            onLintTrigger={handleLint}
            onStartTranscribe={handleStartTranscribe}
            audioLoaded={!!selectedFile}
          />
        </div>
      </main>

      {/* Modals */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        transcriptionResult={transcriptionResult || {
          filename: selectedFile ? selectedFile.name : 'audio_transcript',
          language: targetLanguage,
          script: targetScript,
          segments: segments,
          compliance_score: complianceScore,
          total_errors: totalErrors,
          total_warnings: totalWarnings,
          audio_info: { duration: 0, sample_rate: 16000, channels: 1, rms_db: -20, snr_db: 25 }
        }}
      />

      <GuidelinesModal
        isOpen={showGuidelines}
        onClose={() => setShowGuidelines(false)}
      />

      <ProjectsModal
        isOpen={showProjectsModal}
        onClose={() => setShowProjectsModal(false)}
        projects={savedProjects}
        isLoading={isLoadingProjects}
        onRefresh={fetchProjects}
        onLoadProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
      />

      {/* Floating Save / Action Toast */}
      {dbSaveToast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-slate-900 text-white px-3.5 py-2 rounded-xl shadow-xl border border-slate-700 text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{dbSaveToast}</span>
        </div>
      )}
    </div>
  );
}
