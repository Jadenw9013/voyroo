import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FORMAT, type Asset, type Collection, type Draft, type Shot, validateEdit } from "../domain/edit";

function ShotView({ shot, asset }: { shot: Shot; asset: Asset }) {
  const frame = useCurrentFrame();
  // A small photo move stays within the image; contain never loses its edges.
  const motion = shot.crop.layout === "cover" && asset.kind === "photo"
    ? interpolate(frame, [0, shot.duration - 1], [1, 1.025]) : 1;
  const style: CSSProperties = {
    width: "100%", height: "100%", objectFit: shot.crop.layout,
    objectPosition: `${shot.crop.x * 100}% ${shot.crop.y * 100}%`, transform: `scale(${motion})`,
  };
  return <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#e9edf3" }}>
    {asset.kind === "photo"
      ? <Img src={staticFile(asset.file)} style={style} />
      : <OffthreadVideo src={staticFile(asset.file)} startFrom={shot.sourceStart} endAt={shot.sourceStart + shot.duration}
          muted={!shot.originalAudio} volume={0.65} style={style} />}
  </AbsoluteFill>;
}

export function Recap({ collection, draft }: { collection: Collection; draft: Draft }) {
  validateEdit(collection, draft);
  return <AbsoluteFill style={{ backgroundColor: "#e9edf3" }}>
    {draft.shots.map((shot) => <Sequence key={`${shot.start}:${shot.assetId}`} from={shot.start} durationInFrames={shot.duration}>
      <ShotView shot={shot} asset={collection.assets.find((asset) => asset.id === shot.assetId)!} />
    </Sequence>)}
    {draft.audio === "fixture-score" && <Audio src={staticFile("fixtures/score.wav")}
      volume={(frame) => interpolate(frame, [0, 12, FORMAT.durationInFrames - 40, FORMAT.durationInFrames - 1], [0, 0.6, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />}
  </AbsoluteFill>;
}
