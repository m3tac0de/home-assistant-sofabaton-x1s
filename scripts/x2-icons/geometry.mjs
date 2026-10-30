// Geometry helpers for scripts/x2-icons/icons.mjs. Each primitive returns a
// list of closed subpaths; build() joins them into one minified SVG path on a
// 24x24 grid. Renderers fill with the default nonzero rule (ha-svg-icon, the
// web remote's icon shim), so shapes are wound clockwise and holes
// counter-clockwise: a hole only cuts through a single positive shape, never
// through two overlapping ones (the winding would stay non-zero).

const D2R = Math.PI / 180;
const pt = (a, r, cx, cy) => [cx + r * Math.cos(a * D2R), cy + r * Math.sin(a * D2R)];

// subpath: { s: [x, y], g: [{ t: "L" | "A" | "C" | "Q", ... }] }, closed by the last segment
function close(sp) {
  const last = sp.g[sp.g.length - 1];
  if (!last || Math.abs(last.x - sp.s[0]) > 1e-9 || Math.abs(last.y - sp.s[1]) > 1e-9) sp.g.push({ t: "L", x: sp.s[0], y: sp.s[1] });
  return sp;
}

function arcPoints(x1, y1, g) {
  // SVG endpoint parameterisation -> sampled points (rotation ignored, only the winding matters)
  let rx = Math.abs(g.rx), ry = Math.abs(g.ry);
  const dx = (x1 - g.x) / 2, dy = (y1 - g.y) / 2;
  const lam = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx;
  const den = rx * rx * dy * dy + ry * ry * dx * dx;
  let co = Math.sqrt(Math.max(0, num / den));
  if (g.la === g.sw) co = -co;
  const cxp = (co * rx * dy) / ry, cyp = (-co * ry * dx) / rx;
  const cx = cxp + (x1 + g.x) / 2, cy = cyp + (y1 + g.y) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (dx - cxp) / rx, (dy - cyp) / ry);
  let dt = ang((dx - cxp) / rx, (dy - cyp) / ry, (-dx - cxp) / rx, (-dy - cyp) / ry);
  if (!g.sw && dt > 0) dt -= 2 * Math.PI;
  if (g.sw && dt < 0) dt += 2 * Math.PI;
  const out = [];
  for (let i = 1; i <= 12; i++) out.push([cx + rx * Math.cos(t1 + (dt * i) / 12), cy + ry * Math.sin(t1 + (dt * i) / 12)]);
  return out;
}

function signedArea(sp) {
  const p = [sp.s];
  let [px, py] = sp.s;
  for (const g of sp.g) {
    if (g.t === "L") p.push([g.x, g.y]);
    else if (g.t === "A") p.push(...arcPoints(px, py, g));
    else
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, u = 1 - t;
        if (g.t === "C") p.push([u * u * u * px + 3 * u * u * t * g.x1 + 3 * u * t * t * g.x2 + t * t * t * g.x, u * u * u * py + 3 * u * u * t * g.y1 + 3 * u * t * t * g.y2 + t * t * t * g.y]);
        else p.push([u * u * px + 2 * u * t * g.x1 + t * t * g.x, u * u * py + 2 * u * t * g.y1 + t * t * g.y]);
      }
    px = g.x;
    py = g.y;
  }
  let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i][0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * p[i][1];
  return a; // > 0 = clockwise on screen (y down)
}

function reverse(sp) {
  const pts = [sp.s, ...sp.g.map((g) => [g.x, g.y])];
  const g2 = [];
  for (let i = sp.g.length - 1; i >= 0; i--) {
    const g = sp.g[i], [x, y] = pts[i];
    if (g.t === "L") g2.push({ t: "L", x, y });
    else if (g.t === "A") g2.push({ ...g, sw: g.sw ? 0 : 1, x, y });
    else if (g.t === "C") g2.push({ t: "C", x1: g.x2, y1: g.y2, x2: g.x1, y2: g.y1, x, y });
    else g2.push({ t: "Q", x1: g.x1, y1: g.y1, x, y });
  }
  return { s: pts[pts.length - 1], g: g2 };
}

function orient(sp, hole) {
  close(sp);
  const a = signedArea(sp);
  return (hole ? a > 0 : a < 0) ? reverse(sp) : sp;
}

function dedupe(list) {
  const out = [];
  for (const it of list) {
    const prev = out[out.length - 1];
    if (prev && typeof it[0] === "number" && typeof prev[0] === "number" && Math.abs(prev[0] - it[0]) < 1e-9 && Math.abs(prev[1] - it[1]) < 1e-9) continue;
    out.push(it);
  }
  return out;
}

