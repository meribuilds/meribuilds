/* reelcut ~ transcript-driven vlog cutter with effects, music and sound. Vanilla JS, no build step. */
(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (s, tenths = true) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${tenths ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0')}`; };
const FILLERS = new Set(['um', 'uh', 'umm', 'uhh', 'hmm', 'like', 'literally', 'basically', 'actually', 'so', 'yeah', 'okay', 'ok', 'right', 'well']);
const PAUSE_PRESETS = { none: { gap: Infinity, pad: 0.15 }, tight: { gap: 0.6, pad: 0.08 }, tighter: { gap: 0.35, pad: 0.04 } };
const GRADES = { none: '', warm: 'brightness(1.06) contrast(1.05) saturate(1.15) sepia(0.12)', bright: 'brightness(1.12) contrast(1.03) saturate(1.08)', film: 'contrast(1.12) saturate(0.85) sepia(0.22)', pop: 'contrast(1.15) saturate(1.45)', cool: 'saturate(1.05) hue-rotate(-8deg) brightness(1.03)', mono: 'grayscale(1) contrast(1.1)' };
const RATIOS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };
const ACCENTS = { purple: { a: '#7C3AED', b: '#D946EF', lilac: '#E9D5FF', ink: '#1E1B2E' }, blush: { a: '#A96674', b: '#E8C2C4', lilac: '#F3DEDE', ink: '#3B2A20' }, udream: { a: '#9B3B48', b: '#F7C81E', lilac: '#FDE9B0', ink: '#1E1B2E' } };
const TRANS_D = 0.4;
const EMBED = /[?&]embed=1/.test(location.search); if (EMBED) document.body.classList.add('embed');

/* ---------- state ---------- */
const media = { file: null, url: null, duration: 0, w: 0, h: 0, thumbs: [], thumbStep: 4 };
let state = freshState();
function freshState() {
  return {
    name: 'untitled-reel', words: [], phrases: [], order: [], pauses: 'tight',
    hook: { on: true, style: 'abie', show: 'whole', small: '', big: '', sub: '', x: 50, y: 16, size: 1 },
    captions: { on: true, template: 'abie2', words: 4, size: 1, x: 50, y: 74, case: 'as-is' },
    stickers: [], ig: { user: 'meri.builds', caption: 'how I run my week with AI ~ no jargon' },
    fx: [], fxAccent: 'purple', grade: 'none', ratio: '9:16', progress: false,
    endCard: { on: false, style: 'brand', title: '', sub: '', d: 2.5 },
    music: { mode: 'none', mood: 'chill', bpm: 96, seed: 1, vol: 0.22, duck: true, fileName: '' },
    sfx: { on: true, vol: 0.6 }, voiceVol: 1,
  };
}
const history = { undo: [], redo: [] };
function snapshot() { return JSON.stringify(state); }
function commit() { history.undo.push(snapshot()); if (history.undo.length > 120) history.undo.shift(); history.redo = []; afterChange(); }
function undo() { if (!history.undo.length) return; history.redo.push(snapshot()); state = JSON.parse(history.undo.pop()); afterChange(true); }
function redo() { if (!history.redo.length) return; history.undo.push(snapshot()); state = JSON.parse(history.redo.pop()); afterChange(true); }
const outSize = () => RATIOS[state.ratio] || RATIOS['9:16'];

/* ---------- segments (the cut) ---------- */
let segments = [];
function computeSegments() {
  const preset = PAUSE_PRESETS[state.pauses] || PAUSE_PRESETS.tight; const segs = [];
  for (const id of state.order) {
    const p = state.phrases.find((q) => q.id === id); if (!p || !p.keep) continue;
    const dropped = new Set(p.dropped || []); let run = []; const runs = [];
    const flush = () => { if (run.length) runs.push(run); run = []; };
    for (let i = p.from; i <= p.to; i++) { if (dropped.has(i)) { flush(); continue; } if (run.length) { const prev = state.words[run[run.length - 1]], cur = state.words[i]; if (cur.s - prev.e > preset.gap) flush(); } run.push(i); }
    flush();
    runs.forEach((r, ri) => { const first = state.words[r[0]], last = state.words[r[r.length - 1]]; let start = Math.max(0, first.s - preset.pad), end = Math.min(media.duration || Infinity, last.e + preset.pad); if (ri === 0) start += p.trimIn || 0; if (ri === runs.length - 1) end -= p.trimOut || 0; if (end - start < 0.1) end = start + 0.1; segs.push({ start, end, phraseId: p.id, rotate: p.rotate || 0, zoom: p.zoom || 1, transition: p.transition || 'cut', words: r, first: ri === 0, last: ri === runs.length - 1 }); });
  }
  const merged = [];
  for (const s of segs) { const last = merged[merged.length - 1]; if (last && last.phraseId === s.phraseId && s.start <= last.end + 0.02) { last.end = Math.max(last.end, s.end); last.words.push(...s.words); last.last = s.last; } else merged.push({ ...s, words: [...s.words] }); }
  let t = 0; for (const s of merged) { s.dur = Math.max(0.05, s.end - s.start); s.cutStart = t; t += s.dur; }
  segments = merged; return merged;
}
const cutDuration = () => segments.reduce((a, s) => a + s.dur, 0);
const endDur = () => (state.endCard.on && segments.length ? +state.endCard.d || 2.5 : 0);
const totalDuration = () => cutDuration() + endDur();
function segAtCut(ct) { for (const s of segments) if (ct < s.cutStart + s.dur) return s; return null; }
function cutToSrc(ct) { const s = segAtCut(ct) || segments[segments.length - 1]; return s ? s.start + clamp(ct - s.cutStart, 0, s.dur) : 0; }
function hookEnd() { const total = cutDuration(); if (!state.hook.on || !segments.length) return 0; if (state.hook.show === 'whole') return total; if (state.hook.show === 'first') return segments[0].dur; return Math.min(total, Number(state.hook.show)); }
function capStart() { return state.hook.on && state.hook.show !== 'whole' ? hookEnd() : 0; }
let chunks = [];
function computeChunks() {
  chunks = []; const per = Number(state.captions.words) || 4;
  for (const seg of segments) {
    let cur = []; const push = () => { if (cur.length) { chunks.push({ s: cur[0].s, e: cur[cur.length - 1].e, words: cur }); cur = []; } };
    for (const wi of seg.words) { const w = state.words[wi]; const s = seg.cutStart + clamp(w.s - seg.start, 0, seg.dur), e = seg.cutStart + clamp(w.e - seg.start, 0, seg.dur); cur.push({ t: w.t, s, e }); if (cur.length >= per || /[.!?,;:]$/.test(w.t)) push(); }
    push();
  }
  for (let i = 0; i < chunks.length; i++) { const nx = chunks[i + 1]; const limit = nx ? nx.s : cutDuration(); chunks[i].e = Math.min(limit, Math.max(chunks[i].e, chunks[i].s + 0.4)); }
}
function chunkAt(ct) { if (ct < capStart()) return null; for (const c of chunks) if (ct >= c.s && ct < c.e) return c; return null; }
function caseWord(t) { const c = state.captions.case; return c === 'upper' ? t.toUpperCase() : c === 'lower' ? t.toLowerCase() : t; }
const cueAt = (ct) => state.fx.find((c) => ct >= c.at && ct < c.at + (c.d || 2.15) && c.k !== 'sound');

/* ---------- transcript → phrases ---------- */
function buildPhrases(words) { const phrases = []; let from = 0; for (let i = 0; i < words.length; i++) { const w = words[i], nx = words[i + 1]; const end = !nx || /[.!?]$/.test(w.t) || (nx.s - w.e > 0.9) || (i - from >= 13 && /[,;:]$/.test(w.t)) || i - from >= 22; if (end) { phrases.push(mkPhrase(phrases.length + 1, from, i)); from = i + 1; } } return phrases; }
function mkPhrase(n, from, to) { return { id: 'C1S' + String(n).padStart(3, '0'), from, to, keep: true, rotate: 0, dropped: [], zoom: 1, transition: 'cut', trimIn: 0, trimOut: 0 }; }
function setTranscript(words) {
  words = words.filter((w) => w.t && w.t.trim()).map((w) => ({ t: w.t.trim(), s: Math.max(0, +w.s || 0), e: Math.max(+w.s || 0, +w.e || 0) }));
  for (let i = 0; i < words.length; i++) if (words[i].e <= words[i].s) words[i].e = words[i].s + 0.25;
  state.words = words; state.phrases = buildPhrases(words); state.order = state.phrases.map((p) => p.id); commit(); setTab('words');
}
function parseTranscript(text, name) {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    const j = JSON.parse(text);
    if (j.words && Array.isArray(j.words)) return j.words.map((w) => ({ t: w.word ?? w.text ?? w.t, s: w.start ?? w.s, e: w.end ?? w.e }));
    if (j.segments) { const out = []; for (const sg of j.segments) { if (sg.words) for (const w of sg.words) out.push({ t: w.word ?? w.text, s: w.start, e: w.end }); else out.push(...spread(sg.text, sg.start, sg.end)); } return out; }
    if (j.chunks) return j.chunks.map((c) => ({ t: c.text, s: c.timestamp[0], e: c.timestamp[1] ?? c.timestamp[0] + 0.3 }));
    if (Array.isArray(j)) return j.map((w) => ({ t: w.word ?? w.text ?? w.t, s: w.start ?? w.s, e: w.end ?? w.e }));
    throw new Error('Unknown JSON transcript shape');
  }
  const out = []; const re = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
  const toS = (h, m, s, ms) => (parseInt(h || '0') * 3600) + parseInt(m) * 60 + parseInt(s) + parseInt(String(ms).padEnd(3, '0')) / 1000;
  for (const b of text.replace(/\r/g, '').split(/\n\s*\n/)) { const lines = b.split('\n'); const ti = lines.findIndex((l) => re.test(l)); if (ti < 0) continue; const m = lines[ti].match(re); const s = toS(m[1], m[2], m[3], m[4]), e = toS(m[5], m[6], m[7], m[8]); const txt = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim(); if (txt) out.push(...spread(txt, s, e)); }
  if (!out.length) throw new Error('No timed lines found. Use .srt, .vtt or Whisper .json');
  return out;
}
function spread(text, s, e) { const ws = text.split(/\s+/).filter(Boolean); const d = (e - s) / Math.max(1, ws.length); return ws.map((t, i) => ({ t, s: s + i * d, e: s + (i + 1) * d })); }

/* ---------- audio extraction + transcription ---------- */
async function extractAudio(onStatus) {
  if (media.file.size > 1.5e9) throw new Error('this video is over 1.5 GB, which is too big to read in the browser. Upload a transcript instead, or export a shorter or smaller copy from your phone');
  onStatus('Reading audio from the video…'); const buf = await media.file.arrayBuffer();
  const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 16000 * Math.max(1, Math.ceil(media.duration || 60)), 16000);
  const decoded = await ctx.decodeAudioData(buf); const src = ctx.createBufferSource(); src.buffer = decoded; src.connect(ctx.destination); src.start();
  const rendered = await ctx.startRendering(); return rendered.getChannelData(0).slice(0, Math.ceil(decoded.duration * 16000));
}
function pcmToWav(f32, rate = 16000, channels = 1) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2 * channels, true); v.setUint16(32, 2 * channels, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = clamp(f32[i], -1, 1); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
async function transcribeViaApi() {
  const key = $('apiKey').value.trim(); if (!key) return toast('Paste an OpenAI API key first'); if (!media.file) return toast('Add a video first');
  try { localStorage.setItem('reelcut:key', key); } catch {}
  setBusy(true);
  try { const pcm = await extractAudio(trStatus); const wav = pcmToWav(pcm); if (wav.size > 24.5e6) throw new Error('OpenAI accepts about 13 minutes of audio at a time. Use the in-browser option or upload a transcript'); trStatus('Uploading audio to OpenAI Whisper…'); const fd = new FormData(); fd.append('file', wav, 'audio.wav'); fd.append('model', 'whisper-1'); fd.append('response_format', 'verbose_json'); fd.append('timestamp_granularities[]', 'word'); const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd }); if (!r.ok) throw new Error('OpenAI said ' + r.status + ': ' + (await r.text()).slice(0, 200)); const j = await r.json(); setTranscript(parseTranscript(JSON.stringify(j), 'x.json')); trStatus('Transcribed ' + state.words.length + ' words.'); }
  catch (e) { trStatus('Failed: ' + e.message); toast('Transcription failed'); }
  setBusy(false);
}
let worker = null;
async function transcribeLocal() {
  if (!media.file) return toast('Add a video first'); setBusy(true); $('trProgress').hidden = false;
  try { const pcm = await extractAudio(trStatus); trStatus('Loading the speech model (first time downloads it)…'); if (!worker) worker = new Worker('whisper-worker.js', { type: 'module' }); const words = await new Promise((res, rej) => { worker.onmessage = (ev) => { const m = ev.data; if (m.type === 'progress') { trStatus(m.text); if (m.pct != null) $('trProgress').firstElementChild.style.width = m.pct + '%'; } else if (m.type === 'done') res(m.words); else if (m.type === 'error') rej(new Error(m.message)); }; worker.onerror = (e) => rej(new Error(e.message || 'worker failed')); worker.postMessage({ type: 'run', audio: pcm, model: $('localModel').value }, [pcm.buffer]); }); setTranscript(words); trStatus('Transcribed ' + words.length + ' words in your browser.'); }
  catch (e) { trStatus('Failed: ' + e.message + '. Try the upload or API option.'); toast('In-browser transcription failed'); }
  $('trProgress').hidden = true; setBusy(false);
}
function trStatus(t) { $('trStatus').textContent = t; }
function setBusy(b) { for (const id of ['transcribeApi', 'transcribeLocal']) $(id).disabled = b; }

