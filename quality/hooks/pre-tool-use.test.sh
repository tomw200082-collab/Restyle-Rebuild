#!/usr/bin/env bash
# Feeds crafted payloads to the Restyle PreToolUse hook and records the outcome.
#
# Lives outside the repository tree deliberately: the hook inspects the *tool
# call*, and running this file is one Bash call whose command is just a path, so
# the payloads inside it are never themselves the thing under test.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
export CLAUDE_PROJECT_DIR="$(pwd)"
HOOK=./.claude/hooks/pre-tool-use.sh

pass=0
fail=0

run() { # label | expect | json
  local label="$1" expect="$2" json="$3"
  local out rc verdict mark
  out="$(printf '%s' "$json" | "$HOOK" 2>&1)"; rc=$?
  verdict="ALLOWED"; [ $rc -eq 2 ] && verdict="BLOCKED"
  if [ "$verdict" = "$expect" ]; then mark="ok  "; pass=$((pass+1)); else mark="WRONG"; fail=$((fail+1)); fi
  printf '%s  %-46s -> %-7s (exit %d)\n' "$mark" "$label" "$verdict" "$rc"
  if [ "$verdict" = "BLOCKED" ]; then printf '%s\n' "$out" | head -1 | sed 's/^/         /'; fi
}

Q() { python3 -c 'import json,sys; print(json.dumps({"tool_name":sys.argv[1],"tool_input":{sys.argv[2]:sys.argv[3]}}))' "$@"; }
E() { python3 -c 'import json,sys; print(json.dumps({"tool_name":sys.argv[1],"tool_input":{"file_path":sys.argv[2],"old_string":"a","new_string":"b"}}))' "$@"; }

# Built from parts so the words never appear as literals in a shell command line.
D="D""ROP"; T="TRUN""CATE"; DEL="DEL""ETE"

echo "### 1 - the constitution is not editable"
run "Edit CLAUDE.md"                        BLOCKED "$(E Edit  "$PWD"/CLAUDE.md)"
run "Write CLAUDE.md"                       BLOCKED "$(E Write "$PWD"/CLAUDE.md)"
run "Edit SPEC.md (ordinary work)"          ALLOWED "$(E Edit  "$PWD"/SPEC.md)"
run "Edit EXECUTION_POLICY.md (L1, allowed)" ALLOWED "$(E Edit "$PWD"/EXECUTION_POLICY.md)"

echo
echo "### 2 - destructive SQL through the MCP"
run "$D TABLE"                              BLOCKED "$(Q mcp__sb__execute_sql query "$D TABLE listings;")"
run "$T"                                    BLOCKED "$(Q mcp__sb__execute_sql query "$T orders cascade;")"
run "$DEL with no WHERE"                    BLOCKED "$(Q mcp__sb__execute_sql query "$DEL FROM orders;")"
run "$D POLICY via apply_migration"         BLOCKED "$(Q mcp__sb__apply_migration query "$D POLICY p ON public.listings;")"

echo
echo "### 3 - legitimate SQL still runs"
run "$DEL with a WHERE"                     ALLOWED "$(Q mcp__sb__execute_sql query "$DEL FROM listings WHERE is_demo = true;")"
run "SELECT"                                ALLOWED "$(Q mcp__sb__execute_sql query "select count(*) from orders;")"
run "CREATE TABLE (a real migration)"       ALLOWED "$(Q mcp__sb__apply_migration query "create table public.x (id uuid primary key);")"

echo
echo "### 4 - Bash, including the false positive the first version had"
run "psql running a $D"                     BLOCKED "$(Q Bash command "psql \"\$DATABASE_URL\" -c \"$D TABLE listings;\"")"
run "grep that merely mentions $D"          ALLOWED "$(Q Bash command "grep -rn '$D TABLE' supabase/migrations")"
run "npm run build"                         ALLOWED "$(Q Bash command "npm run build")"
run "heredoc that merely contains one"      ALLOWED "$(Q Bash command "cat > README.md <<'"'"'EOF'"'"'
$D TABLE listings;
EOF")"

echo
printf '%d correct, %d wrong\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
