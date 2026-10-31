# Private 15-second recap evaluation — one export, one review

Status: **PENDING until a real traveler reviews this exact export.** Synthetic
tests, an MP4 render and an automated playback pass do not complete this form.
Keep filled forms, names, media, hashes and all review bundles in ignored
`video/recap/private/`. Use pseudonymous reviewer/collection IDs in aggregates.

## 1. Freeze the review input

- [ ] Record collection ID, template version, draft revision and export hash
      from the bundle. Confirm the review references `export.mp4`, not an older cut.
- [ ] Confirm contributor consent to local processing, private recap inclusion
      and evaluation viewing. Confirm no asset has been deleted or withdrawn.
- [ ] Confirm uploader IDs and explicit manual shot order. Inspect exclusions
      and must-include choices. Do not substitute a source silently.
- [ ] Compare each prepared source to its preserved original: orientation,
      full field of view, duration, natural colors/highlights/skin tones and sound.
      Confirm no GPS/capture metadata is present in derivatives or export.
- [ ] Treat absent/uncertain dates as uncertain. This cut invents no text and
      does not imply planned activities occurred. Flag any misleading sequence.
- [ ] Record actual replacements made during this review (IDs/reason and count).
      Keep the initial draft and each revised export; rerender/rebundle each revision.

## 2. Watch before inspecting

Watch once at normal speed, full-screen, with sound. Without opening the shot
list, ask the traveler: Would you share this? Does it represent the trip? What
important moment is missing? Which shots would you replace? Record their answers
before suggesting edits. Do not coach the answer toward a pass.

## 3. Shot-by-shot review

The contact sheet has start/middle/end frames for every shot. Watch the moving
source as well; three still frames cannot establish action completeness.

| Check | Pass evidence to record | Failure response |
| --- | --- | --- |
| Framing | Compare the full prepared source with all three export frames and playback. Faces, hands, group members and important objects stay visible for the entire shot; no important subject enters a cropped edge. | Use full-image framing, move crop, or replace the shot. Do not generate missing scenery or fill. |
| Action completeness | Note source start/end and the meaningful action's beginning, peak and completion. The selected segment includes enough lead-in and resolution. Slow/fast action looks natural after frame-rate conversion. | Move source start, adjust frame allocations in the saved draft, or choose another clip/photo. Do not count a mid-action freeze as complete. |
| Pacing | Readable photo holds; enough time for the eye to settle; cuts follow completed actions; no accidental repeats, jarring rhythm, unwanted flash/black frame or rushed ending. Watch at 1×, not only scrubbed. | Replace/rebalance shots while keeping exactly 450 frames. Record what changed. |
| Sound | Listen with headphones and phone speaker. Speech/natural sound is useful, not clipped or unexpectedly cut; no jump in level, distracting noise, accidental silent gap or lip/action-sync mismatch. Check the final second and intentional music-free variant. | Disable original audio, select a quieter useful segment, or replace. No production music until its export rights are documented. |

For each shot, enter framing/action/pacing/sound observations in `shotNotes`.
Use each criterion's `notes` for the overall decision and remaining problems.
Technical peak/stream-duration checks are supporting diagnostics, not sound review.

## 4. Physical mobile playback

Record actual device model, OS, browser/app and version, date and reviewer.
Emulation is useful but must be labeled **emulated** and does not satisfy this
gate. Check both an actual iPhone (Safari/Photos) and Android (Chrome/gallery).

- [ ] Transfer/download the MP4 privately; do not use the shared-credential Vercel previews.
- [ ] Open from the downloaded file and a private local transfer, if used. Confirm
      9:16 orientation, natural color, sharp enough subjects and no unexpected bars/crop.
- [ ] Play to the end, pause/resume, seek around each cut, replay and rotate the
      device. Check starts/ends, no black flash, decode error or stutter.
- [ ] Listen muted and unmuted, via speaker and headphones. Confirm A/V sync
      during retained speech/actions and no system playback error.
- [ ] Verify Save to Photos/gallery and sharing/import compatibility only in
      consented private/draft contexts. Do not publish or send to a social network.
- [ ] Confirm the export has 15 seconds/450 frames, but judge pacing with the
      traveler. Record platform-specific failures instead of passing the other device.

## 5. Record and reassess

Fill `review.json`: reviewer pseudonym, travelerReviewed, all five criteria,
physical device records, wouldShare, representsTrip, unauthorizedAssets,
inventedText, missingMoment, replacementCount and shotNotes. Leave unknowns
`pending`/`null`; never fill them from the technical report. Run `evaluate:summary`.
It reports an **accepted example**, pending, rejected or invalid/revoked; it
never declares the overall rendering style or production feature complete.

## 6. Evaluate the style across trips

Start with 3–5 permissioned collections, including portrait/landscape, photos,
moving clips, low-light/quiet footage and varied contributors. Reserve some
collections for evaluation rather than tuning. Record counts of independent
trips, reviewers and exports separately; several cuts of one trip are not several
independent trips. Expand toward approximately 20 varied collections before broad release.

Compare chronological and manually human-selected edits in this same style,
15-second duration and music choice. Randomize A/B presentation order and save
the mapping privately before review; do not tell the traveler which is which.
AI-selected comparison is deferred until a separately reviewed M4 change.
Record preference/ties, representation, missing moments, replacements and
shareability after at most two replacements, with denominator and unresolved
device failures. The proposed 80% gate is not demonstrated by a small pilot.
Zero unauthorized assets and invented captions are required. Do not proceed
to hosted storage/AI implementation or enablement on render success alone.
