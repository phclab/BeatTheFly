// SPDX-License-Identifier: GPL-3.0-or-later
export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const MB = n => (n / 1e6).toFixed(1);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const SITE = new URL('../', import.meta.url);
import { t, dataFile } from './i18n.js';
const CLR = { KC: [79, 209, 197], MBON: [122, 162, 255], DAN: [255, 122, 182], APL: [197, 140, 255], other: [152, 166, 189] };
const DIM = { KC: 0.016, MBON: 0.055, DAN: 0.045, APL: 0.11, other: 0.045 };
const LW = { KC: 0.45, MBON: 0.60, DAN: 0.55, APL: 0.70, other: 0.55 };
const HOT = { KC: 0.13, MBON: 0.34, DAN: 0.30, APL: 0.42, other: 0.24 };
const MB_ORDER = ['KC', 'other', 'DAN', 'MBON', 'APL'];
const MB_VARS = { KC: '--kc', MBON: '--mbon', DAN: '--dan', APL: '--apl', other: '--oth' };

export const ST = {
  ready: false, moves: [], human: '', orient: '', busy: false, temp: 0, status: { over: false }, info: null,
  proj: 'frontal', memory: false, fw: true, bits: [], hist: [], scrubT: null, gen: 0, anim: null, lastVf: null, model: null,
};
let PAGE = null, NOTE = '', REGION = null;
const perFrame = () => !!(PAGE && PAGE.unit === 'frame');

const isMB = () => !ST.info || !ST.info.region;
const colorOf = n => (ST.info && ST.info.class_colors && ST.info.class_colors[n]) || CLR[n] || CLR.other;
const rgb = n => 'rgb(' + colorOf(n).join(',') + ')';
const dotColor = n => (isMB() && MB_VARS[n]) ? 'var(' + MB_VARS[n] + ')' : rgb(n);
const drawOrder = () => (ST.info && ST.info.draw_order) || MB_ORDER;
function styleOf(n) {
  if (n in DIM) return [DIM[n], LW[n], HOT[n]];
  const big = ST.info && ST.info.groups && ST.info.groups[n] > 1000;
  return big ? [DIM.KC, LW.KC, HOT.KC] : [DIM.other, LW.other, HOT.other];
}
function panelClasses() {
  const names = ST.info ? ST.info.class_names : ['KC', 'MBON', 'DAN', 'APL', 'other'];
  return names.length > 4 ? names.filter(n => n !== 'other') : names.slice();
}
function hasSides(n) {
  if (!ST.info) return true;
  const { side, cls, class_names: names } = ST.info, ci = names.indexOf(n);
  for (let i = 0; i < cls.length; i++) if (cls[i] === ci && side[i] < 2) return true;
  return false;
}
function hemiClasses() {
  return ST.info ? panelClasses().filter(hasSides).slice(0, 3) : ['KC', 'MBON', 'DAN'];
}

const mbLegend = () => [['--kc', 'Kenyon cell'], ['--mbon', 'MBON'], ['--dan', 'DAN'], ['--apl', 'APL'], ['--oth', 'other MB']]
  .map(([v, n]) => `<span><span class="dot" style="background:var(${v})"></span>${t(n, null, 'legend')}</span>`).join('\n    ');
const cname = n => t(n, null, 'class');

const danCard = () => `<div class="card">
    <h2>${t('Dopamine gate — the write')}</h2>
    <div class="lamp">
      <div class="bulb" id="bulb"></div>
      <div class="t">${t('{n}of {total} DANs spiking this timestep', { n: '<b id="danN">—</b>', total: '<span id="danTot">340</span>' })}</div>
    </div>
    <svg class="mech" id="mech" viewBox="0 0 300 96" preserveAspectRatio="xMidYMid meet">
      <rect class="box" x="6" y="40" width="66" height="30" rx="6"/>
      <text x="39" y="59" text-anchor="middle" fill="#4fd1c5">KC</text>
      <rect class="box" x="228" y="40" width="66" height="30" rx="6"/>
      <text x="261" y="59" text-anchor="middle" fill="#7aa2ff">MBON</text>
      <line x1="72" y1="55" x2="228" y2="55" stroke="#3a4a66" stroke-width="2"/>
      <polygon points="228,55 220,51 220,59" fill="#3a4a66"/>
      <rect class="box danbox" id="danbox" x="117" y="4" width="66" height="26" rx="6"/>
      <text x="150" y="21" text-anchor="middle" fill="#ff7ab6">DAN</text>
      <path class="gate" d="M150 30 L150 48"/>
      <circle class="gate" cx="150" cy="55" r="7"/>
      <text x="150" y="84" text-anchor="middle">${t('gate × fast-weight write')}</text>
    </svg>
    <div class="legend"><span>${t('When DANs spike they multiplicatively gate the KC→MBON current and drive the fast-weight write — the fly\'s real three-factor plasticity rule, running inside the game.')}</span></div>
  </div>`;

const mbRateNote = () => t('KC stays <b>sparse</b> — that is the point of an expansion layer, and APL\'s global inhibition is what enforces it. ' +
  'MBON is a small population so its rate is coarse; APL is one neuron per hemisphere, so it reads 0%, 50% or 100%.');