/* ---------- video loading + filmstrip ---------- */
const video = $('video'), tv = $('thumbVideo');
for (const ev of ['seeked', 'loadeddata', 'canplay']) video.addEventListener(ev, () => { dirty = true; });
const VIDEO_EXT = /\.(mp4|m4v|mov|qt|hevc|heic|mkv|webm|avi|3gp|mts|m2ts)$/i, AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|oga|flac|opus)$/i;
const isVideoFile = (f) => !!f && ((f.type || '').startsWith('video/') || VIDEO_EXT.test(f.name || ''));
const isAudioFile = (f) => !!f && ((f.type || '').startsWith('audio/') || AUDIO_EXT.test(f.name || ''));
function phoneMessage(html) { const n = $('emptyState'); n.hidden = false; n.innerHTML = '<div>' + html + '</div>'; return n; }
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// waits for the browser to open the file; a video it cannot decode (often iPhone HEVC) opens with no picture
function probeVideo() {
  return new Promise((res) => {
    let done = false; const finish = (r) => { if (done) return; done = true; clearTimeout(t); video.removeEventListener('loadedmetadata', onMeta); video.removeEventListener('error', onErr); res(r); };
    const onErr = () => finish({ ok: false, why: 'error', code: video.error && video.error.code });
    const onMeta = () => { if (!video.videoWidth || !video.videoHeight) { setTimeout(() => finish(video.videoWidth ? { ok: true } : { ok: false, why: 'nopicture' }), 600); } else finish({ ok: true }); };
    const t = setTimeout(() => finish({ ok: false, why: 'timeout' }), 20000);
    video.addEventListener('loadedmetadata', onMeta); video.addEventListener('error', onErr);
  });
}
function showUnplayable(file, r) {
  const big = file.size > 1.2e9; const mb = Math.round(file.size / 1e6);
  const why = r.why === 'timeout' ? 'The browser could not open this file.' : 'This browser can open the file but cannot show its picture.';
  phoneMessage(`<b>This video won't play here</b>${why} Phone videos are usually saved as HEVC, which many browsers can't play.<br><br>
    <button class="btn primary sm" id="convertBtn" type="button"${big ? ' disabled' : ''}>Convert to MP4 here</button><br><span class="help" style="color:#d9c6bd">${big ? `This file is ${mb} MB, too big to convert in the browser.` : `${isFinite(video.duration) && video.duration > 0 ? `Usually takes about ${Math.max(1, Math.round(video.duration * 1.2 / 60))} min for this ${fmt(video.duration, false)} video.` : 'Usually takes about as long as the video.'} Nothing is uploaded.`}</span><br><br>
    <span style="font-size:12px">Other fixes: open the Studio in Safari or Chrome on a Mac, or on your iPhone set Settings, Camera, Formats to Most Compatible before you film.</span>`);
  $('videoInfo').textContent = `${file.name} · ${mb} MB · won't play in this browser. Use Convert to MP4 on the phone preview.`;
  const b = $('convertBtn'); if (b) b.onclick = () => convertVideo(file);
  toast("This video won't play in this browser. Convert it, or see the tips on the preview.");
}
let convertWorker = null;
function convertVideo(file) {
  if (convertWorker) convertWorker.terminate(); convertWorker = new Worker('convert-worker.js');
  const n = phoneMessage(`<b>Converting ${escHtml(file.name)}</b><span id="convText">Starting…</span><div class="progress" style="margin:12px 0"><i id="convBar"></i></div><button class="btn sm" id="convCancel" type="button">Cancel</button>`); void n;
  $('convCancel').onclick = () => { convertWorker.terminate(); convertWorker = null; showUnplayable(file, { why: 'nopicture' }); };
  convertWorker.onmessage = (ev) => { const m = ev.data;
    if (m.type === 'progress') { const t = $('convText'); if (t) t.textContent = m.text; if (m.pct != null && $('convBar')) $('convBar').style.width = m.pct + '%'; }
    else if (m.type === 'done') { convertWorker.terminate(); convertWorker = null; const out = new File([m.data], file.name.replace(/\.[^.]+$/, '') + '-mp4.mp4', { type: 'video/mp4' }); toast(`Converted in ${Math.round(m.seconds)} s`); media.converted = out; loadVideo(out); }
    else if (m.type === 'error') { convertWorker.terminate(); convertWorker = null; phoneMessage(`<b>Conversion failed</b>${escHtml(m.message).slice(0, 220)}<br><br><span style="font-size:12px">Try Safari or Chrome on a Mac, or set your iPhone camera to Most Compatible.</span>`); } };
  convertWorker.onerror = (e) => { phoneMessage(`<b>Conversion failed</b>${escHtml(e.message || 'The converter did not load. Check your connection and try again.')}`); };
  convertWorker.postMessage({ file, duration: isFinite(video.duration) ? video.duration : 0, base: window.REELCUT_FFMPEG_BASE || undefined });
}
async function loadVideo(file) {
  if (!file) return; if (!isVideoFile(file)) { toast(`${file.name} doesn't look like a video. Use MP4 or MOV.`); return; }
  if (media.url) URL.revokeObjectURL(media.url); pause();
  media.file = file; media.url = URL.createObjectURL(file); $('fileLabel').textContent = file.name; phoneMessage(`<b>Opening ${escHtml(file.name)}…</b>${Math.round(file.size / 1e6)} MB`); toast('Opening ' + file.name); $('videoInfo').textContent = 'Opening ' + file.name + '…';
  const probe = probeVideo(); video.src = media.url; video.load();
  const r = await probe; if (!r.ok) { media.url = null; media.w = media.h = 0; showUnplayable(file, r); return; }
  tv.src = media.url; $('emptyState').hidden = true;
  media.duration = video.duration || 0; media.w = video.videoWidth; media.h = video.videoHeight;
  $('videoInfo').textContent = `${file.name} · ${fmt(media.duration)} · ${media.w}×${media.h}`;
  if (media.converted === file) { const a = document.createElement('a'); a.textContent = ' · Save the converted copy'; a.href = media.url; a.download = file.name; a.className = 'navlink'; $('videoInfo').appendChild(a); }
  const saved = loadProject(); state.name = saved ? state.name : file.name.replace(/\.[^.]+$/, ''); $('projectName').value = state.name;
  afterChange(true); buildFilmstrip(); if (state.music.mode === 'generated') ensureMusic();
}
async function buildFilmstrip() {
  media.thumbs = []; const d = media.duration; if (!d) return; media.thumbStep = d > 240 ? 6 : d > 90 ? 4 : d > 30 ? 2 : 1;
  const c = document.createElement('canvas'); const ar = media.w / media.h || 9 / 16; c.height = 96; c.width = Math.round(96 * ar); const ctx = c.getContext('2d');
  for (let t = 0; t < d; t += media.thumbStep) { try { await new Promise((res, rej) => { tv.onseeked = res; tv.onerror = rej; tv.currentTime = Math.min(t + 0.05, d - 0.05); setTimeout(res, 1500); }); ctx.drawImage(tv, 0, 0, c.width, c.height); media.thumbs.push({ t, url: c.toDataURL('image/jpeg', 0.6) }); } catch { break; } if (media.thumbs.length % 5 === 0) renderTimeline(); }
  renderTimeline(); renderCards();
}
const thumbFor = (t) => { if (!media.thumbs.length) return ''; const i = clamp(Math.round(t / media.thumbStep), 0, media.thumbs.length - 1); return media.thumbs[i].url; };

/* ---------- audio graph: voice, music, sfx → speakers + recorder ---------- */
let audioCtx = null, voiceGain = null, msDest = null, musicGain = null, sfxGain = null, musicSrc = null;
function ensureAudioGraph() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)(); msDest = audioCtx.createMediaStreamDestination();
    const src = audioCtx.createMediaElementSource(video); voiceGain = audioCtx.createGain(); src.connect(voiceGain); voiceGain.connect(audioCtx.destination); voiceGain.connect(msDest);
    musicGain = audioCtx.createGain(); musicGain.connect(audioCtx.destination); musicGain.connect(msDest);
    sfxGain = audioCtx.createGain(); sfxGain.connect(audioCtx.destination); sfxGain.connect(msDest);
    applyLevels();
  } catch (e) { console.warn('audio graph', e); }
}
function applyLevels() { const mute = $('muteChk').checked; if (!audioCtx) { video.muted = mute; return; } const m = mute && !engine.rendering ? 0 : 1; voiceGain.gain.value = m * (state.voiceVol ?? 1); sfxGain.gain.value = m * (state.sfx.on ? state.sfx.vol : 0); updateMusicGain(); }
function updateMusicGain() { if (!musicGain) return; const mute = $('muteChk').checked && !engine.rendering; const onEnd = engine.cut >= cutDuration() - 0.05; const base = state.music.mode === 'none' ? 0 : state.music.vol; let g = state.music.duck && !onEnd ? base : Math.min(1, base * (state.music.duck ? 2.4 : 1)); const left = totalDuration() - engine.cut; if (left < 1.2) g *= clamp(left / 1.2, 0, 1); musicGain.gain.setTargetAtTime(mute ? 0 : g, audioCtx.currentTime, 0.08); }

