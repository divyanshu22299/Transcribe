/**
 * Subtitle parser utility (SRT and WebVTT).
 * Converts raw subtitle text into standard segment objects.
 */

function parseTime(timeStr) {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return parseFloat((hours * 3600 + minutes * 60 + seconds).toFixed(3));
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return parseFloat((minutes * 60 + seconds).toFixed(3));
  }
  return parseFloat(clean) || 0;
}

function formatTimestampStr(secs) {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function parseSubtitles(text) {
  if (!text || typeof text !== 'string') return [];

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

  const segments = [];
  let segmentId = 1;

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    if (lines[0].toUpperCase().startsWith('WEBVTT')) continue;

    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1) continue;

    const timeLine = lines[timeLineIdx];
    const [startRaw, endRaw] = timeLine.split('-->').map(s => s.trim().split(/\s+/)[0]);
    const startTime = parseTime(startRaw);
    const endTime = parseTime(endRaw);
    const duration = parseFloat(Math.max(0.1, endTime - startTime).toFixed(3));

    const textLines = lines.slice(timeLineIdx + 1);
    let fullText = textLines.join(' ').trim();

    let speaker = 'Speaker 1';
    let gender = 'Male';

    const bracketMatch = fullText.match(/^\[(.*?)\]\s*(.*)$/);
    const colonMatch = fullText.match(/^([A-Za-z0-9\s_]+):\s*(.*)$/);

    if (bracketMatch) {
      speaker = bracketMatch[1].trim();
      fullText = bracketMatch[2].trim();
    } else if (colonMatch && colonMatch[1].length < 30) {
      speaker = colonMatch[1].trim();
      fullText = colonMatch[2].trim();
    }

    if (speaker.toLowerCase().includes('female') || speaker.toLowerCase().includes('woman')) {
      gender = 'Female';
    }

    segments.push({
      segment_id: segmentId++,
      speaker: speaker || 'Speaker 1',
      gender: gender,
      start_time: startTime,
      end_time: endTime,
      start_time_str: formatTimestampStr(startTime),
      end_time_str: formatTimestampStr(endTime),
      duration: duration,
      transcript: fullText,
      confidence: 0.95,
      words: fullText.split(/\s+/).filter(Boolean).map(w => ({ word: w, confidence: 0.95 })),
      qc_errors: [],
      is_valid: true
    });
  }

  return segments;
}
