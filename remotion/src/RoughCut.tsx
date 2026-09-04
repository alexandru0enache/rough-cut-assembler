/**
 * Watchable rough cut from a roughcut/timeline.json (via scripts/sync-timeline.mjs).
 *
 * Per beat:
 *   - manga  : Ken-Burns slideshow of the pinned / sampled pages
 *   - slate  : "PICK CLIP" card (a narrative beat with no resolvable pages)
 *   - title  : connective line (intro / rules / CTA) on a clean card, no manga
 * The reign's power-streak card drops in bottom-left on its first beat. Script
 * captions ride the top third. The director's shot spec (visual / motion / fx /
 * source) shows as a chip; beats with no spec get an "UNDIRECTED" tag so the cut
 * doubles as a direction-pass checklist. VO plays for review sync only.
 */
import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { PowerStreakCard } from "./PowerStreakCard";
import type { CardData } from "./data";
import rc from "./roughcut.json";

type Caption = { text: string; start: number; end: number };
type Spec = Record<string, string> | null;
type Beat = {
  id: string;
  event: string | null;
  kind: "manga" | "slate" | "title" | "render";
  start: number;
  end: number;
  chapterLabel: string;
  chapterSpan: number[] | null;
  pages: string[];
  card: string | null;
  spec: Spec;
  captions: Caption[];
};

const FPS: number = rc.fps;
const CARDS = rc.cards as Record<string, CardData>;