/* ---------- music: generated or from a file, always an AudioBuffer ---------- */
const music = { buffer: null, key: '', building: false };
function musicKey() { const m = state.music; return m.mode === 'generated' ? `gen:${m.mood}:${m.bpm}:${m.seed}` : m.mode === 'file' ? 'file:' + m.fileName : ''; }
async function ensureMusic() {
  const k = musicKey(); if (!k || music.key === k || music.building) return;
  if (state.music.mode === 'generated') { music.building = true; $('musicInfo').textContent = 'Composing…'; let done; music.pending = new Promise((r) => { done = r; }); try { music.buffer = await generateMusic(state.music.mood, state.music.bpm, state.music.seed); music.key = k; $('musicInfo').textContent = `${state.music.mood} · ${state.music.bpm} bpm · ${fmt(music.buffer.duration, false)}`; } catch (e) { $('musicInfo').textContent = 'Could not compose: ' + e.message; } music.building = false; done(); if (musicKey() !== music.key) return ensureMusic(); if (engine.playing) startMusic(); renderTimeline(); }
}
async function loadMusicFile(f) { ensureAudioGraph(); const buf = await f.arrayBuffer(); const ctx = audioCtx || new AudioContext(); music.buffer = await ctx.decodeAudioData(buf); state.music.fileName = f.name; state.music.mode = 'file'; music.key = 'file:' + f.name; $('musicFileInfo').textContent = `${f.name} · ${fmt(music.buffer.duration, false)}`; commit(); }
function startMusic() { stopMusic(); if (!audioCtx || !music.buffer || state.music.mode === 'none') return; musicSrc = audioCtx.createBufferSource(); musicSrc.buffer = music.buffer; musicSrc.loop = true; musicSrc.connect(musicGain); musicSrc.start(0, engine.cut % music.buffer.duration); updateMusicGain(); }
function stopMusic() { if (musicSrc) { try { musicSrc.stop(); } catch {} musicSrc.disconnect(); musicSrc = null; } }
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const MOODS = {
  chill: { prog: [[60, 64, 67, 71], [55, 59, 62, 67], [57, 60, 64, 67], [53, 57, 60, 64]], bass: [48, 43, 45, 41], drums: 'soft', pad: 0.5, pluck: 0.45, arp: [0, 1, 2, 3, 2, 1], wave: 'triangle' },
  upbeat: { prog: [[60, 64, 67], [65, 69, 72], [57, 60, 64], [67, 71, 74]], bass: [48, 53, 45, 55], drums: 'full', pad: 0.3, pluck: 0.6, arp: [0, 2, 1, 2, 0, 2, 1, 2], wave: 'square' },
  dreamy: { prog: [[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 71], [55, 59, 62, 66]], bass: [45, 41, 48, 43], drums: 'none', pad: 0.75, pluck: 0.3, arp: [0, 1, 2, 3, 3, 2, 1, 0], wave: 'sine' },
  lofi: { prog: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]], bass: [50, 43, 48, 45], drums: 'swing', pad: 0.4, pluck: 0.5, arp: [0, 2, 1, 3, 2, 0], wave: 'triangle' },
};
async function generateMusic(mood, bpm, seed, loopBars = 8) {
  const M = MOODS[mood] || MOODS.chill; const rate = 44100; const loopLen = loopBars * 4 * 60 / bpm; const tail = 3; const seconds = loopLen + tail; const ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate); const out = ctx.createGain(); out.gain.value = 0.8; out.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(out);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mood === 'lofi' ? 3200 : 9000; lp.connect(comp);
  const rev = ctx.createConvolver(); { const len = rate * 2.2; const ir = ctx.createBuffer(2, len, rate); for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); } rev.buffer = ir; } const revG = ctx.createGain(); revG.gain.value = mood === 'dreamy' ? 0.45 : 0.22; rev.connect(revG); revG.connect(lp);
  let s = seed | 0 || 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const beat = 60 / bpm, bar = beat * 4; const bars = loopBars;
  const tone = (freq, t0, dur, vol, type, dest = lp, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05); };
  const pad = (notes, t0, dur) => { for (const n of notes) { for (const det of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(M.pad * 0.05, t0 + bar * 0.4); g.gain.setValueAtTime(M.pad * 0.05, t0 + dur - 0.3); g.gain.linearRampToValueAtTime(0, t0 + dur); o.connect(f); f.connect(g); g.connect(lp); g.connect(rev); o.start(t0); o.stop(t0 + dur + 0.1); } } };
  const noise = (t0, dur, vol, hp, dest = lp) => { const b = ctx.createBuffer(1, Math.ceil(rate * dur), rate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const src = ctx.createBufferSource(); src.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); src.connect(f); f.connect(g); g.connect(dest); src.start(t0); };
  const kick = (t0, vol = 0.9) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.12); const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35); o.connect(g); g.connect(comp); o.start(t0); o.stop(t0 + 0.4); };
  const snare = (t0, vol = 0.35) => { noise(t0, 0.18, vol, 1800, comp); tone(190, t0, 0.12, vol * 0.5, 'triangle', comp); };
  const hat = (t0, vol = 0.12) => noise(t0, 0.05, vol, 7000, comp);
  const octave = rnd() > 0.5 ? 12 : 0;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, chord = M.prog[b % M.prog.length], bass = M.bass[b % M.bass.length];
    pad(chord, t0, bar);
    tone(NOTE(bass), t0, bar * 0.9, 0.22, 'sine'); if (M.drums !== 'none') tone(NOTE(bass), t0 + beat * 2, beat * 1.8, 0.16, 'sine');
    const steps = M.arp.length; const stepLen = bar / Math.max(8, steps * (mood === 'upbeat' ? 1 : 2) / 2);
    for (let i = 0; i < bar / stepLen - 0.001; i++) { if (rnd() < (mood === 'dreamy' ? 0.35 : 0.2)) continue; const n = chord[M.arp[i % steps] % chord.length] + octave + (rnd() < 0.08 ? 12 : 0); tone(NOTE(n), t0 + i * stepLen, stepLen * 1.6, M.pluck * 0.12, M.wave, lp, (rnd() - 0.5) * 8); if (rnd() < 0.5) tone(NOTE(n), t0 + i * stepLen, stepLen * 1.6, M.pluck * 0.05, M.wave, rev); }
    if (M.drums !== 'none') { const sw = M.drums === 'swing' ? beat * 0.08 : 0; for (let q = 0; q < 4; q++) { const t = t0 + q * beat; if (q === 0 || q === 2 || (M.drums === 'full' && rnd() < 0.3)) kick(t, M.drums === 'soft' ? 0.6 : 0.95); if (q === 1 || q === 3) snare(t, M.drums === 'soft' ? 0.18 : M.drums === 'swing' ? 0.28 : 0.4); hat(t, 0.1); hat(t + beat / 2 + sw, 0.07); if (M.drums === 'full') { hat(t + beat / 4, 0.04); hat(t + beat * 3 / 4, 0.04); } } }
    if (mood === 'lofi') noise(t0, bar, 0.012, 300);
  }
  // render loop + tail, then fold the tail onto the start so the loop repeats without a seam
  const full = await ctx.startRendering(); const n = Math.round(loopLen * rate); const loop = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: rate });
  for (let c = 0; c < 2; c++) { const src = full.getChannelData(c), dst = loop.getChannelData(c); dst.set(src.subarray(0, n)); for (let i = n; i < src.length && i - n < n; i++) dst[i - n] += src[i]; }
  return loop;
}
function musicToWav() { if (!music.buffer) return toast('No music yet'); const b = music.buffer, n = b.length; const inter = new Float32Array(n * 2); const L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L; for (let i = 0; i < n; i++) { inter[i * 2] = L[i]; inter[i * 2 + 1] = R[i]; } const blob = pcmToWav(inter, b.sampleRate, 2); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${state.name}-music.wav`; a.click(); }

/* ---------- sound effects, synthesized on the spot ---------- */
const SFX = {
  whoosh: (t) => { noiseSfx(t, 0.45, 0.9, 'bandpass', 300, 3200, 1.5); },
  pop: (t, i = 0) => { toneSfx(t, 0.14, 0.9, 'sine', 700 - i * 40, 220); },
  pops: (t) => { for (let i = 0; i < 4; i++) toneSfx(t + i * 0.09, 0.12, 0.7, 'sine', 600 + i * 90, 260); },
  ding: (t) => { toneSfx(t, 0.9, 0.5, 'sine', 1318, 1318); toneSfx(t, 0.6, 0.25, 'sine', 2637, 2637); },
  impact: (t) => { toneSfx(t, 0.5, 1.2, 'sine', 120, 38); noiseSfx(t, 0.25, 0.8, 'lowpass', 800, 120, 1); },
  riser: (t) => { noiseSfx(t, 1.2, 0.7, 'bandpass', 200, 4000, 2); toneSfx(t, 1.2, 0.18, 'sawtooth', 110, 440); },
  click: (t) => { noiseSfx(t, 0.03, 0.9, 'highpass', 2500, 2500, 1); },
  sparkle: (t) => { [0, 4, 7, 12, 16].forEach((n, i) => toneSfx(t + i * 0.07, 0.5, 0.35, 'sine', NOTE(84 + n), NOTE(84 + n))); },
  shatter: (t) => { for (let i = 0; i < 7; i++) noiseSfx(t + i * 0.05, 0.25, 0.6 - i * 0.06, 'highpass', 3000 + i * 400, 3000, 1); toneSfx(t, 0.3, 0.6, 'sine', 90, 40); },
  beeps: (t) => { for (let i = 0; i < 5; i++) toneSfx(t + i * 0.12, 0.06, 0.4, 'square', 1200, 1200); toneSfx(t + 0.7, 0.3, 0.5, 'square', 1600, 1600); },
  hum: (t) => { toneSfx(t, 1.8, 0.2, 'sawtooth', 55, 58); toneSfx(t, 1.8, 0.12, 'sine', 110, 112); },
  ticks: (t) => { for (let i = 0; i < 12; i++) noiseSfx(t + i * 0.11, 0.02, 0.6, 'highpass', 4000, 4000, 1); },
};
function toneSfx(t0, dur, vol, type, f0, f1) { if (!audioCtx) return; const o = audioCtx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(sfxGain); o.start(t0); o.stop(t0 + dur + 0.05); }
function noiseSfx(t0, dur, vol, type, f0, f1, q) { if (!audioCtx) return; const rate = audioCtx.sampleRate; const b = audioCtx.createBuffer(1, Math.ceil(rate * dur), rate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const src = audioCtx.createBufferSource(); src.buffer = b; const f = audioCtx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t0); }
const FX_SFX = { parallax: [[0, 'whoosh']], kinetic: [[0.05, 'pops'], [0.75, 'pop']], behind: [[0.08, 'whoosh']], infinite: [[0, 'riser']], paper: [[0, 'pop'], [0.3, 'pops']], hologram: [[0.1, 'hum'], [0.3, 'beeps']], escape: [[0.1, 'whoosh'], [0.7, 'pop']], dolly: [[0, 'riser']], floating: [[0, 'ding']], mask: [[0.45, 'whoosh']], shatter: [[0.25, 'ticks'], [0.55, 'shatter']], punch: [[0.05, 'impact'], [0.9, 'impact']], portal: [[0.05, 'sparkle']], social: [[0.1, 'pop'], [0.4, 'pop'], [0.7, 'ding']], particles: [[0.2, 'sparkle'], [1.3, 'whoosh']], liquid: [[0, 'ding']], split: [[0, 'whoosh'], [0.24, 'whoosh']], magazine: [[0, 'click'], [0.4, 'pops']], whip: [[0.7, 'whoosh']], hud: [[0, 'beeps'], [0.6, 'click']], comments: [[0.05, 'pops'], [0.5, 'pops'], [0.95, 'pops']], slider: [[0.2, 'whoosh']], neon: [[0.2, 'hum'], [0.5, 'sparkle']], freeze: [[0.3, 'riser'], [1.2, 'click']], infographic: [[0, 'pop'], [0.5, 'ticks'], [1.4, 'ding']], counter: [[0.2, 'ticks'], [1.6, 'ding']], sound: [[0, 'whoosh']] };
function sfxTimes(cue) { if (cue.sfx === 'none') return []; if (cue.sfx && cue.sfx !== 'auto') return [[0, cue.sfx]]; return FX_SFX[cue.k] || []; }
function triggerSfx(prev, now) { if (!state.sfx.on || !audioCtx || !sfxGain) return; for (const c of state.fx) for (const [off, name] of sfxTimes(c)) { const T = c.at + off; if (T > prev && T <= now && SFX[name]) SFX[name](audioCtx.currentTime + Math.max(0, T - now)); } }

/* ---------- playback engine ---------- */
const engine = { playing: false, cut: 0, raf: 0, onEnd: null, rendering: false, prevCut: 0, lastSeg: null, lastWall: 0 };
const stills = {}; // last frame of each segment, for transitions
function captureStill(key) { const [W, H] = outSize(); const c = document.createElement('canvas'); c.width = W / 2; c.height = H / 2; const x = c.getContext('2d'); drawSource(x, video, media.w, media.h, { W: c.width, H: c.height, rotate: engine.lastSeg?.rotate || 0, scale: engine.lastSeg?.zoom || 1, filter: GRADES[state.grade] || undefined }); stills[key] = c; }
function seekCut(ct) {
  engine.cut = clamp(ct, 0, Math.max(0, totalDuration() - 0.001)); engine.prevCut = engine.cut;
  const s = segAtCut(engine.cut); if (s) { video.currentTime = s.start + (engine.cut - s.cutStart); engine.lastSeg = s; } else if (segments.length) video.currentTime = segments[segments.length - 1].end - 0.05;
  for (const c of state.fx) if (engine.cut < c.at + 1.2) c._frozen = null;
  if (engine.playing) { if (s) video.play().catch(() => {}); else video.pause(); startMusic(); }
  updateOverlays();
}
function play() {
  if (!segments.length || !media.url) return; ensureAudioGraph(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); applyLevels();
  if (engine.cut >= totalDuration() - 0.01) engine.cut = 0;
  const s = segAtCut(engine.cut); if (s) { video.currentTime = s.start + (engine.cut - s.cutStart); engine.lastSeg = s; }
  engine.playing = true; engine.prevCut = engine.cut; engine.lastWall = performance.now(); $('playBtn').textContent = '❚❚ Pause'; if (s) video.play().catch(() => {}); startMusic(); ensureMusic();
  cancelAnimationFrame(engine.raf); engine.raf = requestAnimationFrame(tick);
}
function pause() { engine.playing = false; video.pause(); stopMusic(); $('playBtn').textContent = '▶ Play cut'; cancelAnimationFrame(engine.raf); }
function tick() {
  if (!engine.playing) return; const now = performance.now(); const dt = (now - engine.lastWall) / 1000; engine.lastWall = now;
  const s = segAtCut(engine.cut); const total = totalDuration();
  if (!s) { if (!video.paused) video.pause(); engine.cut += dt; if (engine.cut >= total) { engine.cut = total; pause(); updateOverlays(); if (engine.onEnd) engine.onEnd(); return; } }
  else {
    const vt = video.currentTime;
    if (vt >= s.end - 0.03 || vt < s.start - 0.5) {
      const idx = segments.indexOf(s); const nx = segments[idx + 1]; captureStill(idx);
      if (!nx) { engine.cut = s.cutStart + s.dur; if (endDur() <= 0) { engine.cut = total; pause(); updateOverlays(); if (engine.onEnd) engine.onEnd(); return; } video.pause(); }
      else { engine.cut = nx.cutStart; video.currentTime = nx.start; engine.lastSeg = nx; }
    } else engine.cut = s.cutStart + clamp(vt - s.start, 0, s.dur);
  }
  triggerSfx(engine.prevCut, engine.cut); engine.prevCut = engine.cut; updateMusicGain();
  updateOverlays(); engine.raf = requestAnimationFrame(tick);
}

/* ---------- person cutout (MediaPipe) with a soft fallback ---------- */
const segm = { status: 'idle', inst: null, mask: null, cut: null, face: null, frameT: -1, person: 1 };
function loadSegmenter() {
  if (segm.ready) return segm.ready; segm.status = 'loading'; toast('Loading the person cutout model…');
  const limit = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);
  segm.ready = (async () => {
    try {
      const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'; const mod = await limit(import(base + '/vision_bundle.mjs'), 20000); const files = await limit(mod.FilesetResolver.forVisionTasks(base + '/wasm'), 20000);
      const make = (delegate) => mod.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', delegate }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
      try { segm.inst = await limit(make('GPU'), 20000); } catch { segm.inst = await limit(make('CPU'), 20000); }
      segm.status = 'ready'; segm.lastTs = 0; toast('Cutout ready'); dirty = true;
    } catch (e) { console.warn('segmenter', e); segm.status = 'failed'; toast('Cutout model unavailable, using a soft mask'); }
  })();
  return segm.ready;
}
function updateMask() {
  if (segm.frameT === video.currentTime && segm.mask) return; segm.frameT = video.currentTime;
  if (!segm.mask) segm.mask = document.createElement('canvas');
  if (segm.status === 'ready' && media.w) {
    try {
      const ts = Math.max(performance.now(), (segm.lastTs || 0) + 1); segm.lastTs = ts; const res = segm.inst.segmentForVideo(video, ts); const masks = res.confidenceMasks; const m = masks[masks.length > 1 ? 1 : 0]; const arr = m.getAsFloat32Array(); const mw = m.width, mh = m.height;
      if (masks.length === 1) { let centre = 0, edge = 0; for (let y = mh * 0.5 | 0; y < mh; y += 4) centre += arr[y * mw + (mw / 2 | 0)]; for (let y = 0; y < mh; y += 4) edge += arr[y * mw]; segm.person = centre >= edge ? 1 : 0; }
      const flip = segm.person === 0 && masks.length === 1; segm.mask.width = mw; segm.mask.height = mh; const mc = segm.mask.getContext('2d'); const img = mc.createImageData(mw, mh); const d = img.data; let topY = -1; const rows = [];
      for (let y = 0; y < mh; y++) { let cnt = 0, sx = 0; for (let x = 0; x < mw; x++) { let v = arr[y * mw + x]; if (flip) v = 1 - v; const a = v > 0.5 ? 255 : v < 0.3 ? 0 : (v - 0.3) * 1275; const i = (y * mw + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a; if (v > 0.5) { cnt++; sx += x; } } rows.push([cnt, sx]); if (topY < 0 && cnt > mw * 0.06) topY = y; }
      mc.putImageData(img, 0, 0); res.close();
      if (topY >= 0) { let cnt = 0, sx = 0, wsum = 0; for (let y = topY; y < Math.min(mh, topY + mh * 0.12); y++) { cnt += rows[y][0]; sx += rows[y][1]; wsum = Math.max(wsum, rows[y][0]); } segm.face = { nx: sx / Math.max(1, cnt) / mw, ny: (topY + mh * 0.07) / mh, nr: Math.max(0.08, wsum / mw * 0.55) }; }
      return;
    } catch (e) { console.warn('segment frame', e); }
  }
  const mw = 256, mh = Math.round(256 * (media.h || 16) / (media.w || 9)); segm.mask.width = mw; segm.mask.height = mh; const mc = segm.mask.getContext('2d'); mc.clearRect(0, 0, mw, mh); const g = mc.createRadialGradient(mw / 2, mh * 0.55, mw * 0.1, mw / 2, mh * 0.55, mw * 0.5); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); mc.fillStyle = g; mc.save(); mc.translate(mw / 2, mh * 0.6); mc.scale(1, 1.45); mc.translate(-mw / 2, -mh * 0.6); mc.beginPath(); mc.ellipse(mw / 2, mh * 0.6, mw * 0.5, mw * 0.5, 0, 0, Math.PI * 2); mc.fill(); mc.restore();
  segm.face = { nx: 0.5, ny: 0.36, nr: 0.13 };
}
function cutoutFor(W, H, seg) {
  if (segm.status === 'idle') loadSegmenter(); updateMask();
  if (!segm.cut) segm.cut = document.createElement('canvas'); const c = segm.cut; if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d'); x.clearRect(0, 0, W, H); drawSource(x, video, media.w, media.h, { W, H, rotate: seg?.rotate || 0, scale: seg?.zoom || 1, filter: GRADES[state.grade] || undefined });
  x.save(); x.globalCompositeOperation = 'destination-in'; drawSource(x, segm.mask, media.w, media.h, { W, H, rotate: seg?.rotate || 0, scale: seg?.zoom || 1 }); x.restore();
  return c;
}
function faceFor(W, H, seg) { const f = segm.face || { nx: 0.5, ny: 0.36, nr: 0.13 }; const sw = media.w || 9, sh = media.h || 16; const rot = seg?.rotate || 0; const ew = rot % 180 ? sh : sw, eh = rot % 180 ? sw : sh; const cover = Math.max(W / ew, H / eh) * (seg?.zoom || 1); const px = (f.nx - 0.5) * sw, py = (f.ny - 0.5) * sh; const a = rot * Math.PI / 180; const rx = px * Math.cos(a) - py * Math.sin(a), ry = px * Math.sin(a) + py * Math.cos(a); return { x: W / 2 + rx * cover, y: H / 2 + ry * cover, r: f.nr * sw * cover }; }

/* ---------- drawing ---------- */
function drawSource(ctx, src, sw, sh, o) {
  const { W, H } = o; const rot = o.rotate || 0; const ew = rot % 180 ? sh : sw, eh = rot % 180 ? sw : sh; const cover = Math.max(W / ew, H / eh) * (o.scale || 1);
  ctx.save(); if (o.filter) ctx.filter = o.filter; if (o.alpha != null) ctx.globalAlpha = o.alpha; ctx.translate(W / 2 + (o.dx || 0), H / 2 + (o.dy || 0)); ctx.rotate(rot * Math.PI / 180); ctx.scale(cover, cover);
  try { ctx.drawImage(src, -sw / 2, -sh / 2, sw, sh); } catch {}
  ctx.restore();
}
const scratch = new Map();
function scratchCanvas(key, w, h) { let c = scratch.get(key); if (!c) { c = document.createElement('canvas'); scratch.set(key, c); } if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, w, h); return [c, x]; }
// draws the current source frame blurred by px, at 1/k size with padding so the edges stay full
function blurredSource(W, H, s, px, extraFilter, o = {}, slot = 'b') {
  const k = px >= 30 ? 8 : 4; const sw = Math.max(2, Math.round(W / k)), sh = Math.max(2, Math.round(H / k)); const p = Math.ceil(px / k * 2) + 2;
  const [a, ax] = scratchCanvas(slot + 'a', sw + 2 * p, sh + 2 * p); ax.translate(p, p);
  const cover = Math.max(sw / ((s.rotate % 180 ? media.h : media.w) || 1), sh / ((s.rotate % 180 ? media.w : media.h) || 1));
  drawSource(ax, video, media.w, media.h, { W: sw, H: sh, rotate: s.rotate, scale: (o.scale || 1) * (1 + (2 * p) / Math.min(sw, sh)), dx: (o.dx || 0) / k, dy: (o.dy || 0) / k, filter: extraFilter || undefined }); void cover;
  const [b, bx] = scratchCanvas(slot + 'b', sw + 2 * p, sh + 2 * p); bx.filter = `blur(${(px / k).toFixed(2)}px)`; bx.drawImage(a, 0, 0); bx.filter = 'none';
  return { c: b, p, sw, sh };
}
// tinted, scaled-down copy of a cutout, used for outlines and glows
function tintedCut(c, W, H, color, k, slot) { const w = Math.max(2, Math.round(W / k)), h = Math.max(2, Math.round(H / k)); const [t, tx] = scratchCanvas(slot, w, h); tx.drawImage(c, 0, 0, w, h); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = color; tx.fillRect(0, 0, w, h); tx.globalCompositeOperation = 'source-over'; return t; }
function hookLines() { const h = state.hook; let small = h.small, big = h.big; if (!small && !big && state.words.length) { const p = state.phrases[0]; const ws = state.words.slice(p.from, p.to + 1).map((w) => w.t); small = ws.slice(0, 3).join(' '); big = ws.slice(3, 10).join(' ').replace(/[,.!?]+$/, '') || small; if (ws.length <= 3) { small = ''; big = ws.join(' '); } } return { small, big: big || '', sub: h.sub }; }
function drawFrame(ctx, W, H, ct, opts = {}) {
  const s = segAtCut(ct); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); const u = W / 340; const U = W / 1080; const grade = GRADES[state.grade] || '';
  const base = (o = {}) => {
    if (!s || !media.w) { if (!s && segments.length) drawEndBase(ctx, W, H); return; }
    const z = (s.zoom || 1) * (o.scale || 1); const bm = /blur\(([\d.]+)px\)/.exec(o.filter || '');
    if (bm && +bm[1] >= 6) { const rest = [grade, o.filter.replace(bm[0], '')].join(' ').trim(); const b = blurredSource(W, H, s, +bm[1], rest, { scale: z, dx: o.dx, dy: o.dy }, 'base'); ctx.save(); if (o.alpha != null) ctx.globalAlpha = o.alpha; ctx.drawImage(b.c, b.p, b.p, b.sw, b.sh, 0, 0, W, H); ctx.restore(); }
    else drawSource(ctx, video, media.w, media.h, { W, H, rotate: s.rotate, scale: z, dx: o.dx, dy: o.dy, alpha: o.alpha, filter: [grade, o.filter].filter(Boolean).join(' ') || undefined });
    if (!o.raw) drawTransition(ctx, W, H, ct, s);
  };
  let frameBlur = null;
  const cue = cueAt(ct);
  if (cue && window.FX) {
    const def = FX.BY_KEY[cue.k]; const t = ct - cue.at; const col = ACCENTS[state.fxAccent] || ACCENTS.purple; const words = [cue.w1 || (FX.SAMPLE[cue.k] || ['', ''])[0] || '', cue.w2 || (FX.SAMPLE[cue.k] || ['', ''])[1] || ''];
    const env = { ctx, W, H, u: U, t, d: cue.d || 2.15, p: clamp(t / (cue.d || 2.15), 0, 1), cue, words, text: cue.text || FX.SAMPLE_TEXT[cue.k] || '', col, base,
      cut: () => (def && def.cut && s ? cutoutFor(W, H, s) : null), face: () => faceFor(W, H, s),
      blurFrame: (px) => { if (!s || !media.w) return null; if (!frameBlur || frameBlur.px !== px) { frameBlur = blurredSource(W, H, s, px, grade, { scale: s.zoom || 1 }, 'glass'); frameBlur.px = px; } return frameBlur; },
      drawCut: (c, o = {}) => { ctx.save(); const sc = o.scale || 1; const ay = o.anchor === 'bottom' ? H : H / 2; ctx.translate(W / 2, ay); ctx.scale(sc, sc); ctx.translate(-W / 2, -ay); if (o.glow && (o.glowBlur || 40) > 1) { const g = tintedCut(c, W, H, o.glow, 8, 'glowT'); const gb = (o.glowBlur || 40) / 8; const [b, bx] = scratchCanvas('glowB', g.width, g.height); bx.filter = `blur(${gb.toFixed(2)}px)`; bx.drawImage(g, 0, 0); bx.filter = 'none'; ctx.save(); ctx.drawImage(b, 0, 0, W, H); ctx.globalAlpha = 0.7; ctx.drawImage(b, -W * 0.02, -H * 0.02, W * 1.04, H * 1.04); ctx.restore(); } if (o.drop) { const g = tintedCut(c, W, H, 'rgba(0,0,0,0.3)', 8, 'dropT'); const [b, bx] = scratchCanvas('dropB', g.width, g.height); bx.filter = 'blur(3px)'; bx.drawImage(g, 0, 0); bx.filter = 'none'; ctx.drawImage(b, 0, o.drop, W, H); } if (o.outline) { const t = tintedCut(c, W, H, o.outlineColor || '#fff', 2, 'lineT'); const [ol, ox] = scratchCanvas('lineO', t.width, t.height); const r = o.outline / 2; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ox.drawImage(t, Math.cos(a) * r, Math.sin(a) * r); } ctx.drawImage(ol, 0, 0, W, H); } ctx.drawImage(c, 0, 0, W, H); ctx.restore(); },
      still: () => { if (!cue._still && s) { const c = document.createElement('canvas'); c.width = W; c.height = H; drawSource(c.getContext('2d'), video, media.w, media.h, { W, H, rotate: s.rotate, scale: s.zoom || 1, filter: grade || undefined }); cue._still = c; } return cue._still; },
      freezeFrame: () => { if (!cue._frozen && s) { const c = document.createElement('canvas'); c.width = W; c.height = H; drawSource(c.getContext('2d'), video, media.w, media.h, { W, H, rotate: s.rotate, scale: (s.zoom || 1) * 1.05, filter: grade || undefined }); cue._frozen = c; } return cue._frozen; } };
    if (t < 0.5) cue._still = null;
    try { FX.draw(cue.k, env); } catch (e) { console.warn('fx', cue.k, e); base(); }
  } else base();
  if (!s && segments.length) drawEndCard(ctx, W, H, ct, u);
  if (opts.overlays) drawOverlays(ctx, W, H, ct, u);
  if (state.progress) { const p = ct / (totalDuration() || 1); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, H - 6 * U, W, 6 * U); ctx.fillStyle = (ACCENTS[state.fxAccent] || ACCENTS.purple).b; ctx.fillRect(0, H - 6 * U, W * p, 6 * U); }
}
function drawTransition(ctx, W, H, ct, s) {
  const tr = s.transition; if (!tr || tr === 'cut') return; const idx = segments.indexOf(s); const p = clamp((ct - s.cutStart) / TRANS_D, 0, 1); if (p >= 1 || idx === 0) return; const prev = stills[idx - 1]; const U = W / 1080;
  if (tr === 'dissolve' && prev) { ctx.save(); ctx.globalAlpha = 1 - p; ctx.drawImage(prev, 0, 0, W, H); ctx.restore(); }
  else if (tr === 'black') { ctx.fillStyle = `rgba(0,0,0,${1 - p})`; ctx.fillRect(0, 0, W, H); }
  else if (tr === 'zoom') { const k = 1 + 0.25 * (1 - p) * (1 - p); drawSource(ctx, video, media.w, media.h, { W, H, rotate: s.rotate, scale: (s.zoom || 1) * k, filter: GRADES[state.grade] || undefined }); }
  else if (tr === 'whip') { const k = 1 - p; ctx.save(); ctx.globalAlpha = 0.85 * k; drawSource(ctx, video, media.w, media.h, { W, H, rotate: s.rotate, scale: (s.zoom || 1) * (1 + 0.1 * k), dx: -k * W * 0.4, filter: `blur(${k * 40 * U}px)` }); ctx.restore(); if (prev) { ctx.save(); ctx.globalAlpha = k * 0.9; ctx.filter = `blur(${k * 40 * U}px)`; ctx.drawImage(prev, k * W * 0.6, 0, W, H); ctx.restore(); } }
}
function drawEndBase(ctx, W, H) { const last = stills[segments.length - 1]; if (state.endCard.style === 'blur' && last) { ctx.save(); ctx.filter = `blur(${20 * W / 1080}px) brightness(.55)`; ctx.drawImage(last, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1); ctx.restore(); } else { ctx.fillStyle = state.fxAccent === 'purple' ? '#A96674' : (ACCENTS[state.fxAccent] || ACCENTS.blush).a; ctx.fillRect(0, 0, W, H); } }
function drawEndCard(ctx, W, H, ct, u) {
  const t = ct - cutDuration(); const p = clamp(t / 0.45, 0, 1); const k = 0.9 + 0.1 * (1 - Math.pow(1 - p, 3)); const e = state.endCard; const title = e.title || 'follow for more AI workflows', sub = e.sub || ('@' + (state.ig.user || 'meri.builds'));
  ctx.save(); ctx.globalAlpha = p; ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 20 * u / 3;
  ctx.font = `700 ${34 * u}px Fredoka, Nunito, sans-serif`; wrapText(ctx, title, 0, -20 * u, W * 0.8, 38 * u); ctx.font = `800 ${16 * u}px Nunito, sans-serif`; const w = ctx.measureText(sub).width + 30 * u; ctx.shadowColor = 'transparent'; roundRect(ctx, -w / 2, 30 * u, w, 30 * u, 15 * u, 'rgba(255,255,255,.18)'); ctx.fillStyle = '#fff'; ctx.fillText(sub, 0, 45 * u); ctx.restore();
}
function drawOverlays(ctx, W, H, ct, u) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (state.hook.on && ct < hookEnd()) {
    const L = hookLines(); const x = W * state.hook.x / 100, y = H * state.hook.y / 100; const k = state.hook.size;
    if (state.hook.style === 'abie') { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 2 * u; ctx.fillStyle = '#fff'; ctx.font = `500 ${15 * k * u}px Fredoka, Nunito, sans-serif`; if (L.small) ctx.fillText(L.small, x, y - 16 * k * u); ctx.font = `700 ${30 * k * u}px Fredoka, Nunito, sans-serif`; wrapText(ctx, L.big, x, y + (L.small ? 10 : 0) * k * u, W * 0.88, 32 * k * u); ctx.shadowColor = 'transparent'; }
    else if (state.hook.style === 'editorial') { ctx.font = `900 ${22 * k * u}px Nunito, sans-serif`; boxText(ctx, L.big.toUpperCase(), x, y, 10 * u, 4 * u, '#111', '#fff'); if (L.sub) { ctx.font = `700 ${12 * k * u}px Nunito, sans-serif`; boxText(ctx, L.sub, x, y + 24 * k * u, 8 * u, 2 * u, '#fff', '#111'); } }
    else { ctx.font = `800 ${20 * k * u}px Nunito, sans-serif`; boxText(ctx, L.big, x, y, 12 * u, 5 * u, '#fff', '#111', 8 * u); }
  }
  const c = state.captions.on ? chunkAt(ct) : null;
  if (c) {
    const k = state.captions.size; const tpl = state.captions.template; const fs = (tpl === 'box' ? 16 : 19) * k * u; ctx.font = `${tpl === 'box' ? 800 : 900} ${fs}px Nunito, sans-serif`;
    const words = c.words.map((w) => caseWord(w.t)); const widths = words.map((w) => ctx.measureText(w).width); const gap = 6 * u; const lines = []; let line = [], lw = 0; const maxW = W * 0.86 - (tpl === 'box' ? 20 * u : 0);
    words.forEach((w, i) => { if (line.length && lw + widths[i] + gap > maxW) { lines.push(line); line = []; lw = 0; } line.push(i); lw += widths[i] + (line.length > 1 ? gap : 0); }); if (line.length) lines.push(line);
    const lh = fs * 1.2; const x0 = W * state.captions.x / 100, y0 = H * state.captions.y / 100 - (lines.length - 1) * lh / 2; const cur = c.words.findIndex((w, i) => ct >= w.s && (i === c.words.length - 1 || ct < c.words[i + 1].s));
    if (tpl === 'box') { const bw = Math.max(...lines.map((ln) => ln.reduce((a, i) => a + widths[i], 0) + gap * (ln.length - 1))) + 20 * u; const bh = lines.length * lh + 12 * u; roundRect(ctx, x0 - bw / 2, y0 - lh / 2 - 6 * u, bw, bh, 8 * u, 'rgba(10,10,10,0.78)'); } else { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 2 * u; }
    lines.forEach((ln, li) => { const total = ln.reduce((a, i) => a + widths[i], 0) + gap * (ln.length - 1); let x = x0 - total / 2; const y = y0 + li * lh; for (const i of ln) { const on = i === cur; ctx.fillStyle = on ? (tpl === 'abie2' ? '#E8C2C4' : tpl === 'yellow' ? '#FFD43B' : '#fff') : '#fff'; ctx.save(); if (on && tpl !== 'box') { ctx.translate(x + widths[i] / 2, y); ctx.scale(1.12, 1.12); ctx.translate(-(x + widths[i] / 2), -y); } ctx.textAlign = 'left'; ctx.fillText(words[i], x, y); ctx.restore(); x += widths[i] + gap; } });
    ctx.shadowColor = 'transparent'; ctx.textAlign = 'center';
  }
  for (const st of state.stickers) { if (!(ct >= st.s && ct < st.e)) continue; const x = W * st.x / 100, y = H * st.y / 100; const a = stickerAnim(st, ct); ctx.save(); ctx.globalAlpha = a.alpha; ctx.translate(x, y + a.dy * u); ctx.scale(a.scale * (st.size || 1), a.scale * (st.size || 1)); if (st.img) { if (!st._img) { st._img = new Image(); st._img.src = st.img; } if (st._img.complete) ctx.drawImage(st._img, -45 * u, -45 * u, 90 * u, 90 * u); } else { ctx.font = `${40 * u}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(st.text, 0, 0); } ctx.restore(); }
}
function stickerAnim(st, ct) { const t = ct - st.s; const d = st.e - st.s; const m = st.anim || 'none'; if (m === 'pop') { const p = clamp(t / 0.35, 0, 1); const s = 1.70158; const b = 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2); return { scale: b, dy: 0, alpha: Math.min(1, p * 3) }; } if (m === 'float') return { scale: 1, dy: Math.sin(t * 2) * 6, alpha: 1 }; if (m === 'kenburns') return { scale: 1 + 0.25 * clamp(t / Math.max(0.1, d), 0, 1), dy: 0, alpha: Math.min(1, t * 3, (d - t) * 3) }; return { scale: 1, dy: 0, alpha: 1 }; }
function wrapText(ctx, text, x, y, maxW, lh) { const ws = String(text).split(' '); const lines = []; let cur = ''; for (const w of ws) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); }
function boxText(ctx, text, x, y, px, py, bg, fg, r = 0) { const w = ctx.measureText(text).width; const m = ctx.measureText('M'); const h = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || parseFloat(ctx.font); roundRect(ctx, x - w / 2 - px, y - h / 2 - py, w + px * 2, h + py * 2, r, bg); ctx.fillStyle = fg; ctx.fillText(text, x, y); }
function roundRect(ctx, x, y, w, h, r, fill) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }

