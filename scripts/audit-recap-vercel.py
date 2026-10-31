"""Read-only Vercel audit. Print/store ONLY allowlisted metadata, never values.

Run with Python 3: python scripts/audit-recap-vercel.py [safe-output.json]
Uses the existing Vercel CLI auth file or VERCEL_TOKEN in process memory.
Does not decrypt envs, invoke a deployment, query Redis, or call a model.
"""
import datetime
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "prj_ZLxbK1uOHBb49fxLNpo4MAZnqeGZ"
TEAM = "team_Uo9x4ly6kGaJcAKE5F2u1ZkY"


def sanitize(project, envs, checks, team, deployments):
    rows = [{"key": e["key"], "targets": sorted(e.get("target") or []),
             "gitBranch": e.get("gitBranch"), "type": e.get("type"),
             "customEnvironmentIds": e.get("customEnvironmentIds") or []}
            for e in envs.get("envs", [])]
    shared = sorted(e["key"] for e in rows if "preview" in e["targets"] and "production" in e["targets"])
    link = project.get("link") or {}
    return {
        "observedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "project": project["name"], "projectId": project["id"],
        "productionBranch": link.get("productionBranch"),
        "autoAssignCustomDomains": project.get("autoAssignCustomDomains"),
        "authenticationDeploymentType": (project.get("ssoProtection") or {}).get("deploymentType"),
        "gitForkProtection": project.get("gitForkProtection"),
        "deployHookCount": len(link.get("deployHooks") or []),
        "configuredProjectCheckCount": len(checks["checks"]),
        "checkNames": [c.get("name") for c in checks["checks"]],
        "auditorTeamRole": (team.get("membership") or {}).get("role"),
        "envScopes": sorted(rows, key=lambda e: (e["key"], e["gitBranch"] or "")),
        "sharedProductionPreviewKeys": shared,
        "branchOverrideCount": sum(bool(e["gitBranch"]) for e in rows),
        "isolationVerdict": "FAIL_SHARED_SCOPES" if shared else "REQUIRES_INDEPENDENT_BACKEND_VERIFICATION",
        "recentDeployments": [{"id": d["uid"], "target": d.get("target") or "preview",
                               "state": d.get("readyState"),
                               "branch": (d.get("meta") or {}).get("githubCommitRef"),
                               "sha": (d.get("meta") or {}).get("githubCommitSha")}
                              for d in deployments.get("deployments", [])],
        "limitations": ["Metadata only: no env values, decryption, value hashes, or secret identifiers recorded.",
                        "No authenticated app/Redis/model requests; no promotion or bypass drill.",
                        "Removing shared targets alone does not prove independent backend/credential identity.",
                        "Project configuration does not retroactively remove secrets from existing deployments."],
    }


def run():
    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        auth = Path(os.environ.get("APPDATA", str(Path.home() / ".config"))) / "com.vercel.cli" / "Data" / "auth.json"
        token = json.loads(auth.read_text(encoding="utf-8"))["token"]
    # Do not forward credentials through redirects, even to a storage host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(NoRedirect)

    def get(path, extra=None):
        query = urllib.parse.urlencode({"teamId": TEAM, **(extra or {})})
        request = urllib.request.Request("https://api.vercel.com" + path + "?" + query,
                                         headers={"Authorization": "Bearer " + token, "Cache-Control": "no-cache"})
        with opener.open(request, timeout=30) as response:
            return json.load(response)

    result = sanitize(get("/v9/projects/" + PROJECT),
                      get("/v10/projects/" + PROJECT + "/env", {"decrypt": "false"}),
                      get("/v2/projects/" + PROJECT + "/checks"), get("/v2/teams/" + TEAM),
                      get("/v6/deployments", {"projectId": PROJECT, "limit": 8}))
    safe = json.dumps(result, indent=2) + "\n"
    if len(sys.argv) > 1:
        # Exclusive creation avoids replacing earlier evidence/user files.
        with open(sys.argv[1], "x", encoding="utf-8", newline="\n") as handle:
            handle.write(safe)
    print(safe)


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        # Provider bodies/URLs and auth-file contents are intentionally omitted.
        status = error.code if isinstance(error, urllib.error.HTTPError) else None
        print(json.dumps({"auditFailed": type(error).__name__, "httpStatus": status}), file=sys.stderr)
        sys.exit(1)
