# Memories foundation and repository gates

## Status and branch dependencies

2026-10-25: M0 foundation prepared on `chore/recap-ci-foundation`, stacked
on `docs/memories-recap-plan` (PR #4). No media endpoint, upload, private
storage, hosted worker, AI analysis or product UI is enabled by this change.
The local rendering prototype is the next separate PR. Do not merge a stack
out of order; retarget each child to main after its parent merges.

## Baseline and isolated checks

At f41c0b5, in a fresh worktree without .env.local: `npm ci` passed (462
packages), lint and typecheck passed, 99 unit/API tests passed. Production
E2E built successfully; 3/4 passed, with the public-preview test expecting
the outdated `View-only itinerary` label. The live page says `Shared Travel
Guide`. Both browser suites now assert that label while retaining their
privacy, unauthorized mutation, refresh and revocation assertions.

Use `npm run ci:checks`, `npm run ci:browser`, and `npm run e2e:production`.
The wrapper clears inherited provider credentials, supplies explicit empty
provider settings to override Next .env loading, and disables media flags.
The production command builds exactly once. CI runs each suite in a separate
job/checkout, so .next and .next-e2e outputs cannot collide. The browser
configs refuse existing servers; production OAuth uses the local fixture.
No real Gemini, R2, renderer or production database is configured in CI.
Keep private media, credentials and signed URLs out of test artifacts.

CI uses read-only contents permission, disables persisted checkout credentials,
pins action commit SHAs and uses the committed npm lockfile. Browser failure
reports are retained seven days. No secret context or pull_request_target.

## Flags and future route/worker obligations

`src/server/media/flags.ts` is server-only and evaluated at call time.
All flags require the literal value `1`. Blank allowlists fail closed.
The master switch is `MEMORIES_ENABLED`; independent child switches are
`RECAP_AI_ENABLED` and `RECAP_RENDERING_ENABLED`. Configure comma-separated
`MEMORIES_PILOT_TRIP_IDS` and `MEMORIES_PILOT_ACCOUNT_IDS`. For signed-in
participants both lists must match. Existing authorized guests may view an
allowlisted trip collection when future viewing APIs are added. Guests may
never analyze or render. The caller must verify membership first; this helper
does not authorize anyone and must never receive identities from request bodies.

Every future media route and job claim must call the gate as well as check
membership, ownership and current asset permissions. There are no media routes
or workers yet. No media credentials are needed to run the existing planner.

## Verified remote settings

GitHub API audit on 2026-10-25 at f41c0b5 found no Actions workflows, checks,
branch protection or rulesets. Existing Vercel status was successful and the
latest deployment was recorded as Production. GitHub Preview and Production
environments had no protection rules or branch policies.

With repository admin permission, main branch protection was configured and
read back: strict required checks `Static and unit`, `Browser (dev)`,
`Browser (production)`; one approving review with stale approvals dismissed;
conversation resolution required; admins included; force pushes and deletion
disabled. These check names first become available with this CI PR. PR #4
does not contain CI, so these checks will remain pending on it until CI is
present in its head; never bypass the review/check requirements to merge it.

Vercel project settings, its production-branch selection, deployment promotion
controls and Preview credentials have NOT been independently verified in this
session. GitHub branch protection does not prevent manual Vercel promotion.
Do not deploy or enable memories until those settings are audited. The GitHub
environment currently supplies no additional production deployment gate.

## Rollback and remaining work

Disable all three flags, then stop/drain future workers before rolling versions
back. This PR has no workers, migrations or media data to roll back; reverting
the runtime changes restores the original planner. Retain CI and main branch
protection. A future faulty export requires revocation and eligibility checks;
a UI-only flag will not suffice. Verify sign-in, itinerary editing and public
previews after any rollback.

Outstanding: complete browser verification and remote CI, deterministic M1
renders with quality evidence, licensed soundtrack provenance, infrastructure
ADR, private storage and jobs, gallery, AI and traveler evaluation. Hosting
cost, accepted-export cost and hosted latency are unmeasured.
