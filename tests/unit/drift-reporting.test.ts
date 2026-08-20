import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression test for [D-92].
 *
 * `drift-weekly` opened — and then kept commenting on — a `Schema drift:
 * unknown` issue saying "Still drifting", on two runs where nothing had been
 * compared at all. Both times the remote was unreachable: once a malformed
 * connection string, once IPv6. The check never got as far as a comparison, so
 * there was no drift to find and none had been found.
 *
 * That is the [D-71] failure with its sign flipped. A check that cannot read
 * its own result must not report green; a check that never ran must not report
 * red *with a conclusion attached*. Either way the rule is the same: only
 * report what you measured. The run still fails — it should — but it fails
 * saying "could not compare", not "drifting".
 *
 * The step is 40 lines of JavaScript inside a YAML string that runs once a
 * week, which is the least-observed code in the repository. So this extracts
 * the real script and executes it against stub GitHub clients, rather than
 * asserting on its text: a test that greps for a guard passes the moment
 * someone rewrites the guard into something that does not work.
 */

const WORKFLOW = join(process.cwd(), '.github', 'workflows', 'drift-weekly.yml');

/** The `script:` body of the github-script step, dedented out of the YAML. */
function issueScript(): string {
  const yaml = readFileSync(WORKFLOW, 'utf8');
  const start = yaml.indexOf('script: |');
  if (start < 0) throw new Error('drift-weekly.yml has no github-script step any more');

  const lines = yaml.slice(yaml.indexOf('\n', start) + 1).split('\n');
  const indent = /^\s*/.exec(lines[0] ?? '')?.[0].length ?? 0;
  const body: string[] = [];
  for (const line of lines) {
    if (line.trim() && !line.startsWith(' '.repeat(indent))) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}

type Call = { kind: 'create' | 'comment'; body: string; title?: string };

/**
 * Runs the step the way the runner does: the script body as the whole of an
 * async function, with the globals `actions/github-script` provides.
 */
async function runStep(options: { report: unknown; openIssues?: Array<{ number: number }> }) {
  const calls: Call[] = [];
  const notices: string[] = [];

  const fs = {
    readFileSync(path: string) {
      if (options.report === undefined) throw new Error(`ENOENT: ${path}`);
      return JSON.stringify(options.report);
    },
  };

  const github = {
    rest: {
      issues: {
        listForRepo: async () => ({ data: options.openIssues ?? [] }),
        create: async (args: { title: string; body: string }) => {
          calls.push({ kind: 'create', title: args.title, body: args.body });
        },
        createComment: async (args: { body: string }) => {
          calls.push({ kind: 'comment', body: args.body });
        },
      },
    },
  };

  const context = {
    repo: { owner: 'tomw200082-collab', repo: 'Restyle-Rebuild' },
    serverUrl: 'https://github.com',
    runId: 1,
  };

  const run = new Function(
    'require',
    'github',
    'context',
    'core',
    `return (async () => {\n${issueScript()}\n})()`,
  ) as (
    require: (id: string) => unknown,
    github: unknown,
    context: unknown,
    core: unknown,
  ) => Promise<void>;

  await run(
    (id: string) => {
      if (id !== 'fs') throw new Error(`unexpected require(${id})`);
      return fs;
    },
    github,
    context,
    { notice: (m: string) => notices.push(m), info: (m: string) => notices.push(m) },
  );

  return { calls, notices };
}

describe('the weekly drift job reports only what it measured', () => {
  it('extracts a script that is actually the step, not an empty string', () => {
    expect(issueScript()).toContain('github.rest.issues');
  });

  it('says nothing when the check never produced a report', async () => {
    const { calls, notices } = await runStep({ report: undefined });
    expect(calls, 'nothing was compared, so there is no drift to report').toEqual([]);
    expect(notices.join(' ')).toMatch(/did not complete/);
  });

  it('says nothing when a report exists but found no drift', async () => {
    const { calls } = await runStep({ report: { drifted: [], objects: 921, rows: [] } });
    expect(calls).toEqual([]);
  });

  it('never comments "still drifting" on the open issue after a failed connection', async () => {
    const { calls } = await runStep({ report: undefined, openIssues: [{ number: 4 }] });
    expect(calls).toEqual([]);
  });

  it('opens an issue naming the categories when drift is real', async () => {
    const { calls } = await runStep({
      report: { drifted: ['POLICY', 'COLGRANT'], objects: 921, digest: 'a', remoteDigest: 'b', rows: [] },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('create');
    expect(calls[0]?.title).toBe('Schema drift: POLICY, COLGRANT');
    expect(calls[0]?.body).toContain('POLICY, COLGRANT');
  });

  it('comments on the existing issue rather than opening a second one', async () => {
    const { calls } = await runStep({
      report: { drifted: ['POLICY'], objects: 921, rows: [] },
      openIssues: [{ number: 4 }],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('comment');
  });
});
