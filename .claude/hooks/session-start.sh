#!/usr/bin/env bash
# SessionStart — put the governing context in front of the session before it
# does anything, and shout if automation is stopped.
#
# A fresh session has no memory of this repository. Everything it needs to avoid
# violating the product is in SPEC.md and CLAUDE.md, so those are loaded first,
# not offered as suggested reading.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

emit() { printf '%s\n' "$1"; }

if [ -f ops/KILL_SWITCH ]; then
  emit "🛑 ops/KILL_SWITCH IS PRESENT — all cron jobs and subagents halt."
  emit "   Removing it is L5 (EXECUTION_POLICY.md). Do not remove it."
  sed 's/^/   | /' ops/KILL_SWITCH 2>/dev/null | head -5
  emit ""
fi

emit "── Restyle OS ──────────────────────────────────────────────"
emit "Constitution : CLAUDE.md (operator-authored; editing it is L5)"
emit "Spec         : SPEC.md — read it before touching anything"
emit "Autonomy     : EXECUTION_POLICY.md — active level L1 (branch, commit, draft PR)"
emit ""

if [ -f SPEC.md ]; then
  emit "SPEC.md invariants:"
  grep -E '^\s*[0-9]+\.\s+\*\*|^- \*\*' SPEC.md | sed 's/\*\*//g' | cut -c1-92 | head -14 | sed 's/^/  /'
  emit ""
fi

if [ -f quality/scorecard.json ]; then
  node -e '
    const fs = require("fs");
    try {
      const { entries = [] } = JSON.parse(fs.readFileSync("quality/scorecard.json", "utf8"));
      const last = entries[entries.length - 1];
      if (!last) { console.log("Scorecard    : no entries yet"); process.exit(0); }
      const { pass, fail, skipped } = last.counts;
      console.log(`Scorecard    : ${last.verdict.toUpperCase()} — ${pass} pass, ${fail} fail, ${skipped} skipped (${last.commit}, ${last.at.slice(0,10)})`);
      const bad = last.stages.filter((s) => s.status !== "pass");
      for (const s of bad) console.log(`  ${s.status === "fail" ? "✗" : "–"} ${s.id}: ${s.detail.slice(0, 78)}`);
      if (last.verdict !== "pass") console.log("  → not L2-eligible. A skipped stage is never a pass.");
    } catch (e) { console.log("Scorecard    : unreadable —", e.message); }
  ' 2>/dev/null
  emit ""
fi

if [ -f docs/PROGRESS.md ]; then
  emit "PROGRESS.md tail:"
  tail -6 docs/PROGRESS.md | sed 's/^/  /'
  emit ""
fi

emit "Skills: restyle-yagni · restyle-spec-discipline · restyle-feature-intake"
emit "        restyle-plan-execute · restyle-root-cause-debug · restyle-release-gate"
emit "        marketplace-db · nextjs-seo-engine · restyle-design-system"
emit "        hebrew-rtl-ui · restyle-e2e"
emit "Every response ends with: Next action: <the single next step>"
emit "────────────────────────────────────────────────────────────"
exit 0