/* ---------- preview canvas loop + DOM overlays ---------- */
const pv = $('pv'); const pvCtx = pv.getContext('2d');
let dirty = true; const markDirty = () => { dirty = true; };
function previewLoop() { if (media.url && !engine.rendering && (dirty || engine.playing)) { dirty = false; const [W, H] = outSize(); const pw = Math.round(W / 2), ph = Math.round(H / 2); if (pv.width !== pw || pv.height !== ph) { pv.width = pw; pv.height = ph; } pv.classList.toggle('contain', state.ratio !== '9:16'); try { drawFrame(pvCtx, pw, ph, engine.cut, { overlays: false }); } catch (e) { console.warn('preview', e); } } requestAnimationFrame(previewLoop); }
requestAnimationFrame(previewLoop);
function updateOverlays() {
  const ct = engine.cut, s = segAtCut(ct);
  const hk = $('hookEl'); const showHook = state.hook.on && segments.length && ct < hookEnd(); hk.hidden = !showHook;
  if (showHook) { const L = hookLines(); hk.className = 'hook ' + state.hook.style; hk.querySelector('.small').textContent = L.small; hk.querySelector('.big').textContent = L.big; const sub = hk.querySelector('.sub'); sub.textContent = state.hook.style === 'editorial' ? L.sub : ''; sub.hidden = !sub.textContent; hk.style.left = state.hook.x + '%'; hk.style.top = state.hook.y + '%'; hk.querySelector('.small').style.fontSize = (15 * state.hook.size) + 'px'; hk.querySelector('.big').style.fontSize = ((state.hook.style === 'abie' ? 30 : 21) * state.hook.size) + 'px'; }
  const cap = $('capEl'); const c = state.captions.on ? chunkAt(ct) : null; cap.hidden = !c;
  if (c) { cap.className = 'cap ' + state.captions.template; cap.style.left = state.captions.x + '%'; cap.style.top = state.captions.y + '%'; cap.style.fontSize = ((state.captions.template === 'box' ? 16 : 19) * state.captions.size) + 'px'; const key = c.s + ':' + c.words.length; if (cap.dataset.key !== key) { cap.dataset.key = key; cap.replaceChildren(...c.words.flatMap((w) => [el('span', '', caseWord(w.t)), ' '])); } [...cap.querySelectorAll('span')].forEach((sp, i) => sp.classList.toggle('on', ct >= c.words[i].s && (i === c.words.length - 1 || ct < c.words[i + 1].s))); }
  const layer = $('stickerLayer');
  state.stickers.forEach((st, i) => { let node = layer.children[i]; if (!node) { node = el('div', 'sticker'); layer.appendChild(node); } node.dataset.i = i; const on = ct >= st.s && ct < st.e; node.hidden = !on; if (!on) return; const a = stickerAnim(st, ct); node.style.left = st.x + '%'; node.style.top = st.y + '%'; node.style.opacity = a.alpha; node.style.transform = `translate(-50%, -50%) translateY(${a.dy}px) scale(${a.scale * (st.size || 1)})`; if (st.img) { if (!node.firstChild || node.firstChild.tagName !== 'IMG') node.replaceChildren(el('img')); node.firstChild.src = st.img; } else node.textContent = st.text; });
  while (layer.children.length > state.stickers.length) layer.lastChild.remove();
  markDirty(); $('tCur').textContent = fmt(ct); $('tTotal').textContent = fmt(totalDuration());
  const total = totalDuration() || 1; $('playheadCut').style.left = (ct / total * 100) + '%'; $('playheadSrc').style.left = ((cutToSrc(ct)) / (media.duration || 1) * 100) + '%';
  highlightCard(s); highlightCue(cueAt(ct));
}
let lastHl = null, lastCue = null;
function highlightCard(s) { const id = s ? s.phraseId : null; if (id === lastHl) return; lastHl = id; document.querySelectorAll('.card.active').forEach((c) => c.classList.remove('active')); if (id) { const c = document.querySelector(`.card[data-id="${id}"]`); if (c) c.classList.add('active'); } }
function highlightCue(c) { const id = c ? c.id : null; if (id === lastCue) return; lastCue = id; document.querySelectorAll('.cue.active').forEach((n) => n.classList.remove('active')); if (id) { const n = document.querySelector(`.cue[data-id="${id}"]`); if (n) n.classList.add('active'); } }
function makeDraggable(node, get, set) { let drag = null; node.addEventListener('pointerdown', (e) => { const r = $('phone').getBoundingClientRect(); drag = { r, ox: get().x - (e.clientX - r.left) / r.width * 100, oy: get().y - (e.clientY - r.top) / r.height * 100 }; node.setPointerCapture(e.pointerId); e.preventDefault(); }); node.addEventListener('pointermove', (e) => { if (!drag) return; set(clamp((e.clientX - drag.r.left) / drag.r.width * 100 + drag.ox, 5, 95), clamp((e.clientY - drag.r.top) / drag.r.height * 100 + drag.oy, 4, 96)); updateOverlays(); }); node.addEventListener('pointerup', () => { if (drag) { drag = null; commit(); } }); }
makeDraggable($('hookEl'), () => state.hook, (x, y) => { state.hook.x = x; state.hook.y = y; });
makeDraggable($('capEl'), () => state.captions, (x, y) => { state.captions.x = x; state.captions.y = y; });
$('stickerLayer').addEventListener('pointerdown', (e) => { const node = e.target.closest('.sticker'); if (!node) return; const st = state.stickers[+node.dataset.i]; if (!st) return; const r = $('phone').getBoundingClientRect(); const ox = st.x - (e.clientX - r.left) / r.width * 100, oy = st.y - (e.clientY - r.top) / r.height * 100; const move = (ev) => { st.x = clamp((ev.clientX - r.left) / r.width * 100 + ox, 3, 97); st.y = clamp((ev.clientY - r.top) / r.height * 100 + oy, 3, 97); updateOverlays(); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); commit(); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); e.preventDefault(); });

