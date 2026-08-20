import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The kill switch is the operator's stop button. These tests exist because a
 * stop button that is never tested is a stop button nobody can trust in the
 * one minute they need it.
 *
 * Two things are proved:
 *   1. The switch is detected from both mechanisms — the file and the env var.
 *   2. Every cron job halts before doing any work. Not "the job we remembered
 *      to check" — every name in JOB_NAMES, enumerated, so a job added later
 *      fails this test if it somehow bypasses the guard.
 *
 * The halt cases assert `processed: 0` and `halted: true` for every job, which
 * is what proves nothing downstream ran — locally, where no Supabase is
 * configured, resolving at all is additional proof, since an unguarded job
 * would throw reaching createServiceSupabase(). That is a bonus of the local
 * environment and not something any assertion here depends on: CI has a real
 * stack, and a test that only passes because the environment is broken is a
 * test that breaks when the environment is fixed.
 * CLAUDE.md §6, EXECUTION_POLICY.md.
 */

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_ENV = { ...process.env };

let sandbox: string;

beforeEach(() => {
  vi.resetModules();
  sandbox = mkdtempSync(join(tmpdir(), 'restyle-kill-'));
  mkdirSync(join(sandbox, 'ops'), { recursive: true });
  process.chdir(sandbox);
  delete process.env.KILL_SWITCH;
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(sandbox, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

async function killSwitch() {
  return import('@/lib/ops/kill-switch');
}

describe('kill switch detection', () => {
  it('is inactive when neither the file nor the variable is present', async () => {
    const { killSwitchState, isKillSwitchActive } = await killSwitch();
    expect(killSwitchState()).toEqual({ active: false });
    expect(isKillSwitchActive()).toBe(false);
  });

  it('is active when ops/KILL_SWITCH exists', async () => {
    writeFileSync(join(sandbox, 'ops', 'KILL_SWITCH'), 'reason: testing\n');
    const { killSwitchState } = await killSwitch();
    const state = killSwitchState();
    expect(state.active).toBe(true);
    expect(state.active && state.source).toBe('file');
  });

  it('is active when KILL_SWITCH is set in the environment', async () => {
    process.env.KILL_SWITCH = '1';
    const { killSwitchState } = await killSwitch();
    const state = killSwitchState();
    expect(state.active).toBe(true);
    expect(state.active && state.source).toBe('env');
  });

  it('treats "0" and "false" as off, so an unset-by-value deploy is not a silent halt', async () => {
    for (const value of ['0', 'false', 'FALSE', '']) {
      vi.resetModules();
      process.env.KILL_SWITCH = value;
      const { isKillSwitchActive } = await killSwitch();
      expect(isKillSwitchActive(), `KILL_SWITCH=${JSON.stringify(value)}`).toBe(false);
    }
  });

  it('reads the file on every call, so throwing the switch takes effect immediately', async () => {
    const { isKillSwitchActive } = await killSwitch();
    expect(isKillSwitchActive()).toBe(false);

    writeFileSync(join(sandbox, 'ops', 'KILL_SWITCH'), '');

    // No re-import. A cached module-load answer would keep a warm serverless
    // instance running jobs after the operator stopped them.
    expect(isKillSwitchActive()).toBe(true);
  });
});

describe('every cron job halts when the switch is thrown', () => {
  it('halts all seven jobs before any work, from the file', async () => {
    writeFileSync(join(sandbox, 'ops', 'KILL_SWITCH'), '');
    const { runJob, JOB_NAMES } = await import('@/lib/jobs');

    expect(JOB_NAMES.length).toBe(7);

    for (const job of JOB_NAMES) {
      const result = await runJob(job);
      expect(result, job).toMatchObject({ job, processed: 0, halted: true });
      expect(result.details?.[0], job).toContain('kill switch active');
    }
  });

  it('halts all seven jobs from the environment variable', async () => {
    process.env.KILL_SWITCH = '1';
    const { runJob, JOB_NAMES } = await import('@/lib/jobs');

    for (const job of JOB_NAMES) {
      const result = await runJob(job);
      expect(result, job).toMatchObject({ job, processed: 0, halted: true });
    }
  });

  it('does not halt when the switch is absent', async () => {
    const { runJob } = await import('@/lib/jobs');

    // The guard must be conditional. An unconditional one would silently stop
    // production and every other test in this file would still pass.
    //
    // What the job does *after* the guard is not this test's business, and the
    // first version of it made that mistake: it asserted the job would reject,
    // which was true only because no Supabase was configured. In CI, where one
    // is, the job succeeded and the test failed — a green environment breaking
    // a test that was really asserting "the environment is broken".
    //
    // So: whether it resolves or rejects, it must not be a halt.
    const outcome = await runJob('housekeeping').then(
      (result) => ({ ok: true as const, result }),
      () => ({ ok: false as const, result: null }),
    );
    if (outcome.ok) expect(outcome.result.halted).toBeFalsy();
  });
});
