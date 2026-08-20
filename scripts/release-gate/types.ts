/**
 * The release gate's shared vocabulary.
 *
 * Three statuses, and the distinction between the last two is the whole point
 * of the gate:
 *
 *   pass    — the check ran and the product satisfied it.
 *   fail    — the check ran and the product did not.
 *   skipped — the check could not run here, and says why.
 *
 * A `skipped` stage is **never** counted as a pass. It is reported, it is
 * carried into the scorecard with its reason, and it blocks L2 unless its
 * reason is in ALLOWED_SKIPS *and* CI ran that stage on the same commit.
 * The failure this prevents is the one that has already happened to this
 * project twice: a check that quietly did nothing and was read as green.
 */

export type StageStatus = 'pass' | 'fail' | 'skipped';

export type StageResult = {
  /** Stable id — the scorecard is diffed on these, so they must not churn. */
  id: string;
  /** Human-readable name, Hebrew-free (English code, [CLAUDE.md §3.5]). */
  name: string;
  status: StageStatus;
  /** One line. On failure this is what a reader sees first. */
  detail: string;
  durationMs: number;
  /** Paths or URLs a human can open. CLAUDE.md invariant 12. */
  evidence?: string[];
  /**
   * Numbers worth trending across runs — scores, counts, ratios. `undefined` is
   * permitted in the value type only so a stage can build its metrics object
   * across branches without every branch declaring every key.
   */
  metrics?: Record<string, number | string | undefined>;
  /** Individual failures, capped so a broken build does not produce a novel. */
  failures?: string[];
};

export type GateContext = {
  /** Origin the browser stages hit, e.g. http://localhost:3000 */
  baseUrl: string;
  /** Where evidence is written. */
  outDir: string;
  /** Skip the slow browser stages — for a fast local signal, never for L2. */
  fast: boolean;
  /** Update visual baselines instead of comparing against them. */
};

export type Stage = {
  id: string;
  name: string;
  /** Stages that need a running server and a browser. */
  needsBrowser: boolean;
  run: (ctx: GateContext) => Promise<Omit<StageResult, 'id' | 'name' | 'durationMs'>>;
};

export type Scorecard = {
  version: 1;
  entries: ScorecardEntry[];
};

export type ScorecardEntry = {
  /** ISO-8601 UTC. */
  at: string;
  commit: string;
  branch: string;
  /** pass only when every stage passed. Fails closed. */
  verdict: 'pass' | 'fail';
  /** True when every stage ran — no skips at all. Distinct from the verdict. */
  complete: boolean;
  counts: { pass: number; fail: number; skipped: number };
  target: string;
  stages: StageResult[];
};

/**
 * Skip reasons a scorecard may carry and still be eligible for L2 — provided
 * CI ran the stage on the same commit. Anything else makes the run ineligible
 * regardless of how many stages passed.
 */
export const ALLOWED_SKIPS = [
  'no-listings-in-target-database',
  'browser-unavailable',
  'lighthouse-unavailable',
  'rls-fixture-absent',
] as const;

export type AllowedSkip = (typeof ALLOWED_SKIPS)[number];
