/**
 * Clean parametric scouter HUD. All geometry comes from src/scouter/params.ts
 * (or a `params` override prop). Assembles itself over anim.scanInFrames, then
 * holds with continuous ring spin + a rotating radar sweep.
 */
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { scouterParams, type ScouterParams, type Ring, type Tick, type Bracket } from "./params";

const DEG = Math.PI / 180;
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  cx + r * Math.cos(deg * DEG),
  cy + r * Math.sin(deg * DEG),
];
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function ringPath(cx: number, cy: number, r: number, gapDeg: number, gapAtDeg: number): string {
  // arc that runs the full circle minus a wedge centered on gapAtDeg
  const a0 = gapAtDeg + gapDeg / 2;
  const a1 = gapAtDeg - gapDeg / 2 + 360;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

const RingNode: React.FC<{ ring: Ring; cx: number; cy: number; ink: string; frame: number; fps: number; appear: number }> = ({
  ring,
  cx,
  cy,
  ink,
  frame,
  fps,
  appear,
}) => {
  const spin = (ring.spin * frame) / fps;
  const common = {
    stroke: ink,
    strokeWidth: ring.w,
    fill: "none",
    strokeDasharray: ring.dash ? ring.dash.join(" ") : undefined,
    opacity: (ring.opacity ?? 1) * appear,
  } as React.SVGProps<SVGPathElement | SVGCircleElement>;
  const scale = interpolate(appear, [0, 1], [1.06, 1]);
  const g = `translate(${cx} ${cy}) rotate(${spin}) scale(${scale}) translate(${-cx} ${-cy})`;
  return (
    <g transform={g}>
      {ring.gapDeg ? (
        <path d={ringPath(cx, cy, ring.r, ring.gapDeg, ring.gapAtDeg ?? 0)} strokeLinecap="butt" {...(common as any)} />
      ) : (
        <circle cx={cx} cy={cy} r={ring.r} {...(common as any)} />
      )}
    </g>
  );
};

const TickNode: React.FC<{ tick: Tick; cx: number; cy: number; ink: string; pop: number }> = ({ tick, cx, cy, ink, pop }) => {
  const wf = tick.width ?? 1;
  const [bx, by] = polar(cx, cy, tick.r, tick.atDeg); // base center (outer)
  const [ax, ay] = polar(cx, cy, tick.r - tick.size, tick.atDeg); // apex (inner)
  const perp = tick.atDeg + 90;
  const [px, py] = [Math.cos(perp * DEG), Math.sin(perp * DEG)];
  const half = (tick.size * wf) / 2;
  const p1 = `${bx + px * half},${by + py * half}`;
  const p2 = `${bx - px * half},${by - py * half}`;
  const p3 = `${ax},${ay}`;
  const cxT = (bx + bx + ax) / 3;
  const cyT = (by + by + ay) / 3;
  return (
    <polygon
      points={`${p1} ${p2} ${p3}`}
      fill={ink}
      opacity={Math.max(0, Math.min(1, pop))}
      transform={`translate(${cxT} ${cyT}) scale(${Math.max(0, pop)}) translate(${-cxT} ${-cyT})`}
    />
  );
};

function bracketPoints(b: Bracket, W: number, H: number): [number, number][] {
  const x = b.corner === "tl" || b.corner === "bl" ? b.inset : W - b.inset;
  const y = b.corner === "tl" || b.corner === "tr" ? b.inset : H - b.inset;
  const sx = b.corner === "tl" || b.corner === "bl" ? 1 : -1;
  const sy = b.corner === "tl" || b.corner === "tr" ? 1 : -1;
  return [
    [x, y + sy * b.len],
    [x, y],
    [x + sx * b.len, y],
  ];
}

export const Scouter: React.FC<{ params?: Partial<ScouterParams> }> = ({ params }) => {
  const P: ScouterParams = { ...scouterParams, ...params } as ScouterParams;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [cx, cy] = P.center;
  const W = P.canvas.width;
  const H = P.canvas.height;
  const A = P.anim;
  const ink = P.palette.ink;

  const scanEnd = A.scanInFrames;
  const bracketIn = ease(interpolate(frame, [0, scanEnd * 0.7], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }));
  const fieldIn = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const sweepAngle = P.sweep.on && frame > scanEnd * 0.3 ? ((frame / fps) * 360) / P.sweep.period : null;

  const blink = (on: boolean, delay: number) => {
    if (frame < scanEnd + delay) return 0;
    if (!on) return 1;
    return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((frame - scanEnd) * 0.6));
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="scouter-field" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stopColor={P.palette.field} stopOpacity={P.palette.fieldOpacity} />
            <stop offset="68%" stopColor={P.palette.field} stopOpacity={P.palette.fieldOpacity} />
            <stop offset="100%" stopColor={P.palette.fieldEdge} stopOpacity={P.palette.fieldEdgeOpacity} />
          </radialGradient>
        </defs>

        {P.previewBg && <rect x={0} y={0} width={W} height={H} fill={P.previewBg} />}
        <rect x={0} y={0} width={W} height={H} fill="url(#scouter-field)" opacity={fieldIn} />

        {/* radar sweep: a bright leading edge with a fading wedge trail */}
        {sweepAngle != null &&
          (() => {
            const N = 20;
            const slices = Array.from({ length: N }, (_, k) => {
              const a0 = sweepAngle! - (P.sweep.lenDeg * (k + 1)) / N;
              const a1 = sweepAngle! - (P.sweep.lenDeg * k) / N;
              const [x0, y0] = polar(cx, cy, P.sweep.r, a0);
              const [x1, y1] = polar(cx, cy, P.sweep.r, a1);
              return (
                <path
                  key={k}
                  d={`M ${cx} ${cy} L ${x0} ${y0} A ${P.sweep.r} ${P.sweep.r} 0 0 1 ${x1} ${y1} Z`}
                  fill={ink}
                  opacity={0.22 * Math.pow(k / N, 1.6)}
                />
              );
            });
            const [lx, ly] = polar(cx, cy, P.sweep.r, sweepAngle!);
            return (
              <g>
                {slices}
                <line x1={cx} y1={cy} x2={lx} y2={ly} stroke={ink} strokeWidth={P.sweep.w} opacity={0.5} />
              </g>
            );
          })()}

        {/* rings */}
        {P.rings.map((ring, i) => {
          const appear = ease(
            interpolate(frame, [i * A.ringStaggerFrames, i * A.ringStaggerFrames + scanEnd], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          );
          return <RingNode key={i} ring={ring} cx={cx} cy={cy} ink={ink} frame={frame} fps={fps} appear={appear} />;
        })}

        {/* crosshair stubs */}
        {P.crosshair &&
          [0, 90, 180, 270].map((d) => {
            const [x1, y1] = polar(cx, cy, P.crosshair!.gap, d);
            const [x2, y2] = polar(cx, cy, P.crosshair!.gap + P.crosshair!.len, d);
            return (
              <line
                key={d}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={ink}
                strokeWidth={P.crosshair!.w}
                opacity={bracketIn}
              />
            );
          })}

        {/* ticks */}
        {P.ticks.map((tick, i) => {
          const pop = spring({
            frame: frame - (scanEnd * 0.45 + i * A.tickStaggerFrames),
            fps,
            config: { damping: 12, stiffness: 160, mass: 0.7 },
          });
          return <TickNode key={i} tick={tick} cx={cx} cy={cy} ink={ink} pop={pop} />;
        })}

        {/* center pip + spinning halo */}
        <g opacity={ease(interpolate(frame, [scanEnd * 0.35, scanEnd * 0.35 + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))}>
          <g transform={`rotate(${(P.pip.haloSpin * frame) / fps} ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={P.pip.haloR}
              fill="none"
              stroke={P.palette.hot}
              strokeWidth={P.pip.haloW}
              strokeDasharray={P.pip.haloDash.join(" ")}
            />
          </g>
          <circle cx={cx} cy={cy} r={P.pip.r} fill={P.palette.hot} />
        </g>

        {/* corner brackets */}
        {P.brackets.map((b, i) => {
          const pts = bracketPoints(b, W, H);
          const off = interpolate(bracketIn, [0, 1], [b.corner.includes("l") ? -30 : 30, 0]);
          return (
            <polyline
              key={i}
              points={pts.map(([x, y]) => `${x + off},${y}`).join(" ")}
              fill="none"
              stroke={ink}
              strokeWidth={b.w}
              strokeDasharray={b.dash ? b.dash.join(" ") : undefined}
              opacity={bracketIn}
            />
          );
        })}

        {/* leader lines */}
        {P.leaders.map((l, i) => {
          const app = ease(
            interpolate(frame, [scanEnd + i * A.readoutStaggerFrames, scanEnd + i * A.readoutStaggerFrames + 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          );
          const tx = interpolate(app, [0, 1], [l.from[0], l.to[0]]);
          const ty = interpolate(app, [0, 1], [l.from[1], l.to[1]]);
          return (
            <line
              key={i}
              x1={l.from[0]}
              y1={l.from[1]}
              x2={tx}
              y2={ty}
              stroke={ink}
              strokeWidth={l.w}
              strokeDasharray={l.dash ? l.dash.join(" ") : undefined}
              opacity={app}
            />
          );
        })}

        {/* readouts */}
        {P.readouts.map((r, i) => {
          const app = interpolate(
            frame,
            [scanEnd + i * A.readoutStaggerFrames, scanEnd + i * A.readoutStaggerFrames + 5],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const op = app < 1 ? (Math.floor(frame / 2) % 2 ? app * 0.4 : app) : blink(!!r.blink, i * A.readoutStaggerFrames);
          return (
            <text
              key={i}
              x={r.x}
              y={r.y}
              fontFamily={`${P.font}, "DBZ Scouter", Consolas, "Courier New", monospace`}
              fontSize={r.size}
              fill={r.dim ? P.palette.inkDim : ink}
              textAnchor={r.align}
              opacity={op}
              style={{ letterSpacing: 2 }}
            >
              {r.text}
            </text>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