const tc = (f: number): string => {
  const s = Math.max(0, Math.round(f / FPS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const specLine = (s: Spec): string | null => {
  if (!s) return null;
  const parts = ["visual", "motion", "fx", "source"]
    .map((k) => (s[k] || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join("  ·  ") : null;
};

const KenBurns: React.FC<{ page: string; dir: number; dur: number }> = ({ page, dir, dur }) => {
  const f = useCurrentFrame();
  const k = interpolate(f, [0, Math.max(1, dur)], [0, 1], { extrapolateRight: "clamp" });
  const scale = 1.03 + 0.05 * k;
  const dx = (dir % 2 ? 1 : -1) * 22 * k;
  const dy = (dir % 3 ? -1 : 1) * 14 * k;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0c" }}>
      <Img
        src={staticFile(`roughcut/${page}`)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: `scale(${scale}) translate(${dx}px, ${dy}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

const RenderBeat: React.FC<{ src: string; dur: number }> = ({ src, dur }) => {
  const f = useCurrentFrame();
  const k = interpolate(f, [0, Math.max(1, dur)], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 50% 45%, #1b2230 0%, #0a0b10 70%)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Img
        src={staticFile(`roughcut/${src}`)}
        style={{
          maxWidth: "72%",
          maxHeight: "88%",
          objectFit: "contain",
          transform: `scale(${1.02 + 0.06 * k})`,
          filter: "drop-shadow(0 18px 40px rgba(0,0,0,0.55))",
        }}
      />
    </AbsoluteFill>
  );
};

const TitleBeat: React.FC<{ beat: Beat }> = ({ beat }) => {
  const text = beat.captions.map((c) => c.text).join(" ");
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg,#12151c,#0a0b10)",
        color: "#eef1f6",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 260px",
        textAlign: "center",
      }}
    >
      <div style={{ font: "600 42px system-ui, sans-serif", lineHeight: 1.32, maxWidth: 1300 }}>{text}</div>
    </AbsoluteFill>
  );
};

const SlateBeat: React.FC<{ beat: Beat }> = ({ beat }) => {
  const script = beat.captions.map((c) => c.text).join(" ");
  const secs = ((beat.end - beat.start) / FPS).toFixed(1);
  return (
    <AbsoluteFill
      style={{
        background: "#141013",
        color: "#e6e8ee",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 26,
        padding: 140,
        textAlign: "center",
      }}
    >
      <div style={{ font: "600 30px ui-monospace, monospace", letterSpacing: 2, color: "#ff9f45" }}>
        PICK CLIP &nbsp;&mdash;&nbsp; {beat.chapterLabel || "no chapter"} &nbsp;&middot;&nbsp; {secs}s
      </div>
      <div style={{ font: "400 30px system-ui, sans-serif", lineHeight: 1.4, maxWidth: 1300, color: "#aab" }}>{script}</div>
    </AbsoluteFill>
  );
};

const BeatSeq: React.FC<{ beat: Beat }> = ({ beat }) => {
  const dur = Math.max(1, beat.end - beat.start);
  const card = beat.card ? CARDS[beat.card] : undefined;
  const showCard = !!card && dur > 30;
  const spec = specLine(beat.spec);

  return (
    <>
      {beat.kind === "title" ? (
        <TitleBeat beat={beat} />
      ) : beat.kind === "render" && beat.pages.length ? (
        <RenderBeat src={beat.pages[0]} dur={dur} />
      ) : beat.kind === "manga" && beat.pages.length ? (
        beat.pages.map((page, i) => {
          const slice = Math.round(dur / beat.pages.length);
          const from = i * slice;
          const d = i === beat.pages.length - 1 ? dur - from : slice;
          return (
            <Sequence key={page} from={from} durationInFrames={Math.max(1, d)}>
              <KenBurns page={page} dir={i} dur={Math.max(1, d)} />
            </Sequence>
          );
        })
      ) : (
        <SlateBeat beat={beat} />
      )}

      {beat.kind !== "title" && (
        <div
          style={{
            position: "absolute",
            left: 24,
            top: 24,
            font: "600 20px ui-monospace, monospace",
            color: "#9cd0ff",
            background: "rgba(0,0,0,0.62)",
            padding: "6px 12px",
            borderRadius: 6,
          }}
        >
          {beat.id} &nbsp;&middot;&nbsp; {beat.chapterLabel || "—"} &nbsp;&middot;&nbsp; {tc(beat.start)}&ndash;{tc(beat.end)}
        </div>
      )}

      {/* shot spec / undirected tag, bottom band */}
      <div
        style={{
          position: "absolute",
          left: 24,
          bottom: 20,
          maxWidth: 1200,
          font: "500 18px ui-monospace, monospace",
          color: spec ? "#bfe3c4" : "#ff7a7a",
          background: "rgba(0,0,0,0.62)",
          padding: "6px 12px",
          borderRadius: 6,
        }}
      >
        {spec ? `◆ ${spec}` : "◆ UNDIRECTED — no shot spec"}
      </div>

      {showCard && card && (
        <Sequence from={12} durationInFrames={Math.max(1, Math.min(150, dur - 12))}>
          <PowerStreakCard card={card} />
        </Sequence>
      )}
    </>
  );
};

const CaptionBand: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 4], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 84 }}>
      <div
        style={{
          maxWidth: 1500,
          margin: "0 60px",
          padding: "14px 26px",
          borderRadius: 10,
          background: "rgba(8,10,14,0.74)",
          color: "#fff",
          font: "500 34px system-ui, sans-serif",
          lineHeight: 1.32,
          textAlign: "center",
          opacity: o,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const Footer: React.FC = () => {
  const f = useCurrentFrame();
  const pct = (f / rc.durationInFrames) * 100;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", pointerEvents: "none" }}>
      <div style={{ position: "relative", height: 4, background: "rgba(255,255,255,0.15)" }}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "#ffd36b" }} />
      </div>
      <div
        style={{
          position: "absolute",
          right: 20,
          bottom: 16,
          font: "600 18px ui-monospace, monospace",
          color: "rgba(255,255,255,0.8)",
          textShadow: "0 1px 2px #000",
        }}
      >
        {tc(f)} / {tc(rc.durationInFrames)}
      </div>
    </AbsoluteFill>
  );
};

export const RoughCut: React.FC = () => {
  const beats = rc.beats as Beat[];
  const captions = beats.flatMap((b) => b.captions);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0c" }}>
      {rc.audioPublic && <Audio src={staticFile(rc.audioPublic)} />}
      {beats.map((b) => (
        <Sequence key={b.id} from={b.start} durationInFrames={Math.max(1, b.end - b.start)}>
          <BeatSeq beat={b} />
        </Sequence>
      ))}
      {captions.map((c, i) => (
        <Sequence key={i} from={c.start} durationInFrames={Math.max(1, c.end - c.start)}>
          <CaptionBand text={c.text} />
        </Sequence>
      ))}
      <Footer />
    </AbsoluteFill>
  );
};