function panelsSide() {
  const mb = isMB();
  const legend = mb ? mbLegend() : ST.info.class_names.map(n =>
    `<span><span class="dot" style="background:${rgb(n)}"></span>${esc(t((ST.info.class_labels || {})[n] || n))}</span>`).join('\n    ');
  const hemiRows = hemiClasses().map((n, k) =>
    `<div class="hemi"><div class="hb L"><i id="hb${k}L"></i></div><div class="mid">${esc(cname(n))}</div><div class="hb R"><i id="hb${k}R"></i></div></div>`).join('\n    ') +
    `\n    <div class="hemi"><div class="hb L"><i id="hbAL"></i></div><div class="mid">${cname('all')}</div><div class="hb R"><i id="hbAR"></i></div></div>`;
  const hemiCard = `<div class="card">
    <h2>${t('Hemispheres')}</h2>
    ${hemiRows}
    <div class="legend" style="margin-top:13px"><span id="crosstxt">${t('The connectome is bilateral, with edges crossing the midline in both directions.')}</span></div>
    <div class="grid2" style="margin-top:10px">
      <div class="metric"><div class="k">${t('cross-midline edges')}</div><div class="v" id="mCross">—</div>
        <div class="s" id="mCrossS"></div></div>
      <div class="metric"><div class="k">${t('R→L / L→R')}</div><div class="v" id="mRL">—</div>
        <div class="s">${t('measured, not modelled')}</div></div>
    </div>
  </div>`;
  const rateNote = mb ? mbRateNote() : esc((REGION && REGION.rate_note) || '');
  const title = t('{name} atlas', { name: mb ? t('Mushroom body') : esc(t(ST.info.region.name)) });
  const atlasHtml = `
<div class="card hero">
  <h2>${title} <span class="sm" id="atlasrc">${t('measured soma coordinates')}</span></h2>
  <div class="row" style="margin-bottom:10px">
    <button id="vFront" class="sm${ST.proj === 'frontal' ? ' on' : ''}">${t('Frontal view')}</button>
    <button id="vDors" class="sm${ST.proj === 'dorsal' ? ' on' : ''}">${t('Dorsal view')}</button>
    <span style="flex:1"></span>${ST.fw ? `
    <button id="vMem" class="sm${ST.memory ? ' on' : ''}">${ST.memory ? t('Memory overlay: on') : t('Memory overlay: off')}</button>` : ''}
  </div>
  <div id="atlaswrap"><canvas id="atlas"></canvas></div>
  <div class="alab">
    <div>${t('◀ <b>left hemisphere</b> {n} neurons', { n: '<span id="hdL">2241</span>' })}</div>
    <div>${t('{n} neurons <b>right hemisphere</b> ▶', { n: '<span id="hdR">2269</span>' })}</div>
  </div>
  <div class="legend">
    ${legend}
    <span id="atlasnote">${t('Dim = silent, bright = spiking on this timestep.')}</span>
  </div>
  <div class="legend" style="margin-top:4px"><span class="small" id="skelsrc"></span>
    <span class="small" id="neuritenote">${t('every line is a traced neurite; firing changes brightness, never thickness')}</span>
    <span class="small">${t('atlas redraw {ms}', { ms: '<b id="mDraw">—</b>' })}</span>
    <span class="small" id="atlassub"></span></div>
  <div class="scrub">
    <button id="rewPlay" class="sm">${t('▶ replay game')}</button>
    <input type="range" id="scrub" min="0" max="0" value="0">
    <span class="lb" id="scrublb">${t('live')}</span>
  </div>
</div>`;
  const restHtml = `
<div class="card hero">
  <h2>${t('Continuous activity across the game')} <span class="sm">${t('state carried, never reset')}</span></h2>
  <canvas class="chart" id="gamec"></canvas>
  <div class="grid4" style="margin-top:12px">
    <div class="metric"><div class="k">${t('neurons firing now')}</div><div class="v" id="mRate">—</div>
      <div class="s" id="mRateS">${t('of {H}', { H: ST.info ? ST.info.H : 4510 })}</div></div>
    <div class="metric"><div class="k">${perFrame() ? t('carried from previous frame') : t('carried from previous move')}</div><div class="v" id="mOvP">—</div>
      <div class="s">${t('spike overlap')}</div></div>
    <div class="metric"><div class="k">${perFrame() ? t('still shared with frame 1') : t('still shared with move 1')}</div><div class="v" id="mOv1">—</div>
      <div class="s">${t('unbroken state trajectory')}</div></div>
    <div class="metric"><div class="k">${t('cost per timestep')}</div><div class="v" id="mMs">—</div>
      <div class="s" id="mMsS">${t('constant — O(H) state')}</div></div>
  </div>
  <canvas class="chart" id="latc" style="margin-top:12px"></canvas>
  <div class="legend"><span>${perFrame() ? t('The lower trace is wall-clock cost per timestep in your browser, one timestep per frame. It stays <b>flat</b> ' +
    'because the circuit carries its state instead of re-reading the game: frame 3,000 costs exactly what frame 1 cost. The charts show the last 900 frames.')
    : t('The lower trace is wall-clock cost per timestep in your browser. It stays <b>flat</b> as the game grows ' +
    'because the circuit carries its state instead of re-reading the game — the readout at move 40 costs exactly what move 1 cost.')}</span></div>
</div>
${mb ? `<div class="grid2">\n  ${danCard()}\n  ${hemiCard}\n</div>` : hemiCard}
<div class="card">
  <h2>${t('Firing rate per cell class')}</h2>
  <canvas class="chart" id="ratec"></canvas>
  <div class="grid4" id="classes" style="margin-top:12px"><div class="metric"><div class="k">${t('waiting')}</div>
    <div class="v">—</div><div class="s">${t('no move computed yet')}</div></div></div>
  <div class="legend"><span>${rateNote}</span></div>
</div>`;
  return (PAGE && PAGE.minimal) ? atlasHtml : atlasHtml + restHtml;
}

function mbCells() {
  const cell = (v, title, id, n, desc) => `<div class="cell"><div class="h"><span class="dot" style="background:var(${v})"></span>${title} —
      <span id="${id}">${n}</span></div>
      <div class="d">${desc}</div></div>`;
  return `<div class="note"><p>${t('The <b>mushroom body</b> is the fly\'s olfactory <i>learning</i> centre. Four cell classes do the work, ' +
    'and all four are drawn on the atlas:')}</p></div>
  <div class="cells">
    ${cell('--kc', t('Kenyon cells'), 'cKC', 4064, t('Sparse expansion layer: the <b>keys</b>. Dendrites in the <b>calyx</b>, axons down ' +
      'the <b>peduncle</b> into the α/β, α\'/β\' and γ <b>lobes</b>.'))}
    ${cell('--mbon', t('MBONs'), 'cMBON', 97, t('Output neurons carrying learned <b>values</b>. Their dendrites tile the lobes into ' +
      'compartments; everything downstream sees only these.'))}
    ${cell('--dan', t('DANs'), 'cDAN', 340, t('Dopamine. They <b>gate the write</b> onto KC→MBON synapses. PAM cells innervate the ' +
      'medial lobes, PPL1 cells the vertical lobes.'))}
    ${cell('--apl', 'APL', 'cAPL', 2, t('One giant GABAergic neuron per hemisphere, spanning the whole structure. Global ' +
      '<b>inhibitory feedback</b> that keeps the KC code sparse.'))}
  </div>`;
}

const mbSmall = () => t('Connectome and soma coordinates: <b>MaleCNS v1.0</b> (male <i>Drosophila melanogaster</i> central nervous system), ' +
  'used under <b>CC-BY-4.0</b>. Excitatory/inhibitory signs from the release\'s neurotransmitter annotations; Kenyon cells are treated as ' +
  'cholinergic (excitatory). 4,510 neurons, 1,027,152 within-MB neuron-to-neuron connections, {cross} of them crossing the midline. ' +
  'Neuron morphology from the same release\'s traced skeletons.', { cross: '<span id="crossn">134,807</span>' });

function circuitCard() {
  const mb = isMB(), d = ST.info;
  let cells, small;
  if (mb) { cells = mbCells(); small = mbSmall(); } else {
    cells = `<div class="note">${(REGION && REGION.intro) || ''}</div>
  <div class="cells">` + ((REGION && REGION.cells) || []).map(c =>
      `<div class="cell"><div class="h"><span class="dot" style="background:${rgb(c.cls)}"></span>${esc(c.title)} —
      <span>${Number(d.groups[c.cls] || 0).toLocaleString('en-US')}</span></div>
      <div class="d">${esc(c.desc)}</div></div>`).join('\n    ') + `</div>`;
    small = t('Connectome and soma coordinates: <b>MaleCNS v1.0</b> (male <i>Drosophila melanogaster</i> central nervous system), ' +
      'used under <b>CC-BY-4.0</b>. Excitatory/inhibitory signs from the release\'s predicted neurotransmitters. ' +
      '{H} neurons, {E} within-region neuron-to-neuron connections{cross}. Neuron morphology from the same release\'s traced skeletons.',
      { H: d.H.toLocaleString('en-US'), E: Number(d.edges).toLocaleString('en-US'),
        cross: d.cross ? t(', {n} of them crossing the midline', { n: '<span id="crossn">' + Number(d.cross.cross).toLocaleString('en-US') + '</span>' }) : '' });
  }
  return `
<div class="card">
  <h2>${t('The circuit you are watching')}</h2>
  ${cells}
  <div class="note" style="margin-top:12px">
    ${NOTE}
    <p class="warn" id="caveat"></p>
    <p class="small" style="margin-bottom:0">${small}</p>
  </div>
</div>
<div class="card">
  <h2>${t('The machine')}</h2>
  <table class="fact" id="facts"><tr><td>${t('loading…')}</td><td></td></tr></table>
</div>`;
}

function renderPanels() {
  $('brainPanels').innerHTML = panelsSide();
  const notes = $('notePanels');
  if (notes) notes.innerHTML = (PAGE && PAGE.minimal) ? '' : circuitCard();
  orderSide();
  wirePanels();
}

export function mountPanels(gameNote) {
  NOTE = gameNote;
  renderPanels();
}

const W = { worker: null, seq: 0, pending: new Map() };
export function rpc(cmd, args, onEvent) {
  return new Promise((res, rej) => {
    const id = ++W.seq; W.pending.set(id, { res, rej, onEvent });
    W.worker.postMessage({ id, cmd, args });
  });
}
function onWorkerMessage(e) {
  const m = e.data, p = W.pending.get(m.id); if (!p) return;
  if (m.type === 'progress' || m.type === 'event') { if (p.onEvent) p.onEvent(m.type === 'event' ? m.ev : m); }
  else if (m.type === 'result') { W.pending.delete(m.id); p.res(m.value); }
  else if (m.type === 'error') { W.pending.delete(m.id); p.rej(new Error(m.message)); }
}

