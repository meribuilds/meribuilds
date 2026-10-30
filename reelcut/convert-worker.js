/* Converts a video the browser cannot play (usually iPhone HEVC) into an H.264 MP4, inside the browser with ffmpeg.wasm.
   Runs in its own worker so the page stays responsive. The source file is read in place (WORKERFS), not copied into memory. */
const DEFAULT_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/';
let ff = null, logTail = [];
async function load(base) {
  if (ff) return ff;
  importScripts(base + 'ffmpeg-core.js');
  ff = await self.createFFmpegCore({ mainScriptUrlOrBlob: base + 'ffmpeg-core.js#' + btoa(JSON.stringify({ wasmURL: base + 'ffmpeg-core.wasm' })) });
  return ff;
}
self.onmessage = async ({ data }) => {
  const { file, base = DEFAULT_BASE } = data; let duration = data.duration || 0; const t0 = Date.now();
  const say = (text, pct) => self.postMessage({ type: 'progress', text, pct });
  try {
    say('Downloading the converter (about 30 MB, first time only)…', null);
    const f = await load(base);
    f.setLogger(({ message }) => {
      logTail.push(message); if (logTail.length > 12) logTail.shift();
      const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(message); if (d && !duration) duration = +d[1] * 3600 + +d[2] * 60 + +d[3];
      const m = /time=(\d+):(\d+):([\d.]+)/.exec(message);
      if (m && duration) { const done = +m[1] * 3600 + +m[2] * 60 + +m[3]; const pct = Math.min(99, done / duration * 100); const el = (Date.now() - t0) / 1000; const left = pct > 2 ? el * (100 - pct) / pct : 0; say(`Converting · ${Math.round(pct)}%${left ? ` · about ${left > 90 ? Math.round(left / 60) + ' min' : Math.round(left) + ' s'} left` : ''}`, pct); }
    });
    say('Converting · starting…', 0);
    try { f.FS.mkdir('/in'); } catch {}
    f.FS.mount(f.FS.filesystems.WORKERFS, { files: [file] }, '/in');
    // long side at most 1920 px, keeps phone rotation, 8-bit H.264 that every browser plays
    const ret = f.exec('-i', '/in/' + file.name, '-vf', "scale=w='min(iw,1920*iw/max(iw,ih))':h=-2", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '/out.mp4');
    try { f.FS.unmount('/in'); } catch {}
    if (ret !== 0) throw new Error('ffmpeg stopped (' + ret + '): ' + logTail.slice(-3).join(' | '));
    const out = f.FS.readFile('/out.mp4'); try { f.FS.unlink('/out.mp4'); } catch {}
    self.postMessage({ type: 'done', data: out.buffer, seconds: (Date.now() - t0) / 1000 }, [out.buffer]);
  } catch (e) { self.postMessage({ type: 'error', message: e && e.message ? e.message : String(e) }); }
};
