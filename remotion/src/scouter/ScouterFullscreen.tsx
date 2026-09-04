/**
 * Review reconstruction of scouter_fullscreen.aep -> full_screen_scan, from
 * scripts/aep2remotion.mjs. TIME-AWARE: layer transform tracks are sampled at
 * the current frame (linear interp), and layer in/out points gate visibility.
 *
 * The comp is a 2-phase, 30s sting:
 *   phase 1  (frames 0-118)  the "scan": spinning rings, a flying centre pip,
 *                            4 popping triangle ticks, an L-frame
 *   phase 2  (frames 118+)   the assembled reticle holds: outer/inner circle,
 *                            straight + horizontal lines, scouter-font text,
 *                            arrow, comparison_power_level pip
 *
 * Not reproduced (see NOTE in aep2remotion.mjs): bezier easing, shape-internal
 * keyframes (stroke draw-on, marching-ants, path morph), Mosaic wipe, track
 * mattes, blend modes, DBSScouter font.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import scene from "./scene.json";

type Vec = number[];
type Track = { v?: any; keys?: { f: number; v: any }[] };
type Prim = any;
type Layer = any;
type Comp = { name: string; width: number; height: number; fps: number; layers: Layer[] };

const comps: Record<string, Comp> = scene.comps as any;

const lerp = (a: any, b: any, u: number): any =>
  Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * u) : a + (b - a) * u;

function sample(trk: Track | undefined, f: number): any {
  if (!trk) return 0;
  if (!trk.keys) return trk.v;
  const k = trk.keys;
  if (f <= k[0].f) return k[0].v;
  if (f >= k[k.length - 1].f) return k[k.length - 1].v;
  let i = 0;
  while (i < k.length - 1 && k[i + 1].f <= f) i++;
  const a = k[i];
  const b = k[i + 1];
  return lerp(a.v, b.v, (f - a.f) / (b.f - a.f));
}

function xf(tr: any, f: number): string {
  const p = sample(tr.position, f) as Vec;
  const a = sample(tr.anchor, f) as Vec;
  const s = sample(tr.scale, f) as Vec;
  const r = sample(tr.rotation, f) as number;
  return `translate(${p[0]} ${p[1]}) rotate(${r}) scale(${s[0] / 100} ${s[1] / 100}) translate(${-a[0]} ${-a[1]})`;
}

// AE parenting: a parent hands children only T(position)·R·S - its anchor
// point positions the parent's own content, not its children's origin.
function xfParent(tr: any, f: number): string {
  const p = sample(tr.position, f) as Vec;
  const s = sample(tr.scale, f) as Vec;
  const r = sample(tr.rotation, f) as number;
  return `translate(${p[0]} ${p[1]}) rotate(${r}) scale(${s[0] / 100} ${s[1] / 100})`;
}

function fullXf(layer: Layer, byIndex: Map<number, Layer>, f: number): string {
  const chain: Layer[] = [];
  let cur = layer;
  const guard = new Set<number>();
  while (cur && cur.parentIndex != null && !guard.has(cur.parentIndex)) {
    guard.add(cur.parentIndex);
    const p = byIndex.get(cur.parentIndex);
    if (!p) break;
    chain.unshift(p);
    cur = p;
  }
  return [...chain.map((c) => xfParent(c.transform, f)), xf(layer.transform, f)].join(" ");
}

function strokeProps(s: any) {
  if (!s) return { fill: "none" } as React.SVGProps<any>;
  return {
    stroke: s.color,
    strokeWidth: s.width,
    strokeLinecap: s.cap,
    strokeLinejoin: s.join,
    strokeDasharray: s.dash ? s.dash.join(" ") : undefined,
    fill: "none",
  } as React.SVGProps<any>;
}

function pathD(p: Prim): string {
  const v = p.vertices as Vec[];
  const it = p.inTangents as Vec[];
  const ot = p.outTangents as Vec[];
  if (!v || !v.length) return "";
  let d = `M ${v[0][0]} ${v[0][1]}`;
  const n = v.length;
  const segs = p.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = v[i];
    const b = v[(i + 1) % n];
    const c1 = [a[0] + (ot[i]?.[0] || 0), a[1] + (ot[i]?.[1] || 0)];
    const c2 = [b[0] + (it[(i + 1) % n]?.[0] || 0), b[1] + (it[(i + 1) % n]?.[1] || 0)];
    d += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${b[0]} ${b[1]}`;
  }
  if (p.closed) d += " Z";
  return d;
}

const Primitive: React.FC<{ p: Prim }> = ({ p }) => {
  const stroke = strokeProps(p.stroke);
  const canFill = p.kind === "polygon" || p.kind === "ellipse" || p.kind === "rect" || p.kind === "path";
  const fill = p.fill && canFill ? p.fill : "none";
  const g = p.groupXf
    ? xf(
        {
          position: { v: [...p.groupXf.pos, 0] },
          anchor: { v: [...p.groupXf.anchor, 0] },
          scale: { v: [...p.groupXf.scale, 100] },
          rotation: { v: p.groupXf.rot },
        },
        0,
      )
    : undefined;
  let el: React.ReactNode = null;
  if (p.kind === "ellipse") el = <ellipse cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} {...stroke} fill={fill} />;
  else if (p.kind === "rect") el = <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.round || 0} {...stroke} fill={fill} />;
  else if (p.kind === "polygon")
    el = <polygon points={(p.points as Vec[]).map((q) => q.join(",")).join(" ")} {...stroke} fill={fill} />;
  else if (p.kind === "path") el = <path d={pathD(p)} {...stroke} fill={fill} />;
  return g ? <g transform={g}>{el}</g> : <>{el}</>;
};

const LayerNode: React.FC<{ layer: Layer; byIndex: Map<number, Layer>; f: number }> = ({ layer, byIndex, f }) => {
  if (layer.enabled === false) return null;
  // "*_matte" layers are alpha sources for a track matte / masked adjustment,
  // not meant to paint on their own
  if (/_matte$/i.test(layer.name || "")) return null;
  if (f < layer.inPoint - 0.5 || f >= layer.outPoint) return null;
  const t = fullXf(layer, byIndex, f);
  const op = sample(layer.transform.opacity, f) / 100;

  let content: React.ReactNode = null;
  if (layer.type === "shape") {
    content = (layer.shapes || []).map((p: Prim, i: number) => <Primitive key={i} p={p} />);
  } else if (layer.type === "text" && layer.text) {
    const anchor =
      layer.text.justify === "CENTER_JUSTIFY" ? "middle" : layer.text.justify === "RIGHT_JUSTIFY" ? "end" : "start";
    content = (
      <text x={0} y={0} fontFamily={`${layer.text.font}, sans-serif`} fontSize={layer.text.size} fill={layer.text.fill} textAnchor={anchor as any}>
        {layer.text.text}
      </text>
    );
  } else if (layer.type === "solid" && layer.solid) {
    const tint = (layer.effects || []).find((e: any) => e.matchName === "ADBE Tint");
    content = <rect x={0} y={0} width={layer.solid.w} height={layer.solid.h} fill={tint ? tint.mapWhite : layer.solid.color} />;
  } else if (layer.type === "precomp" && layer.precomp) {
    const sub = comps[layer.precomp.compId];
    if (sub) {
      content = (
        <svg x={0} y={0} width={sub.width} height={sub.height} viewBox={`0 0 ${sub.width} ${sub.height}`} overflow="visible">
          <CompLayers comp={sub} f={f - layer.startTime} />
        </svg>
      );
    }
  }
  if (!content) return null;
  return (
    <g transform={t} opacity={op}>
      {content}
    </g>
  );
};

const CompLayers: React.FC<{ comp: Comp; f: number }> = ({ comp, f }) => {
  const byIndex = new Map<number, Layer>();
  comp.layers.forEach((l) => byIndex.set(l.index, l));
  const painted = comp.layers.slice().reverse(); // AE layer 1 = top -> paint last
  return (
    <>
      {painted.map((l) => (
        <LayerNode key={l.index} layer={l} byIndex={byIndex} f={f} />
      ))}
    </>
  );
};

export const ScouterFullscreen: React.FC = () => {
  const frame = useCurrentFrame();
  const root = comps[scene.rootCompId];
  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <svg width={root.width} height={root.height} viewBox={`0 0 ${root.width} ${root.height}`} style={{ position: "absolute", inset: 0 }}>
        <CompLayers comp={root} f={frame} />
      </svg>
    </AbsoluteFill>
  );
};