export function unpack(b64, n) {
  const raw = atob(b64), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return out;
}
function unpackBytes(b64, n) {
  const raw = atob(b64), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let SKEL = null, PROJ = null, PSTART = null;

async function loadSkeletons(url) {
  try {
    const rs = await fetch(new URL(url, SITE)); const j = rs.ok ? await rs.json() : null;
    if (!j) return null;
    const b = s => { const raw = atob(s), u = new Uint8Array(raw.length);
                     for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return u; };
    const npb = b(j.npoly), plb = b(j.plen), ptb = b(j.pts);
    SKEL = {
      npoly: new Uint32Array(npb.buffer, npb.byteOffset, npb.length / 4),
      plen: new Uint16Array(plb.buffer, plb.byteOffset, plb.length / 2),
      xyz: new Uint16Array(ptb.buffer, ptb.byteOffset, ptb.length / 2),
      counts: j.counts, source: j.source, n_poly: j.n_polylines,
    };
    const M2 = SKEL.plen.length;
    PSTART = new Uint32Array(M2 + 1);
    for (let k = 0; k < M2; k++) PSTART[k + 1] = PSTART[k] + SKEL.plen[k];
    return SKEL;
  } catch (e) { console.warn('skeletons unavailable', e); return null; }
}

function projectSkel(Wd, Hd) {
  const P = SKEL.xyz.length / 3;
  const [ax, ay] = ST.proj === 'dorsal' ? [0, 2] : [0, 1];
  if (!SKEL.kcbox) SKEL.kcbox = {};
  let box = SKEL.kcbox[ax + '_' + ay];
  if (!box) {
    const kci = ST.info.class_names.indexOf('KC');
    const xs = [], ys = [];
    for (let i = 0; i < ST.info.H; i++) {
      if (kci >= 0 && ST.info.cls[i] !== kci) continue;
      for (let j = SKEL.npoly[i]; j < SKEL.npoly[i + 1]; j++) {
        let k = PSTART[j]; const n = SKEL.plen[j];
        for (let q = 0; q < n; q++, k++) { xs.push(SKEL.xyz[3 * k + ax]); ys.push(SKEL.xyz[3 * k + ay]); }
      }
    }
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const q = (arr, f) => arr[Math.max(0, Math.min(arr.length - 1, Math.round(f * (arr.length - 1))))];
    const bx0 = q(xs, 0.002), bx1 = q(xs, 0.998), by0 = q(ys, 0.002), by1 = q(ys, 0.998);
    const mx = (bx1 - bx0) * 0.06, my = (by1 - by0) * 0.08;
    box = { x0: bx0 - mx, x1: bx1 + mx, y0: by0 - my, y1: by1 + my };
    SKEL.kcbox[ax + '_' + ay] = box;
  }
  const M = 4, s = Math.min((Wd - 2 * M) / (box.x1 - box.x0), (Hd - 2 * M) / (box.y1 - box.y0));
  const ox = M + ((Wd - 2 * M) - (box.x1 - box.x0) * s) / 2, oy = M + ((Hd - 2 * M) - (box.y1 - box.y0) * s) / 2;
  const xy = new Float32Array(2 * P);
  for (let i = 0; i < P; i++) {
    xy[2 * i] = ox + (SKEL.xyz[3 * i + ax] - box.x0) * s;
    xy[2 * i + 1] = oy + (SKEL.xyz[3 * i + ay] - box.y0) * s;
  }
  PROJ = { xy, polyStart: PSTART };
}

function strokeNeuron(x, i) {
  const a = SKEL.npoly[i], b = SKEL.npoly[i + 1];
  if (a === b) return;
  const xy = PROJ.xy, ps = PROJ.polyStart;
  x.beginPath();
  for (let j = a; j < b; j++) {
    let k = ps[j]; const n = SKEL.plen[j];
    x.moveTo(xy[2 * k], xy[2 * k + 1]);
    for (let q = 1; q < n; q++) { k++; x.lineTo(xy[2 * k], xy[2 * k + 1]); }
  }
  x.stroke();
}

function layoutSoma(Wd, Hd) {
  const a = ST.info.atlas, N = ST.info.H;
  const P = new Float32Array(2 * N), R = new Float32Array(N);
  const [ax, ay] = ST.proj === 'dorsal' ? [0, 2] : [0, 1];
  const xs = a.xyz.map(p => p[ax]), ys = a.xyz.map(p => p[ay]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const M = 16, s = Math.min((Wd - 2 * M) / (x1 - x0), (Hd - 2 * M) / (y1 - y0));
  const ox = M + ((Wd - 2 * M) - (x1 - x0) * s) / 2, oy = M + ((Hd - 2 * M) - (y1 - y0) * s) / 2;
  for (let i = 0; i < N; i++) {
    P[2 * i] = ox + (a.xyz[i][ax] - x0) * s; P[2 * i + 1] = oy + (a.xyz[i][ay] - y0) * s;
    const c = ST.info.class_names[ST.info.cls[i]];
    R[i] = c === 'KC' ? 1.35 : c === 'DAN' ? 2.1 : c === 'MBON' ? 2.6 : c === 'APL' ? 5.0 : 2.3;
  }
  return { pos: P, rad: R };
}

let ATLAS = null, SOMA = null;

function currentBits() {
  const t = ST.scrubT != null ? ST.scrubT : ST.bits.length - 1;
  return [ST.bits[t] ? unpack(ST.bits[t], ST.info.H) : null, (ST.memory && ST.lastVf) ? unpackBytes(ST.lastVf, ST.info.H) : null];
}

function buildAtlas() {
  if (!ST.info || !ST.info.atlas) return;
  const host = $('atlaswrap');
  const Wd = Math.max(260, Math.floor(host.clientWidth || 600));
  const Hd = Math.round(Wd * (ST.proj === 'dorsal' ? 0.62 : 0.70));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = $('atlas'); c.width = Math.round(Wd * dpr); c.height = Math.round(Hd * dpr); c.style.height = Hd + 'px';
  if (SKEL) projectSkel(Wd, Hd);
  if (!SKEL || ST.fastAtlas) SOMA = layoutSoma(Wd, Hd);
  ATLAS = { dpr, bg: renderBg(Wd, Hd, dpr) };
  const nn = $('neuritenote');
  if (nn) nn.style.display = ST.fastAtlas ? 'none' : '';
  drawAtlas(...currentBits());
}

function renderBg(Wd, Hd, dpr) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(Wd * dpr); cv.height = Math.round(Hd * dpr);
  const x = cv.getContext && cv.getContext('2d'); if (!x) return null;
  x.scale(dpr, dpr);
  x.fillStyle = '#05080e'; x.fillRect(0, 0, Wd, Hd);
  x.strokeStyle = '#111a29'; x.lineWidth = 1; x.setLineDash([3, 6]);
  x.beginPath(); x.moveTo(Wd / 2, 0); x.lineTo(Wd / 2, Hd); x.stroke(); x.setLineDash([]);
  const NAMES = ST.info.class_names;
  x.lineCap = 'round'; x.lineJoin = 'round';
  if (SKEL && !ST.fastAtlas) {
    for (const cname of drawOrder()) {
      const ci = NAMES.indexOf(cname); if (ci < 0) continue;
      const col = colorOf(cname), [dim, lw] = styleOf(cname);
      x.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + dim + ')';
      x.lineWidth = lw / dpr;
      for (let i = 0; i < ST.info.H; i++) if (ST.info.cls[i] === ci) strokeNeuron(x, i);
    }
  } else if (SOMA) {
    for (let i = 0; i < ST.info.H; i++) {
      const col = colorOf(NAMES[ST.info.cls[i]]);
      x.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.14)';
      x.beginPath(); x.arc(SOMA.pos[2 * i], SOMA.pos[2 * i + 1], SOMA.rad[i], 0, 6.283); x.fill();
    }
  }
  const HL = ST.highlight;
  if (HL && SKEL && !ST.fastAtlas) {
    x.lineWidth = 0.9 / dpr;
    for (let k = 0; k < HL.idx.length; k++) {
      x.strokeStyle = 'rgba(255,196,71,' + (0.10 + 0.35 * HL.w[k]).toFixed(3) + ')';
      strokeNeuron(x, HL.idx[k]);
    }
  } else if (HL && SOMA) {
    x.lineWidth = 1.2;
    for (let k = 0; k < HL.idx.length; k++) {
      const i = HL.idx[k];
      x.strokeStyle = 'rgba(255,196,71,' + (0.25 + 0.5 * HL.w[k]).toFixed(3) + ')';
      x.beginPath(); x.arc(SOMA.pos[2 * i], SOMA.pos[2 * i + 1], SOMA.rad[i] * 2.2, 0, 6.283); x.stroke();
    }
  }
  x.font = '10px ui-monospace,monospace'; x.fillStyle = '#46536b'; x.textAlign = 'center';
  x.fillText(ST.proj === 'dorsal'
    ? t('dorsal projection · x = medial-lateral, z = anterior-posterior')
    : t('frontal projection · x = medial-lateral, y = dorsal-ventral'), Wd / 2, Hd - 6);
  return cv;
}

