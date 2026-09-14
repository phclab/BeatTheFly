// SPDX-License-Identifier: GPL-3.0-or-later
// Recurrent spiking network (RSNN) of the fruit-fly mushroom body, one timestep per ply.
//
// State carried across the game: membrane potential V_f, reset current V_res, last spikes, and the
// DAN-gated fast weight M [n_kc, n_mbon]. Per step:
//   syn   = W @ spikes(t-1)                  recurrent current (synaptic delay 1)
//   syn[MBON] *= sigmoid(Wg @ DAN spikes)    dopamine gate on the MBON input
//   V_f   = alpha_exc * V_f + drive + syn    the carried state is not clamped
//   V_c   = max(V_f, e_cl);  V_res = alpha_inh * V_res + relu(pre_spike * reset_w)
//   spike = (V_c - V_res) > v_th
//   logits = dec_w @ (V + lam * fast-weight recall on the MBON slice) + dec_b
// Values are rounded to float32 after every elementwise operation; sums accumulate in float64.

const f = Math.fround;
const EPS_RES = Math.fround(1e-8), EPS_LN = Math.fround(1e-5);

// ------------------------------------------------------------------ weight files
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
    case 'int8': return new Int8Array(buf);
    case 'uint16': return new Uint16Array(buf);
    case 'uint32': return new Uint32Array(buf);
    case 'int32': return new Int32Array(buf);
    default: throw new Error('unknown dtype ' + dtype);
  }
}

/** Decode one tensor. float16 is widened to float32; int8 uses a per-row float32 scale. */
export function decodeTensor(ent, bytes, scaleBytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const a = view(buf, ent.dtype);
  if (ent.dtype === 'float16') {
    const L = f16lut(), out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = L[a[i]];
    return out;
  }
  if (ent.dtype === 'int8') {
    const sb = scaleBytes.buffer.slice(scaleBytes.byteOffset, scaleBytes.byteOffset + scaleBytes.byteLength);
    const s = new Float32Array(sb), cols = ent.shape[1], out = new Float32Array(a.length);
    for (let r = 0; r < ent.shape[0]; r++) {
      const sc = s[r], o = r * cols;
      for (let c = 0; c < cols; c++) out[o + c] = f(a[o + c] * sc);
    }
    return out;
  }
  return a;
}

/** Download and decode every tensor of one precision variant listed in manifest.json.
 *  fetchBytes(file, onBytes) -> Promise<Uint8Array>; onProgress(done, total, file). */
export async function loadWeights(manifest, variant, fetchBytes, onProgress) {
  const ents = manifest.variants[variant];
  if (!ents) throw new Error('unknown weight variant: ' + variant);
  const files = new Map();
  for (const e of Object.values(ents)) {
    files.set(e.file, e.bytes);
    if (e.scale) files.set(e.scale.file, e.scale.bytes);
  }
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
    T[name] = decodeTensor(e, got.get(e.file), e.scale ? got.get(e.scale.file) : null);
  return { T, totalBytes: total };
}

// ------------------------------------------------------------------ board features
// 68-byte board -> indices of the active binary features (789 in total):
// 64 squares x 12 piece codes, 4 castling rights, en-passant file (9 incl. none), 8 clock buckets.
export const D_BOARD = 768 + 4 + 9 + 8;
export function activeBoardFeatures(raw) {
  const act = [];
  for (let sq = 0; sq < 64; sq++) {
    const c = raw[sq];
    if (c > 0 && c <= 12) act.push(sq * 12 + (c - 1));
  }
  for (let i = 0; i < 4; i++) if ((raw[64] >> i) & 1) act.push(768 + i);
  act.push(772 + (raw[65] < 8 ? raw[65] : 8));
  act.push(781 + Math.min(raw[66] >> 4, 7));
  return act;
}

// ------------------------------------------------------------------ network
export class FlyRSNN {
  constructor(manifest, T) {
    const S = manifest.scalars;
    this.S = S;
    this.H = S.H; this.V = S.vocab;
    this.nkc = S.n_kc; this.nmb = S.n_mbon; this.ndan = S.n_dan;
    Object.assign(this, {
      encTok: T.enc_tok_T, encTokB: T.enc_tok_b, lnTokW: T.ln_tok_w, lnTokB: T.ln_tok_b,
      encBrd: T.enc_brd_T, encBrdB: T.enc_brd_b, lnBrdW: T.ln_brd_w, lnBrdB: T.ln_brd_b,
      v2d: T.v2d_T, v2dB: T.v2d_b, dec: T.dec_w, decB: T.dec_b,
      Wg: T.Wg, Wdv: T.W_dan_val,
      aExc: T.alpha_exc, aInh: T.alpha_inh, vth: T.v_th, rst: T.reset_weight,
      kc: T.kc_idx, mbon: T.mbon_idx, dan: T.dan_idx,
      cp: T.W_colptr, ri: T.W_rowidx, wv: T.W_vals,          // recurrent weights, CSC by source
    });
    const H = this.H;
    this.kcMask = new Uint8Array(H); for (const i of this.kc) this.kcMask[i] = 1;
    this._x = new Float64Array(H); this._tokh = new Float32Array(H); this._brdh = new Float32Array(H);
    this._drive = new Float32Array(H); this._syn = new Float64Array(H);
    this.Vfinal = new Float32Array(H); this.Vaug = new Float32Array(H);
    this.reset();
  }

