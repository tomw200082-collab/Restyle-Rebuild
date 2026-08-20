#!/usr/bin/env bash
# Stop — every response ends with "Next action: <the single next step>".
#
# No dead air. A response that ends without naming the next step leaves the
# operator to work out where things stand, which is the cost this rule exists to
# remove. Run-2 operating protocol, CLAUDE.md §5.7.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

payload="$(cat)"

# A hook that blocked and then re-blocked its own retry would loop forever.
already_blocking="$(printf '%s' "$payload" | node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try { const i = JSON.parse(raw); process.stdout.write(i.stop_hook_active ? "1" : ""); }
    catch { process.stdout.write(""); }
  });
' 2>/dev/null)"
[ -n "$already_blocking" ] && exit 0

last_message="$(printf '%s' "$payload" | node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
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

[ -z "$last_message" ] && exit 0

if printf '%s' "$last_message" | grep -qiE 'next action[[:space:]]*:'; then
  exit 0
fi

echo "Your response did not end with a next action." >&2
echo "Add a final line: 'Next action: <the single next step>' — one step, concrete." >&2
echo "If the work is finished, say what the operator should do with it." >&2
exit 2
