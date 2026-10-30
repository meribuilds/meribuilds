/* reelcut ~ transcript-driven vlog cutter. Vanilla JS, no build step. */
(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (s, tenths = true) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${tenths ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0')}`; };
const FILLERS = new Set(['um', 'uh', 'umm', 'uhh', 'hmm', 'like', 'literally', 'basically', 'actually', 'so', 'yeah', 'okay', 'ok', 'right', 'well', 'you know', 'kind of', 'sort of']);
const PAUSE_PRESETS = { none: { gap: Infinity, pad: 0.15 }, tight: { gap: 0.6, pad: 0.08 }, tighter: { gap: 0.35, pad: 0.04 } };

/* ---------- state ---------- */
const media = { file: null, url: null, duration: 0, w: 0, h: 0, thumbs: [], thumbStep: 4 };
let state = freshState();
function freshState() {
  return {
    name: 'untitled-reel', words: [], phrases: [], order: [], pauses: 'tight',
    hook: { on: true, style: 'abie', show: 'whole', small: '', big: '', sub: '', x: 50, y: 16, size: 1 },
    captions: { on: true, template: 'abie2', words: 4, size: 1, x: 50, y: 74, case: 'as-is' },
    stickers: [], ig: { user: 'yourhandle', caption: 'first client pitch in Valencia ~ what I learned' },
  };
}
const history = { undo: [], redo: [] };
function snapshot() { return JSON.stringify(state); }
function commit() { history.undo.push(snapshot()); if (history.undo.length > 120) history.undo.shift(); history.redo = []; afterChange(); }
function undo() { if (!history.undo.length) return; history.redo.push(snapshot()); state = JSON.parse(history.undo.pop()); afterChange(true); }
function redo() { if (!history.redo.length) return; history.undo.push(snapshot()); state = JSON.parse(history.redo.pop()); afterChange(true); }

/* ---------- segments (the cut) ---------- */
let segments = []; // {start,end,dur,cutStart,phraseId,rotate,words:[word idx]}
function phraseWords(p) { const out = []; for (let i = p.from; i <= p.to; i++) out.push(i); return out; }
function computeSegments() {
  const preset = PAUSE_PRESETS[state.pauses] || PAUSE_PRESETS.tight;
  const segs = [];
  for (const id of state.order) {
    const p = state.phrases.find((q) => q.id === id);
    if (!p || !p.keep) continue;
    const dropped = new Set(p.dropped || []);
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const first = state.words[run[0]], last = state.words[run[run.length - 1]];
      segs.push({ start: Math.max(0, first.s - preset.pad), end: Math.min(media.duration || Infinity, last.e + preset.pad), phraseId: p.id, rotate: p.rotate || 0, words: run });
      run = [];
    };
    for (let i = p.from; i <= p.to; i++) {
      if (dropped.has(i)) { flush(); continue; }
      if (run.length) {
        const prev = state.words[run[run.length - 1]], cur = state.words[i];
        if (cur.s - prev.e > preset.gap) flush();
      }
      run.push(i);
    }
    flush();
  }
  // merge touching segments, then compute cut times
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.phraseId === s.phraseId && s.start <= last.end + 0.02) { last.end = Math.max(last.end, s.end); last.words.push(...s.words); }
    else merged.push({ ...s, words: [...s.words] });
  }
  let t = 0;
  for (const s of merged) { s.dur = Math.max(0.05, s.end - s.start); s.cutStart = t; t += s.dur; }
  segments = merged;
  return merged;
}
const cutDuration = () => segments.reduce((a, s) => a + s.dur, 0);
function segAtCut(ct) { for (const s of segments) if (ct < s.cutStart + s.dur) return s; return segments[segments.length - 1] || null; }
function cutToSrc(ct) { const s = segAtCut(ct); return s ? s.start + clamp(ct - s.cutStart, 0, s.dur) : 0; }
function hookEnd() {
  const total = cutDuration();
  if (!state.hook.on || !segments.length) return 0;
  if (state.hook.show === 'whole') return total;
  if (state.hook.show === 'first') return segments[0].dur;
  return Math.min(total, Number(state.hook.show));
}
function capStart() { return state.hook.on && state.hook.show !== 'whole' ? hookEnd() : 0; }

/* caption chunks in cut time: [{s,e,words:[{t,s,e}]}] */
let chunks = [];
function computeChunks() {
  chunks = [];
  const per = Number(state.captions.words) || 4;
  for (const seg of segments) {
    let cur = [];
    const push = () => { if (cur.length) { chunks.push({ s: cur[0].s, e: cur[cur.length - 1].e, words: cur }); cur = []; } };
    for (const wi of seg.words) {
      const w = state.words[wi];
      const s = seg.cutStart + clamp(w.s - seg.start, 0, seg.dur), e = seg.cutStart + clamp(w.e - seg.start, 0, seg.dur);
      cur.push({ t: w.t, s, e });
      if (cur.length >= per || /[.!?,;:]$/.test(w.t)) push();
    }
    push();
  }
  for (let i = 0; i < chunks.length; i++) { const nx = chunks[i + 1]; const limit = nx ? nx.s : cutDuration(); chunks[i].e = Math.min(limit, Math.max(chunks[i].e, chunks[i].s + 0.4)); }
}
function chunkAt(ct) { if (ct < capStart()) return null; for (const c of chunks) if (ct >= c.s && ct < c.e) return c; return null; }
function caseWord(t) { const c = state.captions.case; return c === 'upper' ? t.toUpperCase() : c === 'lower' ? t.toLowerCase() : t; }

/* ---------- transcript → phrases ---------- */
function buildPhrases(words) {
  const phrases = []; let from = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i], nx = words[i + 1];
    const end = !nx || /[.!?]$/.test(w.t) || (nx.s - w.e > 0.9) || (i - from >= 13 && /[,;:]$/.test(w.t)) || i - from >= 22;
    if (end) { phrases.push(mkPhrase(phrases.length + 1, from, i)); from = i + 1; }
  }
  return phrases;
}
function mkPhrase(n, from, to) { return { id: 'C1S' + String(n).padStart(3, '0'), from, to, keep: true, rotate: 0, dropped: [] }; }
function setTranscript(words) {
  words = words.filter((w) => w.t && w.t.trim()).map((w) => ({ t: w.t.trim(), s: Math.max(0, +w.s || 0), e: Math.max(+w.s || 0, +w.e || 0) }));
  for (let i = 0; i < words.length; i++) if (words[i].e <= words[i].s) words[i].e = words[i].s + 0.25;
  state.words = words; state.phrases = buildPhrases(words); state.order = state.phrases.map((p) => p.id);
  commit(); setTab('words');
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
  // SRT / VTT
  const out = []; const re = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
  const toS = (h, m, s, ms) => (parseInt(h || '0') * 3600) + parseInt(m) * 60 + parseInt(s) + parseInt(String(ms).padEnd(3, '0')) / 1000;
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n'); const ti = lines.findIndex((l) => re.test(l)); if (ti < 0) continue;
    const m = lines[ti].match(re); const s = toS(m[1], m[2], m[3], m[4]), e = toS(m[5], m[6], m[7], m[8]);
    const txt = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim(); if (txt) out.push(...spread(txt, s, e));
  }
  if (!out.length) throw new Error('No timed lines found. Use .srt, .vtt or Whisper .json');
  return out;
}
function spread(text, s, e) { const ws = text.split(/\s+/).filter(Boolean); const d = (e - s) / Math.max(1, ws.length); return ws.map((t, i) => ({ t, s: s + i * d, e: s + (i + 1) * d })); }

