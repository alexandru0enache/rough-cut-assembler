// Parametric spec for the clean scouter HUD (src/scouter/Scouter.tsx).
// Everything the graphic draws is derived from this object - edit values here
// (or pass an override object as the `params` prop) and the layout follows.

export type Ring = {
  r: number; // radius, px, from center
  w: number; // stroke width
  dash: [number, number] | null; // [on, off]; null = solid
  spin: number; // degrees/second of continuous rotation (+cw / -ccw)
  gapDeg?: number; // optional wedge cut out of the ring (broadcast-style break)
  gapAtDeg?: number; // where the wedge is centered (0 = +x, clockwise)
  opacity?: number;
};

export type Tick = {
  atDeg: number; // position around the center, 0 = +x (right), clockwise
  r: number; // distance of the tick's base from center
  size: number; // triangle height (points in-ward toward center)
  width?: number; // triangle base as a fraction of size (default 1.0)
};

export type Readout = {
  x: number;
  y: number;
  text: string;
  size: number;
  align: "start" | "middle" | "end";
  dim?: boolean; // use the dim ink color
  blink?: boolean; // flicker between full/half opacity after scan-in
};

export type Leader = {
  from: [number, number];
  to: [number, number];
  w: number;
  dash: [number, number] | null;
};

export type Bracket = {
  corner: "tl" | "tr" | "bl" | "br";
  inset: number; // px from the canvas edges
  len: number; // arm length
  w: number;
  dash: [number, number] | null;
};

export type ScouterParams = {
  canvas: { width: number; height: number; fps: number };
  durationInFrames: number;

  palette: {
    field: string; // full-bleed wash behind everything (solid color)
    fieldOpacity: number; // 0..1 wash strength at center
    fieldEdge: string; // vignette color at the edges (solid color)
    fieldEdgeOpacity: number; // 0..1 wash strength at the edges
    ink: string; // primary wireframe
    inkDim: string; // secondary wireframe / labels
    hot: string; // active element highlight (center pip halo)
  };

  previewBg?: string; // solid color drawn first, for reviewing stills over dark; omit in production

  center: [number, number];
  rings: Ring[];
  ticks: Tick[];
  pip: { r: number; haloR: number; haloW: number; haloDash: [number, number]; haloSpin: number };
  crosshair: { gap: number; len: number; w: number } | null; // 4 radial stubs; null = none
  sweep: { on: boolean; lenDeg: number; period: number; r: number; w: number }; // rotating radar wedge

  brackets: Bracket[];
  leaders: Leader[];
  readouts: Readout[];

  font: string; // scouter display font, with fallbacks appended by the component

  anim: {
    scanInFrames: number; // global assemble-in duration
    ringStaggerFrames: number; // delay between successive rings
    tickStaggerFrames: number; // delay between successive ticks
    readoutStaggerFrames: number;
  };
};

const YELLOW = "#ffea37";

export const scouterParams: ScouterParams = {
  canvas: { width: 1920, height: 1080, fps: 30 },
  durationInFrames: 180,

  palette: {
    field: "#21ff3b",
    fieldOpacity: 0.12,
    fieldEdge: "#0fbe2d",
    fieldEdgeOpacity: 0.26,
    ink: YELLOW,
    inkDim: "rgba(255,234,55,0.55)",
    hot: "#ffffff",
  },

  center: [960, 540],

  rings: [
    { r: 126, w: 2, dash: [2, 8], spin: 16 },
    { r: 172, w: 7, dash: [46, 18], spin: -9, gapDeg: 26, gapAtDeg: 270 },
    { r: 250, w: 3.5, dash: [3, 12], spin: 5 },
  ],

  ticks: [
    { atDeg: 0, r: 212, size: 48 },
    { atDeg: 90, r: 212, size: 48 },
    { atDeg: 180, r: 212, size: 48 },
    { atDeg: 270, r: 212, size: 48 },
  ],

  pip: { r: 13, haloR: 27, haloW: 5, haloDash: [4, 6], haloSpin: -120 },

  crosshair: { gap: 40, len: 26, w: 3 },

  sweep: { on: true, lenDeg: 58, period: 3.4, r: 250, w: 2.5 },

  brackets: [
    { corner: "bl", inset: 150, len: 220, w: 8, dash: [4, 9] },
    { corner: "tr", inset: 150, len: 120, w: 5, dash: [4, 9] },
  ],

  leaders: [
    { from: [250, 300], to: [430, 300], w: 6, dash: [10, 10] },
    { from: [1670, 560], to: [1500, 560], w: 6, dash: [10, 10] },
    { from: [430, 980], to: [600, 980], w: 6, dash: [10, 10] },
  ],

  readouts: [
    { x: 250, y: 262, text: "SCOUTER", size: 40, align: "start" },
    { x: 250, y: 348, text: "PWR 000000", size: 58, align: "start", blink: true },
    { x: 1670, y: 542, text: "LOCK", size: 44, align: "end", blink: true },
    { x: 430, y: 1024, text: "LAT 041.7  LON 118.3", size: 34, align: "start", dim: true },
  ],

  font: "DBSScouter",

  anim: {
    scanInFrames: 22,
    ringStaggerFrames: 3,
    tickStaggerFrames: 2,
    readoutStaggerFrames: 4,
  },
};