// ---- primitives ----

/**
 * Free path from a point list: [x, y] line-to, ["A", r, large, sweep, x, y],
 * ["E", rx, ry, rot, large, sweep, x, y], ["C", x1, y1, x2, y2, x, y], ["Q", x1, y1, x, y].
 */
export function P(list, hole) {
  const [s, ...rest] = list;
  const g = rest.map((it) => {
    if (typeof it[0] === "number") return { t: "L", x: it[0], y: it[1] };
    const [t, ...v] = it;
    if (t === "A") return { t: "A", rx: v[0], ry: v[0], rot: 0, la: v[1], sw: v[2], x: v[3], y: v[4] };
    if (t === "E") return { t: "A", rx: v[0], ry: v[1], rot: v[2], la: v[3], sw: v[4], x: v[5], y: v[6] };
    if (t === "C") return { t: "C", x1: v[0], y1: v[1], x2: v[2], y2: v[3], x: v[4], y: v[5] };
    if (t === "Q") return { t: "Q", x1: v[0], y1: v[1], x: v[2], y: v[3] };
    throw new Error(`unknown segment ${t}`);
  });
  return [orient({ s: [...s], g }, hole)];
}

export const poly = (pts, hole) => P(pts.map((p) => [...p]), hole);

/** Rounded rect; r is one radius or [top-left, top-right, bottom-right, bottom-left]. */
export function R(x, y, w, h, r = 0, hole) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  const L = [[x + a, y], [x + w - b, y]];
  if (b) L.push(["A", b, 0, 1, x + w, y + b]);
  L.push([x + w, y + h - c]);
  if (c) L.push(["A", c, 0, 1, x + w - c, y + h]);
  L.push([x + d, y + h]);
  if (d) L.push(["A", d, 0, 1, x, y + h - d]);
  L.push([x, y + a]);
  if (a) L.push(["A", a, 0, 1, x + a, y]);
  return P(dedupe(L), hole);
}

export const E = (cx, cy, rx, ry, hole) => P([[cx - rx, cy], ["E", rx, ry, 0, 1, 1, cx + rx, cy], ["E", rx, ry, 0, 1, 1, cx - rx, cy]], hole);
export const Ci = (cx, cy, r, hole) => E(cx, cy, r, r, hole);
/** Annulus; with hole=true it cuts a ring out of a shape and leaves the disc inside. */
export const ring = (cx, cy, outer, inner, hole) => [...Ci(cx, cy, outer, hole), ...Ci(cx, cy, inner, !hole)];

/** Ring sector between angles a0..a1 (degrees, clockwise on screen, 0 = right); inner 0 = pie slice. */
export function band(cx, cy, outer, inner, a0, a1, hole) {
  const la = Math.abs(a1 - a0) > 180 ? 1 : 0, sw = a1 > a0 ? 1 : 0;
  const L = [pt(a0, outer, cx, cy), ["A", outer, la, sw, ...pt(a1, outer, cx, cy)]];
  if (inner > 0) L.push(pt(a1, inner, cx, cy), ["A", inner, la, sw ? 0 : 1, ...pt(a0, inner, cx, cy)]);
  else L.push([cx, cy]);
  return P(L, hole);
}

/** Circular arc stroked with width w, optionally with round caps. */
export function arcS(cx, cy, r, a0, a1, w, caps, hole) {
  if (caps !== "round") return band(cx, cy, r + w / 2, r - w / 2, a0, a1, hole);
  const o = r + w / 2, i = r - w / 2, h = w / 2;
  const la = Math.abs(a1 - a0) > 180 ? 1 : 0, sw = a1 > a0 ? 1 : 0;
  return P([pt(a0, o, cx, cy), ["A", o, la, sw, ...pt(a1, o, cx, cy)], ["A", h, 0, sw, ...pt(a1, i, cx, cy)],
    ["A", i, la, sw ? 0 : 1, ...pt(a0, i, cx, cy)], ["A", h, 0, sw, ...pt(a0, o, cx, cy)]], hole);
}

/** Straight stroke p1 -> p2 of width w, butt or round caps. */
export function S(x1, y1, x2, y2, w, caps = "butt", hole) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const h = w / 2, nx = (-(y2 - y1) / len) * h, ny = ((x2 - x1) / len) * h;
  if (caps === "round") return P([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], ["A", h, 0, 0, x2 - nx, y2 - ny], [x1 - nx, y1 - ny], ["A", h, 0, 0, x1 + nx, y1 + ny]], hole);
  return P([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], hole);
}

