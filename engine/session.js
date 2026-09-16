export const HIST_MAX = 260;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const r5 = x => Math.round(x * 1e5) / 1e5;
const r4 = x => Math.round(x * 1e4) / 1e4;

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function packBits(spk) {
  const out = new Uint8Array((spk.length + 7) >> 3);
  for (let i = 0; i < spk.length; i++) if (spk[i]) out[i >> 3] |= 1 << (i & 7);
  return out;
}
function percentile(a, q) {
  const s = Float64Array.from(a).sort();
  const pos = (q / 100) * (s.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export class Brain {
  constructor(info) {
    this.H = info.H;
    const names = info.class_names, cls = info.cls, side = info.side;
    this.groups = names.map((n, ci) => [n, cls.flatMap((c, i) => (c === ci ? [i] : []))]);
    this.dan = (this.groups.find(g => g[0] === 'DAN') || [null, []])[1];
    this.left = side.flatMap((s, i) => (s === 0 ? [i] : []));
    this.right = side.flatMap((s, i) => (s === 1 ? [i] : []));
    this.gh = {};
    for (const [n, idx] of this.groups)
      this.gh[n] = [idx.filter(i => side[i] === 0), idx.filter(i => side[i] === 1)];
  }
  static mean(s, idx) { let c = 0; for (const i of idx) c += s[i]; return idx.length ? c / idx.length : 0; }
  static count(s, idx) { let c = 0; for (const i of idx) c += s[i]; return c; }

  of(s, vf) {
    const H = this.H;
    let n = 0; for (let i = 0; i < H; i++) n += s[i];
    const out = { rate: r5(n / H), n_active: n };
    const g = {};
    for (const [name, idx] of this.groups) {
      if (!idx.length) continue;
      const [L, R] = this.gh[name];
      g[name] = { rate: r5(Brain.mean(s, idx)), count: Brain.count(s, idx),
                  L: L.length ? r5(Brain.mean(s, L)) : 0, R: R.length ? r5(Brain.mean(s, R)) : 0 };
    }
    out.groups = g;
    out.dan_count = Brain.count(s, this.dan);
    out.dan_gate_open = out.dan_count > 0;
    out.hemi = { L: r5(Brain.mean(s, this.left)), R: r5(Brain.mean(s, this.right)),
                 L_count: Brain.count(s, this.left), R_count: Brain.count(s, this.right) };
    out.bits = b64(packBits(s));
    const a = new Float32Array(H); for (let i = 0; i < H; i++) a[i] = Math.abs(vf[i]);
    const hi = percentile(a, 99.0), den = Math.max(hi, 1e-6), q = new Uint8Array(H);
    for (let i = 0; i < H; i++) q[i] = Math.min(255, Math.max(0, (a[i] / den) * 255)) | 0;
    out.vf = b64(q);
    return out;
  }
}

function overlap(a, b) {
  let ab = 0, s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; ab += a[i] & b[i]; }
  return r4(ab / Math.max(1, s));
}

export class GameSession {
  constructor(rsnn, info, game) {
    this.net = rsnn; this.info = info; this.game = game;
    this.brain = new Brain(info);
    this.reset();
  }

  reset() {
    this.state = this.game.start();
    this.moves = [];
    this.net.reset();
    this.hist = [];
    this.spkFirst = null; this.spkPrev = null;
    this.lastLogits = null; this.lastLegal = null;
    this._advance(this.game.bos);
  }

  _advance(tok) {
    const lv = this.game.legal(this.state);
    const t0 = now();
    const { logits, spk, Vf } = this.net.step(tok, this.game.features(this.state), { logits: lv.ids });
    const ms = now() - t0;
    this.lastLogits = logits; this.lastLegal = lv;
    const brain = this.brain.of(spk, Vf);
    const ent = { t: this.hist.length, ms: Math.round(ms * 100) / 100, rate: brain.rate,
                  per_class: Object.fromEntries(Object.entries(brain.groups).map(([k, v]) => [k, v.rate])),
                  bits: brain.bits,
                  overlap_prev: this.spkPrev ? overlap(spk, this.spkPrev) : null,
                  overlap_first: this.spkFirst ? overlap(spk, this.spkFirst) : null };
    if (!this.spkFirst) this.spkFirst = spk.slice();
    this.spkPrev = spk.slice();
    this.hist.push(ent);
    if (this.hist.length > HIST_MAX) this.hist.shift();
    return { brain, ent };
  }

  push(move) {
    const tok = this.game.play(this.state, move);
    this.moves.push(move);
    return this._advance(tok);
  }

  sync(moves) {
    const same = n => { for (let i = 0; i < n; i++) if (moves[i] !== this.moves[i]) return false; return true; };
    if (moves.length === this.moves.length && same(moves.length)) return [];
    if (moves.length > this.moves.length && same(this.moves.length))
      return moves.slice(this.moves.length).map(u => this.push(u));
    this.reset();
    return moves.map(u => this.push(u));
  }

  pick(topk = 6, temperature = 0) {
    const lv = this.lastLegal;
    if (!lv || !lv.ids.length) return null;
    const z = Array.from(this.lastLogits, Number);
    const mx = Math.max(...z);
    const zz = z.map(v => v - mx);
    let p = zz.map(Math.exp); const sp = p.reduce((a, b) => a + b, 0); p = p.map(v => v / sp);
    let pick = 0;
    if (temperature > 0) {
      const zt = zz.map(v => v / temperature), m2 = Math.max(...zt);
      let q = zt.map(v => Math.exp(v - m2)); const sq = q.reduce((a, b) => a + b, 0); q = q.map(v => v / sq);
      const u = Math.random(); let acc = 0; pick = q.length - 1;
      for (let i = 0; i < q.length; i++) { acc += q[i]; if (u < acc) { pick = i; break; } }
    } else {
      for (let i = 1; i < p.length; i++) if (p[i] > p[pick]) pick = i;
    }
    const order = p.map((v, i) => i).sort((a, b) => p[b] - p[a] || a - b);
    return { move: lv.moves[pick], label: lv.labels[pick], p: p[pick],
             candidates: order.slice(0, topk).map(j => ({ move: lv.moves[j], label: lv.labels[j], p: p[j] })) };
  }

  compactHist() { return this.hist.map(({ bits, ...rest }) => rest); }

  *replay(moves) {
    try { this.game.replay(moves); } catch (e) { yield { ev: 'error', msg: String(e.message || e) }; return; }
    for (const { brain, ent } of this.sync(moves)) {
      const { bits, ...entry } = ent;
      yield { ev: 'step', t: ent.t, ms: ent.ms, brain, entry };
    }
    yield { ev: 'synced', hist: this.compactHist() };
  }

  *think(moves, temperature = 0) {
    let b;
    try { b = this.game.replay(moves); } catch (e) { yield { ev: 'error', msg: String(e.message || e) }; return; }
    const st0 = this.game.view(b).status;
    if (st0.over) { yield { ev: 'gameover', status: st0 }; return; }
    for (const { brain, ent } of this.sync(moves)) {
      const { bits, ...entry } = ent;
      yield { ev: 'step', t: ent.t, ms: ent.ms, brain, entry };
    }
    const ch = this.pick(6, temperature);
    if (!ch) { yield { ev: 'error', msg: 'no legal move in the vocabulary' }; return; }
    yield { ev: 'choice', ...ch };
    const { brain, ent } = this.push(ch.move);
    const { bits, ...entry } = ent;
    yield { ev: 'step', t: ent.t, ms: ent.ms, brain, entry };
    yield { ev: 'final', move: ch.move, label: ch.label, p: ch.p, candidates: ch.candidates,
            hist: this.compactHist(), state: this.game.view(this.state) };
  }
}

export class FrameSession {
  constructor(rsnn, info) {
    this.net = rsnn;
    this.brain = new Brain(info);
    this.reset();
  }

  reset() {
    this.net.reset();
    this.t = 0;
    this.spkFirst = null; this.spkPrev = null;
  }

  step(obs, ids) {
    const t0 = now();
    const { logits, spk, Vf } = this.net.step(0, obs, { logits: ids });
    const ms = now() - t0;
    const brain = this.brain.of(spk, Vf);
    const entry = { t: this.t, ms: Math.round(ms * 100) / 100, rate: brain.rate,
                    per_class: Object.fromEntries(Object.entries(brain.groups).map(([k, v]) => [k, v.rate])),
                    overlap_prev: this.spkPrev ? overlap(spk, this.spkPrev) : null,
                    overlap_first: this.spkFirst ? overlap(spk, this.spkFirst) : null };
    if (!this.spkFirst) this.spkFirst = spk.slice();
    this.spkPrev = spk.slice();
    this.t++;
    return { t: entry.t, ms: entry.ms, logits: Array.from(logits), brain, entry };
  }
}

