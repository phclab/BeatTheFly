const FILES = 'abcdefgh';
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const EDGES = [8, 16, 24, 32, 40, 48, 56];

export const sqName = s => FILES[s % 8] + (Math.floor(s / 8) + 1);
export const nameSq = n => (parseInt(n.slice(1), 10) - 1) * 8 + FILES.indexOf(n[0]);

export function start() {
  const cells = new Uint8Array(64);
  cells[27] = 2; cells[36] = 2; cells[28] = 1; cells[35] = 1;
  return { cells, black: true };
}

export function flipsFor(s, sq) {
  if (s.cells[sq]) return [];
  const me = s.black ? 1 : 2, op = 3 - me, r0 = sq >> 3, c0 = sq & 7, out = [];
  for (const [dr, dc] of DIRS) {
    const run = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && s.cells[r * 8 + c] === op) { run.push(r * 8 + c); r += dr; c += dc; }
    if (run.length && r >= 0 && r < 8 && c >= 0 && c < 8 && s.cells[r * 8 + c] === me) out.push(...run);
  }
  return out;
}

export function legalSquares(s) {
  const out = [];
  for (let q = 0; q < 64; q++) if (flipsFor(s, q).length) out.push(q);
  return out;
}

const opponentCanMove = s => legalSquares({ cells: s.cells, black: !s.black }).length > 0;
export const isOver = s => !legalSquares(s).length && !opponentCanMove(s);
export const mustPass = s => !legalSquares(s).length && opponentCanMove(s);

export function play(s, move) {
  if (move === 'pass') {
    if (!mustPass(s)) throw new Error('pass is not allowed here');
    s.black = !s.black;
    return [];
  }
  const sq = typeof move === 'string' && /^[a-h][1-8]$/.test(move) ? nameSq(move) : -1;
  const fl = sq >= 0 ? flipsFor(s, sq) : [];
  if (!fl.length) throw new Error(`illegal move ${move}`);
  const me = s.black ? 1 : 2;
  s.cells[sq] = me;
  for (const q of fl) s.cells[q] = me;
  s.black = !s.black;
  return fl;
}

export function counts(s) {
  let b = 0, w = 0;
  for (const c of s.cells) { if (c === 1) b++; else if (c === 2) w++; }
  return { b, w };
}

export function replay(moves) {
  if (!Array.isArray(moves) || moves.length > 200) throw new Error('bad move list');
  const s = start();
  for (const m of moves) play(s, m);
  return s;
}

export function boardState(s) {
  const n = counts(s), over = isOver(s);
  const status = over
    ? { over: true, result: n.b > n.w ? 'black' : n.w > n.b ? 'white' : 'draw', reason: 'no legal moves for either side' }
    : { over: false };
  return { cells: Array.from(s.cells), turn: s.black ? 'b' : 'w', legal: legalSquares(s).map(sqName),
           mustPass: !over && mustPass(s), counts: n, status };
}

export function othelloGame(tokens) {
  return {
    bos: tokens.bos,
    start,
    replay,
    play(s, move) {
      play(s, move);
      return move === 'pass' ? tokens.pass : tokens.sq0 + nameSq(move);
    },
    features(s) {
      const own = s.black ? 1 : 2, act = [];
      let n = 0;
      for (let q = 0; q < 64; q++) { if (s.cells[q] === own) act.push(q); if (s.cells[q]) n++; }
      for (let q = 0; q < 64; q++) if (s.cells[q] && s.cells[q] !== own) act.push(64 + q);
      act.push(s.black ? 128 : 129);
      let b = 0;
      for (const e of EDGES) if (n >= e) b++;
      act.push(130 + b);
      return act;
    },
    legal(s) {
      if (isOver(s)) return { ids: [], moves: [], labels: [] };
      const sq = legalSquares(s);
      if (!sq.length) return { ids: [tokens.pass], moves: ['pass'], labels: ['pass'] };
      return { ids: sq.map(q => tokens.sq0 + q), moves: sq.map(sqName), labels: sq.map(sqName) };
    },
    view: s => boardState(s),
  };
}
