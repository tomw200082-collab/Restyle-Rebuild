#!/usr/bin/env bash
# SubagentStop — a subagent that finishes without an evidence path has failed.
#
# A report is worth exactly what can be re-opened after the session ends. A
# prose summary with no path is indistinguishable from a plausible summary of
# work that was never done. CLAUDE.md §3.12.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

payload="$(cat)"

last_message="$(printf '%s' "$payload" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const direct = input.last_assistant_message ?? input.response ?? input.result ?? "";
      if (typeof direct === "string" && direct.trim()) return process.stdout.write(direct);

      // Fall back to the transcript when the payload does not carry the text.
      const path = input.transcript_path;
      if (!path) return process.stdout.write("");
      const fs = require("fs");
      const lines = fs.readFileSync(path, "utf8").trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        let entry;
        try { entry = JSON.parse(lines[i]); } catch { continue; }
        if (entry?.message?.role !== "assistant") continue;
        const content = entry.message.content;
        const text = typeof content === "string"
          ? content
          : (content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        if (text.trim()) return process.stdout.write(text);
      }
      process.stdout.write("");
    } catch { process.stdout.write(""); }
  });
' 2>/dev/null)"

# Nothing to judge — never block on our own inability to read the payload.
[ -z "$last_message" ] && exit 0

# An evidence path is a repo-relative file path, or a URL.
if printf '%s' "$last_message" | grep -qE '(^|[[:space:]`(])((quality|docs|brain|src|tests|scripts|supabase|\.claude)/[A-Za-z0-9._/-]+)|https?://[^[:space:]]+'; then
  exit 0
fi

echo "BLOCKED: this subagent finished without an evidence path." >&2
echo "Every subagent's final message must contain a file path, a command's output," >&2
echo "or a URL (CLAUDE.md §3.12). A summary with nothing to re-open is" >&2
echo "indistinguishable from a summary of work that was not done." >&2
echo "Write your findings to a file under quality/ and name that path." >&2
exit 2