/* ---------- audio extraction (16 kHz mono WAV) ---------- */
async function extractAudio(onStatus) {
  onStatus('Reading audio from the video…');
  const buf = await media.file.arrayBuffer();
  const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 16000 * Math.max(1, Math.ceil(media.duration || 60)), 16000);
  const decoded = await ctx.decodeAudioData(buf);
  const src = ctx.createBufferSource(); src.buffer = decoded; src.connect(ctx.destination); src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice(0, Math.ceil(decoded.duration * 16000));
}
function pcmToWav(f32) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = clamp(f32[i], -1, 1); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
async function transcribeViaApi() {
  const key = $('apiKey').value.trim(); if (!key) return toast('Paste an OpenAI API key first'); if (!media.file) return toast('Add a video first');
  try { localStorage.setItem('reelcut:key', key); } catch {}
  setBusy(true);
  try {
    const pcm = await extractAudio(trStatus);
    trStatus('Uploading audio to OpenAI Whisper…');
    const fd = new FormData(); fd.append('file', pcmToWav(pcm), 'audio.wav'); fd.append('model', 'whisper-1'); fd.append('response_format', 'verbose_json'); fd.append('timestamp_granularities[]', 'word');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
    if (!r.ok) throw new Error('OpenAI said ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const j = await r.json(); setTranscript(parseTranscript(JSON.stringify(j), 'x.json')); trStatus('Transcribed ' + state.words.length + ' words.');
  } catch (e) { trStatus('Failed: ' + e.message); toast('Transcription failed'); }
  setBusy(false);
}
let worker = null;
async function transcribeLocal() {
  if (!media.file) return toast('Add a video first');
  setBusy(true); $('trProgress').hidden = false;
  try {
    const pcm = await extractAudio(trStatus);
    trStatus('Loading the speech model (first time downloads it)…');
    if (!worker) worker = new Worker('whisper-worker.js', { type: 'module' });
    const words = await new Promise((res, rej) => {
      worker.onmessage = (ev) => { const m = ev.data; if (m.type === 'progress') { trStatus(m.text); if (m.pct != null) $('trProgress').firstElementChild.style.width = m.pct + '%'; } else if (m.type === 'done') res(m.words); else if (m.type === 'error') rej(new Error(m.message)); };
      worker.onerror = (e) => rej(new Error(e.message || 'worker failed'));
      worker.postMessage({ type: 'run', audio: pcm, model: $('localModel').value }, [pcm.buffer]);
    });
    setTranscript(words); trStatus('Transcribed ' + words.length + ' words in your browser.');
  } catch (e) { trStatus('Failed: ' + e.message + '. Try the upload or API option.'); toast('In-browser transcription failed'); }
  $('trProgress').hidden = true; setBusy(false);
}
function trStatus(t) { $('trStatus').textContent = t; }
function setBusy(b) { for (const id of ['transcribeApi', 'transcribeLocal']) $(id).disabled = b; }

/* ---------- video loading + filmstrip ---------- */
const video = $('video'), tv = $('thumbVideo');
async function loadVideo(file) {
  if (!file) return;
  if (media.url) URL.revokeObjectURL(media.url);
  media.file = file; media.url = URL.createObjectURL(file);
  video.src = media.url; tv.src = media.url;
  $('fileLabel').textContent = file.name; $('emptyState').hidden = true;
  await new Promise((res) => { video.onloadedmetadata = res; video.onerror = res; });
  media.duration = video.duration || 0; media.w = video.videoWidth; media.h = video.videoHeight;
  $('videoInfo').textContent = `${file.name} · ${fmt(media.duration)} · ${media.w}×${media.h}`;
  const saved = loadProject(); state.name = saved ? state.name : file.name.replace(/\.[^.]+$/, '');
  $('projectName').value = state.name;
  afterChange(true); buildFilmstrip();
}
async function buildFilmstrip() {
  media.thumbs = []; const d = media.duration; if (!d) return;
  media.thumbStep = d > 240 ? 6 : d > 90 ? 4 : d > 30 ? 2 : 1;
  const c = document.createElement('canvas'); const ar = media.w / media.h || 9 / 16; c.height = 96; c.width = Math.round(96 * ar); const ctx = c.getContext('2d');
  for (let t = 0; t < d; t += media.thumbStep) {
    try {
      await new Promise((res, rej) => { tv.onseeked = res; tv.onerror = rej; tv.currentTime = Math.min(t + 0.05, d - 0.05); setTimeout(res, 1500); });
      ctx.drawImage(tv, 0, 0, c.width, c.height); media.thumbs.push({ t, url: c.toDataURL('image/jpeg', 0.6) });
    } catch { break; }
    if (media.thumbs.length % 5 === 0) renderTimeline();
  }
  renderTimeline(); renderCards();
}
const thumbFor = (t) => { if (!media.thumbs.length) return ''; const i = clamp(Math.round(t / media.thumbStep), 0, media.thumbs.length - 1); return media.thumbs[i].url; };

/* ---------- playback engine ---------- */
const engine = { playing: false, cut: 0, raf: 0, onEnd: null, rendering: false };
let audioCtx = null, gainNode = null, msDest = null;
function ensureAudioGraph() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(video); gainNode = audioCtx.createGain(); msDest = audioCtx.createMediaStreamDestination();
    src.connect(gainNode); gainNode.connect(audioCtx.destination); src.connect(msDest);
  } catch (e) { console.warn('audio graph', e); }
}
function applyMute() { if (gainNode) gainNode.gain.value = $('muteChk').checked ? 0 : 1; else video.muted = $('muteChk').checked; }
function seekCut(ct) {
  engine.cut = clamp(ct, 0, Math.max(0, cutDuration() - 0.001));
  const s = segAtCut(engine.cut); if (s) video.currentTime = s.start + (engine.cut - s.cutStart);
  updateOverlays();
}
function play() {
  if (!segments.length || !media.url) return;
  ensureAudioGraph(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); applyMute();
  if (engine.cut >= cutDuration() - 0.01) engine.cut = 0;
  const s = segAtCut(engine.cut); video.currentTime = s.start + (engine.cut - s.cutStart);
  engine.playing = true; $('playBtn').textContent = '❚❚ Pause'; video.play().catch(() => {});
  cancelAnimationFrame(engine.raf); engine.raf = requestAnimationFrame(tick);
}
function pause() { engine.playing = false; video.pause(); $('playBtn').textContent = '▶ Play cut'; cancelAnimationFrame(engine.raf); }
function tick() {
  if (!engine.playing) return;
  const s = segAtCut(engine.cut); if (!s) return pause();
  const vt = video.currentTime;
  if (vt >= s.end - 0.03 || vt < s.start - 0.5) {
    const idx = segments.indexOf(s); const nx = segments[idx + 1];
    if (!nx) { engine.cut = cutDuration(); pause(); updateOverlays(); if (engine.onEnd) engine.onEnd(); return; }
    engine.cut = nx.cutStart; video.currentTime = nx.start;
  } else engine.cut = s.cutStart + clamp(vt - s.start, 0, s.dur);
  updateOverlays(); engine.raf = requestAnimationFrame(tick);
}

