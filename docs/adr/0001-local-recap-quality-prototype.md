# ADR 0001: prove the composition locally before hosted processing

Status: proposed for review, 2026-10-25.

The first recap deliverable needs evidence that real footage can make a good
15-second edit. A hosted queue/storage/gallery implementation would not answer
that question. Begin with an isolated Remotion 4 evaluation package, a manual
edit, full-image fallback, synthetic diagnostics and local MP4 export. The
same fixed composition and frame contract power interactive preview/export.

There is no processing inside Next request handlers. No paid model calls,
storage buckets or hosted worker are configured. The developer runs and waits
for a local process; it stages approved source copies, verifies output, checks
the input again, then publishes the file atomically. Closing the editor does
not interrupt the independent CLI process. A process/machine crash does not
resume; that is an explicit prototype limitation.

Remotion dependencies live in `video/recap/package.json` with a separate
lockfile, outside planner bundles/routes. It uses a special license; the pinned
license was read for evaluation, and commercial adoption remains a review
item. FFmpeg is an external executable with its own build/license obligations.
No browser render/export package or executable code comes from AI output.

Consequences: private trip authorization, direct uploads, metadata indexing,
quotas, deletion propagation, service-worker exclusions and persistent jobs
remain M2 work. The local manifest is an attestation, not an identity provider.
The workshop must stay on loopback and must never be deployed as a media API.

Before adding any hosted processing, a new ADR must select the durable queue
provider and persistent job store; specify idempotency scope, lease/heartbeat,
retryable errors and bounded backoff, expired-lease recovery, revision fencing,
cancellation/revocation, callback authentication, temporary-output cleanup and
atomic publish; define worker lifetime and concurrency/budgets; and estimate
cost from measured preparation/render durations plus queue/storage/egress and
licensing. R2 and Vercel Sandbox remain candidates from the handoff, with no
credentials or commercial commitments made here. Hosted cost is unmeasured.

Do not advance to public enablement after a technical render. Use permissioned
traveler examples and the evaluation protocol in `evals/recap/PROTOTYPE.md`.
