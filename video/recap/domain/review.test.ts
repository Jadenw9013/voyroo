import { test } from "node:test";
import assert from "node:assert/strict";
import { assessReview, criteria, pendingReview } from "./review";

test("technical success cannot fill in creative/physical-device assessments", () => {
  const review = pendingReview("a".repeat(64), 6);
  assert.equal(assessReview(review), "pending");
  for (const key of criteria) review.criteria[key].result = "pass";
  review.reviewer = "traveler-pseudonym"; review.travelerReviewed = true;
  review.wouldShare = true; review.representsTrip = true; review.unauthorizedAssets = false; review.inventedText = false;
  for (const device of review.devices) { device.kind = "emulated"; device.result = "pass"; device.device = "synthetic"; device.browserVersion = "test"; }
  assert.equal(assessReview(review), "pending");
  for (const device of review.devices) device.kind = "physical";
  assert.equal(assessReview(review), "accepted-example");
  review.criteria.actionCompleteness.result = "fail";
  assert.equal(assessReview(review), "rejected-example");
});

test("unauthorized assets, invented text and more than two replacements reject the example", () => {
  for (const changes of [{ unauthorizedAssets: true }, { inventedText: true }, { replacementCount: 3 }]) {
    assert.equal(assessReview({ ...pendingReview("a".repeat(64), 6), ...changes }), "rejected-example");
  }
});
