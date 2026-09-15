// SPDX-License-Identifier: GPL-3.0-or-later
const f = Math.fround;
const EPS_RES = Math.fround(1e-8), EPS_LN = Math.fround(1e-5);

let F16LUT = null;
function f16lut() {
  if (F16LUT) return F16LUT;
  F16LUT = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    let v;
    if (e === 0) v = m * Math.pow(2, -24);
    else if (e === 31) v = m ? NaN : Infinity;
    else v = (1 + m / 1024) * Math.pow(2, e - 15);
    F16LUT[h] = s * v;
  }
  return F16LUT;
}

function view(buf, dtype) {
  switch (dtype) {
    case 'float32': return new Float32Array(buf);
    case 'float16': return new Uint16Array(buf);
    case 'uint16': return new Uint16Array(buf);
    case 'uint32': return new Uint32Array(buf);
    case 'int32': return new Int32Array(buf);
    default: throw new Error('unknown dtype ' + dtype);
  }
}

export function decodeTensor(ent, bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const a = view(buf, ent.dtype);
  if (ent.dtype === 'float16') {
    const L = f16lut(), out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = L[a[i]];
    return out;
  }
  return a;
}

export async function loadWeights(manifest, variant, fetchBytes, onProgress) {
  const ents = manifest.variants[variant];
  if (!ents) throw new Error('unknown weight variant: ' + variant);
  const files = new Map();
  for (const e of Object.values(ents)) files.set(e.file, e.bytes);
  const total = [...files.values()].reduce((a, b) => a + b, 0);
  let done = 0;
  const got = new Map();
  for (const [file, n] of files) {
    const b = await fetchBytes(file, k => onProgress && onProgress(done + k, total, file));
    if (b.byteLength !== n) throw new Error(`${file}: expected ${n} bytes, got ${b.byteLength}`);
    done += n; got.set(file, b);
    onProgress && onProgress(done, total, file);
  }
  const T = {};
  for (const [name, e] of Object.entries(ents))
    T[name] = decodeTensor(e, got.get(e.file));
  return { T, totalBytes: total };
}

export class FlyRSNN {
  constructor(manifest, T) {
    const S = manifest.scalars;
    this.S = S;
    this.H = S.H;
    this.fw = (S.mode || 'dan') === 'dan';
    this.dense = S.input === 'dense';
    Object.assign(this, {
      encTok: T.enc_tok_T, encTokB: T.enc_tok_b, lnTokW: T.ln_tok_w, lnTokB: T.ln_tok_b,
      encBrd: T.enc_brd_T, encBrdB: T.enc_brd_b, lnBrdW: T.ln_brd_w, lnBrdB: T.ln_brd_b,
      dec: T.dec_w, decB: T.dec_b,
      aExc: T.alpha_exc, aInh: T.alpha_inh, vth: T.v_th, rst: T.reset_weight,
      inp: T.in_idx || T.kc_idx, outIdx: T.out_idx || null,
      cp: T.W_colptr, ri: T.W_rowidx, wv: T.W_vals,
    });
    if (this.dense) Object.assign(this, { encObs: T.enc_obs_T, encObsB: T.enc_obs_b, lnObsW: T.ln_obs_w, lnObsB: T.ln_obs_b, dObs: S.d_obs });
    if (this.fw) {
      this.nkc = S.n_kc; this.nmb = S.n_mbon; this.ndan = S.n_dan;
      Object.assign(this, { v2d: T.v2d_T, v2dB: T.v2d_b, Wg: T.Wg, Wdv: T.W_dan_val,
                            kc: T.kc_idx, mbon: T.mbon_idx, dan: T.dan_idx });
    }
    const H = this.H;
    this.inMask = new Uint8Array(H); for (const i of this.inp) this.inMask[i] = 1;
    this._x = new Float64Array(H); this._tokh = new Float32Array(H); this._brdh = new Float32Array(H);
    this._drive = new Float32Array(H); this._syn = new Float64Array(H);
    this.Vfinal = new Float32Array(H); this.Vaug = new Float32Array(H);
    this.reset();
  }

  reset() {
    const H = this.H;
    this.Vf = new Float32Array(H); this.Vres = new Float32Array(H);
    this.spk = new Uint8Array(H);
    this.M = this.fw ? new Float32Array(this.nkc * this.nmb) : null;
  }

  _ln(x, w, b, out) {
    const H = this.H;
    let s = 0; for (let i = 0; i < H; i++) s += x[i];
    const mean = f(s / H);
    let v = 0; for (let i = 0; i < H; i++) { const d = f(x[i] - mean); v += d * d; }
    const den = f(Math.sqrt(f(f(v / H) + EPS_LN)));
    for (let i = 0; i < H; i++) out[i] = f(f(f(f(x[i] - mean) / den) * w[i]) + b[i]);
  }

