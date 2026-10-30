/* reelcut ~ in-browser Whisper via transformers.js. Runs in a Web Worker so the page stays responsive. */
let pipe = null, loadedModel = '';
async function getPipeline(model, report) {
  if (pipe && loadedModel === model) return pipe;
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3');
  env.allowLocalModels = false;
  const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  pipe = await pipeline('automatic-speech-recognition', model, {
    device: gpu ? 'webgpu' : 'wasm', dtype: gpu ? 'fp32' : 'q8',
    progress_callback: (p) => { if (p.status === 'progress' && p.file) report(`Downloading ${p.file.split('/').pop()} ${Math.round(p.progress || 0)}%`, p.progress); else if (p.status === 'ready') report('Model ready. Listening…', null); },
  });
  loadedModel = model;
  return pipe;
}
self.onmessage = async (ev) => {
  const { type, audio, model } = ev.data; if (type !== 'run') return;
  const report = (text, pct) => self.postMessage({ type: 'progress', text, pct });
  try {
    const asr = await getPipeline(model, report);
    report('Transcribing… this takes about as long as the video on a laptop', null);
    const out = await asr(audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
    const words = (out.chunks || []).map((c) => ({ t: (c.text || '').trim(), s: c.timestamp[0], e: c.timestamp[1] ?? c.timestamp[0] + 0.3 })).filter((w) => w.t);
    if (!words.length) throw new Error('No words came back');
    self.postMessage({ type: 'done', words });
  } catch (e) { self.postMessage({ type: 'error', message: e && e.message ? e.message : String(e) }); }
};