/* ---------- overlays (preview) ---------- */
function hookLines() {
  const h = state.hook; let small = h.small, big = h.big;
  if (!small && !big && state.words.length) { const p = state.phrases[0]; const ws = state.words.slice(p.from, p.to + 1).map((w) => w.t); small = ws.slice(0, 3).join(' '); big = ws.slice(3, 7).join(' ') || small; if (ws.length <= 3) { small = ''; big = ws.join(' '); } }
  return { small, big: big || '', sub: h.sub };
}
function updateOverlays() {
  const ct = engine.cut, s = segAtCut(ct);
  video.style.transform = s && s.rotate ? `rotate(${s.rotate}deg)` + (s.rotate % 180 ? ' scale(' + (media.h / media.w || 1.78) + ')' : '') : '';
  const hk = $('hookEl'); const showHook = state.hook.on && segments.length && ct < hookEnd();
  hk.hidden = !showHook;
  if (showHook) { const L = hookLines(); hk.className = 'hook ' + state.hook.style; hk.querySelector('.small').textContent = L.small; hk.querySelector('.big').textContent = L.big; const sub = hk.querySelector('.sub'); sub.textContent = state.hook.style === 'editorial' ? L.sub : ''; sub.hidden = !sub.textContent; hk.style.left = state.hook.x + '%'; hk.style.top = state.hook.y + '%'; hk.style.fontSize = (state.hook.size * 100) + '%'; hk.querySelector('.small').style.fontSize = (15 * state.hook.size) + 'px'; hk.querySelector('.big').style.fontSize = ((state.hook.style === 'abie' ? 30 : 21) * state.hook.size) + 'px'; }
  const cap = $('capEl'); const c = state.captions.on ? chunkAt(ct) : null;
  cap.hidden = !c;
  if (c) {
    cap.className = 'cap ' + state.captions.template; cap.style.left = state.captions.x + '%'; cap.style.top = state.captions.y + '%'; cap.style.fontSize = ((state.captions.template === 'box' ? 16 : 19) * state.captions.size) + 'px';
    const key = c.s + ':' + c.words.length; if (cap.dataset.key !== key) { cap.dataset.key = key; cap.replaceChildren(...c.words.flatMap((w) => [el('span', '', caseWord(w.t)), ' '])); }
    [...cap.querySelectorAll('span')].forEach((sp, i) => sp.classList.toggle('on', ct >= c.words[i].s && (i === c.words.length - 1 || ct < c.words[i + 1].s)));
  }
  const layer = $('stickerLayer');
  state.stickers.forEach((st, i) => {
    let node = layer.children[i]; if (!node) { node = el('div', 'sticker'); node.dataset.i = i; layer.appendChild(node); }
    node.dataset.i = i; node.hidden = !(ct >= st.s && ct < st.e); node.style.left = st.x + '%'; node.style.top = st.y + '%';
    if (st.img) { if (!node.firstChild || node.firstChild.tagName !== 'IMG') { node.replaceChildren(el('img')); } node.firstChild.src = st.img; } else node.textContent = st.text;
  });
  while (layer.children.length > state.stickers.length) layer.lastChild.remove();
  $('tCur').textContent = fmt(ct); $('tTotal').textContent = fmt(cutDuration());
  const total = cutDuration() || 1; $('playheadCut').style.left = (ct / total * 100) + '%';
  $('playheadSrc').style.left = ((cutToSrc(ct)) / (media.duration || 1) * 100) + '%';
  highlightCard(s);
}
let lastHl = null;
function highlightCard(s) { const id = s ? s.phraseId : null; if (id === lastHl) return; lastHl = id; document.querySelectorAll('.card.active').forEach((c) => c.classList.remove('active')); if (id) { const c = document.querySelector(`.card[data-id="${id}"]`); if (c) c.classList.add('active'); } }

/* drag overlays to reposition */
function makeDraggable(node, get, set) {
  let drag = null;
  node.addEventListener('pointerdown', (e) => { const r = $('phone').getBoundingClientRect(); drag = { r, ox: get().x - (e.clientX - r.left) / r.width * 100, oy: get().y - (e.clientY - r.top) / r.height * 100 }; node.setPointerCapture(e.pointerId); e.preventDefault(); });
  node.addEventListener('pointermove', (e) => { if (!drag) return; set(clamp((e.clientX - drag.r.left) / drag.r.width * 100 + drag.ox, 5, 95), clamp((e.clientY - drag.r.top) / drag.r.height * 100 + drag.oy, 4, 96)); updateOverlays(); });
  node.addEventListener('pointerup', () => { if (drag) { drag = null; commit(); } });
}
makeDraggable($('hookEl'), () => state.hook, (x, y) => { state.hook.x = x; state.hook.y = y; });
makeDraggable($('capEl'), () => state.captions, (x, y) => { state.captions.x = x; state.captions.y = y; });
$('stickerLayer').addEventListener('pointerdown', (e) => {
  const node = e.target.closest('.sticker'); if (!node) return; const st = state.stickers[+node.dataset.i]; if (!st) return;
  const r = $('phone').getBoundingClientRect(); const ox = st.x - (e.clientX - r.left) / r.width * 100, oy = st.y - (e.clientY - r.top) / r.height * 100;
  const move = (ev) => { st.x = clamp((ev.clientX - r.left) / r.width * 100 + ox, 3, 97); st.y = clamp((ev.clientY - r.top) / r.height * 100 + oy, 3, 97); updateOverlays(); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); commit(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); e.preventDefault();
});

