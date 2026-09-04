// Translate an aep2json export into a flat scene the Scouter component renders
// as SVG, WITH keyframe tracks so the review render animates.
//   node scripts/aep2remotion.mjs ../ae/scouter_fullscreen.aep2json.json
//
// Layer transform props (position/anchor/scale/rotation/opacity) are kept as
// {keys:[{f,v}]} tracks (frame-based, comp time). Shape-internal props
// (stroke width, dashes, ellipse/star geometry, group transform, fills) are
// still baked to their settled (last-keyframe) value - see NOTE at bottom.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inPath = resolve(process.argv[2] || resolve(ROOT, "../ae/scouter_fullscreen.aep2json.json"));
const doc = JSON.parse(readFileSync(inPath, "utf8"));

// ---- helpers -------------------------------------------------------------
const num = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const at0 = (p) => {
  if (!p) return null;
  if (Array.isArray(p.keys) && p.keys.length) return p.keys[p.keys.length - 1].v;
  return p.value;
};
// keyframe track, times converted to frames at `fps`
const trk = (p, dflt, fps) => {
  if (!p) return { v: dflt };
  if (Array.isArray(p.keys) && p.keys.length)
    return { keys: p.keys.map((k) => ({ f: +(k.t * fps).toFixed(3), v: k.v })) };
  return { v: p.value !== undefined ? p.value : dflt };
};
const rgba = (c) => {
  if (!Array.isArray(c)) return null;
  const [r, g, b, a = 1] = c;
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
};
const findProp = (group, matchName) => {
  if (!group || !group.props) return null;
  for (const p of group.props) {
    if (p.matchName === matchName) return p;
    if (p._group) {
      const hit = findProp(p, matchName);
      if (hit) return hit;
    }
  }
  return null;
};
const childGroups = (group, matchName) =>
  (group?.props || []).filter((p) => p._group && p.matchName === matchName);

// ---- shape-group -> primitives (baked) ------------------------------
function strokeFrom(contents) {
  const s = childGroups(contents, "ADBE Vector Graphic - Stroke")[0];
  if (!s) return null;
  const dash1 = num(at0(findProp(s, "ADBE Vector Stroke Dash 1")));
  const dash2 = num(at0(findProp(s, "ADBE Vector Stroke Dash 2")));
  const w = num(at0(findProp(s, "ADBE Vector Stroke Width")));
  if (w <= 0) return null;
  return {
    color: rgba(at0(findProp(s, "ADBE Vector Stroke Color"))) || "#ffce2b",
    width: w,
    cap: { 1: "butt", 2: "round", 3: "square" }[num(at0(findProp(s, "ADBE Vector Stroke Line Cap")), 1)],
    join: { 1: "miter", 2: "round", 3: "bevel" }[num(at0(findProp(s, "ADBE Vector Stroke Line Join")), 1)],
    dash: dash1 > 0 ? [dash1, dash2 || dash1] : null,
  };
}
function fillFrom(contents) {
  const f = childGroups(contents, "ADBE Vector Graphic - Fill")[0];
  if (f) {
    const c = at0(findProp(f, "ADBE Vector Fill Color"));
    const opac = num(at0(findProp(f, "ADBE Vector Fill Opacity")), 100);
    if (!Array.isArray(c) || opac <= 0) return null;
    if (c[0] === 1 && c[1] === 0 && c[2] === 0) return null; // AE vestigial default red
    return rgba([c[0], c[1], c[2], opac / 100]);
  }
  return null; // gradient stops aren't API-readable; this HUD is stroke-only
}

function primFromGroup(g) {
  const contents = childGroups(g, "ADBE Vectors Group")[0];
  if (!contents) return null;
  const gx = childGroups(contents, "ADBE Vector Transform Group")[0];
  const stroke = strokeFrom(contents);
  const fill = fillFrom(contents);
  const groupXf = gx
    ? {
        pos: at0(findProp(gx, "ADBE Vector Position")) || [0, 0],
        anchor: at0(findProp(gx, "ADBE Vector Anchor")) || [0, 0],
        scale: at0(findProp(gx, "ADBE Vector Scale")) || [100, 100],
        rot: num(at0(findProp(gx, "ADBE Vector Rotation"))),
      }
    : null;

  const el = findProp(contents, "ADBE Vector Ellipse Size");
  if (el) {
    const size = at0(el) || [0, 0];
    const pos = at0(findProp(contents, "ADBE Vector Ellipse Position")) || [0, 0];
    return { kind: "ellipse", cx: pos[0], cy: pos[1], rx: size[0] / 2, ry: size[1] / 2, stroke, fill, groupXf };
  }
  const rc = findProp(contents, "ADBE Vector Rect Size");
  if (rc) {
    const size = at0(rc) || [0, 0];
    const pos = at0(findProp(contents, "ADBE Vector Rect Position")) || [0, 0];
    const round = num(at0(findProp(contents, "ADBE Vector Rect Roundness")));
    return { kind: "rect", x: pos[0] - size[0] / 2, y: pos[1] - size[1] / 2, w: size[0], h: size[1], round, stroke, fill, groupXf };
  }
  const starPts = findProp(contents, "ADBE Vector Star Points");
  const starOuter = findProp(contents, "ADBE Vector Star Outer Radius");
  if (starPts || starOuter) {
    const n = Math.max(3, Math.round(num(at0(starPts), 3)));
    const R = num(at0(starOuter), 100);
    const rot = num(at0(findProp(contents, "ADBE Vector Star Rotation")));
    const pos = at0(findProp(contents, "ADBE Vector Star Position")) || [0, 0];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = ((-90 + rot + (i * 360) / n) * Math.PI) / 180;
      pts.push([pos[0] + R * Math.cos(a), pos[1] + R * Math.sin(a)]);
    }
    return { kind: "polygon", points: pts, stroke, fill, groupXf };
  }
  const sp = findProp(contents, "ADBE Vector Shape");
  if (sp) {
    const v = at0(sp);
    if (v && v._shape)
      return { kind: "path", closed: v.closed, vertices: v.vertices, inTangents: v.inTangents, outTangents: v.outTangents, stroke, fill, groupXf };
  }
  return null;
}

