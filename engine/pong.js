// SPDX-License-Identifier: GPL-3.0-or-later
export const CONST = {
  FPS: 60, PADDLE_X: 0.03, PADDLE_H: 0.16, PADDLE_SPEED: 0.018, BALL_R: 0.01, BALL_SPEED0: 0.011, BALL_SPEEDUP: 1.04,
  BALL_SPEED_MAX: 0.028, MAX_BOUNCE_DEG: 50.0, SERVE_DELAY: 30, SERVE_ANGLE_MAX_DEG: 30.0, POINTS_TO_WIN: 11,
};
export const ACTIONS = ['STAY', 'UP', 'DOWN'];
const ACTION_DY = [0, 1, -1];

const PX = CONST.PADDLE_X, PH = CONST.PADDLE_H, PS = CONST.PADDLE_SPEED;
const R = CONST.BALL_R, S0 = CONST.BALL_SPEED0, SUP = CONST.BALL_SPEEDUP, SMAX = CONST.BALL_SPEED_MAX;
const MAXB = CONST.MAX_BOUNCE_DEG * (Math.PI / 180.0), SAMAX = CONST.SERVE_ANGLE_MAX_DEG * (Math.PI / 180.0);
const SDELAY = CONST.SERVE_DELAY, P2W = CONST.POINTS_TO_WIN;

const SPLIT = 134217729.0;
function twoSum(a, b) { const s = a + b, bb = s - a; return [s, (a - (s - bb)) + (b - bb)]; }
function twoProd(a, b) {
  const p = a * b;
  let t = SPLIT * a; const ah = t - (t - a), al = a - ah;
  t = SPLIT * b; const bh = t - (t - b), bl = b - bh;
  return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
}
function norm(s, e) { const h = s + e; return [h, e - (h - s)]; }
function ddAdd(a, b) { const [s, e] = twoSum(a[0], b[0]); return norm(s, e + a[1] + b[1]); }
function ddMul(a, b) { const [p, e] = twoProd(a[0], b[0]); return norm(p, e + a[0] * b[1] + a[1] * b[0]); }
function ddDivD(a, d) {
  const q1 = a[0] / d, [p, e] = twoProd(q1, d);
  const q2 = (a[0] - p - e + a[1]) / d;
  return norm(q1, q2);
}
function ddDiv(a, b) {
  const q1 = a[0] / b[0], r = ddAdd(a, ddMul([-q1, 0], b));
  const q2 = r[0] / b[0], r2 = ddAdd(r, ddMul([-q2, 0], b));
  const q3 = r2[0] / b[0];
  return ddAdd(norm(q1, q2), [q3, 0]);
}
const PIO2 = [1.5707963267948966, 6.123233995736766e-17, -1.4973849048591698e-33];
const LN2 = [0.6931471805599453, 2.3190468138462996e-17, 5.707708438416212e-34];

function sincosDD(x) {
  const k = Math.round(x / PIO2[0]);
  let r = [x, 0];
  for (const p of PIO2) r = ddAdd(r, twoProd(-k, p));
  const r2 = ddMul(r, r);
  let ts = r, s = r, tc = [1, 0], c = [1, 0];
  for (let n = 1; n < 40; n++) {
    ts = ddDivD(ddMul(ts, r2), -(2 * n) * (2 * n + 1)); s = ddAdd(s, ts);
    tc = ddDivD(ddMul(tc, r2), -(2 * n - 1) * (2 * n)); c = ddAdd(c, tc);
    if (Math.abs(ts[0]) < 1e-40 && Math.abs(tc[0]) < 1e-40) break;
  }
  const q = ((k % 4) + 4) % 4;
  const sin = q === 0 ? s : q === 1 ? c : q === 2 ? [-s[0], -s[1]] : [-c[0], -c[1]];
  const cos = q === 0 ? c : q === 1 ? [-s[0], -s[1]] : q === 2 ? [-c[0], -c[1]] : s;
  return [sin[0], cos[0]];
}
export const crSin = x => (x === 0 ? x : sincosDD(x)[0]);
export const crCos = x => sincosDD(x)[1];

