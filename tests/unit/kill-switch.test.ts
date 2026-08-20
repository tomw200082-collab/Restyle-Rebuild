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
 * `runJob` is exercised with no Supabase configured at all. That is the point:
 * if the guard did not fire first, the job would reach createServiceSupabase()
 * and throw on the missing environment. A clean halt is therefore proof that
 * nothing downstream ran. CLAUDE.md §6, EXECUTION_POLICY.md.
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
      // Would throw on the missing Supabase environment if the guard did not
      // fire first — so resolving at all is the proof.
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

  it('does not halt when the switch is absent — proved by the job reaching its dependencies', async () => {
    const { runJob } = await import('@/lib/jobs');

    // With no switch and no Supabase environment the job must get far enough to
    // fail on its dependencies. If this ever resolves with halted:true the
    // guard has become unconditional, which would silently stop production.
    await expect(runJob('housekeeping')).rejects.toThrow();
  });
});
