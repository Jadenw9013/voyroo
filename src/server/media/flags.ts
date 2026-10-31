import "server-only";

export type MediaCapability = "memories" | "analysis" | "rendering";

/** Call at every future route/job boundary, after server-verified identity lookup.
 * Blank allowlists fail closed. Neither names nor public tokens are identities.
 * These gates do not replace trip membership, ownership or source eligibility.
 */
export function mediaFeatureEnabled(
  capability: MediaCapability,
  identity: { tripId: string; accountId?: string },
): boolean {
  const enabled = process.env.MEMORIES_ENABLED === "1";
  const trips = new Set((process.env.MEMORIES_PILOT_TRIP_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
  const accounts = new Set((process.env.MEMORIES_PILOT_ACCOUNT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
  if (!enabled || !trips.has(identity.tripId)) return false;
  // Guest collection viewing is trip-scoped. Mutations still require an account.
  if (identity.accountId && !accounts.has(identity.accountId)) return false;
  if (capability === "memories") return true;
  if (!identity.accountId) return false;
  return process.env[capability === "analysis" ? "RECAP_AI_ENABLED" : "RECAP_RENDERING_ENABLED"] === "1";
}