/* ---------- Words tab ---------- */
function renderCards() {
  const root = $('cards'); root.replaceChildren();
  if (!state.phrases.length) { root.appendChild(el('div', 'empty-cards', media.url ? 'Now add a transcript in Workflow (step 02).' : 'Add a video and a transcript in Workflow to see phrases here.')); return; }
  const kept = state.order.filter((id) => state.phrases.find((p) => p.id === id)?.keep).length;
  $('cutSummary').textContent = `${kept} phrases · ≈${Math.round(cutDuration())}s`;
  state.order.forEach((id, pos) => {
    const p = state.phrases.find((q) => q.id === id); if (!p) return;
    const first = state.words[p.from], last = state.words[p.to];
    const card = el('div', 'card' + (p.keep ? '' : ' off')); card.dataset.id = p.id;
    const ctl = el('div', 'ctl'); const chk = el('input'); chk.type = 'checkbox'; chk.checked = p.keep; chk.title = 'Keep in cut'; chk.onchange = () => { p.keep = chk.checked; commit(); };
    const up = el('button', '', '▲'); up.title = 'Move up'; up.onclick = () => move(pos, pos - 1); const dn = el('button', '', '▼'); dn.title = 'Move down'; dn.onclick = () => move(pos, pos + 1);
    ctl.append(chk, el('span', 'n', String(pos + 1).padStart(2, '0')), up, dn);
    const th = el('div', 'thumb'); th.style.backgroundImage = `url(${thumbFor(first.s)})`; th.title = 'Preview this phrase'; th.onclick = () => previewPhrase(p);
    const body = el('div', 'body'); const meta = el('div', 'meta');
    meta.append(el('span', 'code', `${p.id} ${fmt(first.s)} – ${fmt(last.e)}`));
    const rot = el('button', 'rot' + (p.rotate ? ' on' : ''), p.rotate ? `↻ ${p.rotate}°` : '↻ Rotate'); rot.onclick = () => { p.rotate = ((p.rotate || 0) + 90) % 360; commit(); };
    const split = el('button', 'rot', '✂'); split.title = 'Split phrase at its middle'; split.onclick = () => splitPhrase(p, Math.floor((p.from + p.to) / 2) + 1);
    meta.append(rot, split);
    const words = el('div', 'words'); const dropped = new Set(p.dropped || []);
    for (let i = p.from; i <= p.to; i++) {
      const w = state.words[i]; const sp = el('span', dropped.has(i) ? 'x' : '', w.t); sp.title = 'Click to cut this word';
      sp.onclick = () => { if (dropped.has(i)) dropped.delete(i); else dropped.add(i); p.dropped = [...dropped]; commit(); };
      words.append(sp, ' ');
      const nx = state.words[i + 1]; if (nx && i < p.to && nx.s - w.e > 0.6) words.append(el('span', 'gap', `(${(nx.s - w.e).toFixed(1)}s)`), ' ');
    }
    body.append(meta, words); card.append(ctl, th, body); root.appendChild(card);
  });
}
function move(from, to) { if (to < 0 || to >= state.order.length) return; const [id] = state.order.splice(from, 1); state.order.splice(to, 0, id); commit(); }
function previewPhrase(p) { const s = segments.find((x) => x.phraseId === p.id); if (!s) { p.keep = true; commit(); return previewPhrase(p); } seekCut(s.cutStart); if (!engine.playing) play(); }
function splitPhrase(p, at) {
  if (at <= p.from || at > p.to) return;
  const b = { ...mkPhrase(0, at, p.to), rotate: p.rotate, dropped: (p.dropped || []).filter((i) => i >= at), keep: p.keep };
  p.to = at - 1; p.dropped = (p.dropped || []).filter((i) => i < at);
  state.phrases.splice(state.phrases.indexOf(p) + 1, 0, b); state.order.splice(state.order.indexOf(p.id) + 1, 0, '__new');
  state.phrases.forEach((q, i) => { const old = q.id; q.id = 'C1S' + String(i + 1).padStart(3, '0'); state.order = state.order.map((x) => (x === old ? '__' + q.id : x)); });
  state.order = state.order.map((x) => (x === '__new' ? b.id : x.startsWith('__') ? x.slice(2) : x));
  commit();
}
function splitAtPlayhead() { const s = segAtCut(engine.cut); if (!s) return; const t = cutToSrc(engine.cut); const p = state.phrases.find((q) => q.id === s.phraseId); for (let i = p.from + 1; i <= p.to; i++) if (state.words[i].s >= t) return splitPhrase(p, i); toast('Move the playhead inside a phrase to split it'); }

/* ---------- timeline ---------- */
function renderTimeline() {
  const total = cutDuration(); $('tlSummary').textContent = `In the cut · ${segments.length} clips · ≈${fmt(total, false)}`; $('srcSummary').textContent = `Source · ${fmt(media.duration, false)}`;
  const ruler = $('rulerCut'); ruler.replaceChildren(); const step = total > 150 ? 30 : total > 60 ? 10 : 5;
  for (let t = 0; t <= total; t += step) { const sp = el('span', '', fmt(t, false)); sp.style.left = (t / (total || 1) * 100) + '%'; ruler.appendChild(sp); }
  const strip = $('stripCut'); [...strip.querySelectorAll('.clip')].forEach((n) => n.remove());
  segments.forEach((s, i) => {
    const c = el('div', 'clip' + (s.rotate ? ' rot' : '')); c.style.width = (s.dur / (total || 1) * 100) + '%'; c.style.backgroundImage = `url(${thumbFor(s.start + 0.3)})`; c.draggable = true; c.dataset.i = i;
    c.append(el('div', 'lbl', state.words.slice(s.words[0], s.words[0] + 3).map((w) => w.t).join(' ')));
    const x = el('button', 'x', '×'); x.title = 'Drop this phrase'; x.onclick = (e) => { e.stopPropagation(); const p = state.phrases.find((q) => q.id === s.phraseId); p.keep = false; commit(); };
    c.append(x); c.onclick = () => { seekCut(s.cutStart); };
    c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', s.phraseId); c.classList.add('drag'); };
    c.ondragend = () => c.classList.remove('drag');
    c.ondragover = (e) => { e.preventDefault(); c.classList.add('over'); }; c.ondragleave = () => c.classList.remove('over');
    c.ondrop = (e) => { e.preventDefault(); c.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (!id || id === s.phraseId) return; const from = state.order.indexOf(id), to = state.order.indexOf(s.phraseId); state.order.splice(from, 1); state.order.splice(to, 0, id); commit(); };
    strip.insertBefore(c, $('playheadCut'));
  });
  const lh = $('laneHook'); lh.replaceChildren(); const he = hookEnd(); if (he > 0) { const b = el('div', 'bar', `Hook · until ${fmt(he)}`); b.style.left = '0'; b.style.width = (he / (total || 1) * 100) + '%'; lh.appendChild(b); }
  const lc = $('laneCaps'); lc.replaceChildren(); if (state.captions.on) for (const c of chunks) { if (c.e <= capStart()) continue; const b = el('div', 'bar'); b.style.left = (Math.max(c.s, capStart()) / (total || 1) * 100) + '%'; b.style.width = (Math.max(0.3, (c.e - Math.max(c.s, capStart())) / (total || 1) * 100)) + '%'; lc.appendChild(b); }
  const ls = $('laneStk'); ls.replaceChildren(); for (const st of state.stickers) { const b = el('div', 'bar', st.img ? '🖼' : st.text); b.style.left = (st.s / (total || 1) * 100) + '%'; b.style.width = (Math.max(1, (st.e - st.s) / (total || 1) * 100)) + '%'; ls.appendChild(b); }
  const src = $('source'); [...src.querySelectorAll('.blk')].forEach((n) => n.remove());
  for (const p of state.phrases) {
    const a = state.words[p.from], b = state.words[p.to]; const blk = el('div', 'blk' + (p.keep ? '' : ' off')); blk.style.left = (a.s / (media.duration || 1) * 100) + '%'; blk.style.width = ((b.e - a.s) / (media.duration || 1) * 100) + '%';
    blk.title = (p.keep ? 'Drop ' : 'Add back ') + p.id + ': ' + state.words.slice(p.from, p.to + 1).map((w) => w.t).join(' ').slice(0, 80);
    blk.onclick = () => { p.keep = !p.keep; commit(); }; src.insertBefore(blk, $('playheadSrc'));
  }
}
$('stripCut').addEventListener('click', (e) => { if (e.target !== e.currentTarget) return; const r = e.currentTarget.getBoundingClientRect(); seekCut((e.clientX - r.left) / r.width * cutDuration()); });

