/**
 * PNG-layer card. The look comes from `chrome` (a full-frame 1920x1080 image
 * with alpha - your AE export). This file only positions the dynamic bits over
 * it: the animated bar, three text slots, one portrait. All values are px on
 * the 1920x1080 canvas.
 *
 * Card interior in public/chrome.svg is x 150..1130, y 812..1000 - keep `bar`
 * and text roughly inside that, or re-export chrome and adjust.
 */
export const theme = {
  canvas: { width: 1920, height: 1080, fps: 30 },
  durationInFrames: 150,

  // the static artwork. swap to "chrome.png" once you export it from AE.
  chrome: "chrome.svg",

  // green progress fill - revealed left->right, clipped to the card shape
  // (geometry comes from src/chrome.meta.json so it always matches the artwork)
  bar: {
    color: "#199a33",
    colorTop: "#37c14e", // vertical gradient
    edge: "#d8ffe2", // bright leading edge
    edgeW: 9,
    inset: 6, // px shrink from the card edge so the border stays clean
  },

  // red nameplate tab (auto-widths to the text)
  nameplate: {
    x: 270,
    y: 992, // baseline-ish; tab hangs below the card
    skewDeg: -15,
    padX: 26,
    padY: 8,
    goldEdge: 3,
    fontSize: 38,
  },

  // centre + right text
  counter: { x: 470, y: 872, size: 60, width: 470, align: "center" as const },
  metric: { x: 830, y: 878, size: 48, width: 250, align: "center" as const },
  fallbackCentre: "STRONGEST",

  // portrait (one image; crop framing via objectPosition)
  portrait: {
    x: 150,
    y: 470, // top of the box
    w: 430,
    h: 560,
    framingX: 50, // object-position %
    framingY: 6,
    fade: 60, // % down the box where the bottom fade starts (0 = none)
    opacity: 1,
    shadow: "0 5px 10px rgba(0,0,0,.4)",
  },

  text: {
    color: "#ffffff",
    letterSpacing: 0.5,
    shadow: "0 2px 0 rgba(0,0,0,.45), 0 0 12px rgba(0,0,0,.35)",
    stroke: "1.5px rgba(0,0,0,.35)",
    fallbackFamily: "'Arial Black', system-ui, sans-serif",
  },

  anim: { fillFrames: 24, introFrames: 9 },
};

export type Theme = typeof theme;