export function drawAtlas(bits, vf) {
  if (!ATLAS) return;
  const c = $('atlas'), x = c.getContext && c.getContext('2d'); if (!x) return;
  x.setTransform(1, 0, 0, 1, 0, 0);
  if (ATLAS.bg) x.drawImage(ATLAS.bg, 0, 0);
  else { x.fillStyle = '#05080e'; x.fillRect(0, 0, c.width, c.height); }
  x.scale(ATLAS.dpr, ATLAS.dpr);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const NAMES = ST.info.class_names;
  const t0 = performance.now();
  if (ST.memory && vf) {
    if (SKEL && !ST.fastAtlas) {
      x.globalCompositeOperation = 'lighter';
      x.strokeStyle = 'rgba(255,196,71,0.055)'; x.lineWidth = 0.7 / ATLAS.dpr;
      for (let i = 0; i < ST.info.H; i++) if (vf[i] > 150) strokeNeuron(x, i);
      x.globalCompositeOperation = 'source-over';
    } else if (SOMA) {
      for (let i = 0; i < ST.info.H; i++) { const v = vf[i] / 255; if (v < 0.06) continue;
        x.fillStyle = 'rgba(255,196,71,' + (0.55 * v).toFixed(3) + ')';
        x.beginPath(); x.arc(SOMA.pos[2 * i], SOMA.pos[2 * i + 1], SOMA.rad[i] * 2.1, 0, 6.283); x.fill(); }
    }
  }
  const HL = ST.highlight;
  if (HL && bits && SKEL && !ST.fastAtlas) {
    x.globalCompositeOperation = 'lighter';
    x.strokeStyle = 'rgba(255,196,71,0.95)'; x.lineWidth = 1.4 / ATLAS.dpr;
    for (let k = 0; k < HL.idx.length; k++) if (bits[HL.idx[k]]) strokeNeuron(x, HL.idx[k]);
    x.globalCompositeOperation = 'source-over';
  } else if (HL && bits && SOMA) {
    x.strokeStyle = 'rgba(255,196,71,1)'; x.lineWidth = 1.2;
    for (let k = 0; k < HL.idx.length; k++) {
      const i = HL.idx[k];
      if (!bits[i]) continue;
      x.beginPath(); x.arc(SOMA.pos[2 * i], SOMA.pos[2 * i + 1], SOMA.rad[i] * 2.2, 0, 6.283); x.stroke();
    }
  }
  if (bits) {
    if (SKEL && !ST.fastAtlas) {
      let spikeN = 0;
      for (let i = 0; i < ST.info.H; i++) if (bits[i]) spikeN++;
      const cap = ST.strokeCap | 0;
      const k = (cap && spikeN > cap) ? Math.ceil(spikeN / cap) : 1;
      ATLAS.rot = k > 1 ? (((ATLAS.rot || 0) + 1) % k) : 0;
      let seen = 0, drawn = 0;
      x.globalCompositeOperation = 'lighter';
      for (const cname of drawOrder()) {
        const ci = NAMES.indexOf(cname); if (ci < 0) continue;
        const col = colorOf(cname), [, lw, hot] = styleOf(cname);
        x.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + hot + ')';
        x.lineWidth = lw / ATLAS.dpr;
        for (let i = 0; i < ST.info.H; i++) {
          if (ST.info.cls[i] !== ci || !bits[i]) continue;
          if (k > 1 && ((seen++ + ATLAS.rot) % k)) continue;
          drawn++; strokeNeuron(x, i);
        }
      }
      x.globalCompositeOperation = 'source-over';
      if (k !== ATLAS.lastK) {
        ATLAS.lastK = k;
        const sub = $('atlassub');
        if (sub) sub.textContent = k > 1
          ? t('{n} of the {m} spiking cells are drawn each frame, rotating, so the game keeps real time', { n: drawn, m: spikeN })
          : '';
      }
    } else if (SOMA) {
      for (let i = 0; i < bits.length; i++) { if (!bits[i]) continue;
        const col = colorOf(NAMES[ST.info.cls[i]]);
        x.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
        x.beginPath(); x.arc(SOMA.pos[2 * i], SOMA.pos[2 * i + 1], SOMA.rad[i] * 1.45, 0, 6.283); x.fill(); }
    }
  }
  const dm = $('mDraw'); if (dm) dm.textContent = (performance.now() - t0).toFixed(0) + ' ms';
}

function lineChart(id, series, ymax, xn, h, xlab) {
  const c = $(id); if (!c || !c.getContext) return;
  const Wd = Math.max(240, Math.floor(c.clientWidth || 440)), Hd = h || 118;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(Wd * dpr); c.height = Math.round(Hd * dpr); c.style.height = Hd + 'px';
  let x; try { x = c.getContext('2d'); } catch (_) { return; } if (!x) return;
  x.setTransform(1, 0, 0, 1, 0, 0); x.scale(dpr, dpr);
  x.fillStyle = '#080d15'; x.fillRect(0, 0, Wd, Hd);
  const L = 38, R = 10, T = 8, B = 18;
  const n = Math.max(2, xn);
  const isPct = ymax <= 1.0001;
  const px = k => L + (Wd - L - R) * (k / (n - 1));
  const py = v => T + (Hd - T - B) * (1 - Math.min(1, v / ymax));
  x.strokeStyle = '#161f30'; x.lineWidth = 1; x.font = '9px ui-monospace,monospace';
  for (let g = 0; g <= 4; g++) {
    const v = ymax * g / 4, yy = py(v);
    x.beginPath(); x.moveTo(L, yy); x.lineTo(Wd - R, yy); x.stroke();
    x.fillStyle = '#4d5b74'; x.fillText(isPct ? (100 * v).toFixed(0) + '%' : v.toFixed(0), 2, yy + 3);
  }
  if (xlab) { x.fillStyle = '#3d4960'; x.textAlign = 'right'; x.fillText(xlab, Wd - R, Hd - 5); x.textAlign = 'left'; }
  for (const s of series) {
    if (!s.v || !s.v.length) continue;
    x.strokeStyle = s.color; x.lineWidth = 1.9; x.beginPath();
    s.v.forEach((v, i) => { const xx = px(i), yy = py(v); if (!i) x.moveTo(xx, yy); else x.lineTo(xx, yy); });
    x.stroke();
    if (s.v.length <= 40) s.v.forEach((v, i) => { x.fillStyle = s.color;
      x.beginPath(); x.arc(px(i), py(v), 2.1, 0, 7); x.fill(); });
    x.fillStyle = s.color; x.font = '10px ui-monospace,monospace';
    const lx = Math.min(px(s.v.length - 1) + 4, Wd - R - 30);
    x.fillText(s.name, lx, py(s.v[s.v.length - 1]) - 5);
  }
}