/* ---------- Words tab ---------- */
let cardsSig = '';
function renderCards() {
  const sig = JSON.stringify([state.order, state.phrases, state.pauses, state.words.length, media.thumbs.length]); if (sig === cardsSig && $('cards').childElementCount) return; cardsSig = sig;
  const root = $('cards'); root.replaceChildren();
  if (!state.phrases.length) { root.appendChild(el('div', 'empty-cards', media.url ? 'Now add a transcript in Workflow (step 02).' : 'Add a video and a transcript in Workflow to see phrases here.')); return; }
  const kept = state.order.filter((id) => state.phrases.find((p) => p.id === id)?.keep).length; $('cutSummary').textContent = `${kept} phrases · ≈${Math.round(cutDuration())}s`;
  state.order.forEach((id, pos) => {
    const p = state.phrases.find((q) => q.id === id); if (!p) return; const first = state.words[p.from], last = state.words[p.to];
    const card = el('div', 'card' + (p.keep ? '' : ' off')); card.dataset.id = p.id;
    const ctl = el('div', 'ctl'); const chk = el('input'); chk.type = 'checkbox'; chk.checked = p.keep; chk.title = 'Keep in cut'; chk.onchange = () => { p.keep = chk.checked; commit(); };
    const up = el('button', '', '▲'); up.title = 'Move up'; up.onclick = () => move(pos, pos - 1); const dn = el('button', '', '▼'); dn.title = 'Move down'; dn.onclick = () => move(pos, pos + 1);
    ctl.append(chk, el('span', 'n', String(pos + 1).padStart(2, '0')), up, dn);
    const th = el('div', 'thumb'); th.style.backgroundImage = `url(${thumbFor(first.s)})`; th.title = 'Preview this phrase'; th.onclick = () => previewPhrase(p);
    const body = el('div', 'body'); const meta = el('div', 'meta'); meta.append(el('span', 'code', `${p.id} ${fmt(first.s + (p.trimIn || 0))} – ${fmt(last.e - (p.trimOut || 0))}`));
    const rot = el('button', 'rot' + (p.rotate ? ' on' : ''), p.rotate ? `↻ ${p.rotate}°` : '↻ Rotate'); rot.onclick = () => { p.rotate = ((p.rotate || 0) + 90) % 360; commit(); };
    const zoom = el('button', 'rot' + (p.zoom > 1 ? ' on' : ''), `⌕ ${Math.round((p.zoom || 1) * 100)}%`); zoom.title = 'Punch in'; zoom.onclick = () => { p.zoom = p.zoom >= 1.3 ? 1 : p.zoom >= 1.15 ? 1.3 : 1.15; commit(); };
    const tr = el('select'); tr.title = 'Transition into this clip'; for (const [v, l] of [['cut', 'cut'], ['dissolve', 'dissolve'], ['black', 'fade black'], ['zoom', 'zoom'], ['whip', 'whip']]) tr.appendChild(new Option(l, v)); tr.value = p.transition || 'cut'; tr.onchange = () => { p.transition = tr.value; commit(); };
    const split = el('button', 'rot', '✂'); split.title = 'Split phrase at its middle'; split.onclick = () => splitPhrase(p, Math.floor((p.from + p.to) / 2) + 1);
    meta.append(rot, zoom, tr, split);
    const words = el('div', 'words'); const dropped = new Set(p.dropped || []);
    for (let i = p.from; i <= p.to; i++) { const w = state.words[i]; const sp = el('span', dropped.has(i) ? 'x' : '', w.t); sp.title = 'Click to cut this word'; sp.onclick = () => { if (dropped.has(i)) dropped.delete(i); else dropped.add(i); p.dropped = [...dropped]; commit(); }; words.append(sp, ' '); const nx = state.words[i + 1]; if (nx && i < p.to && nx.s - w.e > 0.6) words.append(el('span', 'gap', `(${(nx.s - w.e).toFixed(1)}s)`), ' '); }
    body.append(meta, words); card.append(ctl, th, body); root.appendChild(card);
  });
}
function move(from, to) { if (to < 0 || to >= state.order.length) return; const [id] = state.order.splice(from, 1); state.order.splice(to, 0, id); commit(); }
function previewPhrase(p) { const s = segments.find((x) => x.phraseId === p.id); if (!s) { p.keep = true; commit(); return previewPhrase(p); } seekCut(s.cutStart); if (!engine.playing) play(); }
function splitPhrase(p, at) {
  if (at <= p.from || at > p.to) return;
  const b = { ...mkPhrase(0, at, p.to), rotate: p.rotate, zoom: p.zoom, dropped: (p.dropped || []).filter((i) => i >= at), keep: p.keep, trimOut: p.trimOut || 0 }; p.to = at - 1; p.dropped = (p.dropped || []).filter((i) => i < at); p.trimOut = 0;
  state.phrases.splice(state.phrases.indexOf(p) + 1, 0, b); state.order.splice(state.order.indexOf(p.id) + 1, 0, '__new');
  state.phrases.forEach((q, i) => { const old = q.id; q.id = 'C1S' + String(i + 1).padStart(3, '0'); state.order = state.order.map((x) => (x === old ? '__' + q.id : x)); });
  state.order = state.order.map((x) => (x === '__new' ? b.id : x.startsWith('__') ? x.slice(2) : x)); commit();
}
function splitAtPlayhead() { const s = segAtCut(engine.cut); if (!s) return; const t = cutToSrc(engine.cut); const p = state.phrases.find((q) => q.id === s.phraseId); for (let i = p.from + 1; i <= p.to; i++) if (state.words[i].s >= t) return splitPhrase(p, i); toast('Move the playhead inside a phrase to split it'); }

