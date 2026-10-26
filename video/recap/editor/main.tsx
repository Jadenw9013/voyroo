import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Recap } from "../composition/Recap";
import { FORMAT, TEMPLATE, collectionSchema, type Collection, type Draft, validateEdit, replaceShot } from "../domain/edit";
import collectionJson from "../fixtures/collection.json";
import draftJson from "../fixtures/mixed-media.json";
import "./style.css";

const initial = validateEdit(collectionJson, draftJson);
function downloadJson(draft: Draft) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2) + "\n"], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `recap-revision-${draft.revision}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Editor() {
  const [collection, setCollection] = useState<Collection>(initial.collection);
  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const player = useRef<PlayerRef>(null);
  const shot = draft.shots[selected];
  const asset = collection.assets.find((candidate) => candidate.id === shot.assetId)!;
  function update(next: Draft) {
    try { setDraft(validateEdit(collection, next).draft); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The edit is invalid."); }
  }
  async function openFile(file: File | undefined, kind: "collection" | "draft") {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (kind === "draft") { setDraft(validateEdit(collection, json).draft); }
      else {
        const nextCollection = collectionSchema.parse(json);
        const ready = nextCollection.assets.filter((candidate) => candidate.ready && candidate.recapAllowed && !candidate.deleted).slice(0, 6);
        if (ready.length < 3) throw new Error("Add at least three permitted, ready assets for this prototype.");
        let start = 0;
        const next: Draft = { tripId: nextCollection.tripId, creatorAccountId: nextCollection.accountId, revision: 1, template: TEMPLATE, mustInclude: [], excluded: [], audio: "none", shots: ready.map((candidate, index) => {
          const duration = Math.floor(450 / ready.length) + (index < 450 % ready.length ? 1 : 0);
          const nextShot = { assetId: candidate.id, assetVersion: candidate.version, start, duration, sourceStart: 0, crop: { layout: "contain" as const, x: 0.5, y: 0.5 }, transition: "cut" as const, originalAudio: false };
          start += duration; return nextShot;
        }) };
        validateEdit(nextCollection, next); setCollection(nextCollection); setDraft(next);
      }
      setSelected(0); setError(""); player.current?.pause(); player.current?.seekTo(0);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The file could not be opened."); }
  }
  const modifyShot = (changes: Partial<typeof shot>) => update({ ...draft, revision: draft.revision + 1, shots: draft.shots.map((candidate, i) => i === selected ? { ...candidate, ...changes } : candidate) });
  return <>
    <header><a className="wordmark" href="/">Voyroo</a><span>Recap workshop</span><span className="local">Local prototype</span></header>
    <main>
      <div className="intro"><div><h1>Keep the moments<br /> that feel like your trip.</h1><p>Choose the shots. Give them room. Make fifteen seconds yours.</p></div><button className="primary" onClick={() => downloadJson(draft)}>Save edit for export</button></div>
      <p className="notice">This workshop runs on your computer. The default collection is synthetic test media. Real media needs contributor consent and a local collection manifest.</p>
      <div className="workspace">
        <section className="preview" aria-label="Recap preview">
          <Player ref={player} component={Recap} inputProps={{ collection, draft }} {...FORMAT} compositionWidth={FORMAT.width} compositionHeight={FORMAT.height}
            controls style={{ width: "100%", aspectRatio: "9/16" }} acknowledgeRemotionLicense />
          <p>15 seconds <span>9:16 vertical · revision {draft.revision}</span></p>
        </section>
        <section className="editing" aria-label="Edit your recap">
          <h2>Your little moments</h2><p className="hint">Select a shot to replace it or adjust its framing.</p>
          <ol className="filmstrip">{draft.shots.map((candidate, index) => {
            const media = collection.assets.find((item) => item.id === candidate.assetId)!;
            return <li key={candidate.start}><button aria-label={`Edit shot ${index+1}`} aria-pressed={selected === index} onClick={() => { setSelected(index); player.current?.pause(); player.current?.seekTo(candidate.start); }}>
              {media.kind === "photo" ? <img src={`/${media.file}`} alt="" /> : <video src={`/${media.file}#t=0.1`} muted preload="metadata" />}
              <span>{index+1}<small>{candidate.duration / 30}s</small></span>
            </button></li>;
          })}</ol>
          <div className="shot-heading"><h2>Shot {selected+1}</h2><span>{asset.kind === "photo" ? "Photo" : "Video"} · {shot.duration / 30}s</span></div>
          <label>Replace this shot<select value={shot.assetId} onChange={(event) => {
            try { update(replaceShot(collection, draft, selected, event.target.value)); } catch (failure) { setError((failure as Error).message); }
          }}>{collection.assets.filter((candidate) => candidate.ready && candidate.recapAllowed && !candidate.deleted).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.id}</option>)}</select></label>
          <div className="framing"><label>Framing<select aria-label="Framing" value={shot.crop.layout} onChange={(event) => modifyShot({ crop: { ...shot.crop, layout: event.target.value as "contain" | "cover" } })}><option value="contain">Keep the full image</option><option value="cover">Fill the portrait frame</option></select></label>
            <label className="checkbox"><input type="checkbox" checked={draft.mustInclude.includes(shot.assetId)} onChange={(event) => update({ ...draft, revision: draft.revision+1, mustInclude: event.target.checked ? [...draft.mustInclude, shot.assetId] : draft.mustInclude.filter((id) => id !== shot.assetId) })} />Must include this moment</label>
          </div>
          {shot.crop.layout === "cover" && <div className="sliders">{(["x", "y"] as const).map((axis) => <label key={axis}>{axis === "x" ? "Horizontal crop" : "Vertical crop"}<input type="range" min="0" max="1" step="0.01" value={shot.crop[axis]} onChange={(event) => modifyShot({ crop: { ...shot.crop, [axis]: Number(event.target.value) } })} /></label>)}</div>}
          {asset.kind === "video" && <div className="framing"><label>Start in source (frames)<input type="number" min="0" max={(asset.durationFrames ?? 0)-shot.duration} value={shot.sourceStart} onChange={(event) => modifyShot({ sourceStart: Number(event.target.value) })} /></label><label className="checkbox"><input type="checkbox" checked={shot.originalAudio} onChange={(event) => modifyShot({ originalAudio: event.target.checked })} />Keep original sound</label></div>}
          <label>Soundtrack<select value={draft.audio} onChange={(event) => update({ ...draft, revision: draft.revision+1, audio: event.target.value as Draft["audio"] })}><option value="none">Music-free</option><option value="fixture-score">Diagnostic score (synthetic examples)</option></select></label>
          <details><summary>Excluded moments and local files</summary><label>Excluded asset IDs (comma separated)<input key={draft.excluded.join(",")} defaultValue={draft.excluded.join(", ")} onBlur={(event) => update({ ...draft, revision: draft.revision+1, excluded: event.target.value.split(",").map((id) => id.trim()).filter(Boolean) })} /></label><p className="hint">Replace a selected moment before excluding it. Must-include moments stay until you uncheck them.</p>
            <div className="file-controls"><label>Open collection<input type="file" accept="application/json,.json" onChange={(event) => void openFile(event.target.files?.[0], "collection")} /></label><label>Open saved edit<input type="file" accept="application/json,.json" onChange={(event) => void openFile(event.target.files?.[0], "draft")} /></label></div>
          </details>
          <p className="error" role="alert">{error}</p>
          <p className="hint">Save your edit, then render it with the local command in the setup guide. MP4 export is local; closing this page doesn’t interrupt a running command.</p>
        </section>
      </div>
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(<Editor />);