function hemiBar(a, bId, g) {
  if (!g || g.L == null || !$(a)) return;
  const m = Math.max(g.L, g.R, 1e-6);
  $(a).style.width = (100 * g.L / m) + '%'; $(bId).style.width = (100 * g.R / m) + '%';
}
function renderClasses(g) {
  if (!$('classes')) return;
  $('classes').innerHTML = panelClasses().filter(n => g[n]).map(n =>
    '<div class="metric"><div class="k"><span class="dot" style="background:' + dotColor(n) + '"></span>' + esc(cname(n)) +
    ' <span style="color:#55617a">n=' + (ST.info ? ST.info.groups[n] : '') + '</span></div>' +
    '<div class="v">' + (100 * g[n].rate).toFixed(1) + '%</div>' +
    '<div class="s">' + t('{n} spiking', { n: g[n].count }) +
    (g[n].L != null && hasSides(n) ? '  ·  ' + t('L {l} / R {r}', { l: (100 * g[n].L).toFixed(0), r: (100 * g[n].R).toFixed(0) }) : '') +
    '</div></div>').join('');
}
function onStep(ev) {
  const b = ev.brain;
  ST.bits[ev.t] = b.bits;
  ST.lastVf = b.vf;
  ST.scrubT = null;
  $('scrub').max = Math.max(0, ST.bits.length - 1);
  $('scrub').value = ST.bits.length - 1;
  $('scrublb').textContent = t('live · t={t}', { t: ev.t });
  drawAtlas(unpack(b.bits, ST.info.H), b.vf ? unpackBytes(b.vf, ST.info.H) : null);
  const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  setTxt('mRate', (100 * b.rate).toFixed(1) + '%');
  setTxt('mRateS', t('{n} of {H}', { n: b.n_active, H: ST.info.H }));
  const e = ev.entry;
  setTxt('mOvP', e.overlap_prev == null ? '—' : (100 * e.overlap_prev).toFixed(0) + '%');
  setTxt('mOv1', e.overlap_first == null ? '—' : (100 * e.overlap_first).toFixed(0) + '%');
  setTxt('mMs', t('{n} ms', { n: ev.ms.toFixed(perFrame() ? 2 : 0) }));
  if ($('bulb')) {
    $('bulb').classList.toggle('on', !!b.dan_gate_open);
    $('mech').classList.toggle('fire', !!b.dan_gate_open);
    $('danN').textContent = b.dan_count;
  }
  const g = b.groups;
  hemiClasses().forEach((n, k) => hemiBar('hb' + k + 'L', 'hb' + k + 'R', g[n]));
  if (b.hemi) hemiBar('hbAL', 'hbAR', { L: b.hemi.L, R: b.hemi.R });
  renderClasses(g);
}
const FRAME_WINDOW = 900;
export function recordFrame(ev) {
  ST.bits[ev.t] = ev.brain.bits;
  if (ev.t >= FRAME_WINDOW) delete ST.bits[ev.t - FRAME_WINDOW];
  ST.hist.push(ev.entry);
  if (ST.hist.length > FRAME_WINDOW) ST.hist.shift();
}
export const drawBrain = ev => onStep(ev);
export const refreshAtlas = () => buildAtlas();
export const refreshCharts = () => drawGameCharts();

export function renderCands(cands) {
  const box = $('cands'); box.innerHTML = '';
  (cands || []).forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'cand' + (i === 0 ? ' lead' : '');
    row.innerHTML = '<div class="rk">' + (i + 1) + '</div><div class="mv">' + esc(t(c.label)) + '</div>' +
      '<div class="bar"><i style="width:' + (100 * c.p).toFixed(1) + '%"></i></div>' +
      '<div class="pv">' + (100 * c.p).toFixed(1) + '%</div>';
    box.appendChild(row);
  });
}
function drawGameCharts() {
  const h = ST.hist; if (!h.length) return;
  const n = h.length;
  lineChart('gamec', [
    { name: cname('all'), color: '#9fb0cb', v: h.map(e => e.rate) },
    { name: perFrame() ? t('carried from frame 1') : t('carried from move 1'), color: '#ffc447', v: h.map(e => e.overlap_first == null ? 0 : e.overlap_first) },
  ], 1.0, n, 132, perFrame() ? t('timestep (one per frame) →') : t('timestep (one per move) →'));
  lineChart('latc', [
    { name: t('ms / timestep'), color: '#5ad1ff', v: h.map(e => e.ms) },
  ], Math.max(perFrame() ? 4 : 60, Math.ceil(Math.max(...h.map(e => e.ms)) * 1.3)), n, 96, t('timestep →'));
  lineChart('ratec', panelClasses().map(k => ({
    name: cname(k), color: rgb(k), v: h.map(e => (e.per_class && e.per_class[k]) || 0),
  })), 1.0, n, 132, t('timestep →'));
  const ms = h.map(e => e.ms);
  const dg = perFrame() ? 2 : 0;
  if (!$('mMsS')) return;
  $('mMsS').textContent = t('first {a} · last {b} ms', { a: ms[0].toFixed(dg), b: ms[ms.length - 1].toFixed(dg) });
}

function showT(k) {
  if (!ST.bits[k]) return;
  ST.scrubT = k;
  drawAtlas(unpack(ST.bits[k], ST.info.H), null);
  const e = ST.hist[k];
  $('scrublb').textContent = 't=' + k + (e ? '  ' + (100 * e.rate).toFixed(1) + '%' : '');
}

export const FLY = { el: null, bubble: null, carry: null, busy: false, skip: false, x: 0, y: 0, k: 1, csz: 0 };

export const FLY_BODY = `
  <g class="wing wl"><ellipse cx="26" cy="12" rx="13" ry="6.5" transform="rotate(-22 26 12)"/></g>
  <g class="wing wr"><ellipse cx="26" cy="20" rx="13" ry="6.5" transform="rotate(22 26 20)"/></g>
  <path class="leg" d="M28 30 q-3 6 -8 8"/><path class="leg" d="M33 31 q-1 7 -4 9"/>
  <path class="leg" d="M38 30 q2 6 6 8"/>
  <ellipse class="abdo" cx="27" cy="24" rx="14" ry="9"/>
  <ellipse class="thor" cx="40" cy="22" rx="8.5" ry="7.5"/>
  <ellipse class="eye"  cx="45.5" cy="19" rx="5" ry="5.2"/>
  <ellipse class="eye"  cx="45.5" cy="26" rx="4.4" ry="4.6"/>
  <circle class="glint" cx="47.4" cy="17.6" r="1.5"/>
  <path class="ant" d="M46 14 q4 -6 8 -6"/><path class="ant" d="M47 30 q4 6 8 6"/>
`;
const FLY_STYLE = '.abdo{fill:#3b4657}.thor{fill:#2a3340}.eye{fill:#e2452f}.glint{fill:#fff;opacity:.85}' +
  '.ant,.leg{stroke:#222a36;stroke-width:2;fill:none;stroke-linecap:round}.wing ellipse{fill:rgba(205,232,255,.5);stroke:rgba(255,255,255,.5);stroke-width:.7}';
export function flySpriteSvg(wing) {
  const w = wing == null ? '' : '.wing{transform-origin:34px 18px;transform:scaleY(' + wing + ')}';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 44" width="180" height="132"><style>' + FLY_STYLE + w + '</style>' + FLY_BODY + '</svg>';
}