function shapesFromLayer(layer) {
  const root = layer.shape;
  if (!root) return [];
  const out = [];
  for (const g of childGroups(root, "ADBE Vector Group")) {
    const p = primFromGroup(g);
    if (p) out.push(p);
  }
  return out;
}

// ---- layer -> scene entry ----------------------------------------
function conv(layer, fps) {
  const tr = layer.transform || {};
  const base = {
    index: layer.index,
    name: layer.name,
    type: layer.type,
    enabled: layer.enabled !== false,
    blend: layer.blendMode,
    parentIndex: layer.parentIndex ?? null,
    trackMatte: layer.trackMatte || null,
    inPoint: +(num(layer.inPoint) * fps).toFixed(3),
    outPoint: +(num(layer.outPoint, 1e6) * fps).toFixed(3),
    startTime: +(num(layer.startTime) * fps).toFixed(3),
    transform: {
      position: trk(tr.position, [0, 0, 0], fps),
      anchor: trk(tr.anchorPoint, [0, 0, 0], fps),
      scale: trk(tr.scale, [100, 100, 100], fps),
      rotation: trk(tr.rotation, 0, fps),
      opacity: trk(tr.opacity, 100, fps),
    },
  };
  if (layer.type === "shape") base.shapes = shapesFromLayer(layer);
  if (layer.type === "text") {
    const td = at0(layer.text) || {};
    base.text = {
      text: td.text || "",
      font: td.font || "sans-serif",
      size: num(td.fontSize, 40),
      fill: Array.isArray(td.fillColor) ? rgba([...td.fillColor, 1]) : "#ffce2b",
      justify: td.justification || "LEFT_JUSTIFY",
    };
  }
  if (layer.type === "solid" && layer.source) base.solid = { color: rgba([...layer.source.color, 1]), w: layer.source.width, h: layer.source.height };
  if (layer.type === "precomp" && layer.source) base.precomp = { compId: String(layer.source.compId), name: layer.source.compName };
  if (layer.effects && layer.effects.length) {
    base.effects = layer.effects.map((e) => {
      const o = { matchName: e.matchName, name: e.name };
      if (e.matchName === "ADBE Tint") {
        o.mapWhite = rgba(at0(findProp(e, "ADBE Tint-0002")));
        o.mapBlack = rgba(at0(findProp(e, "ADBE Tint-0001")));
        o.amount = num(at0(findProp(e, "ADBE Tint-0003")), 100);
      }
      if (e.matchName === "ADBE Mosaic") {
        o.hBlocks = num(at0(findProp(e, "ADBE Mosaic-0001")), 20);
        o.vBlocks = num(at0(findProp(e, "ADBE Mosaic-0002")), 20);
      }
      return o;
    });
  }
  return base;
}

function convComp(c) {
  const fps = c.frameRate || 30;
  return {
    name: c.name,
    width: c.width,
    height: c.height,
    fps,
    durationF: Math.round(num(c.duration) * fps),
    layers: c.layers.map((l) => conv(l, fps)),
  };
}

const out = { source: inPath, rootCompId: String(doc.rootCompId), comps: {} };
for (const [id, c] of Object.entries(doc.comps)) out.comps[id] = convComp(c);

const dst = resolve(ROOT, "src/scouter");
mkdirSync(dst, { recursive: true });
writeFileSync(resolve(dst, "scene.json"), JSON.stringify(out, null, 2));
const root = out.comps[out.rootCompId];
console.log(
  `scene -> src/scouter/scene.json  |  root "${root.name}" ${root.width}x${root.height} @ ${root.fps}fps, ${root.durationF}f, ${root.layers.length} layers, ${Object.keys(out.comps).length} comp(s)`,
);

// NOTE - not carried into the review render (geometry review is unaffected):
//   * bezier keyframe easing (tracks are linear-interpolated)
//   * shape-internal keyframes: stroke-width draw-on (circle_stroke_01-03),
//     dash offset marching-ants + path morph (straight_line_01/02)
//   * Mosaic pixelate wipe (Adjustment Layer 1, 3.23-4.67s)
//   * track mattes, blend modes
