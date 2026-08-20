import 'server-only';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The operator's stop button for automation.
 *
 * Presence of `ops/KILL_SWITCH` — or `KILL_SWITCH` set in the environment —
 * halts every cron job and every subagent before it does any work.
 *
 * Two mechanisms because there are two deployment shapes. In a checkout the
 * file is the natural control: greppable, reviewable, and `git log` says who
 * stopped what and when. On Vercel the filesystem is a build artifact, so
 * creating a file there would require a deploy — which is exactly what an
 * operator cannot wait for when automation is misbehaving. The environment
 * variable takes effect on the next invocation.
 *
 * Checked per call rather than cached at module load: a cached answer would
 * keep a warm serverless instance running jobs after the switch was thrown,
 * which is the one moment the answer must be current.
 *
 * See EXECUTION_POLICY.md — creating the switch is allowed at any level;
 * removing it is L5.
 */

export const KILL_SWITCH_PATH = join(process.cwd(), 'ops', 'KILL_SWITCH');

export type KillSwitchState =
  | { active: false }
  | { active: true; source: 'file' | 'env'; detail: string };

export function killSwitchState(): KillSwitchState {
  // The environment is checked first: it is the mechanism that works in
  // production, so it should not be masked by a filesystem check that cannot.
  const fromEnv = process.env.KILL_SWITCH;
  if (fromEnv && fromEnv !== '0' && fromEnv.toLowerCase() !== 'false') {
    return { active: true, source: 'env', detail: 'KILL_SWITCH is set in the environment' };
  }

  if (existsSync(KILL_SWITCH_PATH)) {
    return { active: true, source: 'file', detail: `${KILL_SWITCH_PATH} exists` };
  }

  return { active: false };
}

export function isKillSwitchActive(): boolean {
  return killSwitchState().active;
}