/* ---------- Effects tab ---------- */
let cueSeq = 1;
function addCue(k) { if (!segments.length) return toast('Add a video and transcript first'); const at = Math.round(clamp(engine.cut, 0, Math.max(0, cutDuration() - 0.5)) * 10) / 10; state.fx.push({ id: 'fx' + Date.now() + (cueSeq++), k, at, d: 2.15, w1: '', w2: '', text: '', sfx: 'auto' }); state.fx.sort((a, b) => a.at - b.at); commit(); if (FX.BY_KEY[k]?.cut) loadSegmenter(); toast(`${FX.BY_KEY[k]?.name || 'Sound'} at ${fmt(at)}`); }
function renderFxMenu() {
  const root = $('fxMenu'); const q = ($('fxSearch').value || '').toLowerCase(); root.replaceChildren(); let grp = '';
  const items = [...FX.LIST, { k: 'sound', n: -1, name: 'Sound only', grp: 'Extra', blurb: 'A whoosh, pop, hit or riser on its own, no visual.', best: 'Punctuating a cut' }].filter((e) => !q || (e.name + e.blurb + e.best + 'fx' + e.n).toLowerCase().includes(q))
  const GROUPS = ['Depth and camera', 'Text and captions', 'Transitions and reveals', 'Overlays and social proof', 'Extra']; items.sort((x, y) => GROUPS.indexOf(x.grp) - GROUPS.indexOf(y.grp) || x.n - y.n);
  for (const e of items) { if (e.grp !== grp) { grp = e.grp; root.appendChild(el('div', 'fxgroup', grp)); } const b = el('button', 'fxitem'); b.type = 'button'; const code = el('span', 'code', e.n > 0 ? 'FX' + String(e.n).padStart(2, '0') : e.n === 0 ? 'FX00' : 'SFX'); if (e.cut) code.appendChild(el('i', '', 'cutout')); b.append(code, el('b', '', e.name), el('span', '', e.blurb + ' Best for: ' + e.best + '.')); b.onclick = () => addCue(e.k); root.appendChild(b); }
}
let cuesSig = '';
function renderCues() {
  const sig = JSON.stringify(state.fx, (k, v) => (k.startsWith('_') ? undefined : v)); if (sig === cuesSig && $('fxCues').childElementCount) return; cuesSig = sig;
  const root = $('fxCues'); root.replaceChildren(); if (!state.fx.length) { root.appendChild(el('div', 'empty-cards', 'No effects yet. Move the playhead, then pick one below.')); return; }
  for (const c of state.fx) {
    const def = FX.BY_KEY[c.k] || { name: 'Sound only', n: -1 }; const n = el('div', 'cue'); n.dataset.id = c.id;
    const head = el('div', 'head'); head.append(el('span', 'code', def.n > 0 ? 'FX' + String(def.n).padStart(2, '0') : def.n === 0 ? 'FX00' : 'SFX'), el('b', '', def.name));
    const acts = el('div', 'acts'); const go = el('button', '', '▶'); go.title = 'Preview'; go.onclick = () => { seekCut(Math.max(0, c.at - 0.3)); if (!engine.playing) play(); }; const rm = el('button', '', '×'); rm.title = 'Remove'; rm.onclick = () => { state.fx = state.fx.filter((x) => x !== c); commit(); }; acts.append(go, rm);
    const f = el('div', 'fields'); const field = (label, input) => { const l = el('label', '', label); l.appendChild(input); f.appendChild(l); };
    const at = el('input'); at.type = 'number'; at.step = '0.1'; at.min = '0'; at.value = c.at; at.onchange = () => { c.at = clamp(+at.value || 0, 0, Math.max(0, totalDuration() - 0.2)); state.fx.sort((a, b) => a.at - b.at); commit(); }; field('At (s)', at);
    const d = el('input'); d.type = 'number'; d.step = '0.05'; d.min = '0.5'; d.max = '8'; d.value = c.d || 2.15; d.onchange = () => { c.d = clamp(+d.value || 2.15, 0.5, 8); commit(); }; field('Length (s)', d);
    if (def.words) { const w1 = el('input'); w1.type = 'text'; w1.placeholder = (FX.SAMPLE[c.k] || [])[0] || ''; w1.value = c.w1 || ''; w1.oninput = () => { c.w1 = w1.value; commitSoft(); }; field('Line 1', w1); const w2 = el('input'); w2.type = 'text'; w2.placeholder = (FX.SAMPLE[c.k] || [])[1] || ''; w2.value = c.w2 || ''; w2.oninput = () => { c.w2 = w2.value; commitSoft(); }; field('Line 2', w2); }
    if (def.text) { const tx = el('input'); tx.type = 'text'; tx.placeholder = FX.SAMPLE_TEXT[c.k] || ''; tx.value = c.text || ''; tx.oninput = () => { c.text = tx.value; commitSoft(); }; field('Text', tx); }
    const sfx = el('select'); for (const [v, l] of [['auto', 'auto'], ['none', 'none'], ...Object.keys(SFX).map((k) => [k, k])]) sfx.appendChild(new Option(l, v)); sfx.value = c.sfx || 'auto'; sfx.onchange = () => { c.sfx = sfx.value; commit(); }; field('Sound', sfx);
    n.append(head, acts, f); root.appendChild(n);
  }
}
let softTimer = 0; function commitSoft() { clearTimeout(softTimer); softTimer = setTimeout(() => { history.undo.push(snapshot()); afterChangeLight(); }, 300); }

/* ---------- timeline ---------- */
function renderTimeline() {
  const total = totalDuration(); const cd = cutDuration(); $('tlSummary').textContent = `In the cut · ${segments.length} clips · ≈${fmt(cd, false)}${endDur() ? ' + end card' : ''}`; $('srcSummary').textContent = `Source · ${fmt(media.duration, false)}`;
  const ruler = $('rulerCut'); ruler.replaceChildren(); const step = total > 150 ? 30 : total > 60 ? 10 : 5; for (let t = 0; t <= total; t += step) { const sp = el('span', '', fmt(t, false)); sp.style.left = (t / (total || 1) * 100) + '%'; ruler.appendChild(sp); }
  const strip = $('stripCut'); [...strip.querySelectorAll('.clip, .endcard')].forEach((n) => n.remove());
  segments.forEach((s, i) => {
    const p = state.phrases.find((q) => q.id === s.phraseId); const c = el('div', 'clip' + (s.rotate ? ' rot' : '') + ((p?.trimIn || p?.trimOut) ? ' trimmed' : '')); c.style.width = (s.dur / (total || 1) * 100) + '%'; c.style.backgroundImage = `url(${thumbFor(s.start + 0.3)})`; c.draggable = true; c.dataset.i = i;
    c.append(el('div', 'lbl', (s.transition && s.transition !== 'cut' ? '⇄ ' : '') + state.words.slice(s.words[0], s.words[0] + 3).map((w) => w.t).join(' '))); if (s.zoom > 1) c.append(el('span', 'z', Math.round(s.zoom * 100) + '%'));
    const x = el('button', 'x', '×'); x.title = 'Drop this phrase'; x.onclick = (e) => { e.stopPropagation(); p.keep = false; commit(); }; c.append(x);
    if (s.first) c.append(trimHandle('l', p, s, strip, total)); if (s.last) c.append(trimHandle('r', p, s, strip, total));
    c.onclick = (e) => { if (e.target.classList.contains('h')) return; seekCut(s.cutStart); };
    c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', s.phraseId); c.classList.add('drag'); }; c.ondragend = () => c.classList.remove('drag'); c.ondragover = (e) => { e.preventDefault(); c.classList.add('over'); }; c.ondragleave = () => c.classList.remove('over');
    c.ondrop = (e) => { e.preventDefault(); c.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (!id || id === s.phraseId) return; const from = state.order.indexOf(id), to = state.order.indexOf(s.phraseId); state.order.splice(from, 1); state.order.splice(to, 0, id); commit(); };
    strip.insertBefore(c, $('playheadCut'));
  });
  if (endDur()) { const e = el('div', 'clip endcard', 'END'); e.style.width = (endDur() / (total || 1) * 100) + '%'; e.onclick = () => seekCut(cd + 0.05); strip.insertBefore(e, $('playheadCut')); }
  const lh = $('laneHook'); lh.replaceChildren(); const he = hookEnd(); if (he > 0) { const b = el('div', 'bar', `Hook · until ${fmt(he)}`); b.style.left = '0'; b.style.width = (he / (total || 1) * 100) + '%'; lh.appendChild(b); }
  const lc = $('laneCaps'); lc.replaceChildren(); if (state.captions.on) for (const c of chunks) { if (c.e <= capStart()) continue; const b = el('div', 'bar'); b.style.left = (Math.max(c.s, capStart()) / (total || 1) * 100) + '%'; b.style.width = (Math.max(0.3, (c.e - Math.max(c.s, capStart())) / (total || 1) * 100)) + '%'; lc.appendChild(b); }
  const lf = $('laneFx'); lf.replaceChildren(); for (const c of state.fx) { const def = FX.BY_KEY[c.k]; const b = el('div', 'bar', def ? 'FX' + String(def.n).padStart(2, '0') : '♪'); b.title = def ? def.name : 'Sound'; b.style.left = (c.at / (total || 1) * 100) + '%'; b.style.width = (Math.max(1, (c.k === 'sound' ? 0.4 : c.d || 2.15) / (total || 1) * 100)) + '%'; b.style.background = (ACCENTS[state.fxAccent] || ACCENTS.purple).a; b.onclick = () => seekCut(c.at); lf.appendChild(b); }
  const ls = $('laneStk'); ls.replaceChildren(); for (const st of state.stickers) { const b = el('div', 'bar', st.img ? '🖼' : st.text); b.style.left = (st.s / (total || 1) * 100) + '%'; b.style.width = (Math.max(1, (st.e - st.s) / (total || 1) * 100)) + '%'; ls.appendChild(b); }
  const lm = $('laneMusic'); lm.replaceChildren(); if (state.music.mode !== 'none') { const b = el('div', 'bar'); b.style.left = '0'; b.style.width = '100%'; b.appendChild(el('i')); b.title = music.buffer ? 'Music ready' : 'Music loading'; b.style.opacity = music.buffer ? 1 : 0.4; lm.appendChild(b); }
  const src = $('source'); [...src.querySelectorAll('.blk')].forEach((n) => n.remove());
  for (const p of state.phrases) { const a = state.words[p.from], b = state.words[p.to]; const blk = el('div', 'blk' + (p.keep ? '' : ' off')); blk.style.left = (a.s / (media.duration || 1) * 100) + '%'; blk.style.width = ((b.e - a.s) / (media.duration || 1) * 100) + '%'; blk.title = (p.keep ? 'Drop ' : 'Add back ') + p.id + ': ' + state.words.slice(p.from, p.to + 1).map((w) => w.t).join(' ').slice(0, 80); blk.onclick = () => { p.keep = !p.keep; commit(); }; src.insertBefore(blk, $('playheadSrc')); }
}
function trimHandle(side, p, s, strip, total) {
  const h = el('div', 'h ' + side); h.draggable = false;
  h.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); const r = strip.getBoundingClientRect(); const x0 = e.clientX; const v0 = side === 'l' ? (p.trimIn || 0) : (p.trimOut || 0); const maxTrim = Math.max(0, s.dur + v0 - 0.3);
    const mv = (ev) => { const dx = (ev.clientX - x0) / r.width * total; const v = clamp(side === 'l' ? v0 + dx : v0 - dx, 0, maxTrim); if (side === 'l') p.trimIn = Math.round(v * 20) / 20; else p.trimOut = Math.round(v * 20) / 20; computeSegments(); computeChunks(); const ns = segments.find((q) => q.phraseId === p.id); $('tlSummary').textContent = `Trim ${side === 'l' ? 'start' : 'end'} · ${fmt(side === 'l' ? p.trimIn : p.trimOut)} · clip ${fmt(ns ? ns.dur : 0)}`; if (ns) seekCut(side === 'l' ? ns.cutStart : ns.cutStart + ns.dur - 0.05); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); commit(); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); });
  h.addEventListener('dragstart', (e) => e.preventDefault()); return h;
}
$('stripCut').addEventListener('click', (e) => { if (e.target !== e.currentTarget) return; const r = e.currentTarget.getBoundingClientRect(); seekCut((e.clientX - r.left) / r.width * totalDuration()); });

