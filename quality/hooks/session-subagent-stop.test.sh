#!/usr/bin/env bash
# SessionStart, SubagentStop and Stop hooks.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
export CLAUDE_PROJECT_DIR="$(pwd)"
TMP="$(mktemp -d)"

pass=0; fail=0
check() { # label expect actual
  if [ "$2" = "$3" ]; then printf 'ok    %-52s -> %s\n' "$1" "$3"; pass=$((pass+1));
  else printf 'WRONG %-52s -> %s (expected %s)\n' "$1" "$3" "$2"; fail=$((fail+1)); fi
}

transcript() { # file  text
  python3 -c '
import json,sys
open(sys.argv[1],"w").write(json.dumps({"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":sys.argv[2]}]}})+"\n")
' "$1" "$2"
}

echo "### SessionStart — loads the governing context"
out="$(./.claude/hooks/session-start.sh 2>&1)"
for needle in "SPEC.md" "CLAUDE.md" "EXECUTION_POLICY.md" "Scorecard" "Next action"; do
  printf '%s' "$out" | grep -q "$needle" && r=present || r=missing
  check "mentions $needle" present "$r"
done
printf '%s\n' "$out" | head -30 | sed 's/^/      /'

echo
echo "### SessionStart — shouts when the kill switch is on"
printf 'reason: hook demonstration\n' > ops/KILL_SWITCH
out="$(./.claude/hooks/session-start.sh 2>&1)"
printf '%s' "$out" | grep -q "KILL_SWITCH IS PRESENT" && r=warned || r=silent
check "warns about the kill switch" warned "$r"
printf '%s\n' "$out" | head -4 | sed 's/^/      /'
rm -f ops/KILL_SWITCH

echo
echo "### SubagentStop — an evidence path is required"
transcript "$TMP/t-noev.jsonl" "I reviewed the routes and everything looks fine."
rc=0; printf '{"transcript_path":"%s"}' "$TMP/t-noev.jsonl" | ./.claude/hooks/subagent-stop.sh >/dev/null 2>&1 || rc=$?
check "prose with no path is rejected" 2 "$rc"

transcript "$TMP/t-ev.jsonl" "Audit complete. Evidence: quality/route-audit.md — 19/19 clean."
rc=0; printf '{"transcript_path":"%s"}' "$TMP/t-ev.jsonl" | ./.claude/hooks/subagent-stop.sh >/dev/null 2>&1 || rc=$?
check "a repo-relative path is accepted" 0 "$rc"

transcript "$TMP/t-url.jsonl" "Deployed. https://restyle.co.il/sitemap.xml returns 200."
rc=0; printf '{"transcript_path":"%s"}' "$TMP/t-url.jsonl" | ./.claude/hooks/subagent-stop.sh >/dev/null 2>&1 || rc=$?
check "a URL is accepted" 0 "$rc"

echo
echo "### Stop — every response ends with a next action"
transcript "$TMP/t-nonext.jsonl" "Done. The build is green and the tests pass."
rc=0; printf '{"transcript_path":"%s"}' "$TMP/t-nonext.jsonl" | ./.claude/hooks/stop.sh >/dev/null 2>&1 || rc=$?
check "a response with no next action is rejected" 2 "$rc"

transcript "$TMP/t-next.jsonl" "Gate green.

Next action: run /go-no-go against production."
rc=0; printf '{"transcript_path":"%s"}' "$TMP/t-next.jsonl" | ./.claude/hooks/stop.sh >/dev/null 2>&1 || rc=$?
check "a response with a next action is accepted" 0 "$rc"

rc=0; printf '{"transcript_path":"%s","stop_hook_active":true}' "$TMP/t-nonext.jsonl" | ./.claude/hooks/stop.sh >/dev/null 2>&1 || rc=$?
check "does not re-block its own retry (no loop)" 0 "$rc"

echo
printf '%d correct, %d wrong\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