function flyInit() {
  const stage = $('boardstage');
  const d = document.createElement('div');
  d.id = 'flyguy'; d.innerHTML = '<svg viewBox="0 0 60 44" width="52" height="38">' + FLY_BODY + '</svg>';
  stage.appendChild(d);
  FLY.el = d;
  const b = document.createElement('div');
  b.id = 'flybubble'; b.innerHTML = '<span>· · ·</span>';
  stage.appendChild(b); FLY.bubble = b;
  const c = document.createElement('div');
  c.id = 'flycarry'; stage.appendChild(c); FLY.carry = c;
  flyPlace(-70, 30, 0);
  d.style.opacity = '0';
}
export function flyPlace(x, y, rot) {
  FLY.x = x; FLY.y = y;
  const k = FLY.k || 1;
  FLY.el.style.transform = 'translate(' + (x - 26) + 'px,' + (y - 19) + 'px) rotate(' + (rot || 0) + 'deg) scale(' + k + ')';
  if (FLY.carry.dataset.on === '1')
    FLY.carry.style.transform = 'translate(' + (x - FLY.csz / 2) + 'px,' + (y + FLY.csz * 0.22) + 'px)';
  if (FLY.bubble.dataset.on === '1')
    FLY.bubble.style.transform = 'translate(' + (x + 18 * k) + 'px,' + (y - 46 * k) + 'px)';
}
const easeIO = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export function flyTo(x1, y1, ms) {
  return new Promise(res => {
    if (FLY.skip) { flyPlace(x1, y1, 0); return res(); }
    const x0 = FLY.x, y0 = FLY.y, t0 = performance.now();
    const dx = x1 - x0, dy = y1 - y0;
    const arc = Math.min(38, Math.hypot(dx, dy) * 0.22);
    const rot = Math.max(-18, Math.min(18, dx * 0.06));
    (function step(now) {
      let t = Math.min(1, (now - t0) / ms);
      if (FLY.skip) t = 1;
      const e = easeIO(t);
      const wob = Math.sin(t * Math.PI * 3) * 3 * (1 - t);
      flyPlace(x0 + dx * e, y0 + dy * e - Math.sin(Math.PI * e) * arc + wob, rot * (1 - Math.abs(0.5 - t) * 2) + wob);
      if (t < 1) requestAnimationFrame(step); else res();
    })(performance.now());
  });
}
export function flyShow(on) { FLY.el.style.opacity = on ? '1' : '0'; }
function flySize() { const w = $('boardwrap').clientWidth || 320; FLY.csz = (w / 8) * 0.86; FLY.k = Math.min(2.2, Math.max(1, w / 8 / 46)); }
export function flyThinking(on, text) {
  FLY.bubble.innerHTML = '<span>' + (text || '· · ·') + '</span>';
  FLY.bubble.dataset.on = on ? '1' : '0';
  FLY.bubble.style.opacity = on ? '1' : '0';
  if (on) {
    flySize();
    flyShow(true);
    const w = $('boardwrap').clientWidth || 320;
    if (FLY.x < 0) flyPlace(w * 0.5, -34, 0);
    flyPlace(FLY.x, FLY.y, 0);
    hover();
  }
}
let HOV = null;
function hover() {
  cancelAnimationFrame(HOV);
  const bx = FLY.x, by = FLY.y, t0 = performance.now();
  (function step(now) {
    if (FLY.bubble.dataset.on !== '1') return;
    const t = (now - t0) / 1000;
    flyPlace(bx + Math.sin(t * 2.1) * 7, by + Math.cos(t * 3.3) * 5, Math.sin(t * 2.1) * 6);
    HOV = requestAnimationFrame(step);
  })(performance.now());
}
export function carryShow(make) {
  flySize();
  FLY.carry.innerHTML = '';
  FLY.carry.appendChild(make(FLY.csz));
  FLY.carry.dataset.on = '1'; FLY.carry.style.opacity = '1';
  flyPlace(FLY.x, FLY.y, 0);
}
export function carryHide() { FLY.carry.dataset.on = '0'; FLY.carry.style.opacity = '0'; FLY.carry.innerHTML = ''; }
export function puff(sq, kind) {
  const [x, y] = PAGE.sqCenter(sq);
  const d = document.createElement('div');
  d.className = 'puff' + (kind ? ' ' + kind : '');
  d.style.left = x + 'px'; d.style.top = y + 'px';
  $('boardstage').appendChild(d);
  setTimeout(() => d.remove(), 620);
}
const HANG = () => FLY.csz * 0.72;
export async function flyToSquare(sq) {
  const [x, y] = PAGE.sqCenter(sq), h = HANG();
  await flyTo(x, y - h - 14, 380);
  await flyTo(x, y - h, 130);
}
export async function carryTo(from, to) {
  const [fx, fy] = PAGE.sqCenter(from), [tx, ty] = PAGE.sqCenter(to), h = HANG();
  await flyTo(fx, fy - h - 12, 120);
  await flyTo(tx, ty - h - 12, Math.max(260, Math.min(700, Math.hypot(tx - fx, ty - fy) * 2.4)));
  await flyTo(tx, ty - h, 120);
}
export function flyBegin() {
  FLY.busy = true; FLY.skip = false;
  flyShow(true);
  flySize();
  $('skipfly').style.display = 'inline-block';
}
export function flyEnd() {
  carryHide();
  $('skipfly').style.display = 'none';
  FLY.busy = false;
  const w = $('boardwrap').clientWidth || 320;
  flyTo(w - 30, -40, 420).then(() => { if (!FLY.busy) flyShow(false); });
}

export function fitBoard() {
  const root = document.documentElement;
  if (innerWidth <= 1000) { root.style.removeProperty('--bcol'); return; }
  const wrap = document.querySelector('.wrap'), cs = getComputedStyle(wrap);
  const inner = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const hdr = document.querySelector('header').offsetHeight;
  const byH = innerHeight - hdr - ((PAGE && PAGE.fitExtra) || 95);
  const byW = Math.min(0.78 * innerWidth, inner - 16 - 170 - 30);
  const size = Math.round(Math.max(360, Math.min(byH, byW, 960)));
  root.style.setProperty('--bcol', (size + 30) + 'px');
}

function valText(v) {
  const f = /^([\d,]+) of ([\d,]+) spike bits differ from the reference on the same weights \(([\d,]+) held-out frames and a ([\d,]+)-frame closed-loop game\)$/.exec(v);
  if (f) return t('{x} of {y} spike bits differ from the reference on the same weights ({a} held-out frames and a {b}-frame closed-loop game)',
    { x: f[1], y: f[2], a: f[3], b: f[4] });
  const m = /^legal top-1 (\d+)\/(\d+) vs the fp32 reference \((\d+) (.+?)\); ([\d,]+) of ([\d,]+) spike bits differ from the reference on the same weights$/.exec(v);
  return m ? t('legal top-1 {a}/{b} vs the fp32 reference ({n} {games}); {x} of {y} spike bits differ from the reference on the same weights',
    { a: m[1], b: m[2], n: m[3], games: t(m[4]), x: m[5], y: m[6] }) : v;
}

function supportsModuleWorker() {
  let ok = false;
  try { new Worker('data:,', { get type() { ok = true; return 'module'; } }).terminate(); } catch (_) {}
  return ok;
}
function loaderMsg(h, sub, err) {
  $('ldH').textContent = h; $('ldS').innerHTML = sub; $('loader').classList.toggle('err', !!err);
  $('loader').style.display = 'flex';
}

let RP = null;
function wirePanels() {
  if (RP) { clearInterval(RP); RP = null; }
  $('scrub').oninput = e => showT(+e.target.value);
  $('rewPlay').onclick = () => {
    if (RP) { clearInterval(RP); RP = null; $('rewPlay').textContent = t('▶ replay game'); return; }
    let k = 0; $('rewPlay').textContent = t('■ stop');
    RP = setInterval(() => {
      if (k >= ST.bits.length) { clearInterval(RP); RP = null; $('rewPlay').textContent = t('▶ replay game'); return; }
      $('scrub').value = k; showT(k); k++;
    }, 140);
  };
  const setProj = v => {
    ST.proj = v;
    $('vFront').classList.toggle('on', v === 'frontal');
    $('vDors').classList.toggle('on', v === 'dorsal');
    buildAtlas();
  };
  $('vFront').onclick = () => setProj('frontal');
  $('vDors').onclick = () => setProj('dorsal');
  if ($('vMem')) $('vMem').onclick = () => {
    ST.memory = !ST.memory;
    $('vMem').textContent = ST.memory ? t('Memory overlay: on') : t('Memory overlay: off');
    $('vMem').classList.toggle('on', ST.memory);
    if (ST.info) drawAtlas(...currentBits());
  };
}

