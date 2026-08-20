/**
 * Renders `quality/scorecard.json` as markdown, and diffs the last two entries.
 *
 *   npm run scorecard              latest entry, plus a diff against the previous
 *   npm run scorecard -- --latest  latest entry only
 *
 * Used by the `/scorecard` command and by release-gate.yml's job summary, so the
 * PR comment and the local report say the same thing in the same words.
 *
 * This started life as a `node -e` inline in the workflow. It moved here because
 * shellcheck was right: a JS template literal inside a single-quoted shell
 * string is indistinguishable from a shell expansion that will not expand, and
 * the two only stay distinguishable while someone remembers which is which.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCORECARD = join(ROOT, 'quality', 'scorecard.json');

type Stage = {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skipped';
  detail: string;
  durationMs: number;
  metrics?: Record<string, number | string | undefined>;
};

type Entry = {
  at: string;
  commit: string;
  branch: string;
  verdict: 'pass' | 'fail';
  complete: boolean;
  counts: { pass: number; fail: number; skipped: number };
  target: string;
  stages: Stage[];
};

const ICON: Record<Stage['status'], string> = { pass: '✅', fail: '❌', skipped: '⏭️' };

/** Escapes a cell so a detail containing a pipe cannot break the table. */
const cell = (text: string) => text.replace(/\|/g, '\\|');

function renderEntry(entry: Entry): string[] {
  const { pass, fail, skipped } = entry.counts;
  const out = [
    `## Release gate — \`${entry.verdict.toUpperCase()}\``,
    '',
    `${pass} passed · ${fail} failed · ${skipped} skipped — commit \`${entry.commit}\` on \`${entry.branch}\``,
    `Target: \`${entry.target}\``,
    '',
    '| stage | status | detail |',
    '|---|---|---|',
  ];
  for (const stage of entry.stages) {
    out.push(`| \`${stage.id}\` | ${ICON[stage.status]} ${stage.status} | ${cell(stage.detail)} |`);
  }
  if (entry.verdict !== 'pass') {
    out.push('', '**Not eligible for L2.** A skipped stage is never a pass — `EXECUTION_POLICY.md` §L2.');
  } else if (!entry.complete) {
    out.push('', '_Verdict is `pass` but `complete` is false: part of the picture is missing._');
  }
  return out;
}

function numericMetrics(stage: Stage | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(stage?.metrics ?? {})) {
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

function renderDiff(previous: Entry, latest: Entry): string[] {
  const out = ['', '## Change since the previous run', ''];

  if (previous.target !== latest.target) {
    // Said first, because it invalidates every comparison below it. A green run
    // against an empty database measured less than a green run against a full
    // one, and the two are not comparable.
    out.push(
      `> ⚠️ **Different targets.** \`${previous.target}\` → \`${latest.target}\`.`,
      '> These runs measured different data; treat the comparison as indicative only.',
      '',
    );
  }

  if (previous.verdict !== latest.verdict) {
    out.push(`**Verdict: ${previous.verdict} → ${latest.verdict}**`, '');
  }

  const transitions: string[] = [];
  for (const stage of latest.stages) {
    const before = previous.stages.find((s) => s.id === stage.id);
    if (!before) {
      transitions.push(`- \`${stage.id}\` — **new stage**, ${stage.status}`);
      continue;
    }
    if (before.status === stage.status) continue;

    if (before.status === 'pass' && stage.status === 'fail') {
      transitions.push(`- ❌ \`${stage.id}\` — **regression**: passed before, fails now. ${cell(stage.detail)}`);
    } else if (stage.status === 'pass') {
      transitions.push(`- ✅ \`${stage.id}\` — ${before.status} → pass`);
    } else if (stage.status === 'skipped' && before.status === 'pass') {
      // Easy to miss, and it reads as "nothing broke", which is a different
      // thing from "nothing was checked".
      transitions.push(`- ⚠️ \`${stage.id}\` — **coverage lost**: passed before, skipped now. ${cell(stage.detail)}`);
    } else {
      transitions.push(`- \`${stage.id}\` — ${before.status} → ${stage.status}`);
    }
  }
  for (const before of previous.stages) {
    if (!latest.stages.some((s) => s.id === before.id)) {
      transitions.push(`- ⚠️ \`${before.id}\` — **stage removed**`);
    }
  }

  out.push(transitions.length ? '### Stages' : '### Stages\n\nNo status changes.', ...transitions, '');

  const drift: string[] = [];
  for (const stage of latest.stages) {
    const before = previous.stages.find((s) => s.id === stage.id);
    if (!before) continue;
    const now = numericMetrics(stage);
    const then = numericMetrics(before);
    for (const [key, value] of Object.entries(now)) {
      const previousValue = then[key];
      if (previousValue === undefined || previousValue === value) continue;
      const delta = value - previousValue;
      // A test count that went *down* is always worth a line: a suite that
      // shrank silently is a suite someone deleted from.
      const notable = Math.abs(delta) >= 3 || (/tests?$/i.test(key) && delta < 0);
      if (notable) {
        drift.push(`- \`${stage.id}.${key}\`: ${previousValue} → ${value} (${delta > 0 ? '+' : ''}${delta})`);
      }
    }
  }
  if (drift.length) out.push('### Metrics', ...drift, '');

  return out;
}

async function main() {
  if (!existsSync(SCORECARD)) {
    console.log('No `quality/scorecard.json` yet. Run `npm run release-gate`.');
    return;
  }

  const { entries = [] } = JSON.parse(await readFile(SCORECARD, 'utf8')) as { entries: Entry[] };
  if (!entries.length) {
    console.log('`quality/scorecard.json` has no entries yet.');
    return;
  }

  const latest = entries[entries.length - 1]!;
  const lines = renderEntry(latest);

  if (entries.length >= 2 && !process.argv.includes('--latest')) {
    lines.push(...renderDiff(entries[entries.length - 2]!, latest));
  } else if (entries.length === 1) {
    lines.push('', '_First entry — no previous run to compare against._');
  }

  console.log(lines.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