  step(tok, act, opts = {}) {
    const H = this.H, S = this.S, x = this._x;

    const drive = this._drive, da = S.drive_alpha;
    if (this.dense) {
      const E = this.encObs, D = this.dObs;
      for (let i = 0; i < H; i++) x[i] = 0;
      for (let j = 0; j < D; j++) { const o = f(act[j]), off = j * H; for (let i = 0; i < H; i++) x[i] += o * E[off + i]; }
      for (let i = 0; i < H; i++) x[i] = f(f(x[i]) + this.encObsB[i]);
      this._ln(x, this.lnObsW, this.lnObsB, this._brdh);
      for (let i = 0; i < H; i++) drive[i] = f(da * (this.inMask[i] ? Math.abs(this._brdh[i]) : 0));
    } else {
      const to = tok * H;
      for (let i = 0; i < H; i++) x[i] = f(this.encTok[to + i] + this.encTokB[i]);
      this._ln(x, this.lnTokW, this.lnTokB, this._tokh);
      for (let i = 0; i < H; i++) x[i] = 0;
      for (const a of act) { const o = a * H; for (let i = 0; i < H; i++) x[i] += this.encBrd[o + i]; }
      for (let i = 0; i < H; i++) x[i] = f(f(x[i]) + this.encBrdB[i]);
      this._ln(x, this.lnBrdW, this.lnBrdB, this._brdh);
      const ut = S.use_tok, ub = S.use_board;
      for (let i = 0; i < H; i++) {
        const emb = f(f(ut * this._tokh[i]) + f(ub * this._brdh[i]));
        drive[i] = f(da * (this.inMask[i] ? Math.abs(emb) : 0));
      }
    }
    if (this.fw && this.dense) {
      const nd = this.ndan, D = this.dObs, pre = new Float64Array(nd);
      for (let j = 0; j < D; j++) { const o = f(act[j]), off = j * nd; for (let d = 0; d < nd; d++) pre[d] += o * this.v2d[off + d]; }
      for (let d = 0; d < nd; d++) {
        const i = this.dan[d];
        drive[i] = f(drive[i] + f(S.dan_teach * Math.abs(f(f(pre[d]) + this.v2dB[d]))));
      }
    } else if (this.fw) {
      const vo = tok * this.ndan;
      for (let d = 0; d < this.ndan; d++) {
        const i = this.dan[d];
        drive[i] = f(drive[i] + f(S.dan_teach * Math.abs(f(this.v2d[vo + d] + this.v2dB[d]))));
      }
    }

    const prev = this.spk, syn = this._syn;
    syn.fill(0);
    const cp = this.cp, ri = this.ri, wv = this.wv;
    for (let j = 0; j < H; j++) {
      if (!prev[j]) continue;
      for (let k = cp[j], e = cp[j + 1]; k < e; k++) syn[ri[k]] += wv[k];
    }
    if (this.fw) {
      const nmb = this.nmb, ndan = this.ndan;
      for (let m = 0; m < nmb; m++) {
        let g = 0; const o = m * ndan;
        for (let d = 0; d < ndan; d++) if (prev[this.dan[d]]) g += this.Wg[o + d];
        const i = this.mbon[m];
        syn[i] = f(f(syn[i]) * f(1 / (1 + Math.exp(-f(g)))));
      }
    }

    const Vf = this.Vf, Vres = this.Vres, Vfinal = this.Vfinal, ecl = S.e_cl;
    const out = new Uint8Array(H);
    for (let i = 0; i < H; i++) {
      const vf = f(f(this.aExc[i] * Vf[i]) + f(drive[i] + f(syn[i])));
      Vf[i] = vf;
      const vfc = vf > ecl ? vf : f(ecl);
      const rw = f((f(vfc - this.vth[i]) > 0 ? 1 : 0) * this.rst[i]);
      const vr = f(f(this.aInh[i] * Vres[i]) + f((rw > 0 ? rw : 0) + EPS_RES));
      Vres[i] = vr;
      const vfin = f(vfc - vr);
      Vfinal[i] = vfin;
      out[i] = f(vfin - this.vth[i]) > 0 ? 1 : 0;
    }

    const Vaug = this.Vaug; Vaug.set(Vfinal);
    if (this.fw) {
      const M = this.M, nkc = this.nkc, kc = this.kc, nmb = this.nmb;
      const r = new Float64Array(nmb);
      for (let q = 0; q < nkc; q++) {
        if (!out[kc[q]]) continue;
        const o = q * nmb;
        for (let m = 0; m < nmb; m++) r[m] += M[o + m];
      }
      for (let m = 0; m < nmb; m++) { const i = this.mbon[m]; Vaug[i] = f(Vaug[i] + f(S.lam * f(r[m]))); }
    }

    let logits = null;
    if (opts.logits) {
      const ids = opts.logits, n = ids.length;
      logits = new Float32Array(n);
      const dec = this.dec, pop = this.outIdx;
      if (pop) {
        const np = pop.length;
        for (let k = 0; k < n; k++) {
          const v = ids[k], o = v * np;
          let s = 0;
          for (let i = 0; i < np; i++) s += dec[o + i] * Vaug[pop[i]];
          logits[k] = f(f(s) + this.decB[v]);
        }
      } else {
        for (let k = 0; k < n; k++) {
          const v = ids[k], o = v * H;
          let s = 0;
          for (let i = 0; i < H; i++) s += dec[o + i] * Vaug[i];
          logits[k] = f(f(s) + this.decB[v]);
        }
      }
    }

    if (this.fw) {
      const M = this.M, nkc = this.nkc, kc = this.kc, nmb = this.nmb, ndan = this.ndan;
      const gv = new Float32Array(nmb);
      for (let m = 0; m < nmb; m++) {
        let g = 0, v = 0; const o = m * ndan;
        for (let d = 0; d < ndan; d++) if (out[this.dan[d]]) { g += this.Wg[o + d]; v += this.Wdv[o + d]; }
        gv[m] = f(f(1 / (1 + Math.exp(-f(g)))) * f(Math.tanh(f(v))));
      }
      for (let q = 0; q < nkc; q++) {
        if (!prev[kc[q]]) continue;
        const o = q * nmb;
        for (let m = 0; m < nmb; m++) M[o + m] = f(M[o + m] + gv[m]);
      }
    }

    this.spk = out;
    return { logits, spk: out, Vf };
  }
}
