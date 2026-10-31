# Vercel controls and Preview isolation audit

Observed 2026-10-26 UTC (2026-10-25 America/Los_Angeles). **Preview credential
isolation fails. No permissioned footage or production-data tests may use
these Preview deployments.** No Vercel setting, secret, domain or deployment
was changed by this audit.

Machine-readable, value-free evidence:
[recap-vercel-audit-2026-10-26.json](evidence/recap-vercel-audit-2026-10-26.json).
Project `voyroo`, `prj_ZLxbK1uOHBb49fxLNpo4MAZnqeGZ`.

## Verified controls

| Control | Observed evidence | Meaning |
| --- | --- | --- |
| Git production branch | `main` in project `link.productionBranch` | Normal Git branch builds target Production only from main; this is not a manual-promotion restriction. |
| Production domains | Auto-assignment enabled; voyroo.com redirects to www.voyroo.com; neither has a branch override | A successful production build normally receives the production domain. No staging-only release gate is configured here. |
| Vercel project checks | GET `/v2/projects/{id}/checks` returned `checks: []` | No configured Vercel project check gate was found. The sampled preview deployment's legacy checks list is also empty. |
| Preview access | `ssoProtection.deploymentType=all_except_custom_domains` | Vercel Authentication protects default deployment URLs. Anonymous HEAD to the prior prototype preview returned 302 to vercel.com; production returned 200. No app/trip body was read. |
| Fork/deploy hooks | Fork protection enabled; zero deploy hooks | These controls do not isolate credentials or stop an authorized manual production promotion. |
| Current operator | Vercel team role OWNER | The operator can manage production/promote. No denial or promotion experiment was performed. |
| GitHub main | Three strict required checks, one approving review, admins included, force pushes disabled, read back by API | Protects Git merges/direct updates; it does not gate owner actions in Vercel. |
| Prior feature deployments | Eight sampled feature/documentation deployments had no production target; GitHub recorded Preview | No sampled feature branch was promoted by this work. This is historical evidence, not a universal prevention guarantee. |

Vercel [manual promotion](https://vercel.com/docs/cli/promote) and
[owner permissions](https://vercel.com/docs/rbac/access-roles) permit a path
outside GitHub merge protection. [Deployment Checks](https://vercel.com/docs/deployment-checks)
can gate domain promotion, and privileged users can bypass checks. Authentication
for a deployment's visitors is a separate control from deployment authorization.
No claim is made that production promotion is impossible.

## Verified credential scopes — failed isolation

The environment metadata API was called with decryption disabled. The same
environment-variable records target both Production and Preview, with **zero
branch overrides**:

- `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`.
- `REDIS_URL`, `KV_URL`.
- `SESSION_SECRET`, `GEMINI_API_KEY`, legacy `TRIP_PASSPHRASE`.

These are shared configured credentials, not merely similar variable names.
The existing app consumes KV_REST_API_URL/TOKEN, so this is a live storage-access
concern. Session-signing and model-spend credentials are shared as well. Host-only
browser cookies and Vercel Authentication do not separate the backing database
or credentials available to a preview build/function.

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and
`ALLOW_MEMORY_STORE` are Production-only in the observed metadata. No R2/media
credentials or media-enable flags were configured. OAuth credentials being
Production-only does not fix Redis/session/model sharing.

No values were decrypted, printed, hashed, pulled to .env files, or committed.
No credential-bearing provider payload, bypass URL, deploy-hook URL, auth-file
contents, account UID or raw API response is included. The committed audit
script emits an explicit allowlist of metadata; redaction tests include sentinel
values in nested provider fields. Audit data proves shared scopes without
contacting Redis, Gemini, private trips or an authenticated preview app.

## Containment and reviewed follow-up

`vercel.json` disables automatic Git deployments for exactly the new audit,
quality-evaluation, and handoff-documentation branches. All other branches keep
their existing behavior, including main. These branch rules are a temporary
local-work containment measure using documented
[git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration),
not a credential-isolation fix, a CLI/API deployment restriction, or revocation
of previous previews. Check the deployment list after each push. Do not launch
the local workshop on Vercel or create a preview to test private imports.

Before any hosted preview/pilot, prepare and review a separate infrastructure
change that:

1. Creates a separate Preview database and credentials; the current trip store
   has no environment namespace setting, so adding a label is insufficient.
   Alternatively use an explicitly disposable in-memory preview with no live
   provider access. No production database migration is needed for this audit.
2. Gives Preview a distinct session secret and no production Gemini key. Use
   an isolated model project/budget if provider testing is later authorized.
3. Removes Preview targets from existing production credential records while
   preserving Production values and sessions. Do not casually rotate the
   production session secret: that signs out existing members.
4. Reviews already-built previews, which retain their captured configuration.
   Restrict/delete/rebuild them and plan any necessary credential rotation
   separately, accounting for production continuity. This audit performs none
   of those mutations.
5. Adds the intended Vercel production checks after the CI foundation is merged;
   reviews owner/member/production-deployment permissions, force-promotion and
   token access. Keep the explicit no-production-promotion operating rule.
6. Repeats this metadata audit and verifies independent backend identity and
   limited credentials in an isolated environment. Disjoint variable scopes
   alone are not proof that different records contain different credentials.

This work does not implement M2 storage or hosted jobs/AI. Local M1 evaluation
can continue without Vercel/Redis/model credentials.

## Repeat audit and validation

```powershell
python -m unittest discover -s scripts -p test_audit_recap_vercel.py
python scripts/audit-recap-vercel.py docs/evidence/NEW-UNIQUE-OUTPUT.json
```

The script uses an already authenticated Vercel CLI token in process memory or
`VERCEL_TOKEN`; never pass a token on the command line. It issues GETs only,
refuses redirects with credentials and creates output exclusively. Review the
sanitized JSON before adding it. Windows CLI auth is discovered automatically;
on other systems use a locally provided environment token without logging it.

Executed: live read-only audit, anonymous HEAD access checks, GitHub protection
readback and two redaction/verdict tests passed. No deployment, promotion,
rollback drill or production-data test was run. Rollback for this PR: revert
the report/tool and exact branch rules if approved; that does not remediate
shared credentials or invalidate existing previews.
