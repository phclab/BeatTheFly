// SPDX-License-Identifier: GPL-3.0-or-later
import { FlyRSNN, loadWeights } from './rsnn.js';
import { GameSession } from './session.js';

let net = null, info = null, manifest = null, game = null, session = null;

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
async function fetchBytes(url, onBytes) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  if (!r.body || !r.body.getReader) return new Uint8Array(await r.arrayBuffer());
  const rd = r.body.getReader(), parts = []; let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    parts.push(value); n += value.byteLength; onBytes && onBytes(n);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

async function makeGame(kind, base) {
  if (kind === 'chess') {
    const [{ chessGame }, tok2id] = await Promise.all([import('./chess.js'), fetchJSON(`${base}data/chess_uci_vocab.json`)]);
    return chessGame(tok2id);
  }
  if (kind === 'othello') {
    const { othelloGame } = await import('./othello.js');
    return othelloGame(manifest.scalars.tokens);
  }
  throw new Error('unknown game ' + kind);
}

function runSelfcheck(sc) {
  const s = game.start();
  net.reset();
  let agree = 0, maxd = 0;
  for (let t = 0; t < sc.plies.length; t++) {
    const p = sc.plies[t];
    const tok = t === 0 ? game.bos : game.play(s, sc.moves[t - 1]);
    const { logits } = net.step(tok, game.features(s), { logits: p.ids });
    let bi = 0; for (let i = 1; i < p.ids.length; i++) if (logits[i] > logits[bi]) bi = i;
    if (p.ids[bi] === p.top1) agree++;
    for (let i = 0; i < p.ids.length; i++) maxd = Math.max(maxd, Math.abs(logits[i] - p.logits[i]));
  }
  net.reset();
  return { plies: sc.plies.length, legal_top1_agree: agree, max_abs_logit_diff: maxd };
}

async function init({ base, wbase, variant, kind }, post) {
  const wb = wbase.endsWith('/') ? wbase : wbase + '/';
  [manifest, info] = await Promise.all([fetchJSON(wb + 'manifest.json'), fetchJSON(wb + 'info.json')]);
  game = await makeGame(kind, base);
  let last = 0;
  const { T, totalBytes } = await loadWeights(manifest, variant, (file, cb) => fetchBytes(wb + file, cb),
    (done, total, file) => {
      const t = performance.now();
      if (t - last > 80 || done === total) { last = t; post({ type: 'progress', done, total, file }); }
    });
  post({ type: 'progress', done: totalBytes, total: totalBytes, file: 'building the network' });
  net = new FlyRSNN(manifest, T);
  let check = null;
  try { check = runSelfcheck(await fetchJSON(wb + `selfcheck_${variant}.json`)); } catch (_) { check = null; }
  return { info, variant, download_bytes: totalBytes, selfcheck: check,
           manifest: { label: manifest.label, connectome_audit: manifest.connectome_audit, validation: manifest.validation } };
}

self.onmessage = async (e) => {
  const { id, cmd, args } = e.data;
  const post = m => self.postMessage({ id, ...m });
  try {
    if (cmd === 'init') return post({ type: 'result', value: await init(args, post) });
    if (!net) throw new Error('engine not ready');
    if (cmd === 'new') {
      session = new GameSession(net, info, game);
      return post({ type: 'result', value: { state: game.view(game.start()), brain: { t: 0, entry: session.compactHist()[0] } } });
    }
    if (cmd === 'validate') {
      const moves = args.moves || [];
      let s;
      try { s = game.replay(moves); } catch (err) { return post({ type: 'error', message: String(err.message || err) }); }
      return post({ type: 'result', value: game.view(s) });
    }
    if (cmd === 'think') {
      if (!session) session = new GameSession(net, info, game);
      const temp = Math.min(Math.max(+args.temperature || 0, 0), 3);
      for (const ev of session.think(args.moves || [], temp)) post({ type: 'event', ev });
      return post({ type: 'result', value: { done: true } });
    }
    throw new Error('unknown command ' + cmd);
  } catch (err) {
    post({ type: 'error', message: String((err && err.message) || err) });
  }
};