/* ---------- stickers tab ---------- */
function renderStickers() {
  const root = $('stkList'); root.replaceChildren(); if (!state.stickers.length) root.appendChild(el('div', 'empty-cards', 'No stickers yet.'));
  state.stickers.forEach((st, i) => { const card = el('div', 'card'); card.style.gridTemplateColumns = '48px minmax(0,1fr) auto'; const pvw = el('div', 'thumb'); pvw.style.width = '48px'; pvw.style.height = '48px'; pvw.style.display = 'grid'; pvw.style.placeItems = 'center'; pvw.style.fontSize = '26px'; pvw.style.background = 'var(--surface-2)'; if (st.img) { pvw.style.backgroundImage = `url(${st.img})`; pvw.style.backgroundSize = 'contain'; } else pvw.textContent = st.text; const body = el('div', 'body'); body.append(el('span', 'code', `${fmt(st.s)} – ${fmt(st.e)} · ${st.anim || 'still'} · ×${st.size || 1}`)); const rm = el('button', 'btn sm', 'Remove'); rm.onclick = () => { state.stickers.splice(i, 1); commit(); }; card.append(pvw, body, rm); root.appendChild(card); });
}
$('stkAdd').onclick = async () => { const text = $('stkEmoji').value.trim(); const f = $('stkImg').files[0]; if (!text && !f) return toast('Type an emoji or pick an image'); const st = { text, img: null, s: +$('stkStart').value || 0, e: +$('stkEnd').value || 3, x: 50, y: 40, size: +$('stkSize').value || 1, anim: $('stkAnim').value }; if (f) st.img = await shrinkImage(f, 512); state.stickers.push(st); $('stkEmoji').value = ''; $('stkImg').value = ''; commit(); };

