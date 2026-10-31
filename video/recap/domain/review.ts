import { z } from "zod";

export const criteria = ["framing", "actionCompleteness", "pacing", "sound", "mobilePlayback"] as const;
const decision = z.object({ result: z.enum(["pending", "pass", "fail"]), notes: z.string() }).strict();
export const reviewSchema = z.object({
  version: z.literal(1), exportHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewer: z.string(), travelerReviewed: z.boolean(),
  criteria: z.object({ framing: decision, actionCompleteness: decision, pacing: decision, sound: decision, mobilePlayback: decision }).strict(),
  devices: z.array(z.object({ platform: z.enum(["ios", "android"]), device: z.string(), browserVersion: z.string(),
    kind: z.enum(["physical", "emulated"]), result: z.enum(["pending", "pass", "fail"]), notes: z.string() }).strict()),
  wouldShare: z.boolean().nullable(), representsTrip: z.boolean().nullable(),
  unauthorizedAssets: z.boolean().nullable(), inventedText: z.boolean().nullable(),
  replacementCount: z.number().int().nonnegative(), missingMoment: z.string(),
  shotNotes: z.array(z.object({ shot: z.number().int().positive(), notes: z.string() }).strict()),
}).strict();
export type Review = z.infer<typeof reviewSchema>;

export function pendingReview(exportHash: string, shotCount: number): Review {
  return { version: 1, exportHash, reviewer: "", travelerReviewed: false,
    criteria: Object.fromEntries(criteria.map((key) => [key, { result: "pending", notes: "" }])) as Review["criteria"],
    devices: ["ios", "android"].map((platform) => ({ platform: platform as "ios" | "android", device: "", browserVersion: "", kind: "physical", result: "pending", notes: "" })),
    wouldShare: null, representsTrip: null, unauthorizedAssets: null, inventedText: null, replacementCount: 0,
    missingMoment: "", shotNotes: Array.from({ length: shotCount }, (_, index) => ({ shot: index + 1, notes: "" })) };
}

export function assessReview(raw: unknown): "pending" | "rejected-example" | "accepted-example" {
  const review = reviewSchema.parse(raw);
  if (review.unauthorizedAssets || review.inventedText || review.wouldShare === false || review.representsTrip === false || review.replacementCount > 2 || criteria.some((key) => review.criteria[key].result === "fail") || review.devices.some((device) => device.result === "fail")) return "rejected-example";
  if (!review.reviewer.trim() || !review.travelerReviewed || review.wouldShare === null || review.representsTrip === null || review.unauthorizedAssets === null || review.inventedText === null || criteria.some((key) => review.criteria[key].result !== "pass")) return "pending";
  for (const platform of ["ios", "android"] as const) {
    if (!review.devices.some((device) => device.platform === platform && device.kind === "physical" && device.result === "pass" && device.device.trim() && device.browserVersion.trim())) return "pending";
  }
  return "accepted-example";
}