function orderSide() {
  const col = $('colSide'), bp = $('brainPanels'); if (!col) return;
  const stale = $('atlasCard');
  if (stale && bp && !bp.contains(stale)) stale.remove();
  const wrap = bp && bp.querySelector('#atlaswrap');
  const atlas = wrap ? wrap.closest('.card') : null;
  if (atlas) atlas.id = 'atlasCard';
  const first = [atlas, col.querySelector('[data-side="command"]'), col.querySelector('[data-side="picker"]')].filter(Boolean);
  for (let i = first.length - 1; i >= 0; i--) col.insertBefore(first[i], col.firstChild);
}

function wirePage() {
  [['tg0', 0], ['tg1', 0.5], ['tg2', 1.0]].forEach(([id, temp]) => {
    if ($(id)) $(id).onclick = () => { ST.temp = temp; ['tg0', 'tg1', 'tg2'].forEach(i => $(i).classList.toggle('on', i === id)); };
  });
  if ($('skipfly')) $('skipfly').onclick = () => { FLY.skip = true; };
  let RT = null;
  window.addEventListener('resize', () => {
    fitBoard(); PAGE.render();
    clearTimeout(RT);
    RT = setTimeout(() => {
      if (!ST.info || !ST.info.atlas) return;
      buildAtlas();
      drawGameCharts();
    }, 220);
  });
  if (window.ResizeObserver) new ResizeObserver(() => PAGE.render()).observe($('boardwrap'));
}

function defaultModel(kind) {
  const qs = new URLSearchParams(location.search);
  const CFG = (window.FLY_CONFIG || {})[kind] || {};
  return { id: kind, wsrc: qs.get('weights') || CFG.WEIGHTS_BASE || '', variant: qs.get('prec') || CFG.PRECISION || 'fp16w32',
           skel: 'data/mb_skel.json', region: null };
}

export async function start(page) {
  PAGE = page;
  orderSide();
  fitBoard();
  flyInit();
  wirePage();
  const missing = [];
  if (typeof Worker === 'undefined') missing.push('Web Workers');
  else if (!supportsModuleWorker()) missing.push('module Web Workers');
  if (typeof BigInt === 'undefined') missing.push('BigInt');
  if (typeof fetch === 'undefined' || typeof ReadableStream === 'undefined') missing.push('fetch streams');
  if (typeof Float32Array === 'undefined') missing.push('typed arrays');
  if (missing.length) {
    loaderMsg(t('This browser cannot run the fly'), t('Missing: <b>{list}</b>. Please use a current Chrome, Edge, Firefox (114+) or Safari (15+).',
      { list: esc(missing.join(', ')) }), true);
    throw new Error('unsupported browser');
  }
  W.worker = new Worker(new URL('../engine/worker.js', import.meta.url), { type: 'module' });
  W.worker.onmessage = onWorkerMessage;
  W.worker.onerror = ev => loaderMsg(t('The engine failed to start'), esc(ev.message || 'worker error'), true);
  const spec = page.initialModel ? page.initialModel() : defaultModel(page.kind);
  if (spec) await loadModel(spec);
  else $('loader').style.display = 'none';
}