async function shrinkImage(file, max) {
  const url = URL.createObjectURL(file); try { const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/png'); } finally { URL.revokeObjectURL(url); }
}
/* ---------- render (canvas + MediaRecorder) ---------- */
let recorder = null;
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
async function renderCut() {
  if (!segments.length || !media.url) return toast('Nothing to render yet'); pause(); ensureAudioGraph(); if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
  $('renderModal').hidden = false; $('renderTitle').textContent = 'Getting ready'; $('renderStatus').textContent = 'Loading fonts, music and the cutout model…'; $('renderDownload').hidden = true;
  await withTimeout(Promise.all(['700 40px Fredoka', '900 40px Nunito', '500 40px Fredoka', '800 40px Nunito', '900 40px Poppins', '700 40px Poppins'].map((f) => document.fonts.load(f))).catch(() => {}), 4000);
  if (state.music.mode === 'generated') { ensureMusic(); if (music.building) await withTimeout(music.pending, 60000); }
  if (state.fx.some((c) => FX.BY_KEY[c.k]?.cut) && (segm.status === 'idle' || segm.status === 'loading')) { loadSegmenter(); await withTimeout(segm.ready, 25000); }
  const canvas = $('renderCanvas'); const [W, H] = outSize(); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d'); const modal = $('renderModal'); modal.hidden = false; $('renderDownload').hidden = true; $('renderBar').style.width = '0%'; $('renderTitle').textContent = 'Rendering your cut'; $('renderCancel').textContent = 'Cancel';
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']; const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) { modal.hidden = true; return toast('This browser cannot record video. Use Chrome, or the FFmpeg export.'); }
  const stream = canvas.captureStream(30); if (msDest) for (const t of msDest.stream.getAudioTracks()) stream.addTrack(t);
  const parts = []; recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 }); recorder.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const total = totalDuration(); engine.rendering = true; applyLevels();
  const finish = () => { engine.onEnd = null; cancelAnimationFrame(draw.raf); engine.rendering = false; applyLevels(); if (recorder && recorder.state !== 'inactive') recorder.stop(); recorder.onstop = () => { if (!parts.length) { modal.hidden = true; return; } const blob = new Blob(parts, { type: mime }); const ext = mime.includes('mp4') ? 'mp4' : 'webm'; const a = $('renderDownload'); a.href = URL.createObjectURL(blob); a.download = `${state.name || 'reel'}.${ext}`; a.hidden = false; $('renderTitle').textContent = 'Done'; $('renderCancel').textContent = 'Close'; $('renderStatus').textContent = `${fmt(total)} · ${(blob.size / 1e6).toFixed(1)} MB · ${ext.toUpperCase()}${ext === 'webm' ? ' (this browser saves WebM; Chrome saves MP4)' : ''}`; $('renderBar').style.width = '100%'; }; };
  const draw = () => { drawFrame(ctx, W, H, engine.cut, { overlays: true }); $('renderBar').style.width = (engine.cut / total * 100) + '%'; $('renderStatus').textContent = `Recording ${fmt(engine.cut)} of ${fmt(total)} · keep this tab in front`; draw.raf = requestAnimationFrame(draw); };
  $('renderCancel').onclick = () => { pause(); finish(); modal.hidden = true; }; engine.onEnd = () => setTimeout(finish, 150);
  for (const c of state.fx) { c._frozen = null; c._still = null; } seekCut(0); await new Promise((r) => setTimeout(r, 250)); recorder.start(250); play(); draw();
}
function saveCover() { if (!media.url) return toast('Add a video first'); const [W, H] = outSize(); const c = document.createElement('canvas'); c.width = W; c.height = H; drawFrame(c.getContext('2d'), W, H, engine.cut, { overlays: true }); c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${state.name || 'reel'}-cover.png`; a.click(); toast('Cover saved'); }, 'image/png'); }

/* ---------- exports ---------- */
function download(name, text, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const assT = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${sec}`; };
const srtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
function buildAss(W, H) {
  const esc = (t) => t.replace(/[{}]/g, ''); const u = W / 340; const cap = state.captions; const hk = state.hook; const hl = { abie2: '&HC4C2E8&', yellow: '&H3BD4FF&', box: '&HFFFFFF&' }[cap.template];
  let s = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`;
  s += `Style: Cap,Nunito,${Math.round((cap.template === 'box' ? 16 : 19) * cap.size * u * 1.25)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,${cap.template === 'box' ? 3 : 1},${cap.template === 'box' ? 10 : 2},${cap.template === 'box' ? 0 : 2},5,20,20,20,1\n`;
  s += `Style: HookSmall,Fredoka,${Math.round(15 * hk.size * u * 1.25)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,2,5,20,20,20,1\n`;
  s += `Style: HookBig,${hk.style === 'abie' ? 'Fredoka' : 'Nunito'},${Math.round((hk.style === 'abie' ? 30 : 22) * hk.size * u * 1.25)},${hk.style === 'clean' ? '&H00111111' : '&H00FFFFFF'},&H00FFFFFF,&H00000000,${hk.style === 'abie' ? '&H80000000' : hk.style === 'editorial' ? '&H00111111' : '&H00FFFFFF'},-1,0,0,0,100,100,0,0,${hk.style === 'abie' ? 1 : 3},${hk.style === 'abie' ? 2 : 10},${hk.style === 'abie' ? 2 : 0},5,20,20,20,1\n`;
  s += `\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const he = hookEnd();
  if (he > 0) { const L = hookLines(); const x = Math.round(W * hk.x / 100), y = Math.round(H * hk.y / 100); if (hk.style === 'abie' && L.small) s += `Dialogue: 0,${assT(0)},${assT(he)},HookSmall,,0,0,0,,{\\pos(${x},${y - Math.round(18 * hk.size * u)})}${esc(L.small)}\n`; s += `Dialogue: 0,${assT(0)},${assT(he)},HookBig,,0,0,0,,{\\pos(${x},${y + Math.round((hk.style === 'abie' && L.small ? 10 : 0) * hk.size * u)})}${esc(hk.style === 'editorial' ? L.big.toUpperCase() : L.big)}\n`; if (hk.style === 'editorial' && L.sub) s += `Dialogue: 0,${assT(0)},${assT(he)},HookSmall,,0,0,0,,{\\pos(${x},${y + Math.round(26 * hk.size * u)})}${esc(L.sub)}\n`; }
  if (state.captions.on) { const x = Math.round(W * cap.x / 100), y = Math.round(H * cap.y / 100); const cs = capStart(); for (const c of chunks) { if (c.e <= cs) continue; c.words.forEach((w, i) => { const a = Math.max(cs, i === 0 ? c.s : w.s), b = i === c.words.length - 1 ? c.e : c.words[i + 1].s; if (b <= a) return; const txt = c.words.map((v, j) => (j === i ? `{\\c${hl}}${esc(caseWord(v.t))}{\\c&HFFFFFF&}` : esc(caseWord(v.t)))).join(' '); s += `Dialogue: 1,${assT(a)},${assT(b)},Cap,,0,0,0,,{\\pos(${x},${y})}${txt}\n`; }); } }
  return s;
}
const FF_GRADE = { none: '', warm: 'eq=brightness=0.03:contrast=1.05:saturation=1.15,colorbalance=rs=.04:bs=-.03', bright: 'eq=brightness=0.06:contrast=1.03:saturation=1.08', film: 'eq=contrast=1.12:saturation=0.85,colorbalance=rs=.05:gs=.02:bs=-.05', pop: 'eq=contrast=1.15:saturation=1.45', cool: 'eq=saturation=1.05:brightness=0.02,colorbalance=bs=.05', mono: 'hue=s=0,eq=contrast=1.1' };
function exportFfmpeg() {
  if (!segments.length) return toast('Nothing to export yet'); const [W, H] = outSize(); const input = media.file ? media.file.name : 'input.mp4'; const g = FF_GRADE[state.grade] ? ',' + FF_GRADE[state.grade] : '';
  let fc = ''; const vs = [], as = [];
  segments.forEach((s, i) => { const tr = s.rotate === 90 ? ',transpose=1' : s.rotate === 180 ? ',transpose=1,transpose=1' : s.rotate === 270 ? ',transpose=2' : ''; const z = s.zoom > 1 ? `,scale=iw*${s.zoom}:ih*${s.zoom},crop=iw/${s.zoom}:ih/${s.zoom}` : ''; fc += `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=PTS-STARTPTS${tr}${z},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${g}[v${i}];[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS,volume=${state.voiceVol || 1}[a${i}];`; vs.push(`[v${i}]`); as.push(`[a${i}]`); });
  fc += `${vs.map((v, i) => v + as[i]).join('')}concat=n=${segments.length}:v=1:a=1[vc][ac];[vc]ass=captions.ass[vout]`; const name = (state.name || 'reel').replace(/[^\w.-]+/g, '_');
  const sh = `#!/usr/bin/env bash\n# reelcut export ~ run this next to your video file: bash render.sh\n# Needs ffmpeg. Fonts: Fredoka + Nunito from Google Fonts, or it falls back to a system font.\n# Covers the cut, trims, zooms, grade, hook and captions. Effects, transitions, music, stickers and the end card are browser-render only.\nset -e\nINPUT="\${1:-${input.replace(/"/g, '\\"')}}"\ncat > captions.ass <<'EOF_ASS'\n${buildAss(W, H)}EOF_ASS\nffmpeg -y -i "$INPUT" -filter_complex "${fc}" -map "[vout]" -map "[ac]" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${name}_cut.mp4"\necho "Done: ${name}_cut.mp4"\n`;
  download('render.sh', sh); toast('render.sh downloaded');
}
function exportSrt() { if (!chunks.length) return toast('No captions yet'); let i = 1, out = ''; for (const c of chunks) out += `${i++}\n${srtT(c.s)} --> ${srtT(c.e)}\n${c.words.map((w) => caseWord(w.t)).join(' ')}\n\n`; download((state.name || 'reel') + '.srt', out); }

/* ---------- persistence + versions ---------- */
const key = () => media.file ? `reelcut:${media.file.name}:${media.file.size}` : null; let saveTimer = 0;
function cleanState() { return JSON.stringify(state, (k, v) => (k.startsWith('_') ? undefined : v)); }
function saveProject() { const k = key(); if (!k) return; try { const store = JSON.parse(localStorage.getItem(k) || '{}'); store.draft = cleanState(); localStorage.setItem(k, JSON.stringify(store)); $('saveStatus').textContent = 'saved'; } catch { $('saveStatus').textContent = 'not saved'; } }
function mergeState(obj) { const f = freshState(); const s = { ...f, ...obj }; for (const k of ['hook', 'captions', 'ig', 'endCard', 'music', 'sfx']) s[k] = { ...f[k], ...(obj[k] || {}) }; s.phrases = (s.phrases || []).map((p) => ({ zoom: 1, transition: 'cut', trimIn: 0, trimOut: 0, dropped: [], ...p })); if (s.music.mode === 'file' && !music.buffer) s.music.mode = 'none'; return s; }
function loadProject() { const k = key(); if (!k) return false; try { const store = JSON.parse(localStorage.getItem(k) || 'null'); if (!store || !store.draft) return false; state = mergeState(JSON.parse(store.draft)); renderVersions(); toast('Picked up where you left off'); return true; } catch { return false; } }
function versionsStore() { const k = key(); if (!k) return { versions: [] }; try { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.versions = s.versions || []; return s; } catch { return { versions: [] }; } }
function saveVersion() { const k = key(); if (!k) return toast('Add a video first'); const s = versionsStore(); const name = 'ROUGH_V' + (s.versions.length + 1); s.versions.push({ name, at: Date.now(), state: cleanState() }); s.draft = cleanState(); localStorage.setItem(k, JSON.stringify(s)); renderVersions(); toast(name + ' saved'); }
function loadVersion(name) { const s = versionsStore(); const v = s.versions.find((x) => x.name === name); if (!v) return; history.undo.push(snapshot()); state = mergeState(JSON.parse(v.state)); afterChange(true); toast('Loaded ' + name); }
function renderVersions() { const s = versionsStore(); const row = $('versions'); row.replaceChildren(); const sel = $('versionSel'); sel.replaceChildren(new Option('draft', '')); for (const v of [...s.versions].reverse()) { const b = el('button', 'v', v.name); b.onclick = () => loadVersion(v.name); row.appendChild(b); sel.appendChild(new Option(v.name, v.name)); } if (s.versions.length) { const add = el('button', 'v', '+ save version'); add.onclick = saveVersion; row.appendChild(add); } }
$('versionSel').onchange = (e) => { if (e.target.value) loadVersion(e.target.value); };

/* ---------- UI sync ---------- */
function afterChange(full) { computeSegments(); computeChunks(); renderTimeline(); renderCards(); renderStickers(); renderCues(); if (full) syncControls(); afterChangeLight(); if (state.music.mode === 'generated' && media.url) ensureMusic(); }
function afterChangeLight() { $('igUser').textContent = state.ig.user || 'meri.builds'; $('igCaption').textContent = state.ig.caption || ''; $('projectName').value = state.name; $('undoBtn').disabled = !history.undo.length; $('redoBtn').disabled = !history.redo.length; engine.cut = clamp(engine.cut, 0, Math.max(0, totalDuration())); if (audioCtx) applyLevels(); updateOverlays(); $('saveStatus').textContent = 'saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(saveProject, 400); }
function syncControls() {
  const h = state.hook, c = state.captions, m = state.music, e = state.endCard;
  $('hookOn').checked = h.on; $('hookStyle').value = h.style; $('hookShow').value = h.show; $('hookSmall').value = h.small; $('hookBig').value = h.big; $('hookSub').value = h.sub; $('hookSize').value = h.size;
  $('capOn').checked = c.on; $('capTemplate').value = c.template; $('capWords').value = c.words; $('capSize').value = c.size; $('capCase').value = c.case;
  $('igUserIn').value = state.ig.user; $('igCapIn').value = state.ig.caption; $('pausesSel').value = state.pauses; $('gradeSel').value = state.grade; $('ratioSel').value = state.ratio; $('progressOn').checked = !!state.progress; $('fxAccent').value = state.fxAccent;
  $('endOn').checked = !!e.on; $('endStyle').value = e.style; $('endTitle').value = e.title; $('endSub').value = e.sub; $('endDur').value = e.d;
  $('musicMode').value = m.mode; $('musicMood').value = m.mood; $('musicBpm').value = m.bpm; $('musicVol').value = m.vol; $('musicDuck').checked = !!m.duck; $('musicGen').hidden = m.mode !== 'generated'; $('musicFileRow').hidden = m.mode !== 'file';
  $('sfxOn').checked = !!state.sfx.on; $('sfxVol').value = state.sfx.vol; $('voiceVol').value = state.voiceVol ?? 1;
}
const bind = (id, fn, ev = 'input') => {
  const node = $(id); const live = ev === 'input' && (node.type === 'range' || node.type === 'text');
  if (!live) { node.addEventListener(ev, (e) => { fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value); commit(); }); return; }
  let before = null; // one undo step per drag or per burst of typing
  node.addEventListener('input', (e) => { if (before == null) before = snapshot(); fn(e.target.value); computeChunks(); afterChangeLight(); clearTimeout(node._t); node._t = setTimeout(settle, node.type === 'range' ? 250 : 600); });
  const settle = () => { if (before == null) return; history.undo.push(before); history.redo = []; before = null; afterChange(); };
  node.addEventListener('change', settle);
};
bind('hookOn', (v) => state.hook.on = v, 'change'); bind('hookStyle', (v) => state.hook.style = v, 'change'); bind('hookShow', (v) => state.hook.show = v, 'change'); bind('hookSmall', (v) => state.hook.small = v); bind('hookBig', (v) => state.hook.big = v); bind('hookSub', (v) => state.hook.sub = v); bind('hookSize', (v) => state.hook.size = +v);
bind('capOn', (v) => state.captions.on = v, 'change'); bind('capTemplate', (v) => state.captions.template = v, 'change'); bind('capWords', (v) => state.captions.words = +v, 'change'); bind('capSize', (v) => state.captions.size = +v); bind('capCase', (v) => state.captions.case = v, 'change');
bind('igUserIn', (v) => state.ig.user = v); bind('igCapIn', (v) => state.ig.caption = v); bind('pausesSel', (v) => state.pauses = v, 'change');
bind('gradeSel', (v) => state.grade = v, 'change'); bind('ratioSel', (v) => state.ratio = v, 'change'); bind('progressOn', (v) => state.progress = v, 'change'); bind('fxAccent', (v) => state.fxAccent = v, 'change');
bind('endOn', (v) => state.endCard.on = v, 'change'); bind('endStyle', (v) => state.endCard.style = v, 'change'); bind('endTitle', (v) => state.endCard.title = v); bind('endSub', (v) => state.endCard.sub = v); bind('endDur', (v) => state.endCard.d = +v);
bind('musicMode', (v) => { state.music.mode = v; $('musicGen').hidden = v !== 'generated'; $('musicFileRow').hidden = v !== 'file'; if (v === 'file' && !music.buffer) $('musicFileInfo').textContent = 'Pick a file to use it.'; }, 'change'); bind('musicMood', (v) => state.music.mood = v, 'change'); bind('musicBpm', (v) => state.music.bpm = +v, 'change'); bind('musicVol', (v) => state.music.vol = +v); bind('musicDuck', (v) => state.music.duck = v, 'change');
bind('sfxOn', (v) => state.sfx.on = v, 'change'); bind('sfxVol', (v) => state.sfx.vol = +v); bind('voiceVol', (v) => state.voiceVol = +v);
$('musicRegen').onclick = () => { state.music.seed = (state.music.seed || 1) + 1; commit(); }; $('musicWav').onclick = musicToWav;
$('musicFile').onchange = (e) => { const f = e.target.files[0]; if (f) loadMusicFile(f).catch(() => toast('Could not read that audio file')); };
$('sfxTry').replaceChildren(...Object.keys(SFX).map((k) => { const b = el('button', 'btn sm', k); b.onclick = () => { ensureAudioGraph(); if (audioCtx.state === 'suspended') audioCtx.resume(); applyLevels(); SFX[k](audioCtx.currentTime + 0.02); }; return b; }));
$('fxSearch').oninput = renderFxMenu;
$('projectName').addEventListener('change', (e) => { state.name = e.target.value.trim() || 'untitled-reel'; commit(); });
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo; $('playBtn').onclick = () => (engine.playing ? pause() : play()); $('restartBtn').onclick = () => seekCut(0); $('muteChk').onchange = applyLevels; $('coverBtn').onclick = saveCover;
$('igToggle').onclick = (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); $('igEl').hidden = !on; };
$('safeToggle').onclick = (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); $('safeEl').hidden = !on; };
$('renderBtn').onclick = renderCut; $('splitBtn').onclick = splitAtPlayhead;
$('keepAll').onclick = () => { state.phrases.forEach((p) => p.keep = true); commit(); }; $('dropAll').onclick = () => { state.phrases.forEach((p) => p.keep = false); commit(); };
$('dropFillers').onclick = () => { let n = 0; for (const p of state.phrases) { const d = new Set(p.dropped || []); for (let i = p.from; i <= p.to; i++) { const t = state.words[i].t.toLowerCase().replace(/[^a-z']/g, ''); if (FILLERS.has(t) && !d.has(i)) { d.add(i); n++; } } p.dropped = [...d]; } commit(); toast(n ? `Cut ${n} filler words` : 'No filler words found'); };
$('autoZoom').onclick = () => { let i = 0; for (const id of state.order) { const p = state.phrases.find((q) => q.id === id); if (!p || !p.keep) continue; p.zoom = i % 2 ? 1.15 : 1; i++; } commit(); toast('Zoom alternates on every other clip'); };
$('autoTrans').onclick = () => { const all = state.phrases.every((p) => p.transition === 'dissolve'); state.phrases.forEach((p) => p.transition = all ? 'cut' : 'dissolve'); commit(); toast(all ? 'Back to hard cuts' : 'Dissolve on every cut'); };
$('saveVersion').onclick = saveVersion; $('exportProject').onclick = () => download((state.name || 'reel') + '.reelcut.json', cleanState(), 'application/json');
$('importProject').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { history.undo.push(snapshot()); state = mergeState(JSON.parse(await f.text())); afterChange(true); toast('Project loaded'); } catch { toast('That file is not a reelcut project'); } e.target.value = ''; };
$('exportFfmpeg').onclick = exportFfmpeg; $('exportSrt').onclick = exportSrt; $('transcribeApi').onclick = transcribeViaApi; $('transcribeLocal').onclick = transcribeLocal; $('videoFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) loadVideo(f); };
$('srtFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { setTranscript(parseTranscript(await f.text(), f.name)); trStatus(`Loaded ${state.words.length} words from ${f.name}`); } catch (err) { trStatus('Could not read that transcript: ' + err.message); } e.target.value = ''; };
for (const [dropId, inputId] of [['videoDrop', 'videoFile'], ['srtDrop', 'srtFile'], ['musicDrop', 'musicFile']]) { const d = $(dropId); d.ondragover = (e) => { e.preventDefault(); d.classList.add('drag'); }; d.ondragleave = () => d.classList.remove('drag'); d.ondrop = (e) => { e.preventDefault(); d.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (!f) return inputId === 'videoFile' ? emptyDrop() : toast('No file came through. Copy it to your PC first.'); if (inputId === 'videoFile') loadVideo(f); else { const dt = new DataTransfer(); dt.items.add(f); $(inputId).files = dt.files; $(inputId).dispatchEvent(new Event('change')); } }; }
const openPicker = () => { const i = $('videoFile'); try { i.showPicker ? i.showPicker() : i.click(); } catch { i.click(); } };
$('addVideoBtn').onclick = openPicker;
$('emptyState').addEventListener('click', (e) => { if (e.target.closest('#pickVideo') || (!media.url && !convertWorker && !e.target.closest('button, a'))) openPicker(); });
// a drop with no file in it, usually dragged straight from an iPhone in File Explorer or from the Photos app
function emptyDrop() { phoneMessage('<b>That drop had no file in it</b>Windows does not pass videos dragged straight from a plugged-in iPhone or the Photos app. Copy the video to your PC first (for example to Downloads), then choose it here.<br><br><button class="btn primary" id="pickVideo" type="button">Choose a video</button>'); toast('No file came through. Copy the video to your PC, then choose it.'); }
const phone = $('phone'); phone.addEventListener('dragover', (e) => { e.preventDefault(); $('emptyState').classList.add('drag'); }); phone.addEventListener('dragleave', () => $('emptyState').classList.remove('drag')); phone.addEventListener('drop', (e) => { e.preventDefault(); $('emptyState').classList.remove('drag'); const f = e.dataTransfer.files[0]; if (!f) return emptyDrop(); if (isVideoFile(f)) loadVideo(f); else if (isAudioFile(f)) loadMusicFile(f).catch(() => toast('Could not read that audio file')); else { const dt = new DataTransfer(); dt.items.add(f); $('srtFile').files = dt.files; $('srtFile').dispatchEvent(new Event('change')); } });
pv.addEventListener('click', () => (engine.playing ? pause() : play()));
document.querySelectorAll('.tabs [role="tab"]').forEach((b) => b.onclick = () => setTab(b.dataset.tab));
function setTab(name) { document.querySelectorAll('.tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name)); document.querySelectorAll('.tab').forEach((t) => t.hidden = t.dataset.tab !== name); }
function setTheme(t) { try { localStorage.setItem('reelcut:theme', t); } catch {} if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; $('themeDark').setAttribute('aria-pressed', t === 'dark'); $('themeLight').setAttribute('aria-pressed', t !== 'dark'); }
$('themeDark').onclick = () => setTheme('dark'); $('themeLight').onclick = () => setTheme('light');
document.addEventListener('keydown', (e) => { if (e.target.matches('input, textarea, select')) return; if (e.code === 'Space') { e.preventDefault(); engine.playing ? pause() : play(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } if (e.key === 'ArrowLeft') seekCut(engine.cut - (e.shiftKey ? 0.1 : 1)); if (e.key === 'ArrowRight') seekCut(engine.cut + (e.shiftKey ? 0.1 : 1)); if (e.key === 'Home') seekCut(0); if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) splitAtPlayhead(); });
let toastTimer = 0; function toast(t) { const n = $('toast'); n.textContent = t; n.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => n.hidden = true, 2600); }

window.addEventListener('dragover', (e) => e.preventDefault()); window.addEventListener('drop', (e) => { if (!e.target.closest('#phone, .drop')) { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f && isVideoFile(f)) loadVideo(f); else if (!f) emptyDrop(); } });
// any unexpected error shows on screen instead of failing silently
const showError = (msg) => { try { toast('Something went wrong: ' + String(msg).slice(0, 140)); const n = $('videoInfo'); if (n && !media.url) n.textContent = 'Error: ' + String(msg).slice(0, 200); } catch {} };
window.addEventListener('error', (e) => { if (e.message && !/ResizeObserver/.test(e.message)) showError(e.message); });
window.addEventListener('unhandledrejection', (e) => { const m = e.reason && (e.reason.message || e.reason); if (m && !/segment|mediapipe|AbortError|play\(\)/i.test(String(m))) showError(m); });
/* ---------- boot ---------- */
try { setTheme(EMBED ? 'light' : (localStorage.getItem('reelcut:theme') || '')); $('apiKey').value = localStorage.getItem('reelcut:key') || ''; } catch {}
renderFxMenu(); syncControls(); afterChange(true);
window.reelcut = { get state() { return state; }, loadVideo, setTranscript, parseTranscript, computeSegments, get segments() { return segments; }, get chunks() { return chunks; }, buildAss, seekCut, play, pause, commit, addCue, drawFrame, generateMusic, SFX, get engine() { return engine; }, get segm() { return segm; }, totalDuration };
})();
