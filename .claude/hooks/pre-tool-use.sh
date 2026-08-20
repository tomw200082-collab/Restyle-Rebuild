#!/usr/bin/env bash
# PreToolUse — two hard blocks that must not depend on an agent remembering them.
#
#   1. Any write to CLAUDE.md. The constitution is operator-authored; editing it
#      is L5. The request itself is logged, because a session asking to edit it
#      is information the operator should have.
#   2. Destructive SQL against production. DROP / TRUNCATE / DELETE-without-WHERE
#      outside supabase/migrations/.
#
# Exit 2 blocks the call and returns stderr to the model as the reason.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

payload="$(cat)"

field() {
  printf '%s' "$payload" | node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      try {
        const input = JSON.parse(raw);
        const path = process.argv[1].split(".");
        let value = input;
        for (const key of path) value = value?.[key];
        process.stdout.write(typeof value === "string" ? value : value == null ? "" : JSON.stringify(value));
      } catch { process.stdout.write(""); }
    });
  ' "$1" 2>/dev/null
}

tool="$(field tool_name)"

# ---------------------------------------------------------------- CLAUDE.md
case "$tool" in
  Edit|Write|NotebookEdit|MultiEdit)
    target="$(field tool_input.file_path)"
    case "$target" in
      */CLAUDE.md|CLAUDE.md)
        {
          printf '\n## %s — L5 REFUSED — attempt to edit CLAUDE.md\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
          printf -- '- **Actor:** agent session (tool: %s)\n' "$tool"
          printf -- '- **Evidence:** blocked by .claude/hooks/pre-tool-use.sh\n'
          printf -- '- **Notes:** CLAUDE.md is operator-authored. Request logged, not performed.\n'
        } >> AUTONOMY_LOG.md 2>/dev/null
        echo "BLOCKED: CLAUDE.md is edited only by the operator." >&2
        echo "Editing it is an L5 action (EXECUTION_POLICY.md) and is never autonomous." >&2
        echo "The request has been logged to AUTONOMY_LOG.md. Tell the operator what you" >&2
        echo "wanted changed and why, then continue with the rest of the work." >&2
        exit 2
        ;;
    esac
    ;;
esac

# ------------------------------------------------------------ destructive SQL
sql=""
case "$tool" in
  Bash)
    bash_command="$(field tool_input.command)"

    # A heredoc body is *data being written to a file*, not a command being run.
    # Scanning it is what makes this guard fire on documentation about itself —
    # which happened twice while it was being built: once on a test harness whose
    # command line quoted a keyword, and once on a README paragraph explaining
    # the rule. Both times the guard was right about the characters and wrong
    # about the intent, and a guard that blocks writing prose is a guard people
    # switch off. If destructive SQL is written into a file, that file is either
    # a migration (sanctioned) or a script — and running the script is itself a
    # Bash call, caught then, when it actually would do something.
    bash_command="$(printf '%s' "$bash_command" | node -e '
      let raw = "";
      process.stdin.on("data", (c) => (raw += c));
      process.stdin.on("end", () => {
        const lines = raw.split("\n");
        const out = [];
        let terminator = null;
        for (const line of lines) {
          if (terminator !== null) {
            if (line.trim() === terminator) terminator = null;
            continue;                       // drop the body
          }
          const m = /<<-?\s*[\x27"]?([A-Za-z_][A-Za-z0-9_]*)[\x27"]?/.exec(line);
          if (m) terminator = m[1];
          out.push(line);
        }
        process.stdout.write(out.join("\n"));
      });
    ' 2>/dev/null || printf '%s' "$bash_command")"

    # Of what remains, only inspect a command that actually *runs* SQL. Scanning
    # every command for these keywords blocks `grep -rn "…" supabase/migrations`
    # for no benefit.
    case "$bash_command" in
      *psql*|*"supabase db"*|*pg_dump*|*pg_restore*|*db-migrate*|*db-reset*)
        sql="$bash_command" ;;
    esac
    ;;
  *)
    # Covers the Supabase MCP's execute_sql / apply_migration.
    case "$tool" in
      *execute_sql*|*apply_migration*) sql="$(field tool_input.query)" ;;
    esac
    ;;
esac

if [ -n "$sql" ]; then
  # A migration file is the sanctioned place for DDL; it is reviewed, ordered,
  # and reversible by a forward migration. This guard is about ad-hoc SQL.
  case "$sql" in
    *supabase/migrations/*|*'-- migration'*) ;;
    *)
      upper="$(printf '%s' "$sql" | tr '[:lower:]' '[:upper:]' | tr '\n' ' ')"
      reason=""
      case "$upper" in
        *"DROP TABLE"*|*"DROP SCHEMA"*|*"DROP DATABASE"*|*"DROP FUNCTION"*|*"DROP POLICY"*)
          reason="a DROP" ;;
        *TRUNCATE*) reason="a TRUNCATE" ;;
      esac
      # DELETE with no WHERE anywhere after it.
      case "$upper" in
        *"DELETE FROM"*)
          case "$upper" in
            *"DELETE FROM"*WHERE*) ;;
            *) reason="a DELETE without a WHERE" ;;
          esac
          ;;
      esac

      if [ -n "$reason" ]; then
        echo "BLOCKED: this is $reason outside supabase/migrations/." >&2
        echo "Deleting or mutating production rows outside the state machines is L5" >&2
        echo "(EXECUTION_POLICY.md §L5.3) and is never autonomous." >&2
        echo "If this is a schema change, write it as a new migration file — an applied" >&2
        echo "migration is never edited, a correction is always a new one (CLAUDE.md §4)." >&2
        echo "If it is genuinely needed against production, hand the operator the exact" >&2
        echo "statement and stop." >&2
        exit 2
      fi
      ;;
  esac
fi

exit 0
