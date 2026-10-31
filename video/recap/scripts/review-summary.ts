import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assessReview, reviewSchema } from "../domain/review";
import { bindExport } from "./evaluate";
import { digest, inside } from "./local-media";

const totals = { pending: 0, rejected: 0, accepted: 0, invalidOrRevoked: 0 };
if (process.argv.length < 3) throw new Error("Pass one or more private/evaluations/<run> folders.");
for (const argument of process.argv.slice(2)) {
  try {
    const folder = await realpath(resolve(argument));
    if (!inside(await realpath("private/evaluations"), folder)) throw new Error("Not a private evaluation run.");
    const review = reviewSchema.parse(JSON.parse(await readFile(join(folder, "review.json"), "utf8")));
    const binding = JSON.parse(await readFile(join(folder, "binding.json"), "utf8"));
    const bound = await bindExport(binding.draftPath, binding.collectionPath, binding.exportPath);
    if (review.exportHash !== bound.exportHash || await digest(join(folder, "export.mp4")) !== bound.exportHash) throw new Error("The reviewed file changed.");
    const result = assessReview(review);
    totals[result === "accepted-example" ? "accepted" : result === "rejected-example" ? "rejected" : "pending"]++;
  } catch { totals.invalidOrRevoked++; }
}
console.log(JSON.stringify({ ...totals, sampleSize: process.argv.length - 2,
  creativeQualityGate: "not established by this summary; review varied permissioned traveler collections and baseline preferences",
  note: "No physical-device or traveler review is inferred from technical tests. Counts describe reviewed exports, not independent trips." }, null, 2));
if (totals.invalidOrRevoked) process.exitCode = 1;