/**
 * Stroke of width w along a chain of lines / cubics / quadratics (same list
 * format as P, without arcs). The outline offsets the control polygons
 * (Tiller-Hanson), which is close enough while each cubic bends < ~90 deg.
 */
export function SC(list, w, caps = "round", hole) {
  const h = w / 2;
  const segs = [];
  let cur = list[0];
  for (const it of list.slice(1)) {
    if (typeof it[0] === "number") segs.push([cur, (cur = it)]);
    else if (it[0] === "C") segs.push([cur, [it[1], it[2]], [it[3], it[4]], (cur = [it[5], it[6]])]);
    else {
      const q = [it[1], it[2]], p3 = [it[3], it[4]];
      segs.push([cur, [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])], p3]);
      cur = p3;
    }
  }
  const offset = (seg, d) => {
    const n = seg.length, dirs = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = seg[i + 1][0] - seg[i][0], dy = seg[i + 1][1] - seg[i][1], L = Math.hypot(dx, dy);
      dirs.push(L < 1e-9 ? null : [dx / L, dy / L]);
    }
    // a control point on its end point has no direction: borrow the neighbour's
    for (let i = 0; i < dirs.length; i++) if (!dirs[i]) dirs[i] = dirs.slice(i).find(Boolean) || dirs.slice(0, i).reverse().find(Boolean);
    const nrm = (v) => [v[1] * d, -v[0] * d];
    const out = [[seg[0][0] + nrm(dirs[0])[0], seg[0][1] + nrm(dirs[0])[1]]];
    for (let i = 1; i < n - 1; i++) {
      const a = dirs[i - 1], b = dirs[i];
      const pa = [seg[i][0] + nrm(a)[0], seg[i][1] + nrm(a)[1]], pb = [seg[i][0] + nrm(b)[0], seg[i][1] + nrm(b)[1]];
      const den = a[0] * b[1] - a[1] * b[0];
      if (Math.abs(den) < 1e-6) { out.push(pa); continue; }
      const t = ((pb[0] - pa[0]) * b[1] - (pb[1] - pa[1]) * b[0]) / den;
      out.push([pa[0] + t * a[0], pa[1] + t * a[1]]);
    }
    const last = nrm(dirs[dirs.length - 1]);
    out.push([seg[n - 1][0] + last[0], seg[n - 1][1] + last[1]]);
    return out;
  };
  const left = segs.map((s) => offset(s, h)), right = segs.map((s) => offset(s, -h));
  const toSeg = (p) => (p.length === 2 ? [...p[1]] : ["C", ...p[1], ...p[2], ...p[3]]);
  const out = [[...left[0][0]]];
  left.forEach((p, i) => { if (i) out.push([...p[0]]); out.push(toSeg(p)); });
  const end = right[right.length - 1];
  out.push(caps === "round" ? ["A", h, 0, 1, ...end[end.length - 1]] : [...end[end.length - 1]]);
  for (let i = right.length - 1; i >= 0; i--) {
    const p = right[i].slice().reverse();
    if (i !== right.length - 1) out.push([...p[0]]);
    out.push(toSeg(p));
  }
  if (caps === "round") out.push(["A", h, 0, 1, ...left[0][0]]);
  return P(dedupe(out), hole);
}

/** Point on an ellipse at angle a (degrees, clockwise on screen, 0 = right). */
export const ept = (cx, cy, rx, ry, a) => [cx + rx * Math.cos(a * D2R), cy + ry * Math.sin(a * D2R)];

/**
 * Elliptical arc a0 -> a1 as cubic segments (each <= 90 deg) for P and SC
 * lists; the caller supplies the start point, usually ept(..., a0).
 */
export function ellArc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90 - 1e-9));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = (a0 + ((a1 - a0) * i) / n) * D2R, t1 = (a0 + ((a1 - a0) * (i + 1)) / n) * D2R;
    const k = (4 / 3) * Math.tan((t1 - t0) / 4);
    const [x0, y0] = [cx + rx * Math.cos(t0), cy + ry * Math.sin(t0)], [x1, y1] = [cx + rx * Math.cos(t1), cy + ry * Math.sin(t1)];
    out.push(["C", x0 - k * rx * Math.sin(t0), y0 + k * ry * Math.cos(t0), x1 + k * rx * Math.sin(t1), y1 - k * ry * Math.cos(t1), x1, y1]);
  }
  return out;
}