export async function loadModel(spec) {
  if (!spec.wsrc || /[<>]/.test(spec.wsrc)) {
    loaderMsg(t('Weights location not configured'), t('Set <b>WEIGHTS_BASE</b> for this model in <code>config.js</code> to ' +
      'the model folder URL (e.g. the Hugging Face <code>resolve/main/</code> URL).'), true);
    throw new Error('WEIGHTS_BASE not configured');
  }
  const wbase = new URL(spec.wsrc, SITE).href;
  ST.ready = false;
  const brain = spec.region ? t('the fly\'s {region}', { region: spec.region.name.toLowerCase() }) : t('the fly\'s brain');
  loaderMsg(t('Loading {brain}…', { brain }), t('Downloading the trained connectome weights. Everything runs locally in this tab.'), false);
  $('ldBar').style.width = '0%'; $('ldP').textContent = t('starting…');
  const t0 = performance.now();
  let r;
  try {
    r = await rpc('init', { base: SITE.href, wbase, variant: spec.variant, kind: PAGE.kind }, m => {
      if (m.type !== 'progress') return;
      $('ldBar').style.width = (100 * m.done / Math.max(1, m.total)).toFixed(1) + '%';
      $('ldP').textContent = MB(m.done) + ' / ' + MB(m.total) + ' MB  ·  ' + t(m.file);
    });
  } catch (e) {
    loaderMsg(t('Could not load {brain}', { brain }), esc(e.message), true); throw e;
  }
  const d = r.info;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_) {}
  ST.info = d; ST.model = spec; REGION = spec.region; ST.cache = r.cache; ST.readout = r.readout || null;
  ST.fw = r.manifest.fast_weight !== false;
  if (!ST.fw) ST.memory = false;
  if (spec.note) NOTE = spec.note;
  SKEL = null; PROJ = null; PSTART = null; ATLAS = null; SOMA = null;
  ST.bits = []; ST.hist = []; ST.scrubT = null; ST.lastVf = null; ST.highlight = null;
  renderPanels();
  $('loader').style.display = 'none';
  const g = d.groups || {}, man = r.manifest, audit = man.connectome_audit || {}, val = man.validation || {}, sc = r.selfcheck;
  const ok = v => v ? '<span class="ok">' + t('PASS') + '</span>' : '<span class="warn">' + t('FAIL') + '</span>';
  const regionName = d.region ? esc(t(d.region.name).toLowerCase()) : t('mushroom body');
  const MBs = MB(r.download_bytes), cache = r.cache || {};
  const rows = [
    [t('connectome'), t('MaleCNS v1.0 {region} (CC-BY-4.0)', { region: regionName })],
    [t('neurons'), d.H + '  (' + d.class_names.map(n => esc(cname(n)) + ' ' + g[n]).join(' · ') + ')'],
    [t('neuron-to-neuron connections'), Number(d.edges).toLocaleString('en-US')],
    [t('Dale signs'), t('E {E} / I {I} / modulatory {mod}', d.sign)],
    [t('hemispheres'), t('{L} L / {R} R', { L: d.nL, R: d.nR })],
    [t('cross-midline edges'), d.cross ? Number(d.cross.cross).toLocaleString('en-US') + ' (' + (100 * d.cross.frac).toFixed(1) + '%)' : '—'],
    [t('soma coordinates'), d.atlas ? t('{a} measured, {b} imputed', { a: d.atlas.n_real, b: d.atlas.n_filled }) : t('unavailable')],
    [t('run mode'), perFrame() ? t('RSNN (one timestep per frame at 60 frames per second, state carried through the game) · in this browser tab')
      : t('RSNN (one timestep per move, state carried, no reset) · in this browser tab')],
  ];
  if (d.region) rows.push([t('input → readout'), t('{nin} {input} → {nout} {output} (no dopamine gate)',
    { nin: d.region.n_in, input: esc(t(d.region.input)), nout: d.region.n_out, output: esc(t(d.region.output)) })]);
  rows.push(
    [t('synaptic weights'), t('trained with <a href="https://arxiv.org/abs/2604.01295" target="_blank" rel="noopener">PHCSSM</a> parallel-scan mode, deployment in sequential RSNN mode')],
    [perFrame() ? t('actions') : t('move vocabulary'), PAGE.vocabText(d.vocab)],
    [t('trained parameters'), t('{x} M', { x: (d.params / 1e6).toFixed(2) })],
    [t('model'), esc(man.label) + (PAGE.modelNote && PAGE.modelNote() ? ' — ' + esc(PAGE.modelNote()) : '')],
    [t('weights in this page'), cache.from_network_bytes === 0 ? t('{variant} · {mb} MB loaded from this browser\'s storage', { variant: esc(r.variant), mb: MBs })
      : cache.from_cache_bytes > 0 ? t('{variant} · {mb} MB loaded ({net} MB downloaded, the rest from this browser\'s storage)', { variant: esc(r.variant), mb: MBs, net: MB(cache.from_network_bytes) })
      : cache.available ? t('{variant} · {mb} MB downloaded, kept in this browser for next time', { variant: esc(r.variant), mb: MBs })
      : t('{variant} · {mb} MB downloaded', { variant: esc(r.variant), mb: MBs })],
    [t('recurrent weights'), t('{n} nonzero, {m} off the connectome', { n: Number(audit.nonzero_weights || 0).toLocaleString('en-US'),
      m: Number(audit.off_connectome || 0).toLocaleString('en-US') })],
    [t('Dale check'), t('{n} wrong-sign weights', { n: Number(audit.wrong_sign || 0).toLocaleString('en-US') })],
    [t('engine vs reference'), val[r.variant] ? esc(valText(val[r.variant])) : '—'],
    [t('load-time self-check'), sc ? ok(sc.legal_top1_agree === sc.plies) + ' ' + (perFrame()
      ? t('— top-1 {a}/{b} frames, max |Δlogit| {e}', { a: sc.legal_top1_agree, b: sc.plies, e: sc.max_abs_logit_diff.toExponential(1) })
      : t('— legal top-1 {a}/{b} plies, max |Δlogit| {e}', { a: sc.legal_top1_agree, b: sc.plies, e: sc.max_abs_logit_diff.toExponential(1) })) : '—'],
    [t('engine load'), t('{s} s', { s: ((performance.now() - t0) / 1000).toFixed(1) })],
  );
  if ($('facts')) $('facts').innerHTML = rows.map(([a, b]) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>').join('');
  $('footck').textContent = ' ' + t('Model: {label} ({variant} weights).', { label: man.label, variant: r.variant });
  let st = null;
  try { const rs = await fetch(new URL(dataFile('data/strength_' + PAGE.kind + '.json'), SITE)); if (rs.ok) st = await rs.json(); } catch (_) {}
  const cv = PAGE.caveat(st, REGION);
  if ($('caveat')) $('caveat').innerHTML = cv.html;
  if (cv.row && $('facts')) {
    const tb = $('facts'), tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (perFrame() ? t('record') : t('strength')) + '</td><td>' + cv.row + '</td>';
    const modelRow = [...tb.children].find(x => x.firstChild && x.firstChild.textContent === t('model'));
    tb.insertBefore(tr, modelRow || null);
  }
  if ($('hdL')) { $('hdL').textContent = d.nL; $('hdR').textContent = d.nR; }
  for (const [id, n] of [['cKC', 'KC'], ['cMBON', 'MBON'], ['cDAN', 'DAN'], ['cAPL', 'APL'], ['danTot', 'DAN']])
    if ($(id)) $(id).textContent = g[n];
  if (d.cross && $('mCross')) {
    $('mCross').textContent = (100 * d.cross.frac).toFixed(1) + '%';
    $('mCrossS').textContent = t('{a} of {b}', { a: Number(d.cross.cross).toLocaleString('en-US'), b: Number(d.cross.edges).toLocaleString('en-US') });
    $('mRL').textContent = Number(d.cross.R_to_L).toLocaleString('en-US') + ' / ' + Number(d.cross.L_to_R).toLocaleString('en-US');
    if ($('crossn')) $('crossn').textContent = Number(d.cross.cross).toLocaleString('en-US');
    $('crosstxt').innerHTML = t('Bilateral: <b>{L} left / {R} right</b>, and <b>{p}%</b> of {edges} cross the midline — the two sides are not independent copies.',
      { L: d.nL, R: d.nR, p: (100 * d.cross.frac).toFixed(1),
        edges: d.region && d.cross.edges < d.edges ? t('edges between neurons of known side') : t('edges') });
  }
  await loadSkeletons(spec.skel || 'data/mb_skel.json');
  if (SKEL) {
    const c = SKEL.counts || {};
    const tot = Object.values(c).reduce((a, v) => a + (v.have || 0), 0);
    const missingS = Object.values(c).reduce((a, v) => a + (v.missing || 0), 0);
    $('atlasrc').textContent = t('{n} traced cells · {b} branches · MaleCNS v1.0', { n: tot, b: SKEL.n_poly.toLocaleString('en-US') });
    $('atlasnote').textContent = t('Every line is a real traced neuron. Dim = silent; when a neuron spikes its WHOLE cell lights up.') +
      (missingS ? ' ' + t('{n} cells have no published skeleton.', { n: missingS }) : '');
    $('skelsrc').textContent = t(SKEL.source);
  } else {
    $('atlasrc').textContent = t('{n} measured soma positions (skeletons unavailable)', { n: d.atlas ? d.atlas.n_real : '' });
    $('atlasnote').textContent = t('Skeletons could not be loaded — falling back to measured soma positions (one dot per neuron).');
  }
  fitBoard(); PAGE.render();
  buildAtlas();
  return r;
}

export async function newSession() {
  ST.gen++; FLY.skip = true;
  ST.busy = false;
  ST.bits = []; ST.hist = []; ST.scrubT = null; ST.lastVf = null;
  if ($('cands')) $('cands').innerHTML = ''; if ($('flyline')) $('flyline').textContent = '';
  $('scrub').max = 0; $('scrub').value = 0; $('scrublb').textContent = t('live');
  ['mRate', 'mOvP', 'mOv1', 'mMs', 'danN'].forEach(i => { if ($(i)) $(i).textContent = '—'; });
  document.querySelectorAll('.hemi .hb i').forEach(el => { el.style.width = '0'; });
  drawAtlas(null, null);
  const j = await rpc('new', {});
  ST.ready = true;
  if (j.brain && j.brain.entry) ST.hist = [j.brain.entry];
  return j;
}

export async function syncBrain(moves) {
  await rpc('sync', { moves }, ev => {
    if (ev.ev === 'step') onStep(ev);
    else if (ev.ev === 'synced') ST.hist = ev.hist || [];
  });
  drawGameCharts();
}

export async function think() {
  if (ST.busy || !ST.ready) return;
  ST.busy = true; PAGE.sync(); PAGE.renderStatus();
  flyThinking(true);
  try {
    let over = false;
    await rpc('think', { moves: ST.moves, temperature: ST.temp }, ev => {
      if (ev.ev === 'gameover') { over = true; PAGE.onGameOver(ev.status); }
      else if (ev.ev === 'step') onStep(ev);
      else if (ev.ev === 'choice') renderCands(ev.candidates);
      else if (ev.ev === 'final') {
        ST.hist = ev.hist || [];
        renderCands(ev.candidates);
        const rest = ev.candidates.filter(c => c.move !== ev.move).map(c => esc(t(c.label)) + ' ' + (100 * c.p).toFixed(1) + '%');
        $('flyline').innerHTML = t('fly:') + ' <b style="color:var(--gold)">' + esc(t(ev.label)) + '</b> ' +
          (100 * ev.p).toFixed(1) + '%' + (rest.length ? '  ·  ' + rest.join('  ') : '');
        drawGameCharts();
        ST.anim = PAGE.onFinal(ev);
      } else if (ev.ev === 'error') { PAGE.renderStatus(t('fly error')); console.error(ev.msg); }
    });
    if (over) { flyThinking(false); flyShow(false); }
  } catch (e) { PAGE.renderStatus(t('fly error: {msg}', { msg: e.message })); flyThinking(false); flyShow(false); }
  if (ST.anim) { try { await ST.anim; } catch (_) {} ST.anim = null; }
  ST.busy = false; PAGE.sync();
}
