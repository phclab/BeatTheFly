// SPDX-License-Identifier: GPL-3.0-or-later
// Chess-side helpers for the engine: board encoding, legal-move vocabulary, game status.
import { Chess } from '../vendor/chess.esm.js';

const FILES = 'abcdefgh';
const sqIndex = s => FILES.indexOf(s[0]) + 8 * (parseInt(s[1], 10) - 1);   // a1 = 0 ... h8 = 63
const PT = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };

/** Play UCI moves from the start position; throws on an illegal move. */
export function replay(moves) {
  if (!Array.isArray(moves) || moves.length > 1000) throw new Error('bad move list');
  const g = new Chess();
  for (const u of moves) {
    if (typeof u !== 'string' || u.length < 4 || u.length > 5) throw new Error('bad uci ' + u);
    let mv = null;
    try { mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }); } catch (_) { mv = null; }
    if (!mv) throw new Error(`illegal move ${u} in position ${g.fen()}`);
  }
  return g;
}

/**
 * The 68-byte board the model reads, always seen from the side to move (when Black is to move the
 * board is flipped vertically and the colours are swapped):
 *   0..63 piece code per square (0 empty, 1-6 own P N B R Q K, 7-12 opponent's)
 *   64    castling rights (bit0 own king-side, bit1 own queen-side, bit2/bit3 opponent's)
 *   65    en-passant file 0-7 after any double pawn push, 255 otherwise
 *   66    half-move clock (capped at 255);  67 unused
 */
export function encodeBoard(g, out = new Uint8Array(68)) {
  out.fill(0);
  const blackToMove = g.turn() === 'b';
  const bd = g.board();                         // bd[0] = rank 8 ... bd[7] = rank 1
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = bd[r][c]; if (!p) continue;
    let sq = (7 - r) * 8 + c;
    let white = p.color === 'w';
    if (blackToMove) { sq ^= 56; white = !white; }
    out[sq] = PT[p.type] + (white ? 0 : 6);
  }
  const cast = g.fen().split(' ')[2];
  const has = ch => cast.indexOf(ch) >= 0;
  const [usK, usQ, thK, thQ] = blackToMove ? ['k', 'q', 'K', 'Q'] : ['K', 'Q', 'k', 'q'];
  out[64] = (has(usK) ? 1 : 0) | (has(usQ) ? 2 : 0) | (has(thK) ? 4 : 0) | (has(thQ) ? 8 : 0);
  // the en-passant file is set after every double push, even if no capture is possible
  const hist = g.history({ verbose: true });
  const last = hist.length ? hist[hist.length - 1] : null;
  const big = last && last.piece === 'p' && Math.abs(parseInt(last.to[1], 10) - parseInt(last.from[1], 10)) === 2;
  out[65] = big ? FILES.indexOf(last.to[0]) : 255;
  out[66] = Math.min(parseInt(g.fen().split(' ')[4], 10), 255);
  out[67] = 0;
  return out;
}

/** Legal moves that exist in the model's move vocabulary -> {ids, ucis, sans}. */
export function legalVocab(g, tok2id) {
  const ids = [], ucis = [], sans = [];
  for (const m of g.moves({ verbose: true })) {
    const u = m.from + m.to + (m.promotion || '');
    const i = tok2id[u];
    if (i !== undefined) { ids.push(i); ucis.push(u); sans.push(m.san); }
  }
  return { ids, ucis, sans };
}

// ------------------------------------------------------------------ game status
function pieces(g) {
  const out = [];
  const bd = g.board();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = bd[r][c]; if (p) out.push({ ...p, sq: (7 - r) * 8 + c }); }
  return out;
}
const isDark = sq => ((sq >> 3) + (sq & 7)) % 2 === 0;
// a side has insufficient material if it cannot deliver mate even with the opponent's help
function hasInsufficient(ps, color) {
  const mine = ps.filter(p => p.color === color), theirs = ps.filter(p => p.color !== color);
  if (mine.some(p => 'prq'.includes(p.type))) return false;
  if (mine.some(p => p.type === 'n'))
    return mine.length <= 2 && !theirs.some(p => p.type !== 'k' && p.type !== 'q');
  if (mine.some(p => p.type === 'b')) {
    const bs = ps.filter(p => p.type === 'b');
    const sameColor = bs.every(p => !isDark(p.sq)) || bs.every(p => isDark(p.sq));
    return sameColor && !ps.some(p => p.type === 'p') && !ps.some(p => p.type === 'n');
  }
  return true;
}
const halfmoves = g => parseInt(g.fen().split(' ')[4], 10);
// the fifty-move and threefold draws may also be claimed with the move that reaches them
function canClaimFifty(g) {
  if (halfmoves(g) >= 100 && g.moves().length) return true;
  if (halfmoves(g) >= 99) {
    for (const m of g.moves({ verbose: true })) {
      if (m.piece === 'p' || m.captured) continue;
      g.move(m); const ok = halfmoves(g) >= 100 && g.moves().length > 0; g.undo();
      if (ok) return true;
    }
  }
  return false;
}
function canClaimThreefold(g) {
  if (g.isThreefoldRepetition()) return true;
  for (const m of g.moves({ verbose: true })) {
    g.move(m); const ok = g.isThreefoldRepetition(); g.undo();
    if (ok) return true;
  }
  return false;
}
export function statusOf(g) {
  const out = { over: false, result: null, reason: null, check: g.isCheck() };
  const set = (res, why) => { out.over = true; out.result = res; out.reason = why; return out; };
  if (g.isCheckmate()) return set(g.turn() === 'w' ? '0-1' : '1-0', 'checkmate');
  const ps = pieces(g);
  if (hasInsufficient(ps, 'w') && hasInsufficient(ps, 'b')) return set('1/2-1/2', 'insufficient material');
  if (!g.moves().length) return set('1/2-1/2', 'stalemate');
  if (halfmoves(g) >= 150) return set('1/2-1/2', 'seventy-five moves');
  if (canClaimFifty(g)) return set('1/2-1/2', 'fifty moves');
  if (canClaimThreefold(g)) return set('1/2-1/2', 'threefold repetition');
  return out;
}

const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function captured(g) {
  const ps = pieces(g), out = {}, score = {};
  for (const col of ['w', 'b']) {
    const lost = []; let s = 0;
    for (const [t, n0] of Object.entries(START_COUNT)) {
      const have = ps.filter(p => p.color === col && p.type === t).length;
      for (let k = 0; k < Math.max(0, n0 - have); k++) { lost.push(t); s += VAL[t]; }
    }
    out[col] = lost; score[col] = s;
  }
  return [out, { w: score.b - score.w, b: score.w - score.b }];
}

/** Everything the page shows about a position. */
export function boardState(g, moves) {
  const legal = g.moves({ verbose: true }).map(m => ({
    uci: m.from + m.to + (m.promotion || ''), san: m.san, from: sqIndex(m.from), to: sqIndex(m.to),
    promo: m.promotion || null,
  }));
  const [cap, adv] = captured(g);
  return {
    fen: g.fen(), turn: g.turn(), ply: moves.length, legal, status: statusOf(g),
    san_history: g.history(), captured: cap, advantage: adv, last: moves.length ? moves[moves.length - 1] : null,
  };
}