/** Hole variant of a primitive: H(Ci)(x, y, r). */
export const H = (fn) => (...a) => fn(...a, true);

// ---- transforms ----

function xf(list, f) {
  return list.map((sp) => ({
    s: f(sp.s[0], sp.s[1]),
    g: sp.g.map((g) => {
      const [x, y] = f(g.x, g.y);
      if (g.t === "C") { const [a, b] = f(g.x1, g.y1), [c, d] = f(g.x2, g.y2); return { ...g, x1: a, y1: b, x2: c, y2: d, x, y }; }
      if (g.t === "Q") { const [a, b] = f(g.x1, g.y1); return { ...g, x1: a, y1: b, x, y }; }
      return { ...g, x, y };
    }),
  }));
}

export const move = (list, dx, dy) => xf(list, (x, y) => [x + dx, y + dy]);

export function rot(list, deg, ox, oy) {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
  return xf(list, (x, y) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]).map((sp) => ({
    ...sp,
    g: sp.g.map((g) => (g.t === "A" ? { ...g, rot: (g.rot + deg) % 360 } : g)),
  }));
}

// ---- serializer ----

// two decimals, snapped to one where that moves a point by at most 0.03 units
const rnd = (n) => {
  const a = Math.round(n * 100) / 100, b = Math.round(n * 10) / 10;
  return Math.abs(a - b) <= 0.03 + 1e-9 ? b : a;
};

function num(n) {
  let v = Math.round(n * 100) / 100;
  if (Object.is(v, -0)) v = 0;
  const s = String(v);
  if (s.startsWith("0.")) return s.slice(1);
  if (s.startsWith("-0.")) return "-" + s.slice(2);
  return s;
}

// append a number, dropping the separator where the path grammar allows ("1.5.5", "1-2")
function app(out, s) {
  const m = out.match(/[\d.]+$/);
  if (!m || s.startsWith("-") || (s.startsWith(".") && m[0].includes("."))) return out + s;
  return out + " " + s;
}

const joinNums = (arr) => arr.reduce((out, s) => (out ? app(out, s) : s), "");

function serialize(list) {
  let d = "";
  let cur = [0, 0];
  for (const sp of list) {
    const s = [rnd(sp.s[0]), rnd(sp.s[1])];
    const abs = "M" + joinNums([num(s[0]), num(s[1])]);
    const rel = "m" + joinNums([num(s[0] - cur[0]), num(s[1] - cur[1])]);
    d += !d || abs.length <= rel.length ? abs : rel;
    const segs = sp.g.slice();
    const last = segs[segs.length - 1];
    if (last && last.t === "L" && rnd(last.x) === s[0] && rnd(last.y) === s[1]) segs.pop(); // z closes it
    let p = s, lastCmd = "";
    for (const g of segs) {
      const x = rnd(g.x), y = rnd(g.y), dx = x - p[0], dy = y - p[1];
      let cmd, nums;
      if (g.t === "L") {
        if (Math.abs(dy) < 1e-9) [cmd, nums] = ["h", [num(dx)]];
        else if (Math.abs(dx) < 1e-9) [cmd, nums] = ["v", [num(dy)]];
        else [cmd, nums] = ["l", [num(dx), num(dy)]];
      } else if (g.t === "A") {
        [cmd, nums] = ["a", [num(rnd(g.rx)), num(rnd(g.ry)), num(Math.round(g.rot || 0)), String(g.la), String(g.sw), num(dx), num(dy)]];
      } else if (g.t === "C") {
        [cmd, nums] = ["c", [num(rnd(g.x1) - p[0]), num(rnd(g.y1) - p[1]), num(rnd(g.x2) - p[0]), num(rnd(g.y2) - p[1]), num(dx), num(dy)]];
      } else {
        [cmd, nums] = ["q", [num(rnd(g.x1) - p[0]), num(rnd(g.y1) - p[1]), num(dx), num(dy)]];
      }
      // repeated commands may drop the letter; arcs keep it so their flags stay unambiguous
      if (cmd === lastCmd && cmd !== "a") for (const n of nums) d = app(d, n);
      else d += cmd + joinNums(nums);
      lastCmd = cmd;
      p = [x, y];
    }
    d += "z";
    cur = s;
  }
  return d;
}

export const build = (parts) => serialize(parts.flat());
