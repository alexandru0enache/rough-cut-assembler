import React from "react";
import { loadFont } from "@remotion/google-fonts/Anton";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { countUp, type CardData } from "./data";
import { theme as T } from "./theme";
import chrome from "./chrome.meta.json";

const { fontFamily } = loadFont();

export const PowerStreakCard: React.FC<{ card: CardData }> = ({ card }) => {
  const frame = useCurrentFrame();

  const t = interpolate(frame, [0, T.anim.fillFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const intro = interpolate(frame, [0, T.anim.introFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const fill = t * card.barFill;
  const b = T.bar;
  const cx = chrome.x;
  const cy = chrome.y;
  const cyb = chrome.y + chrome.h;
  const front = cx + fill * (chrome.w - chrome.slant); // leading edge, bottom x
  const greenPts = `${cx - 60},${cyb} ${cx - 60},${cy} ${front + chrome.slant},${cy} ${front},${cyb}`;
  const edgePts = `${front},${cyb} ${front + chrome.slant},${cy} ${front + chrome.slant + b.edgeW},${cy} ${front + b.edgeW},${cyb}`;

  const centre = card.counter
    ? countUp(card.counter, card.chapters, t)
    : card.metric || T.fallbackCentre;
  const right = card.counter ? card.metric : "";

  const src = card.portraitSrc ? staticFile(card.portraitSrc) : null;
  const family = `${fontFamily}, ${T.text.fallbackFamily}`;
  const fadeMask = T.portrait.fade
    ? `linear-gradient(to bottom, #000 ${T.portrait.fade}%, transparent 100%)`
    : undefined;

  const label = (l: {
    x: number;
    y: number;
    size: number;
    width: number;
    align: string;
  }): React.CSSProperties => ({
    position: "absolute",
    left: l.x - l.width / 2,
    top: l.y - l.size,
    width: l.width,
    fontSize: l.size,
    textAlign: l.align as React.CSSProperties["textAlign"],
    color: T.text.color,
    letterSpacing: T.text.letterSpacing,
    textShadow: T.text.shadow,
    WebkitTextStroke: T.text.stroke,
    whiteSpace: "nowrap",
    lineHeight: 1,
  });

  return (
    <AbsoluteFill
      style={{
        fontFamily: family,
        transform: `translateX(${(1 - intro) * -50}px)`,
        opacity: intro,
      }}
    >
      {/* portrait - behind the chrome so the border sits on top */}
      {src && (
        <div
          style={{
            position: "absolute",
            left: T.portrait.x,
            top: T.portrait.y,
            width: T.portrait.w,
            height: T.portrait.h,
            maskImage: fadeMask,
            WebkitMaskImage: fadeMask,
          }}
        >
          <Img
            src={src}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: `${T.portrait.framingX}% ${T.portrait.framingY}%`,
              opacity: T.portrait.opacity,
              filter: `drop-shadow(${T.portrait.shadow})`,
            }}
          />
        </div>
      )}

      {/* static artwork (slate body + gold border) */}
      <Img
        src={staticFile(T.chrome)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {/* animated green fill ON TOP of the chrome, clipped to the card shape */}
      <svg
        width={T.canvas.width}
        height={T.canvas.height}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <linearGradient id={`bg-${card.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={b.colorTop} />
            <stop offset="1" stopColor={b.color} />
          </linearGradient>
          <clipPath id={`bc-${card.id}`}>
            <path d={chrome.path} />
          </clipPath>
        </defs>
        <g clipPath={`url(#bc-${card.id})`}>
          <polygon points={greenPts} fill={`url(#bg-${card.id})`} />
          {fill > 0.01 && fill < 0.99 && (
            <polygon points={edgePts} fill={b.edge} opacity={0.9} />
          )}
        </g>
        {/* redraw the border so it stays on top of the fill */}
        <path
          d={chrome.path}
          fill="none"
          stroke="#ffce2b"
          strokeWidth={10}
          strokeLinejoin="round"
        />
      </svg>

      {/* red nameplate tab - auto-widths to the text */}
      <div
        style={{
          position: "absolute",
          left: T.nameplate.x,
          top: T.nameplate.y - T.nameplate.fontSize,
          transform: `skewX(${T.nameplate.skewDeg}deg)`,
          background: "#d4211f",
          borderTop: `${T.nameplate.goldEdge}px solid #ffce2b`,
          padding: `${T.nameplate.padY}px ${T.nameplate.padX}px`,
          boxShadow: "0 4px 10px rgba(0,0,0,.35)",
        }}
      >
        <span
          style={{
            display: "block",
            transform: `skewX(${-T.nameplate.skewDeg}deg)`,
            color: T.text.color,
            fontSize: T.nameplate.fontSize,
            letterSpacing: T.text.letterSpacing,
            textShadow: T.text.shadow,
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          {card.nameplate}
        </span>
      </div>

      <span style={label(T.counter)}>{centre}</span>
      {right && <span style={label(T.metric)}>{right}</span>}
    </AbsoluteFill>
  );
};