  reset() {
    const H = this.H;
    this.Vf = new Float32Array(H); this.Vres = new Float32Array(H);
    this.spk = new Uint8Array(H);
    this.M = new Float32Array(this.nkc * this.nmb);
    this.t = 0;
  }

  // LayerNorm: (x - mean) / sqrt(var + eps) * w + b
  _ln(x, w, b, out) {
    const H = this.H;
    let s = 0; for (let i = 0; i < H; i++) s += x[i];
    const mean = f(s / H);
    let v = 0; for (let i = 0; i < H; i++) { const d = f(x[i] - mean); v += d * d; }
    const den = f(Math.sqrt(f(f(v / H) + EPS_LN)));
    for (let i = 0; i < H; i++) out[i] = f(f(f(f(x[i] - mean) / den) * w[i]) + b[i]);
  }

  /**
   * One timestep. tok: move token id; raw: Uint8Array(68), the board after that move.
   * opts.logits: 'full' for all move tokens, or an array of token ids (e.g. the legal moves).
   * Returns {logits, spk, Vf}.
   */
  step(tok, raw, opts = {}) {
    const H = this.H, S = this.S, x = this._x;

    // input drive: token and board encoders, each with its own LayerNorm, onto the Kenyon cells
    const to = tok * H;
    for (let i = 0; i < H; i++) x[i] = f(this.encTok[to + i] + this.encTokB[i]);
    this._ln(x, this.lnTokW, this.lnTokB, this._tokh);
    for (let i = 0; i < H; i++) x[i] = 0;
    for (const a of activeBoardFeatures(raw)) { const o = a * H; for (let i = 0; i < H; i++) x[i] += this.encBrd[o + i]; }
    for (let i = 0; i < H; i++) x[i] = f(f(x[i]) + this.encBrdB[i]);
    this._ln(x, this.lnBrdW, this.lnBrdB, this._brdh);
    const drive = this._drive, ut = S.use_tok, ub = S.use_board, da = S.drive_alpha;
    for (let i = 0; i < H; i++) {
      const emb = f(f(ut * this._tokh[i]) + f(ub * this._brdh[i]));
      drive[i] = f(da * (this.kcMask[i] ? Math.abs(emb) : 0));
    }
    // teaching drive onto the dopaminergic (DAN) neurons
    const vo = tok * this.ndan;
    for (let d = 0; d < this.ndan; d++) {
      const i = this.dan[d];
      drive[i] = f(drive[i] + f(S.dan_teach * Math.abs(f(this.v2d[vo + d] + this.v2dB[d]))));
    }

    // recurrent current from the previous spikes: scatter the columns of the neurons that fired
    const prev = this.spk, syn = this._syn;
    syn.fill(0);
    const cp = this.cp, ri = this.ri, wv = this.wv;
    for (let j = 0; j < H; j++) {
      if (!prev[j]) continue;
      for (let k = cp[j], e = cp[j + 1]; k < e; k++) syn[ri[k]] += wv[k];
    }
    const nmb = this.nmb, ndan = this.ndan;
    for (let m = 0; m < nmb; m++) {
      let g = 0; const o = m * ndan;
      for (let d = 0; d < ndan; d++) if (prev[this.dan[d]]) g += this.Wg[o + d];
      const i = this.mbon[m];
      syn[i] = f(f(syn[i]) * f(1 / (1 + Math.exp(-f(g)))));
    }

    // leaky integrate-and-fire
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

    // fast-weight recall: active Kenyon cells read M into the MBON voltages
    const Vaug = this.Vaug; Vaug.set(Vfinal);
    const M = this.M, nkc = this.nkc, kc = this.kc;
    const r = new Float64Array(nmb);
    for (let q = 0; q < nkc; q++) {
      if (!out[kc[q]]) continue;
      const o = q * nmb;
      for (let m = 0; m < nmb; m++) r[m] += M[o + m];
    }
    for (let m = 0; m < nmb; m++) { const i = this.mbon[m]; Vaug[i] = f(Vaug[i] + f(S.lam * f(r[m]))); }

    // readout from the whole population
    let logits = null;
    if (opts.logits) {
      const ids = opts.logits === 'full' ? null : opts.logits;
      const n = ids ? ids.length : this.V;
      logits = new Float32Array(n);
      const dec = this.dec;
      for (let k = 0; k < n; k++) {
        const v = ids ? ids[k] : k, o = v * H;
        let s = 0;
        for (let i = 0; i < H; i++) s += dec[o + i] * Vaug[i];
        logits[k] = f(f(s) + this.decB[v]);
      }
    }

    // fast-weight write: key = previous Kenyon-cell spikes, value = gated DAN signal
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

    this.spk = out;
    this.t++;
    return { logits, spk: out, Vf };
  }
}