export function crLog(x) {
  if (x === 1) return 0;
  let m = x, e = 0;
  while (m < Math.SQRT1_2) { m *= 2; e--; }
  while (m >= Math.SQRT2) { m /= 2; e++; }
  const s = ddDiv([m - 1, 0], twoSum(m, 1)), s2 = ddMul(s, s);
  let p = s, sum = s;
  for (let k = 1; k < 60; k++) {
    p = ddMul(p, s2);
    const term = ddDivD(p, 2 * k + 1);
    sum = ddAdd(sum, term);
    if (Math.abs(term[0]) < 1e-40) break;
  }
  let r = [2 * sum[0], 2 * sum[1]];
  if (e) for (const l of LN2) r = ddAdd(r, twoProd(e, l));
  return r[0];
}

export class Mulberry32 {
  constructor(seed) { this.a = seed >>> 0; }
  nextU32() {
    this.a = (this.a + 0x6D2B79F5) >>> 0;
    const a = this.a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a) >>> 0;
    const m = Math.imul(t ^ (t >>> 7), 61 | t) >>> 0;
    t = (((t + m) >>> 0) ^ t) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }
  uniform() { return this.nextU32() / 4294967296.0; }
}

export class Pong {
  constructor(seed) {
    this.rng = new Mulberry32(seed);
    this.yL = this.yR = 0.5;
    this.scoreL = this.scoreR = 0;
    this.hitsL = this.hitsR = 0;
    this.frame = 0;
    this._serve(this.rng.uniform() < 0.5 ? -1 : 1);
  }

  _serve(dir) {
    this.x = this.y = 0.5; this.vx = this.vy = 0.0;
    this.speed = S0; this.serveTimer = SDELAY; this.serveDir = dir;
  }

  _bounce(d, yp, plane) {
    this.x = 2.0 * plane - this.x;
    this.speed = Math.min(this.speed * SUP, SMAX);
    const off = Math.max(-1.0, Math.min(1.0, (this.y - yp) / (PH / 2.0)));
    const ang = off * MAXB;
    this.vx = d * this.speed * crCos(ang); this.vy = this.speed * crSin(ang);
  }

  step(aL, aR) {
    const ev = [], h2 = PH / 2.0;
    this.yL = Math.min(Math.max(this.yL + ACTION_DY[aL] * PS, h2), 1.0 - h2);
    this.yR = Math.min(Math.max(this.yR + ACTION_DY[aR] * PS, h2), 1.0 - h2);
    this.frame += 1;
    if (this.serveTimer > 0) {
      this.serveTimer -= 1;
      if (this.serveTimer === 0) {
        const ang = (2.0 * this.rng.uniform() - 1.0) * SAMAX;
        this.vx = this.serveDir * this.speed * crCos(ang); this.vy = this.speed * crSin(ang);
        ev.push('serve');
      }
      return ev;
    }
    const xp = this.x;
    this.x += this.vx; this.y += this.vy;
    if (this.y < R) { this.y = 2.0 * R - this.y; this.vy = -this.vy; ev.push('wall'); }
    else if (this.y > 1.0 - R) { this.y = 2.0 * (1.0 - R) - this.y; this.vy = -this.vy; ev.push('wall'); }
    const pL = PX + R;
    if (this.vx < 0 && this.x <= pL && pL < xp && Math.abs(this.y - this.yL) <= h2 + R) {
      this._bounce(1, this.yL, pL); this.hitsL += 1; ev.push('hitL');
    }
    const pR = 1.0 - PX - R;
    if (this.vx > 0 && xp < pR && pR <= this.x && Math.abs(this.y - this.yR) <= h2 + R) {
      this._bounce(-1, this.yR, pR); this.hitsR += 1; ev.push('hitR');
    }
    if (this.x < 0.0) { this.scoreR += 1; ev.push('pointR'); this._serve(-1); }
    else if (this.x > 1.0) { this.scoreL += 1; ev.push('pointL'); this._serve(1); }
    return ev;
  }

  over() { return this.scoreL >= P2W || this.scoreR >= P2W; }

  obs(side) {
    const s = this.serveTimer > 0;
    if (side === 'L') return [this.x, this.y, this.vx, this.vy, this.yL, this.yR, s];
    return [1.0 - this.x, this.y, -this.vx, this.vy, this.yR, this.yL, s];
  }
}

export function flyObs(game, side) {
  const [x, y, vx, vy, own, opp] = game.obs(side);
  return [2.0 * (x - 0.5), 2.0 * (y - 0.5), vx / SMAX, vy / SMAX, 2.0 * (own - 0.5), 2.0 * (opp - 0.5)];
}
