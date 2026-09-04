import React from "react";
import { Composition } from "remotion";
import type { CardData } from "./data";
import { PowerStreakCard } from "./PowerStreakCard";
import { ScouterFullscreen } from "./scouter/ScouterFullscreen";
import { Scouter } from "./scouter/Scouter";
import { scouterParams } from "./scouter/params";
import { RoughCut } from "./RoughCut";
import roughcut from "./roughcut.json";
import { theme } from "./theme";
import events from "./events.json";

const { width, height, fps } = theme.canvas;
const DURATION = theme.durationInFrames;

const cards = (events.cards ?? []) as CardData[];
const fallback: CardData = cards[0] ?? {
  id: "placeholder",
  series: "DB",
  nameplate: "RUN npm run sync",
  counter: "0 CHAPTERS",
  metric: "",
  barFill: 0.3,
  chapters: 0,
  disputed: false,
  portraitSrc: null,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="RoughCut"
      component={RoughCut}
      durationInFrames={Math.max(1, roughcut.durationInFrames)}
      fps={roughcut.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="Scouter"
      component={Scouter}
      durationInFrames={scouterParams.durationInFrames}
      fps={scouterParams.canvas.fps}
      width={scouterParams.canvas.width}
      height={scouterParams.canvas.height}
      defaultProps={{ params: {} }}
    />
    <Composition
      id="ScouterFullscreen"
      component={ScouterFullscreen}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="PowerStreakCard"
      component={PowerStreakCard}
      durationInFrames={DURATION}
      fps={fps}
      width={width}
      height={height}
      defaultProps={{ card: fallback }}
    />
    {cards.map((card) => (
      <Composition
        key={card.id}
        id={`card-${card.id.replace(/_/g, "-")}`}
        component={PowerStreakCard}
        durationInFrames={DURATION}
        fps={fps}
        width={width}
        height={height}
        defaultProps={{ card }}
      />
    ))}
  </>
);
