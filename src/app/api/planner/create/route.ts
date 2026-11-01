import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { stripCards, tripProblems } from "@/domain/change";
import { PlannerSnapshotSchema, plannerProblems, plannerTrip } from "@/domain/planner";
import { isZone } from "@/domain/time";
import { hashPasscode, newTripId, readAccount, readSession, writeSession } from "@/server/auth";
import { firstName, getStore, jsonError, rateLimit, readJson, sameSite } from "@/server/http";
import { resolveContextualPhotoUrl } from "@/server/photos";

const schema = z.object({ snapshot: PlannerSnapshotSchema, homeTz: z.string().refine(isZone), homeCurrency: z.string().regex(/^[A-Z]{3}$/) });

export async function POST(request: Request) {
  const denied = sameSite(request);
  if (denied) return denied;
  const limited = await rateLimit(request, "trips", 20, 3600, "That's a lot of new trips this hour. Try again later.");
  if (limited) return limited;
  const body = await readJson(request, 100_000);
  if (!body.ok) return body.res;
  const parsed = schema.safeParse(JSON.parse(stripCards(JSON.stringify(body.body))));
  if (!parsed.success) return jsonError(400, "This draft needs a correction before it can be saved.");
  const { snapshot, homeTz, homeCurrency } = parsed.data;
  const account = await readAccount();
  const name = firstName(account?.name.split(/\s+/)[0]) || snapshot.draft?.travelerName || "";
  const problems = plannerProblems(snapshot.draft, name);
  if (problems.length) return jsonError(400, problems.join(" "));
  const suffix = createHash("sha256").update(`${account?.id || "guest"}:${snapshot.id}`).digest("hex").slice(0, 16);
  const id = newTripId(snapshot.draft!.name || snapshot.draft!.destination!).replace(/-[^-]+$/, `-${suffix}`);
  const trip = plannerTrip(snapshot.draft!, { id, name, homeTz, homeCurrency });
  trip.people = name ? [name] : [];
  if (!trip.cover) {
    const resolvedCover = await resolveContextualPhotoUrl({
      title: trip.name,
      dest: trip.destination,
      kind: "destination",
    });
    if (resolvedCover && /^https:\/\//.test(resolvedCover)) {
      trip.cover = resolvedCover;
    }
  }
  const issues = tripProblems(trip);
  if (issues.length) return jsonError(400, issues.join(" "));
  const existing = await getStore().get(id);
  if (existing) return await readSession(id) ? NextResponse.json({ ok: true, id, passcode: null }) : jsonError(409, "This trip has already been saved. Open it from Your trips.");
  const passcode = randomBytes(9).toString("base64url");
  if (!await getStore().create(trip, await hashPasscode(passcode), account?.id)) return jsonError(409, "This trip is already being saved. Try again.");
  await writeSession({ tripId: id, name });
  if (account) await getStore().setPlanner(account.id, "");
  return NextResponse.json({ ok: true, id, passcode }, { headers: { "Cache-Control": "no-store" } });
}