/* ---------- stickers tab ---------- */
function renderStickers() {
  const root = $('stkList'); root.replaceChildren();
  if (!state.stickers.length) root.appendChild(el('div', 'empty-cards', 'No stickers yet.'));
  state.stickers.forEach((st, i) => {
    const card = el('div', 'card'); card.style.gridTemplateColumns = '48px minmax(0,1fr) auto';
    const pv = el('div', 'thumb'); pv.style.width = '48px'; pv.style.height = '48px'; pv.style.display = 'grid'; pv.style.placeItems = 'center'; pv.style.fontSize = '26px'; pv.style.background = 'var(--surface-2)';
    if (st.img) { pv.style.backgroundImage = `url(${st.img})`; pv.style.backgroundSize = 'contain'; } else pv.textContent = st.text;
    const body = el('div', 'body'); body.append(el('span', 'code', `${fmt(st.s)} – ${fmt(st.e)}`)); const rm = el('button', 'btn sm', 'Remove'); rm.onclick = () => { state.stickers.splice(i, 1); commit(); };
    card.append(pv, body, rm); root.appendChild(card);
  });
}
$('stkAdd').onclick = async () => {
  const text = $('stkEmoji').value.trim(); const f = $('stkImg').files[0]; if (!text && !f) return toast('Type an emoji or pick an image');
  const st = { text, img: null, s: +$('stkStart').value || 0, e: +$('stkEnd').value || 3, x: 50, y: 40 };
  if (f) st.img = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
  state.stickers.push(st); $('stkEmoji').value = ''; $('stkImg').value = ''; commit();
};

