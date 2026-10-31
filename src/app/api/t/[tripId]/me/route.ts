import { NextResponse } from "next/server";
import { checkPasscode, hashPasscode, writeSession } from "@/server/auth";
import { firstName, getStore, jsonError, readJson, requester, requireSession } from "@/server/http";

const MAX_TRIES = 10;
const WINDOW_SECONDS = 15 * 60;

/** Body: { name } to change your name, or { passcode, newPasscode } to change the trip's passcode. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const parsed = await readJson(request, 2_000);
  if (!parsed.ok) return parsed.res;
  const { name, passcode, newPasscode } = parsed.body;

  if (newPasscode !== undefined) {
    if (typeof newPasscode !== "string" || newPasscode.trim().length < 4 || newPasscode.length > 100) {
      return jsonError(400, "The new passcode needs at least 4 characters.", { field: "newPasscode" });
    }
    const store = getStore();
    const stored = await store.getPass(tripId);
    // Changing it locks out anyone who hasn't joined yet, so it takes the current passcode, from
    // everyone but the Google account that made the trip (a planner trip's passcode is generated).
    const owner = !!auth.session.accountId && (await store.owner(tripId)) === auth.session.accountId;
    if (stored && !owner) {
      const failKey = `passcode:${tripId}:${await requester(request)}`;
      if ((await store.count(failKey)) >= MAX_TRIES) return jsonError(429, "Too many wrong passcodes. Wait 15 minutes and try again.");
      if (typeof passcode !== "string" || !(await checkPasscode(passcode.trim(), stored))) {
        await store.hit(failKey, WINDOW_SECONDS);
        return jsonError(403, "The current passcode doesn't match.", { field: "passcode" });
      }
    }
    await store.setPass(tripId, await hashPasscode(newPasscode.trim()));
    return NextResponse.json({ ok: true });
  }

  const who = firstName(name);
  if (!who) return jsonError(400, "Your first name, one word.", { field: "name" });
  await writeSession({ tripId, name: who });
  return NextResponse.json({ ok: true, name: who });
}
