/* reelcut ~ 25 canvas video effects (FX01-FX25) plus the counter card. Browser-native versions of Meri's effect menu.
   Each effect draws into env.ctx for local time env.t (0..env.d). env.base() draws the footage, env.cut() gives a person cutout. */
window.FX = (() => {
'use strict';
const FONT = 'Poppins, "Nunito", system-ui, sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const c01 = (v) => clamp(v, 0, 1);
const eo = (x) => 1 - Math.pow(1 - c01(x), 3);          // ease out cubic
const ei = (x) => Math.pow(c01(x), 3);
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const expo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * c01(x)));
const back = (x) => { x = c01(x); const s = 1.70158 * 1.2; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
const seg = (t, a, b) => c01((t - a) / (b - a));         // 0..1 between times a and b
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function text(ctx, s, x, y, px, color, opts = {}) {
  ctx.save(); ctx.font = `${opts.weight || 900} ${px}px ${opts.font || FONT}`; ctx.textAlign = opts.align || 'center'; ctx.textBaseline = opts.baseline || 'middle';
  if (opts.shadow) { ctx.shadowColor = opts.shadow; ctx.shadowBlur = opts.blur || px * 0.25; ctx.shadowOffsetY = opts.offY || px * 0.04; }
  if (opts.stroke) { ctx.lineWidth = opts.strokeW || px * 0.06; ctx.strokeStyle = opts.stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.restore();
}
function glass(ctx, x, y, w, h, r, env, alpha = 0.72) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  try { ctx.filter = `blur(${18 * env.u}px)`; env.base({ raw: true }); } catch {} ctx.filter = 'none';
  ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fillRect(x, y, w, h); ctx.restore();
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2 * env.u; ctx.stroke(); ctx.restore();
}
function shake(env, amp, t0, t1) { const { t } = env; if (t < t0 || t > t1) return [0, 0]; const k = 1 - seg(t, t0, t1); const r = rng(Math.floor(t * 60)); return [(r() - 0.5) * amp * k, (r() - 0.5) * amp * k]; }
const dim = (ctx, W, H, a) => { ctx.fillStyle = `rgba(10,8,16,${a})`; ctx.fillRect(0, 0, W, H); };

const LIST = [
  { k: 'parallax', n: 1, name: '3D Parallax Zoom', cut: true, grp: 'Depth and camera', blurb: 'You zoom forward faster than the background, a 3D push-in.', best: 'Hooks, the opening line' },
  { k: 'kinetic', n: 2, name: 'Kinetic Typography', grp: 'Text and captions', blurb: 'Letters bounce in one by one, then a second word slides up in colour.', best: 'Titles, the topic of the reel', words: true },
  { k: 'behind', n: 3, name: 'Text Behind Subject', cut: true, grp: 'Text and captions', blurb: 'A big title sits behind you, so your head covers part of it.', best: 'The hook title', words: true },
  { k: 'infinite', n: 4, name: 'Infinite Zoom', grp: 'Depth and camera', blurb: 'The frame sits inside itself again and again, an endless tunnel.', best: '"Wait, there is more", loops' },
  { k: 'paper', n: 5, name: 'Paper Cutout', cut: true, grp: 'Overlays and social proof', blurb: 'You become a white-bordered paper sticker on lavender with paper shapes.', best: 'Playful intros' },
  { k: 'hologram', n: 6, name: 'Hologram Interface', cut: true, grp: 'Overlays and social proof', blurb: 'The room darkens, you glow and a HUD with panels and rings appears.', best: 'AI or tech topics' },
  { k: 'escape', n: 7, name: 'Frame Escape', cut: true, grp: 'Transitions and reveals', blurb: 'The video shrinks into a card while you break out of the frame.', best: 'Breaking the fourth wall' },
  { k: 'dolly', n: 8, name: 'Dolly Zoom', cut: true, grp: 'Depth and camera', blurb: 'The background stretches away while you stay the same size.', best: 'A reveal or a realisation' },
  { k: 'floating', n: 9, name: '3D Floating Captions', grp: 'Text and captions', blurb: 'A white caption card floats and turns in 3D.', best: 'One key phrase', words: true },
  { k: 'mask', n: 10, name: 'Object Mask Transition', cut: true, grp: 'Transitions and reveals', blurb: 'You appear first on black, then the room fades in around you.', best: 'Scene openers' },
  { k: 'shatter', n: 11, name: 'Glass Shatter', grp: 'Transitions and reveals', blurb: 'The frame cracks and shatters into shards.', best: 'A big change, breaking a myth' },
  { k: 'punch', n: 12, name: 'Word Punch Effect', grp: 'Text and captions', blurb: 'Words slam in big with a camera shake.', best: 'A strong word or punchline', words: true },
  { k: 'portal', n: 13, name: 'Zoom Portal', grp: 'Depth and camera', blurb: 'A glowing circle opens on your face, zoomed in.', best: 'Emphasis on a reaction' },
  { k: 'social', n: 14, name: 'Social Proof Stack', grp: 'Overlays and social proof', blurb: 'Glass cards stack up: stars, likes and a comment.', best: 'Credibility, testimonials', text: true },
  { k: 'particles', n: 15, name: 'Digital Particle Dissolve', cut: true, grp: 'Transitions and reveals', blurb: 'You dissolve into floating particles, then come back.', best: 'Magic or AI moments' },
  { k: 'liquid', n: 16, name: 'Liquid Glass', grp: 'Overlays and social proof', blurb: 'A frosted glass pill label floats over the footage.', best: 'Labels, a feature name', text: true },
  { k: 'split', n: 17, name: 'Dynamic Split Screen', grp: 'Transitions and reveals', blurb: 'The frame splits into three sliding strips.', best: 'Multitasking, "three things"' },
  { k: 'magazine', n: 18, name: 'Magazine Cover', grp: 'Text and captions', blurb: 'The frame becomes a magazine cover with masthead, cover lines and barcode.', best: 'Intros, features', words: true },
  { k: 'whip', n: 19, name: 'Whip Pan Transition', grp: 'Depth and camera', blurb: 'A fast sideways smear that hides a cut 1 s in.', best: 'Changing topic or location' },
  { k: 'hud', n: 20, name: 'HUD Tracking', grp: 'Overlays and social proof', blurb: 'A targeting reticle locks onto your face with live data labels.', best: 'Tech, "scanning" jokes' },
  { k: 'comments', n: 21, name: 'Comment Explosion', grp: 'Overlays and social proof', blurb: 'Lots of comment bubbles pop up around you.', best: 'The CTA, "everyone is asking"' },
  { k: 'slider', n: 22, name: 'Before-and-After Slider', grp: 'Transitions and reveals', blurb: 'A slider wipes from black and white to colour.', best: 'Before and after, results' },
  { k: 'neon', n: 23, name: 'Neon Stroke Reveal', cut: true, grp: 'Text and captions', blurb: 'The scene dims, you glow and outlined neon text draws on.', best: 'Dramatic statements', words: true },
  { k: 'freeze', n: 24, name: 'Speed Ramp Freeze', grp: 'Depth and camera', blurb: 'A 2.2x badge, then the frame freezes with a FREEZE tag.', best: '"Pause here", a key moment', text: true },
  { k: 'infographic', n: 25, name: 'Animated Infographic', grp: 'Overlays and social proof', blurb: 'A card with animated bars and a count-up number.', best: 'Stats, recaps, "in numbers"', words: true },
  { k: 'counter', n: 0, name: 'Counter Card', grp: 'Extra', blurb: 'A glass card that counts up a number.', best: 'An opener', words: true },
];
const BY_KEY = Object.fromEntries(LIST.map((e) => [e.k, e]));
const SAMPLE = { kinetic: ['AI', 'MADE EASY'], behind: ['SAVE', 'YOUR WEEK'], floating: ['no jargon', 'just workflows'], punch: ['STOP', 'GUESSING!'], magazine: ['MERI', 'THE AI ISSUE'], neon: ['WORK', 'SMARTER'], infographic: ['HOURS SAVED A WEEK', '12+'], counter: ['100', 'AI PROMPTS'] };
const SAMPLE_TEXT = { liquid: 'Claude Worklab', social: 'Finally, AI that makes sense', freeze: '2.2×' };

/* ---------- the effects ---------- */
const E = {};
E.parallax = (env) => { const { ctx, p } = env; env.base({ scale: 1 + 0.12 * eo(p) }); const c = env.cut(); if (c) env.drawCut(c, { scale: 1 + 0.32 * eo(p), anchor: 'bottom' }); };
E.kinetic = (env) => {
  const { ctx, W, H, u, t, words } = env; env.base({}); dim(ctx, W, H, 0.25 * eo(seg(t, 0, 0.3)));
  const w1 = words[0], px = Math.min(168 * u, (W * 0.9) / Math.max(1, w1.length) * 1.7); ctx.save(); ctx.font = `900 ${px}px ${FONT}`; const tw = ctx.measureText(w1).width; ctx.restore();
  let x = W / 2 - tw / 2; const y = H * 0.42;
  for (let i = 0; i < w1.length; i++) { const ch = w1[i]; ctx.save(); ctx.font = `900 ${px}px ${FONT}`; const cw = ctx.measureText(ch).width; ctx.restore(); const s = back(seg(t, 0.05 + i * 0.07, 0.4 + i * 0.07)); if (s > 0) { ctx.save(); ctx.translate(x + cw / 2, y); ctx.scale(s, s); text(ctx, ch, 0, 0, px, '#fff', { shadow: 'rgba(0,0,0,.45)', blur: 24 * u, offY: 10 * u }); ctx.restore(); } x += cw; }
  const p2 = eo(seg(t, 0.75, 1.1)); if (p2 > 0) text(ctx, words[1], W / 2, H * 0.42 + px * 0.95 + (1 - p2) * 60 * u, Math.min(96 * u, (W * 0.9) / Math.max(1, words[1].length) * 1.7), env.col.a, { stroke: '#fff', strokeW: 3 * u, alpha: p2, shadow: 'rgba(0,0,0,.35)' });
  if (t > env.d - 0.22) dim(ctx, W, H, 0);
};
E.behind = (env) => {
  const { ctx, W, H, u, t, words } = env; env.base({}); const f = env.face(); const s = 1.35 - 0.35 * expo(seg(t, 0.08, 0.53)); const a = eo(seg(t, 0.08, 0.4)) * (t > env.d - 0.22 ? 1 - seg(t, env.d - 0.22, env.d) : 1);
  const y = Math.max(H * 0.13, f.y - 210 * u); ctx.save(); ctx.translate(W / 2, y); ctx.scale(s, s); ctx.translate(-W / 2, -y);
  text(ctx, words[0], W / 2, y, Math.min(250 * u, (W * 0.95) / Math.max(1, words[0].length) * 1.65), env.col.a, { alpha: a }); text(ctx, words[1], W / 2, y + 190 * u, Math.min(104 * u, (W * 0.95) / Math.max(1, words[1].length) * 1.65), '#fff', { alpha: a, shadow: 'rgba(0,0,0,.35)' }); ctx.restore();
  const c = env.cut(); if (c) env.drawCut(c, {});
};
E.infinite = (env) => {
  const { ctx, W, H, u, p } = env; const k = 0.56, levels = 7, z = Math.pow(1 / k, (p * 1.6) % 1);
  env.base({}); dim(ctx, W, H, 0.15);
  for (let i = levels; i >= 0; i--) { const sc = Math.pow(k, i) * z; if (sc > 1.6 || sc < 0.03) continue; const w = W * 0.7 * sc, h = H * 0.7 * sc; ctx.save(); ctx.translate(W / 2, H / 2); rr(ctx, -w / 2, -h / 2, w, h, 44 * u * sc); ctx.clip(); ctx.translate(-W / 2, -H / 2); env.base({ scale: sc * 0.7, raw: true }); ctx.restore(); ctx.save(); ctx.translate(W / 2, H / 2); rr(ctx, -w / 2, -h / 2, w, h, 44 * u * sc); ctx.lineWidth = Math.max(2, 10 * u * sc); ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore(); }
};
E.paper = (env) => {
  const { ctx, W, H, u, t } = env; ctx.fillStyle = env.col.lilac; ctx.fillRect(0, 0, W, H); const r = rng(5);
  for (let i = 0; i < 9; i++) { const x = r() * W, y = r() * H, s = (60 + r() * 160) * u, col = [env.col.a, env.col.b, '#FDE68A', '#fff', '#A7F3D0'][i % 5]; ctx.save(); ctx.translate(x + Math.sin(t * 1.3 + i) * 18 * u, y + Math.cos(t * 1.1 + i) * 14 * u); ctx.rotate(r() * 6 + t * 0.2); ctx.fillStyle = col; ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 20 * u; ctx.shadowOffsetY = 8 * u; if (i % 3 === 0) { ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill(); } else if (i % 3 === 1) ctx.fillRect(-s / 2, -s / 2, s, s * 0.7); else { ctx.beginPath(); ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2); ctx.closePath(); ctx.fill(); } ctx.restore(); }
  const c = env.cut(); const s = 0.92 + 0.08 * back(seg(t, 0, 0.5)); const rot = Math.sin(t * 2) * 0.03;
  if (c) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 30 * u; ctx.shadowOffsetY = 16 * u; env.drawCut(c, { outline: 14 * u }); ctx.restore(); }
};
E.hologram = (env) => {
  const { ctx, W, H, u, t } = env; env.base({}); dim(ctx, W, H, 0.6 * eo(seg(t, 0, 0.3))); const f = env.face(); const c = env.cut(); const a = eo(seg(t, 0.1, 0.6));
  if (c) env.drawCut(c, { glow: env.col.a, glowBlur: 40 * u });
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = env.col.b; ctx.lineWidth = 3 * u; ctx.shadowColor = env.col.b; ctx.shadowBlur = 16 * u;
  for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(f.x, f.y + 120 * u); ctx.scale(1, 0.35); ctx.rotate(t * (i % 2 ? 1 : -1) * 0.9 + i); ctx.setLineDash([60 * u, 30 * u]); ctx.beginPath(); ctx.arc(0, 0, f.r * (1.9 + i * 0.45), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  ctx.setLineDash([]);
  const panel = (x, y, w, h, title, rows, delay) => { const pp = eo(seg(t, delay, delay + 0.4)); if (pp <= 0) return; ctx.save(); ctx.globalAlpha = a * pp; ctx.translate((1 - pp) * (x < W / 2 ? -60 : 60) * u, 0); ctx.fillStyle = 'rgba(124,58,237,.18)'; ctx.strokeStyle = env.col.b; ctx.lineWidth = 2 * u; rr(ctx, x, y, w, h, 10 * u); ctx.fill(); ctx.stroke(); text(ctx, title, x + 16 * u, y + 24 * u, 22 * u, '#fff', { align: 'left', weight: 700 }); rows.forEach((rw, i) => { const bw = (w - 32 * u) * rw * (0.6 + 0.4 * Math.abs(Math.sin(t * 2 + i))); ctx.fillStyle = env.col.b; ctx.fillRect(x + 16 * u, y + 48 * u + i * 26 * u, bw, 10 * u); }); ctx.restore(); };
  panel(40 * u, H * 0.2, 300 * u, 150 * u, 'SYSTEM', [0.8, 0.5, 0.9], 0.3); panel(W - 340 * u, H * 0.62, 300 * u, 150 * u, 'ANALYSIS', [0.6, 0.95, 0.4], 0.5); ctx.restore();
};
E.escape = (env) => {
  const { ctx, W, H, u, t } = env; const s = 1 - 0.3 * expo(seg(t, 0.1, 0.7)); ctx.fillStyle = env.col.ink; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); rr(ctx, 0, 0, W, H, 60 * u); ctx.clip(); env.base({ raw: true }); ctx.restore();
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); rr(ctx, 0, 0, W, H, 60 * u); ctx.lineWidth = 16 * u; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
  const c = env.cut(); if (c) env.drawCut(c, { scale: 1.02 + 0.06 * eo(seg(t, 0.1, 0.9)), anchor: 'bottom' });
};
E.dolly = (env) => { const { p } = env; env.base({ scale: 1 + 0.4 * eio(p), filter: `blur(${2 * eio(p) * env.u}px)` }); const c = env.cut(); if (c) env.drawCut(c, { scale: 1 - 0.04 * eio(p), anchor: 'bottom' }); };
E.floating = (env) => {
  const { ctx, W, H, u, t, words } = env; env.base({}); const a = eo(seg(t, 0, 0.35)) * (t > env.d - 0.25 ? 1 - seg(t, env.d - 0.25, env.d) : 1);
  const w = W * 0.78, h = 240 * u, x = W / 2, y = H * 0.5 + Math.sin(t * 2.2) * 18 * u; const tilt = Math.sin(t * 1.6) * 0.09; const sk = Math.cos(t * 1.6) * 0.12;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.transform(1, sk * 0.35, tilt, 1 - Math.abs(sk) * 0.08, 0, 0); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40 * u; ctx.shadowOffsetY = 24 * u; ctx.fillStyle = '#fff'; rr(ctx, -w / 2, -h / 2, w, h, 28 * u); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = env.col.a; ctx.fillRect(-w / 2, -h / 2, 16 * u, h); text(ctx, words[0], 0, -34 * u, Math.min(64 * u, (w * 0.85) / Math.max(1, words[0].length) * 1.7), env.col.ink); text(ctx, words[1], 0, 44 * u, Math.min(56 * u, (w * 0.85) / Math.max(1, words[1].length) * 1.7), env.col.a); ctx.restore();
};
E.mask = (env) => { const { ctx, W, H, t } = env; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); const a = eo(seg(t, 0.45, 1.3)); if (a > 0) { ctx.save(); ctx.globalAlpha = a; env.base({ scale: 1.06 - 0.06 * a }); ctx.restore(); } const c = env.cut(); if (c) env.drawCut(c, {}); else if (a < 1) { ctx.save(); ctx.globalAlpha = 1 - a; dim(ctx, W, H, 0.5); ctx.restore(); } };
const shards = (() => { const r = rng(11); const pts = []; for (let i = 0; i < 26; i++) pts.push([r(), r(), r() * 2 - 1, r() * 2 - 1, (r() - 0.5) * 3]); return pts; })();
E.shatter = (env) => {
  const { ctx, W, H, u, t } = env; const cx = W * 0.5, cy = H * 0.45;
  if (t < 0.55) { env.base({}); const k = seg(t, 0.25, 0.55); if (k > 0) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3 * u; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8 * u; for (const [px, py] of shards) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (px * W - cx) * k, cy + (py * H - cy) * k); ctx.stroke(); } ctx.restore(); } return; }
  env.base({ scale: 1.08, filter: 'brightness(1.08)' }); const p = ei(seg(t, 0.55, 1.5)); const still = env.still();
  shards.forEach(([px, py, dx, dy, rot], i) => { const n = shards.length; const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2; const R = Math.hypot(W, H); ctx.save(); ctx.globalAlpha = 1 - p * 0.9; ctx.translate(cx + dx * p * W * 0.9, cy + dy * p * H * 0.6 + p * p * H * 0.5); ctx.rotate(rot * p); ctx.translate(-cx, -cy); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(b) * R, cy + Math.sin(b) * R); ctx.closePath(); ctx.clip(); if (still) ctx.drawImage(still, 0, 0, W, H); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2 * u; ctx.stroke(); ctx.restore(); });
};
E.punch = (env) => {
  const { ctx, W, H, u, t, words } = env; const [sx, sy] = shake(env, 40 * u, 0.12, 0.6); const [sx2, sy2] = shake(env, 30 * u, 0.95, 1.4);
  env.base({ dx: sx + sx2, dy: sy + sy2, scale: 1.03 }); dim(ctx, W, H, 0.2);
  const s1 = seg(t, 0.05, 0.3); if (s1 > 0) { const sc = 3 - 2 * expo(s1); ctx.save(); ctx.translate(W / 2 + sx, H * 0.42 + sy); ctx.scale(sc, sc); text(ctx, words[0], 0, 0, Math.min(190 * u, (W * 0.9) / Math.max(1, words[0].length) * 1.7), '#fff', { alpha: Math.min(1, s1 * 3), shadow: 'rgba(0,0,0,.5)', blur: 30 * u, offY: 12 * u }); ctx.restore(); }
  const s2 = seg(t, 0.9, 1.1); if (s2 > 0) { const sc = 2.4 - 1.4 * expo(s2); ctx.save(); ctx.translate(W / 2 + sx2, H * 0.58 + sy2); ctx.rotate(-0.06); ctx.scale(sc, sc); text(ctx, words[1], 0, 0, Math.min(150 * u, (W * 0.9) / Math.max(1, words[1].length) * 1.7), env.col.a, { alpha: Math.min(1, s2 * 3), stroke: '#fff', strokeW: 6 * u, shadow: 'rgba(0,0,0,.4)' }); ctx.restore(); }
};
E.portal = (env) => {
  const { ctx, W, H, u, t } = env; env.base({}); dim(ctx, W, H, 0.55 * eo(seg(t, 0, 0.4))); const f = env.face(); const R = f.r * 1.9 * back(seg(t, 0.05, 0.6)) * (t > env.d - 0.3 ? 1 - ei(seg(t, env.d - 0.3, env.d)) : 1); if (R <= 0) return;
  ctx.save(); ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.clip(); ctx.translate(f.x, f.y); ctx.scale(1.6, 1.6); ctx.translate(-f.x, -f.y); env.base({ raw: true }); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.lineWidth = 10 * u; ctx.strokeStyle = env.col.b; ctx.shadowColor = env.col.a; ctx.shadowBlur = 50 * u; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * u; ctx.stroke(); ctx.restore();
};
E.social = (env) => {
  const { ctx, W, H, u, t, text: tx } = env; env.base({}); const cards = [['★★★★★', '4.9 from 300+ students'], ['♥ 12.4K', 'saves this week'], ['"' + (tx || 'Finally, AI that makes sense') + '"', '@client · 2h']];
  cards.forEach((c, i) => { const p = back(seg(t, 0.1 + i * 0.3, 0.55 + i * 0.3)); if (p <= 0) return; const w = W * 0.72, h = 150 * u, x = W / 2 - w / 2, y = H * 0.56 - i * 170 * u + (1 - p) * 120 * u; ctx.save(); ctx.globalAlpha = Math.min(1, p); glass(ctx, x, y, w, h, 28 * u, env, 0.78); text(ctx, c[0], x + 28 * u, y + 52 * u, 44 * u, i === 0 ? '#F59E0B' : env.col.ink, { align: 'left', weight: 900 }); text(ctx, c[1], x + 28 * u, y + 106 * u, 28 * u, '#5b5570', { align: 'left', weight: 600 }); ctx.restore(); });
};
E.particles = (env) => {
  const { ctx, W, H, u, t } = env; env.base({ scale: 1.05, filter: `blur(${10 * u}px) brightness(.7)` }); const c = env.cut(); const gone = t < 1.1 ? ei(seg(t, 0.2, 1.1)) : 1 - eo(seg(t, 1.3, env.d - 0.1));
  if (c) { ctx.save(); ctx.globalAlpha = 1 - gone; env.drawCut(c, { glow: env.col.a, glowBlur: 20 * u * gone }); ctx.restore(); }
  const f = env.face(); const r = rng(3); ctx.save(); for (let i = 0; i < 260; i++) { const bx = f.x + (r() - 0.5) * f.r * 5, by = f.y + (r() - 0.2) * H * 0.6; const life = r(); const k = c01(gone * 1.4 - life * 0.4); if (k <= 0) continue; const x = bx + Math.sin(i + t * 3) * 20 * u * k, y = by - k * (200 + r() * 400) * u; ctx.globalAlpha = (1 - k) * 0.95; ctx.fillStyle = i % 3 ? env.col.b : '#fff'; ctx.shadowColor = env.col.a; ctx.shadowBlur = 10 * u; ctx.beginPath(); ctx.arc(x, y, (2 + r() * 5) * u, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
};
E.liquid = (env) => { const { ctx, W, H, u, t, text: tx } = env; env.base({}); const a = eo(seg(t, 0, 0.4)) * (t > env.d - 0.25 ? 1 - seg(t, env.d - 0.25, env.d) : 1); if (a <= 0) return; const label = tx || 'Claude Worklab'; ctx.save(); ctx.font = `800 ${52 * u}px ${FONT}`; const w = ctx.measureText(label).width + 110 * u; ctx.restore(); const h = 120 * u, x = W / 2 - w / 2, y = H * 0.62 + Math.sin(t * 2.4) * 14 * u; ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 40 * u); glass(ctx, x, y, w, h, h / 2, env, 0.55); ctx.beginPath(); ctx.arc(x + 48 * u, y + h / 2, 16 * u, 0, Math.PI * 2); ctx.fillStyle = env.col.a; ctx.fill(); text(ctx, label, x + 84 * u, y + h / 2, 52 * u, '#fff', { align: 'left', weight: 800, shadow: 'rgba(0,0,0,.3)' }); ctx.restore(); };
E.split = (env) => { const { ctx, W, H, u, t } = env; ctx.fillStyle = env.col.ink; ctx.fillRect(0, 0, W, H); for (let i = 0; i < 3; i++) { const p = expo(seg(t, i * 0.12, 0.45 + i * 0.12)); const dir = i % 2 ? 1 : -1; const y = i * H / 3; ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, H / 3); ctx.clip(); ctx.translate(dir * (1 - p) * W + Math.sin(t * 1.5 + i) * 10 * u, 0); env.base({ raw: true, scale: 1.1 + i * 0.08, dy: (1 - i) * H * 0.15 }); ctx.restore(); ctx.fillStyle = '#fff'; ctx.fillRect(0, y - 4 * u, W, 8 * u); } };
E.magazine = (env) => {
  const { ctx, W, H, u, t, words } = env; env.base({ scale: 1.08 }); const a = eo(seg(t, 0, 0.4));
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 14 * u; ctx.strokeRect(7 * u, 7 * u, W - 14 * u, H - 14 * u);
  const mh = words[0]; text(ctx, mh, W / 2, H * 0.13 - (1 - a) * 40 * u, Math.min(230 * u, (W * 0.9) / Math.max(1, mh.length) * 1.65), env.col.a, { shadow: 'rgba(0,0,0,.25)' });
  text(ctx, (words[1] || 'THE AI ISSUE').toUpperCase() + '  ·  ' + new Date().toLocaleString('en', { month: 'short', year: 'numeric' }).toUpperCase(), W / 2, H * 0.215, 30 * u, '#fff', { weight: 700 });
  const lines = [['100 PROMPTS', 'free inside'], ['MY VA', 'workflow, step by step'], ['NO JARGON', 'just plain English']]; lines.forEach((l, i) => { const p = eo(seg(t, 0.4 + i * 0.15, 0.8 + i * 0.15)); if (p <= 0) return; const x = i % 2 ? W - 60 * u : 60 * u; const al = i % 2 ? 'right' : 'left'; const y = H * 0.66 + i * 150 * u; ctx.save(); ctx.globalAlpha = p; ctx.translate((i % 2 ? 1 : -1) * (1 - p) * 60 * u, 0); text(ctx, l[0], x, y, 54 * u, '#fff', { align: al, shadow: 'rgba(0,0,0,.4)' }); text(ctx, l[1], x, y + 50 * u, 34 * u, env.col.lilac, { align: al, weight: 700, shadow: 'rgba(0,0,0,.4)' }); ctx.restore(); });
  const r = rng(9); ctx.fillStyle = '#fff'; ctx.fillRect(50 * u, H - 150 * u, 240 * u, 100 * u); ctx.fillStyle = '#000'; for (let i = 0; i < 36; i++) ctx.fillRect(60 * u + i * 6.2 * u, H - 140 * u, (r() > 0.5 ? 3 : 1.5) * u, 70 * u); text(ctx, '9 772731 000' + '42', 170 * u, H - 60 * u, 16 * u, '#000', { weight: 600 }); ctx.restore();
};
E.whip = (env) => { const { ctx, W, H, u, t } = env; const k = t < 1 ? ei(seg(t, 0.7, 1.0)) : 1 - eo(seg(t, 1.0, 1.3)); if (k <= 0.01) return env.base({}); const dx = (t < 1 ? -1 : 1) * (1 - k) * W * 0.4; env.base({ dx: dx * -1, filter: `blur(${k * 40 * u}px)`, scale: 1 + k * 0.1 }); ctx.save(); ctx.globalAlpha = k * 0.5; env.base({ dx: dx * -2, filter: `blur(${k * 60 * u}px)`, scale: 1 + k * 0.15, raw: true }); ctx.restore(); };
E.hud = (env) => {
  const { ctx, W, H, u, t } = env; env.base({}); const f = env.face(); const a = eo(seg(t, 0, 0.3)); const R = f.r * 1.5 * (1.6 - 0.6 * eo(seg(t, 0, 0.5))); const col = '#5EEAD4';
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 4 * u; ctx.shadowColor = col; ctx.shadowBlur = 12 * u; const L = R * 0.35;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(f.x + sx * R, f.y + sy * (R - L)); ctx.lineTo(f.x + sx * R, f.y + sy * R); ctx.lineTo(f.x + sx * (R - L), f.y + sy * R); ctx.stroke(); }
  ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(t * 1.2); ctx.setLineDash([20 * u, 14 * u]); ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  ctx.beginPath(); ctx.moveTo(f.x - 30 * u, f.y); ctx.lineTo(f.x + 30 * u, f.y); ctx.moveTo(f.x, f.y - 30 * u); ctx.lineTo(f.x, f.y + 30 * u); ctx.stroke();
  const sy = f.y - R + ((t * 0.7) % 1) * R * 2; ctx.globalAlpha = a * 0.6; ctx.beginPath(); ctx.moveTo(f.x - R, sy); ctx.lineTo(f.x + R, sy); ctx.stroke(); ctx.globalAlpha = a;
  const lock = t > 0.6; const labels = [[`TRACKING ${lock ? '98' : Math.floor(40 + seg(t, 0, 0.6) * 58)}%`, f.x + R + 20 * u, f.y - R + 10 * u], [lock ? 'FACE LOCK ✓' : 'SEARCHING…', f.x + R + 20 * u, f.y - R + 50 * u], [`X ${Math.round(f.x)}  Y ${Math.round(f.y)}`, f.x + R + 20 * u, f.y - R + 90 * u], ['ID MERI-01', f.x - R, f.y + R + 44 * u]];
  for (const [s, x, y] of labels) { if (x + 260 * u > W) continue; text(ctx, s, x, y, 24 * u, col, { align: 'left', weight: 700, font: 'ui-monospace, Menlo, monospace' }); } ctx.restore();
};
const COMMENTS = ['Teach us!', 'Which prompt is this? 👀', 'Need this for my VA', 'Saving this!!', 'Wait, that easy?', 'Part 2 please 🙏', 'Doing this tonight', 'Okay this is genius', '🔥🔥🔥', 'Sending to my team', 'Where do I start?', 'Is there a course?'];
E.comments = (env) => {
  const { ctx, W, H, u, t } = env; env.base({}); const r = rng(21); const f = env.face();
  COMMENTS.forEach((c, i) => { const p = back(seg(t, 0.05 + i * 0.11, 0.4 + i * 0.11)); if (p <= 0) return; const ang = r() * Math.PI * 2, dist = (f.r * 2.2 + r() * H * 0.25); const x = clamp(f.x + Math.cos(ang) * dist * 0.9, 150 * u, W - 150 * u), y = clamp(f.y + Math.sin(ang) * dist, H * 0.1, H * 0.85) + Math.sin(t * 2 + i) * 8 * u; ctx.save(); ctx.font = `700 ${34 * u}px ${FONT}`; const w = ctx.measureText(c).width + 100 * u, h = 72 * u; ctx.translate(x, y); ctx.scale(Math.min(1.08, p), Math.min(1.08, p)); ctx.rotate((r() - 0.5) * 0.16); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 20 * u; ctx.shadowOffsetY = 8 * u; ctx.fillStyle = '#fff'; rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.fillStyle = [env.col.a, env.col.b, '#F59E0B', '#10B981'][i % 4]; ctx.beginPath(); ctx.arc(-w / 2 + 36 * u, 0, 20 * u, 0, Math.PI * 2); ctx.fill(); text(ctx, c, -w / 2 + 68 * u, 0, 34 * u, env.col.ink, { align: 'left', weight: 700 }); ctx.restore(); });
};
E.slider = (env) => { const { ctx, W, H, u, t } = env; env.base({}); const x = W * (0.08 + 0.84 * eio(seg(t, 0.2, env.d - 0.3))); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, x, H); ctx.clip(); env.base({ raw: true, filter: 'grayscale(1) contrast(1.05)' }); ctx.restore(); ctx.fillStyle = '#fff'; ctx.fillRect(x - 3 * u, 0, 6 * u, H); ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 16 * u; ctx.beginPath(); ctx.arc(x, H / 2, 44 * u, 0, Math.PI * 2); ctx.fill(); ctx.restore(); text(ctx, '◀ ▶', x, H / 2, 28 * u, env.col.ink, { weight: 700 }); const lab = (s, lx, al) => { ctx.save(); ctx.font = `900 ${30 * u}px ${FONT}`; const w = ctx.measureText(s).width + 40 * u; ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, al === 'left' ? lx : lx - w, H * 0.1, w, 56 * u, 12 * u); ctx.fill(); text(ctx, s, al === 'left' ? lx + 20 * u : lx - 20 * u, H * 0.1 + 28 * u, 30 * u, '#fff', { align: al }); ctx.restore(); }; lab('BEFORE', 40 * u, 'left'); lab('AFTER', W - 40 * u, 'right'); };
E.neon = (env) => {
  const { ctx, W, H, u, t, words } = env; env.base({}); dim(ctx, W, H, 0.72 * eo(seg(t, 0, 0.3))); const c = env.cut(); if (c) env.drawCut(c, { glow: env.col.a, glowBlur: 50 * u, outline: 3 * u, outlineColor: env.col.b });
  const draw = (s, y, px, delay) => { const p = seg(t, delay, delay + 0.9); if (p <= 0) return; ctx.save(); ctx.font = `900 ${px}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 5 * u; ctx.strokeStyle = env.col.b; ctx.shadowColor = env.col.b; ctx.shadowBlur = 30 * u; const len = ctx.measureText(s).width * 2.6; ctx.setLineDash([len * p, len]); ctx.strokeText(s, W / 2, y); ctx.setLineDash([]); const fp = seg(t, delay + 0.9, delay + 1.2); if (fp > 0) { ctx.globalAlpha = fp; ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 20 * u; ctx.fillText(s, W / 2, y); } ctx.restore(); };
  draw(words[0], H * 0.18, Math.min(190 * u, (W * 0.9) / Math.max(1, words[0].length) * 1.65), 0.2); draw(words[1], H * 0.85, Math.min(96 * u, (W * 0.9) / Math.max(1, words[1].length) * 1.65), 0.5);
};
E.freeze = (env) => {
  const { ctx, W, H, u, t, text: tx } = env; const frozen = t >= 1.2; if (!frozen) env.base({ scale: 1 + seg(t, 0.3, 1.2) * 0.05 }); else { const st = env.freezeFrame(); if (st) ctx.drawImage(st, 0, 0, W, H); else env.base({}); }
  const badge = (s, x, y, col, p) => { if (p <= 0) return; ctx.save(); ctx.globalAlpha = Math.min(1, p); ctx.font = `900 ${56 * u}px ${FONT}`; const w = ctx.measureText(s).width + 70 * u; ctx.translate(x, y); ctx.scale(back(p), back(p)); ctx.fillStyle = col; rr(ctx, -w / 2, -45 * u, w, 90 * u, 22 * u); ctx.fill(); text(ctx, s, 0, 0, 56 * u, '#fff'); ctx.restore(); };
  if (t >= 0.3 && t < 1.25) badge(tx || '2.2×', W / 2, H * 0.2, env.col.a, seg(t, 0.3, 0.5));
  if (frozen) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.25; const st = env.freezeFrame(); if (st) { ctx.drawImage(st, 6 * u, 0, W, H); } ctx.restore(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 12 * u; ctx.strokeRect(6 * u, 6 * u, W - 12 * u, H - 12 * u); badge('FREEZE', W / 2, H * 0.2, env.col.b, seg(t, 1.2, 1.4)); }
};
E.infographic = (env) => {
  const { ctx, W, H, u, t, words } = env; env.base({ filter: `blur(${6 * u}px) brightness(.75)`, scale: 1.05 }); const a = back(seg(t, 0, 0.5)); if (a <= 0) return; const w = W * 0.8, h = H * 0.42, x = W / 2 - w / 2, y = H / 2 - h / 2;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(Math.min(1.05, a), Math.min(1.05, a)); ctx.translate(-W / 2, -H / 2); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 50 * u; ctx.fillStyle = '#fff'; rr(ctx, x, y, w, h, 36 * u); ctx.fill(); ctx.shadowColor = 'transparent';
  text(ctx, words[0], x + 40 * u, y + 60 * u, 36 * u, '#6b6480', { align: 'left', weight: 700 });
  const target = parseFloat((words[1] || '128').replace(/[^\d.]/g, '')) || 128; const pre = (words[1] || '').match(/^[^\d]*/)[0], post = (words[1] || '').replace(/^[^\d]*[\d.,]*/, ''); const n = Math.round(target * eo(seg(t, 0.2, 1.4)));
  text(ctx, pre + n.toLocaleString() + post, x + 40 * u, y + 150 * u, 130 * u, env.col.a, { align: 'left' });
  [0.55, 0.85, 0.7, 1, 0.6].forEach((v, i) => { const p = eo(seg(t, 0.5 + i * 0.1, 1.2 + i * 0.1)); const bw = (w - 80 * u) / 5 - 16 * u, bh = (h - 300 * u) * v * p; ctx.fillStyle = i === 3 ? env.col.b : env.col.a; rr(ctx, x + 40 * u + i * (bw + 16 * u), y + h - 40 * u - bh, bw, bh, 10 * u); ctx.fill(); }); ctx.restore();
};
E.counter = (env) => { const { ctx, W, H, u, t, words } = env; env.base({ filter: `blur(${12 * u}px) brightness(.6)`, scale: 1.05 }); const a = back(seg(t, 0, 0.5)); const w = W * 0.7, h = 420 * u, x = W / 2 - w / 2, y = H / 2 - h / 2; ctx.save(); ctx.globalAlpha = Math.min(1, a); ctx.translate(W / 2, H / 2); ctx.scale(Math.min(1.04, a), Math.min(1.04, a)); ctx.translate(-W / 2, -H / 2); glass(ctx, x, y, w, h, 40 * u, env, 0.2); const target = parseInt(words[0]) || 25; text(ctx, String(Math.round(target * eo(seg(t, 0.2, env.d - 0.5)))), W / 2, y + 170 * u, 220 * u, '#fff', { shadow: 'rgba(0,0,0,.4)' }); text(ctx, words[1] || '', W / 2, y + 330 * u, 44 * u, env.col.lilac, { weight: 800 }); ctx.restore(); };

return { LIST, BY_KEY, SAMPLE, SAMPLE_TEXT, draw: (k, env) => (E[k] || E.liquid)(env), keyOf: (fx) => (/^FX\d+$/i.test(fx) ? (LIST.find((e) => e.n === parseInt(fx.slice(2), 10)) || {}).k : fx), FONT };
})();