/* ---------- render (canvas + MediaRecorder) ---------- */
function drawFrame(ctx, W, H, ct) {
  const s = segAtCut(ct); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (s && media.w) {
    const rot = s.rotate || 0; const sw = rot % 180 ? media.h : media.w, sh = rot % 180 ? media.w : media.h; const scale = Math.max(W / sw, H / sh);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(rot * Math.PI / 180); ctx.scale(scale, scale);
    try { ctx.drawImage(video, -media.w / 2, -media.h / 2, media.w, media.h); } catch {}
    ctx.restore();
  }
  const u = W / 340; // same proportions as the phone preview (340px wide)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (state.hook.on && ct < hookEnd()) {
    const L = hookLines(); const x = W * state.hook.x / 100, y = H * state.hook.y / 100; const k = state.hook.size;
    if (state.hook.style === 'abie') {
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 2 * u; ctx.fillStyle = '#fff';
      ctx.font = `500 ${15 * k * u}px Fredoka, Nunito, sans-serif`; if (L.small) ctx.fillText(L.small, x, y - 16 * k * u);
      ctx.font = `700 ${30 * k * u}px Fredoka, Nunito, sans-serif`; wrapText(ctx, L.big, x, y + (L.small ? 10 : 0) * k * u, W * 0.88, 32 * k * u);
      ctx.shadowColor = 'transparent';
    } else if (state.hook.style === 'editorial') {
      ctx.font = `900 ${22 * k * u}px Nunito, sans-serif`; boxText(ctx, L.big.toUpperCase(), x, y, 10 * u, 4 * u, '#111', '#fff');
      if (L.sub) { ctx.font = `700 ${12 * k * u}px Nunito, sans-serif`; boxText(ctx, L.sub, x, y + 24 * k * u, 8 * u, 2 * u, '#fff', '#111'); }
    } else { ctx.font = `800 ${20 * k * u}px Nunito, sans-serif`; boxText(ctx, L.big, x, y, 12 * u, 5 * u, '#fff', '#111', 8 * u); }
  }
  const c = state.captions.on ? chunkAt(ct) : null;
  if (c) {
    const k = state.captions.size; const tpl = state.captions.template; const fs = (tpl === 'box' ? 16 : 19) * k * u; ctx.font = `${tpl === 'box' ? 800 : 900} ${fs}px Nunito, sans-serif`;
    const words = c.words.map((w) => caseWord(w.t)); const widths = words.map((w) => ctx.measureText(w).width); const gap = 6 * u;
    const lines = []; let line = [], lw = 0; const maxW = W * 0.86 - (tpl === 'box' ? 20 * u : 0);
    words.forEach((w, i) => { if (line.length && lw + widths[i] + gap > maxW) { lines.push(line); line = []; lw = 0; } line.push(i); lw += widths[i] + (line.length > 1 ? gap : 0); });
    if (line.length) lines.push(line);
    const lh = fs * 1.2; const x0 = W * state.captions.x / 100, y0 = H * state.captions.y / 100 - (lines.length - 1) * lh / 2;
    const cur = c.words.findIndex((w, i) => ct >= w.s && (i === c.words.length - 1 || ct < c.words[i + 1].s));
    if (tpl === 'box') { const bw = Math.max(...lines.map((ln) => ln.reduce((a, i) => a + widths[i], 0) + gap * (ln.length - 1))) + 20 * u; const bh = lines.length * lh + 12 * u; roundRect(ctx, x0 - bw / 2, y0 - lh / 2 - 6 * u, bw, bh, 8 * u, 'rgba(10,10,10,0.78)'); }
    else { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 2 * u; }
    lines.forEach((ln, li) => {
      const total = ln.reduce((a, i) => a + widths[i], 0) + gap * (ln.length - 1); let x = x0 - total / 2; const y = y0 + li * lh;
      for (const i of ln) {
        const on = i === cur; ctx.fillStyle = on ? (tpl === 'abie2' ? '#E8C2C4' : tpl === 'yellow' ? '#FFD43B' : '#fff') : '#fff';
        ctx.save(); if (on && tpl !== 'box') { ctx.translate(x + widths[i] / 2, y); ctx.scale(1.12, 1.12); ctx.translate(-(x + widths[i] / 2), -y); }
        ctx.textAlign = 'left'; ctx.fillText(words[i], x, y); ctx.restore(); x += widths[i] + gap;
      }
    });
    ctx.shadowColor = 'transparent'; ctx.textAlign = 'center';
  }
  for (const st of state.stickers) {
    if (!(ct >= st.s && ct < st.e)) continue; const x = W * st.x / 100, y = H * st.y / 100;
    if (st.img) { if (!st._img) { st._img = new Image(); st._img.src = st.img; } if (st._img.complete) ctx.drawImage(st._img, x - 45 * u, y - 45 * u, 90 * u, 90 * u); }
    else { ctx.font = `${40 * u}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(st.text, x, y); }
  }
}
function wrapText(ctx, text, x, y, maxW, lh) { const ws = text.split(' '); const lines = []; let cur = ''; for (const w of ws) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); }
function boxText(ctx, text, x, y, px, py, bg, fg, r = 0) { const w = ctx.measureText(text).width; const m = ctx.measureText('M'); const h = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || parseFloat(ctx.font); roundRect(ctx, x - w / 2 - px, y - h / 2 - py, w + px * 2, h + py * 2, r, bg); ctx.fillStyle = fg; ctx.fillText(text, x, y); }
function roundRect(ctx, x, y, w, h, r, fill) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }

let recorder = null;
async function renderCut() {
  if (!segments.length || !media.url) return toast('Nothing to render yet');
  pause(); ensureAudioGraph(); if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
  await Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('900 40px Nunito'), document.fonts.load('500 40px Fredoka'), document.fonts.load('800 40px Nunito')]).catch(() => {});
  const canvas = $('renderCanvas'); const portrait = media.h >= media.w; canvas.width = portrait ? 1080 : 1920; canvas.height = portrait ? 1920 : 1080;
  const ctx = canvas.getContext('2d'); const modal = $('renderModal'); modal.hidden = false; $('renderDownload').hidden = true; $('renderBar').style.width = '0%'; $('renderTitle').textContent = 'Rendering your cut'; $('renderCancel').textContent = 'Cancel';
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) { modal.hidden = true; return toast('This browser cannot record video. Use Chrome, or the FFmpeg export.'); }
  const stream = canvas.captureStream(30); if (msDest) for (const t of msDest.stream.getAudioTracks()) stream.addTrack(t);
  const parts = []; recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 });
  recorder.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const total = cutDuration(); const prevMute = $('muteChk').checked; if (gainNode) gainNode.gain.value = 0; // silent while recording, audio still reaches the recorder
  const finish = () => {
    engine.onEnd = null; cancelAnimationFrame(draw.raf); if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorder.onstop = () => {
      if (gainNode) gainNode.gain.value = prevMute ? 0 : 1;
      if (!parts.length) { modal.hidden = true; return; }
      const blob = new Blob(parts, { type: mime }); const ext = mime.includes('mp4') ? 'mp4' : 'webm'; const a = $('renderDownload'); a.href = URL.createObjectURL(blob); a.download = `${state.name || 'reel'}.${ext}`; a.hidden = false;
      $('renderTitle').textContent = 'Done'; $('renderCancel').textContent = 'Close'; $('renderStatus').textContent = `${fmt(total)} · ${(blob.size / 1e6).toFixed(1)} MB · ${ext.toUpperCase()}${ext === 'webm' ? ' (Chrome saves MP4; this browser saves WebM)' : ''}`; $('renderBar').style.width = '100%';
    };
  };
  const draw = () => { drawFrame(ctx, canvas.width, canvas.height, engine.cut); $('renderBar').style.width = (engine.cut / total * 100) + '%'; $('renderStatus').textContent = `Recording ${fmt(engine.cut)} of ${fmt(total)} · keep this tab in front`; draw.raf = requestAnimationFrame(draw); };
  $('renderCancel').onclick = () => { pause(); finish(); modal.hidden = true; };
  engine.onEnd = () => setTimeout(finish, 150);
  engine.rendering = true; seekCut(0); await new Promise((r) => setTimeout(r, 200)); recorder.start(250); play(); draw();
}

/* ---------- exports ---------- */
function download(name, text, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const assT = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${sec}`; };
const srtT = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
function buildAss(W, H) {
  const esc = (t) => t.replace(/[{}]/g, ''); const u = W / 340; const cap = state.captions; const hk = state.hook; const hl = { abie2: '&HC4C2E8&', yellow: '&H3BD4FF&', box: '&HFFFFFF&' }[cap.template];
  let s = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`;
  s += `Style: Cap,Nunito,${Math.round((cap.template === 'box' ? 16 : 19) * cap.size * u * 1.25)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,${cap.template === 'box' ? 3 : 1},${cap.template === 'box' ? 10 : 2},${cap.template === 'box' ? 0 : 2},5,20,20,20,1\n`;
  s += `Style: HookSmall,Fredoka,${Math.round(15 * hk.size * u * 1.25)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,2,5,20,20,20,1\n`;
  s += `Style: HookBig,${hk.style === 'abie' ? 'Fredoka' : 'Nunito'},${Math.round((hk.style === 'abie' ? 30 : 22) * hk.size * u * 1.25)},${hk.style === 'abie' ? '&H00FFFFFF' : hk.style === 'editorial' ? '&H00FFFFFF' : '&H00111111'},&H00FFFFFF,&H00000000,${hk.style === 'abie' ? '&H80000000' : hk.style === 'editorial' ? '&H00111111' : '&H00FFFFFF'},-1,0,0,0,100,100,0,0,${hk.style === 'abie' ? 1 : 3},${hk.style === 'abie' ? 2 : 10},${hk.style === 'abie' ? 2 : 0},5,20,20,20,1\n`;
  s += `\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const he = hookEnd();
  if (he > 0) { const L = hookLines(); const x = Math.round(W * hk.x / 100), y = Math.round(H * hk.y / 100); if (hk.style === 'abie' && L.small) s += `Dialogue: 0,${assT(0)},${assT(he)},HookSmall,,0,0,0,,{\\pos(${x},${y - Math.round(18 * hk.size * u)})}${esc(L.small)}\n`; s += `Dialogue: 0,${assT(0)},${assT(he)},HookBig,,0,0,0,,{\\pos(${x},${y + Math.round((hk.style === 'abie' && L.small ? 10 : 0) * hk.size * u)})}${esc(hk.style === 'editorial' ? L.big.toUpperCase() : L.big)}\n`; if (hk.style === 'editorial' && L.sub) s += `Dialogue: 0,${assT(0)},${assT(he)},HookSmall,,0,0,0,,{\\pos(${x},${y + Math.round(26 * hk.size * u)})}${esc(L.sub)}\n`; }
  if (state.captions.on) {
    const x = Math.round(W * cap.x / 100), y = Math.round(H * cap.y / 100); const cs = capStart();
    for (const c of chunks) { if (c.e <= cs) continue; c.words.forEach((w, i) => { const a = Math.max(cs, i === 0 ? c.s : w.s), b = i === c.words.length - 1 ? c.e : c.words[i + 1].s; if (b <= a) return; const txt = c.words.map((v, j) => (j === i ? `{\\c${hl}}${esc(caseWord(v.t))}{\\c&HFFFFFF&}` : esc(caseWord(v.t)))).join(' '); s += `Dialogue: 1,${assT(a)},${assT(b)},Cap,,0,0,0,,{\\pos(${x},${y})}${txt}\n`; }); }
  }
  return s;
}
function exportFfmpeg() {
  if (!segments.length) return toast('Nothing to export yet');
  const portrait = media.h >= media.w; const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080; const input = media.file ? media.file.name : 'input.mp4';
  let fc = ''; const vs = [], as = [];
  segments.forEach((s, i) => { const tr = s.rotate === 90 ? ',transpose=1' : s.rotate === 180 ? ',transpose=1,transpose=1' : s.rotate === 270 ? ',transpose=2' : ''; fc += `[0:v]trim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},setpts=PTS-STARTPTS${tr},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[v${i}];[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`; vs.push(`[v${i}]`); as.push(`[a${i}]`); });
  fc += `${vs.map((v, i) => v + as[i]).join('')}concat=n=${segments.length}:v=1:a=1[vc][ac];[vc]ass=captions.ass[vout]`;
  const sh = `#!/usr/bin/env bash
# reelcut export ~ run this next to your video file: bash render.sh
# Needs ffmpeg (brew install ffmpeg / apt install ffmpeg). Fonts: Fredoka + Nunito from Google Fonts, or it falls back to a system font.
set -e
INPUT="\${1:-${input.replace(/"/g, '\\"')}}"
cat > captions.ass <<'EOF_ASS'
${buildAss(W, H)}EOF_ASS
ffmpeg -y -i "$INPUT" -filter_complex "${fc}" -map "[vout]" -map "[ac]" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${(state.name || 'reel').replace(/[^\w.-]+/g, '_')}_cut.mp4"
echo "Done: ${(state.name || 'reel').replace(/[^\w.-]+/g, '_')}_cut.mp4"
`;
  download('render.sh', sh); toast('render.sh downloaded');
}
function exportSrt() { if (!chunks.length) return toast('No captions yet'); let i = 1, out = ''; for (const c of chunks) out += `${i++}\n${srtT(c.s)} --> ${srtT(c.e)}\n${c.words.map((w) => caseWord(w.t)).join(' ')}\n\n`; download((state.name || 'reel') + '.srt', out); }

/* ---------- persistence + versions ---------- */
const key = () => media.file ? `reelcut:${media.file.name}:${media.file.size}` : null;
let saveTimer = 0;
function saveProject() { const k = key(); if (!k) return; try { const store = JSON.parse(localStorage.getItem(k) || '{}'); store.draft = snapshot(); localStorage.setItem(k, JSON.stringify(store)); $('saveStatus').textContent = 'saved'; } catch { $('saveStatus').textContent = 'not saved'; } }
function loadProject() { const k = key(); if (!k) return false; try { const store = JSON.parse(localStorage.getItem(k) || 'null'); if (!store || !store.draft) return false; state = { ...freshState(), ...JSON.parse(store.draft) }; renderVersions(); toast('Picked up where you left off'); return true; } catch { return false; } }
function versionsStore() { const k = key(); if (!k) return { versions: [] }; try { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.versions = s.versions || []; return s; } catch { return { versions: [] }; } }
function saveVersion() { const k = key(); if (!k) return toast('Add a video first'); const s = versionsStore(); const name = 'ROUGH_V' + (s.versions.length + 1); s.versions.push({ name, at: Date.now(), state: snapshot() }); s.draft = snapshot(); localStorage.setItem(k, JSON.stringify(s)); renderVersions(); toast(name + ' saved'); }
function loadVersion(name) { const s = versionsStore(); const v = s.versions.find((x) => x.name === name); if (!v) return; history.undo.push(snapshot()); state = { ...freshState(), ...JSON.parse(v.state) }; afterChange(true); toast('Loaded ' + name); }
function renderVersions() {
  const s = versionsStore(); const row = $('versions'); row.replaceChildren(); const sel = $('versionSel'); sel.replaceChildren(new Option('draft', ''));
  for (const v of [...s.versions].reverse()) { const b = el('button', 'v', v.name); b.onclick = () => loadVersion(v.name); row.appendChild(b); sel.appendChild(new Option(v.name, v.name)); }
  if (s.versions.length) { const add = el('button', 'v', '+ save version'); add.onclick = saveVersion; row.appendChild(add); }
}
$('versionSel').onchange = (e) => { if (e.target.value) loadVersion(e.target.value); };

/* ---------- UI sync ---------- */
function afterChange(full) {
  computeSegments(); computeChunks(); renderTimeline(); renderCards(); renderStickers();
  if (full) syncControls();
  $('igUser').textContent = state.ig.user || 'yourhandle'; $('igCaption').textContent = state.ig.caption || '';
  $('projectName').value = state.name; $('undoBtn').disabled = !history.undo.length; $('redoBtn').disabled = !history.redo.length;
  engine.cut = clamp(engine.cut, 0, Math.max(0, cutDuration())); updateOverlays();
  $('saveStatus').textContent = 'saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(saveProject, 400);
}
function syncControls() {
  const h = state.hook, c = state.captions;
  $('hookOn').checked = h.on; $('hookStyle').value = h.style; $('hookShow').value = h.show; $('hookSmall').value = h.small; $('hookBig').value = h.big; $('hookSub').value = h.sub; $('hookSize').value = h.size;
  $('capOn').checked = c.on; $('capTemplate').value = c.template; $('capWords').value = c.words; $('capSize').value = c.size; $('capCase').value = c.case;
  $('igUserIn').value = state.ig.user; $('igCapIn').value = state.ig.caption; $('pausesSel').value = state.pauses;
}
const bind = (id, fn, ev = 'input') => $(id).addEventListener(ev, (e) => { fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value); commit(); });
bind('hookOn', (v) => state.hook.on = v, 'change'); bind('hookStyle', (v) => state.hook.style = v, 'change'); bind('hookShow', (v) => state.hook.show = v, 'change');
bind('hookSmall', (v) => state.hook.small = v); bind('hookBig', (v) => state.hook.big = v); bind('hookSub', (v) => state.hook.sub = v); bind('hookSize', (v) => state.hook.size = +v);
bind('capOn', (v) => state.captions.on = v, 'change'); bind('capTemplate', (v) => state.captions.template = v, 'change'); bind('capWords', (v) => state.captions.words = +v, 'change'); bind('capSize', (v) => state.captions.size = +v); bind('capCase', (v) => state.captions.case = v, 'change');
bind('igUserIn', (v) => state.ig.user = v); bind('igCapIn', (v) => state.ig.caption = v); bind('pausesSel', (v) => state.pauses = v, 'change');
$('projectName').addEventListener('change', (e) => { state.name = e.target.value.trim() || 'untitled-reel'; commit(); });
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
$('playBtn').onclick = () => (engine.playing ? pause() : play()); $('restartBtn').onclick = () => { seekCut(0); };
$('muteChk').onchange = applyMute;
$('igToggle').onclick = (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); $('igEl').hidden = !on; };
$('safeToggle').onclick = (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); $('safeEl').hidden = !on; };
$('renderBtn').onclick = renderCut; $('splitBtn').onclick = splitAtPlayhead;
$('keepAll').onclick = () => { state.phrases.forEach((p) => p.keep = true); commit(); };
$('dropAll').onclick = () => { state.phrases.forEach((p) => p.keep = false); commit(); };
$('dropFillers').onclick = () => { let n = 0; for (const p of state.phrases) { const d = new Set(p.dropped || []); for (let i = p.from; i <= p.to; i++) { const t = state.words[i].t.toLowerCase().replace(/[^a-z']/g, ''); if (FILLERS.has(t) && !d.has(i)) { d.add(i); n++; } } p.dropped = [...d]; } commit(); toast(n ? `Cut ${n} filler words` : 'No filler words found'); };
$('saveVersion').onclick = saveVersion;
$('exportProject').onclick = () => download((state.name || 'reel') + '.reelcut.json', snapshot(), 'application/json');
$('importProject').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { history.undo.push(snapshot()); state = { ...freshState(), ...JSON.parse(await f.text()) }; afterChange(true); toast('Project loaded'); } catch { toast('That file is not a reelcut project'); } e.target.value = ''; };
$('exportFfmpeg').onclick = exportFfmpeg; $('exportSrt').onclick = exportSrt;
$('transcribeApi').onclick = transcribeViaApi; $('transcribeLocal').onclick = transcribeLocal;
$('videoFile').onchange = (e) => loadVideo(e.target.files[0]);
$('srtFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { setTranscript(parseTranscript(await f.text(), f.name)); trStatus(`Loaded ${state.words.length} words from ${f.name}`); } catch (err) { trStatus('Could not read that transcript: ' + err.message); } e.target.value = ''; };
for (const [dropId, inputId] of [['videoDrop', 'videoFile'], ['srtDrop', 'srtFile']]) { const d = $(dropId); d.ondragover = (e) => { e.preventDefault(); d.classList.add('drag'); }; d.ondragleave = () => d.classList.remove('drag'); d.ondrop = (e) => { e.preventDefault(); d.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (!f) return; if (inputId === 'videoFile') loadVideo(f); else { const dt = new DataTransfer(); dt.items.add(f); $(inputId).files = dt.files; $(inputId).dispatchEvent(new Event('change')); } }; }
const phone = $('phone'); phone.addEventListener('dragover', (e) => { e.preventDefault(); $('emptyState').classList.add('drag'); }); phone.addEventListener('dragleave', () => $('emptyState').classList.remove('drag')); phone.addEventListener('drop', (e) => { e.preventDefault(); $('emptyState').classList.remove('drag'); const f = e.dataTransfer.files[0]; if (!f) return; if (f.type.startsWith('video/')) loadVideo(f); else { const dt = new DataTransfer(); dt.items.add(f); $('srtFile').files = dt.files; $('srtFile').dispatchEvent(new Event('change')); } });
video.addEventListener('click', () => (engine.playing ? pause() : play()));
document.querySelectorAll('.tabs [role="tab"]').forEach((b) => b.onclick = () => setTab(b.dataset.tab));
function setTab(name) { document.querySelectorAll('.tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name)); document.querySelectorAll('.tab').forEach((t) => t.hidden = t.dataset.tab !== name); }
function setTheme(t) { try { localStorage.setItem('reelcut:theme', t); } catch {} if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; $('themeDark').setAttribute('aria-pressed', t === 'dark'); $('themeLight').setAttribute('aria-pressed', t !== 'dark'); }
$('themeDark').onclick = () => setTheme('dark'); $('themeLight').onclick = () => setTheme('light');
document.addEventListener('keydown', (e) => { if (e.target.matches('input, textarea, select')) return; if (e.code === 'Space') { e.preventDefault(); engine.playing ? pause() : play(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } if (e.key === 'ArrowLeft') seekCut(engine.cut - 1); if (e.key === 'ArrowRight') seekCut(engine.cut + 1); });
let toastTimer = 0; function toast(t) { const n = $('toast'); n.textContent = t; n.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => n.hidden = true, 2600); }

/* ---------- boot ---------- */
const EMBED = /[?&]embed=1/.test(location.search); if (EMBED) document.body.classList.add('embed');
try { setTheme(EMBED ? 'light' : (localStorage.getItem('reelcut:theme') || '')); $('apiKey').value = localStorage.getItem('reelcut:key') || ''; } catch {}
syncControls(); afterChange(true);
// expose a tiny API for tests and demos
window.reelcut = { get state() { return state; }, loadVideo, setTranscript, parseTranscript, computeSegments, get segments() { return segments; }, get chunks() { return chunks; }, buildAss, seekCut, play, pause, commit };
})();
