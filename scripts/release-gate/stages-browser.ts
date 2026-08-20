/**
 * Stages that need a running server, and mostly a browser.
 *
 * Each one exists because of a defect class that has already cost this project
 * time. The comment above each stage names it — a stage that cannot name the
 * failure it prevents is ceremony, and ADR-001 says to delete it.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import type { GateContext, Stage } from "./types";
import { staticRoutes, dynamicRoutes, type PublicRoute } from "./routes";
import { launchOptions, resolveBrowser, withBrowser } from "./browser";

const ROOT = process.cwd();
const MAX_FAILURES = 25;

async function evidence(
  ctx: GateContext,
  name: string,
  body: string,
): Promise<string> {
  await mkdir(ctx.outDir, { recursive: true });
  const path = join(ctx.outDir, name);
  await writeFile(path, body, "utf8");
  return relative(ROOT, path);
}

async function allRoutes(): Promise<{
  routes: PublicRoute[];
  soldItemSlug: string | null;
  listings: number;
}> {
  const statics = await staticRoutes();
  const sample = await dynamicRoutes();
  return {
    routes: [...statics, ...sample.routes],
    soldItemSlug: sample.soldItemSlug,
    listings: sample.counts.listings,
  };
}

/* ------------------------------------------------------------------------ */
/* Status codes — the soft-404 class. [D-49]                                 */
/*                                                                           */
/* /sitemap.xml returned 404 in production-shaped builds: the one URL         */
/* robots.txt points at, which nothing in the application ever requests. A    */
/* test asserting on rendered text passes against a soft-404 because a        */
/* soft-404 renders. So this asserts the status code and nothing else.        */
/* ------------------------------------------------------------------------ */
export const statusCodesStage: Stage = {
  id: "status-codes",
  name: "status codes on every public route",
  needsBrowser: false,
  async run(ctx) {
    const { routes } = await allRoutes();
    const failures: string[] = [];
    const lines: string[] = [];

    for (const route of routes) {
      const url = `${ctx.baseUrl}${route.path}`;
      try {
        const response = await fetch(url, { redirect: "manual" });
        const ok = response.status === route.expectedStatus;
        lines.push(
          `${ok ? "OK  " : "FAIL"} ${response.status} ${route.path} (expected ${route.expectedStatus})`,
        );
        if (!ok)
          failures.push(
            `${route.path} → ${response.status} (expected ${route.expectedStatus})`,
          );
      } catch (error) {
        lines.push(`FAIL ERR ${route.path}`);
        failures.push(`${route.path} → ${(error as Error).message}`);
      }
    }

    // A URL that should NOT resolve must actually 404. A catch-all that renders
    // a friendly page for anything is the same defect wearing the other face.
    for (const path of [
      "/category/definitely-not-a-real-category",
      "/item/no-such-item-abc123",
    ]) {
      const response = await fetch(`${ctx.baseUrl}${path}`, {
        redirect: "manual",
      });
      const ok = response.status === 404;
      lines.push(
        `${ok ? "OK  " : "FAIL"} ${response.status} ${path} (expected 404)`,
      );
      if (!ok) failures.push(`${path} → ${response.status} (expected 404)`);
    }

    const path = await evidence(ctx, "status-codes.txt", lines.join("\n"));
    return failures.length
      ? {
          status: "fail",
          detail: `${failures.length} of ${lines.length} routes returned the wrong status`,
          failures: failures.slice(0, MAX_FAILURES),
          metrics: { checked: lines.length, wrong: failures.length },
          evidence: [path],
        }
      : {
          status: "pass",
          detail: `${lines.length} routes returned their expected status`,
          metrics: { checked: lines.length, wrong: 0 },
          evidence: [path],
        };
  },
};

/* ------------------------------------------------------------------------ */
/* Computed contrast — the tailwind-merge class. [D-51]                      */
/*                                                                           */
/* tailwind-merge classified a custom font-size utility as a colour utility   */
/* and dropped text-white from every primary button. The class list was       */
/* correct; the pixel was not. So this measures the computed colour in a real */
/* browser, walking up the ancestor chain for the real background.            */
/* ------------------------------------------------------------------------ */
const CONTRAST_PROBE = `(() => {
  const parseColor = (value) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(value);
    if (!m) return null;
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const effectiveBackground = (el) => {
    let node = el;
    let acc = null;
    while (node) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? blend(acc, c) : c;
        if (acc.a >= 1) return acc;
      }
      node = node.parentElement;
    }
    return acc && acc.a >= 1 ? acc : { r: 255, g: 255, b: 255, a: 1 };
  };
  const label = (el) => {
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40);
    return el.tagName.toLowerCase() + (text ? \` "\${text}"\` : '') + \` [\${(el.className || '').toString().slice(0, 60)}]\`;
  };

  const selector = 'a, button, [role="button"], input, select, textarea, summary, label';
  const results = [];
  for (const el of document.querySelectorAll(selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue;
    const text = (el.innerText || '').trim();
    if (!text) continue;

    const fg = parseColor(style.color);
    if (!fg) continue;
    const bg = effectiveBackground(el);
    const flat = fg.a < 1 ? blend(fg, bg) : fg;
    const l1 = luminance(flat), l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    results.push({ label: label(el), ratio: Math.round(ratio * 100) / 100, required: large ? 3 : 4.5 });
  }
  return results;
})()`;

export const contrastStage: Stage = {
  id: "contrast",
  name: "computed contrast, WCAG AA",
  needsBrowser: true,
  async run(ctx) {
    const { routes } = await allRoutes();
    // Auth-gated routes redirect to login for an anonymous visitor, so what
    // would be measured there is the login page, once per gated route.
    const pages = routes.filter(
      (r) =>
        r.expectedStatus === 200 &&
        !r.path.endsWith(".xml") &&
        !r.path.endsWith(".txt"),
    );

    return withBrowser(async (browser) => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const failures: string[] = [];
      const lines: string[] = [];
      let checked = 0;

      for (const route of pages) {
        const page = await context.newPage();
        try {
          await page.goto(`${ctx.baseUrl}${route.path}`, {
            waitUntil: "networkidle",
            timeout: 45_000,
          });
          const results = (await page.evaluate(CONTRAST_PROBE)) as Array<{
            label: string;
            ratio: number;
            required: number;
          }>;
          for (const r of results) {
            checked += 1;
            if (r.ratio < r.required) {
              const line = `${route.path} — ${r.label}: ${r.ratio}:1 (needs ${r.required}:1)`;
              failures.push(line);
              lines.push(`FAIL ${line}`);
            }
          }
          lines.push(
            `OK   ${route.path} — ${results.length} interactive elements`,
          );
        } finally {
          await page.close();
        }
      }
      await context.close();

      const path = await evidence(ctx, "contrast.txt", lines.join("\n"));
      return failures.length
        ? {
            status: "fail" as const,
            detail: `${failures.length} of ${checked} interactive elements below AA`,
            failures: failures.slice(0, MAX_FAILURES),
            metrics: { elements: checked, below: failures.length },
            evidence: [path],
          }
        : {
            status: "pass" as const,
            detail: `${checked} interactive elements at or above AA`,
            metrics: { elements: checked, below: 0 },
            evidence: [path],
          };
    });
  },
};

/* ------------------------------------------------------------------------ */
/* axe — zero critical violations.                                           */
/* ------------------------------------------------------------------------ */
export const axeStage: Stage = {
  id: "axe",
  name: "axe accessibility scan",
  needsBrowser: true,
  async run(ctx) {
    const { AxeBuilder } = await import("@axe-core/playwright");
    const { routes } = await allRoutes();
    const pages = routes.filter(
      (r) =>
        r.expectedStatus === 200 &&
        !r.path.endsWith(".xml") &&
        !r.path.endsWith(".txt"),
    );

    return withBrowser(async (browser) => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const failures: string[] = [];
      const lines: string[] = [];
      let critical = 0;
      let serious = 0;

      for (const route of pages) {
        const page = await context.newPage();
        try {
          await page.goto(`${ctx.baseUrl}${route.path}`, {
            waitUntil: "networkidle",
            timeout: 45_000,
          });
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze();

          for (const violation of results.violations) {
            const line = `${route.path} — [${violation.impact}] ${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`;
            lines.push(line);
            if (violation.impact === "critical") {
              critical += 1;
              failures.push(line);
            } else if (violation.impact === "serious") {
              serious += 1;
            }
          }
          if (!results.violations.length) lines.push(`OK   ${route.path}`);
        } finally {
          await page.close();
        }
      }
      await context.close();

      const path = await evidence(ctx, "axe.txt", lines.join("\n"));
      // Critical fails the gate; serious is reported and trended. Failing on
      // serious too would be defensible, but it is a policy change, not a
      // default — the master prompt's budget is "0 critical".
      return critical
        ? {
            status: "fail" as const,
            detail: `${critical} critical accessibility violation(s)`,
            failures: failures.slice(0, MAX_FAILURES),
            metrics: { critical, serious },
            evidence: [path],
          }
        : {
            status: "pass" as const,
            detail: `0 critical violations across ${pages.length} pages (${serious} serious, reported)`,
            metrics: { critical: 0, serious },
            evidence: [path],
          };
    });
  },
};

/* ------------------------------------------------------------------------ */
/* Lighthouse. Two kinds of budget, because these are two kinds of           */
/* measurement. [D-80]                                                      */
/*                                                                          */
/* SEO and accessibility audit markup. Given the same HTML they return the   */
/* same score on any machine, so they stay hard budgets and a miss is always */
/* a defect.                                                                */
/*                                                                          */
/* Performance is a composite of simulated-throttling timings, and on a      */
/* shared runner it measures the runner as much as the page. The item page   */
/* that scores 94 against the hosted project scored 84 in CI — on two cores  */
/* also hosting a Postgres container and a Next server — while home and      */
/* category on that same run stayed above 90. A hard budget there fails the  */
/* build for the machine's load, and the only way to make such a gate green  */
/* is to stop believing it.                                                  */
/*                                                                          */
/* So performance carries a floor and a target. The floor catches a cliff:   */
/* a page that ships a blocking bundle or an unoptimised hero lands far      */
/* below it on any hardware, and runner noise does not reach it. The target  */
/* is recorded every run and is what the scorecard trends — the metric-drift */
/* signal the release-gate skill already describes.                          */
/*                                                                          */
/* Every score is now printed whether it passed or not. The run that         */
/* prompted this printed a single line, "item performance: 84 (budget 90)",  */
/* and from it there was no way to tell one slow page from one slow machine. */
/* ------------------------------------------------------------------------ */
const LH_HARD_BUDGETS = { seo: 100, accessibility: 95 } as const;
const LH_PERF_TARGET = 90;
const LH_PERF_FLOOR = 70;
/** Three runs and a median, so the recorded performance number is worth
 *  trending. SEO and accessibility are deterministic, so the median of three
 *  identical values costs nothing and keeps this to one code path. */
const LH_RUNS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export const lighthouseStage: Stage = {
  id: "lighthouse",
  name: "Lighthouse budgets",
  needsBrowser: true,
  async run(ctx) {
    let lighthouse: typeof import("lighthouse").default;
    try {
      lighthouse = (await import("lighthouse")).default;
    } catch {
      return {
        status: "skipped" as const,
        detail: "lighthouse is not installed in this environment",
        metrics: { reason: "lighthouse-unavailable" },
      };
    }

    const sample = await dynamicRoutes(1);
    const targets: Array<{ label: string; path: string }> = [
      { label: "home", path: "/" },
    ];
    const category = sample.routes.find(
      (r) => r.template === "category/[slug]",
    );
    const item = sample.routes.find((r) => r.template === "item/[slug]");
    if (category) targets.push({ label: "category", path: category.path });
    if (item) targets.push({ label: "item", path: item.path });

    if (!item) {
      // Honest: the item page is one of the three the budget names. Reporting
      // "2 of 3 passed" as a pass would be the silent kind of green.
      if (targets.length < 2) {
        return {
          status: "skipped" as const,
          detail:
            "no listings in the target database — only the home page is measurable",
          metrics: { reason: "no-listings-in-target-database" },
        };
      }
      const measured = await runLighthouse(ctx, lighthouse, targets);
      const path = await evidence(
        ctx,
        "lighthouse.json",
        JSON.stringify(measured.report, null, 2),
      );
      return {
        status: "skipped" as const,
        detail:
          `no listings in the target database — item page not measurable. ` +
          `Measured: ${measured.summary}`,
        metrics: {
          reason: "no-listings-in-target-database",
          ...measured.metrics,
        },
        failures: measured.failures,
        evidence: [path],
      };
    }

    const measured = await runLighthouse(ctx, lighthouse, targets);
    const path = await evidence(
      ctx,
      "lighthouse.json",
      JSON.stringify(measured.report, null, 2),
    );
    const note = measured.belowTarget.length
      ? ` — below the ${LH_PERF_TARGET} performance target: ${measured.belowTarget.join(", ")}`
      : "";

    return measured.failures.length
      ? {
          status: "fail" as const,
          detail: `${measured.failures.length} budget(s) missed. ${measured.summary}`,
          failures: measured.failures,
          metrics: measured.metrics,
          evidence: [path],
        }
      : {
          status: "pass" as const,
          detail: `${measured.summary}${note}`,
          metrics: measured.metrics,
          evidence: [path],
        };
  },
};

/** The audits a category actually failed. A budget that reports a number and
 *  not the audits behind it tells you a page is worse without telling you how,
 *  which is half a measurement. [D-80] */
function failingAudits(lhr: LhResult, category: string): string[] {
  const refs = lhr.categories?.[category]?.auditRefs ?? [];
  return refs
    .map((ref) => [ref.id, lhr.audits?.[ref.id]] as const)
    .filter(
      ([, a]) =>
        a &&
        typeof a.score === "number" &&
        a.score < 1 &&
        a.scoreDisplayMode !== "informative" &&
        a.scoreDisplayMode !== "notApplicable",
    )
    .slice(0, 6)
    .map(([id]) => id);
}

/** The audits that cost a page the most time, so a missed budget says what to
 *  fix rather than only that something is slow. */
type LhAudit = {
  score?: number | null;
  scoreDisplayMode?: string;
  numericValue?: number;
  details?: { type?: string };
};
type LhResult = {
  audits?: Record<string, LhAudit>;
  categories?: Record<string, { auditRefs?: Array<{ id: string }> }>;
};

function opportunities(lhr: LhResult): string[] {
  return Object.entries(lhr.audits ?? {})
    .filter(
      ([, a]) =>
        a.details?.type === "opportunity" && (a.numericValue ?? 0) >= 100,
    )
    .sort((a, b) => (b[1].numericValue ?? 0) - (a[1].numericValue ?? 0))
    .slice(0, 3)
    .map(([id, a]) => `${id} (${Math.round(a.numericValue ?? 0)}ms)`);
}

async function runLighthouse(
  ctx: GateContext,
  lighthouse: typeof import("lighthouse").default,
  targets: Array<{ label: string; path: string }>,
) {
  const failures: string[] = [];
  const belowTarget: string[] = [];
  const metrics: Record<string, number> = {};
  const report: Record<string, unknown> = {};
  const summaries: string[] = [];

  for (const target of targets) {
    const runs: Array<Record<string, number>> = [];
    let slowest: string[] = [];
    let failed: Record<string, string[]> = {};

    for (let i = 0; i < LH_RUNS; i += 1) {
      // A browser per run. Sharing one across runs made Lighthouse attach to
      // a leftover target instead of the page it had just navigated: two runs
      // in three reported `document-title` and `meta-description` missing on
      // an item page whose server-rendered HTML contains both, every time,
      // and scored the performance of a blank document while doing it. The
      // audit was real; the page it audited was not.
      const port = 9222 + i;
      const browser = await chromium.launch(
        await launchOptions({ args: [`--remote-debugging-port=${port}`] }),
      );
      let result;
      try {
        result = await lighthouse(
          `${ctx.baseUrl}${target.path}`,
          { port, output: "json", logLevel: "error" },
          // Mobile is the majority case for this product, so it is the
          // default configuration rather than an extra run.
          undefined,
        );
      } finally {
        await browser.close();
      }
      if (!result) continue;
      const categories = result.lhr.categories;
      runs.push({
        performance: Math.round((categories.performance?.score ?? 0) * 100),
        seo: Math.round((categories.seo?.score ?? 0) * 100),
        accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
      });
      const lhr = result.lhr as unknown as LhResult;
      slowest = opportunities(lhr);
      failed = {
        accessibility: failingAudits(lhr, "accessibility"),
        seo: failingAudits(lhr, "seo"),
      };
    }

    if (!runs.length) {
      failures.push(`${target.label}: lighthouse returned no result`);
      continue;
    }

    const scores = {
      performance: median(runs.map((r) => r.performance!)),
      seo: median(runs.map((r) => r.seo!)),
      accessibility: median(runs.map((r) => r.accessibility!)),
    };
    for (const [key, value] of Object.entries(scores))
      metrics[`${target.label}.${key}`] = value;
    report[target.label] = {
      scores,
      runs,
      slowestAudits: slowest,
      failedAudits: failed,
    };

    // Printed for every page, passing or not: the difference between one
    // slow page and one slow machine is only visible when all three are here.
    summaries.push(
      `${target.label} ${scores.performance}/${scores.accessibility}/${scores.seo}`,
    );

    for (const key of Object.keys(LH_HARD_BUDGETS) as Array<
      keyof typeof LH_HARD_BUDGETS
    >) {
      if (scores[key] < LH_HARD_BUDGETS[key]) {
        const named = failed[key]?.length
          ? ` — ${failed[key]!.join(", ")}`
          : "";
        failures.push(
          `${target.label} ${key}: ${scores[key]} (budget ${LH_HARD_BUDGETS[key]})${named}`,
        );
      }
    }
    if (scores.performance < LH_PERF_FLOOR) {
      failures.push(
        `${target.label} performance: ${scores.performance} — below the ${LH_PERF_FLOOR} floor` +
          (slowest.length ? `; worst: ${slowest.join(", ")}` : ""),
      );
    } else if (scores.performance < LH_PERF_TARGET) {
      belowTarget.push(`${target.label} ${scores.performance}`);
    }
  }

  return {
    failures,
    belowTarget,
    metrics,
    report,
    summary: `${summaries.join(" · ")} (perf/a11y/seo, median of ${LH_RUNS})`,
  };
}

/* ------------------------------------------------------------------------ */
/* RTL layout at 390px. [D-79]                                               */
/*                                                                          */
/* This stage used to hash a full-page screenshot and diff it against a      */
/* committed baseline. On a runner all ten pages differed — including the    */
/* static copy pages that have no listing content at all — and that is the   */
/* signature of a different Chromium build and a different font set, not a   */
/* layout regression. A sha256 of a render is a function of the browser      */
/* build, the installed fonts and the catalogue, and this repository pins    */
/* none of the three, so the check could only ever pass on the machine that  */
/* produced the baseline. A check that cannot tell a defect from its own     */
/* environment is not a check. [SPEC.md §10]                                 */
/*                                                                          */
/* It now asserts the two things that are true of a correct RTL page on any  */
/* machine, and that together are the mobile failure this product actually   */
/* has: the document is rtl, and nothing overflows 390px sideways. A stray   */
/* fixed width or an unwrapped Hebrew string pushes the page wider than the  */
/* phone and the whole layout starts scrolling horizontally — visible to     */
/* every user, invisible to a desktop test.                                  */
/*                                                                          */
/* The screenshots are still taken and still written to the evidence         */
/* directory, and the render hash is still recorded there. They are what a   */
/* human looks at when something is reported. They are simply no longer a    */
/* verdict on their own.                                                     */
/*                                                                          */
/* Restoring a true pixel diff means pinning the render environment — a      */
/* fixed container image with a fixed font set — and diffing pixels rather   */
/* than hashes, so the report can say what moved instead of that something   */
/* did. That is infrastructure this project does not have yet.               */
/* ------------------------------------------------------------------------ */
const MASK_SELECTORS = [
  "[data-dynamic]",
  "time",
  '[data-testid="price"]',
  "img",
  "picture",
  "video",
  "canvas",
];

const VIEWPORT = { width: 390, height: 844 };

/**
 * Runs in the page. Returns the overflow verdict plus the outermost elements
 * responsible, which is the only part a human can act on.
 *
 * A string rather than a function, like `CONTRAST_PROBE` above and for the same
 * reason: `tsx` compiles with esbuild, which wraps declarations in a `__name`
 * helper to preserve function names. Serialise such a function into the page
 * and it throws `ReferenceError: __name is not defined`, because the helper
 * stayed behind in Node.
 */
const OVERFLOW_PROBE = `(() => {
  const doc = document.documentElement;
  const limit = doc.clientWidth;
  // A pixel of slack: sub-pixel layout rounding is not a defect.
  const overflows = doc.scrollWidth > limit + 1;

  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const testid = el.getAttribute('data-testid');
    const cls = (el.getAttribute('class') || '')
      .split(/\\s+/).filter(Boolean).slice(0, 3).map((c) => '.' + c).join('');
    return el.tagName.toLowerCase() + id + (testid ? '[data-testid="' + testid + '"]' : '') + cls;
  };

  const culprits = [];
  if (overflows) {
    const found = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= limit + 1 && rect.left >= -1) continue;
      const style = getComputedStyle(el);
      // A fixed or hidden element cannot widen the document, so it is a red
      // herring in this list even when its rect sits outside the viewport.
      if (style.position === 'fixed' || style.visibility === 'hidden') continue;
      // Outermost offender only: a wide container drags every descendant past
      // the edge, and listing all of them buries the one that caused it.
      if (found.some((seen) => seen.contains(el))) continue;
      found.push(el);
      culprits.push(describe(el) + ' spans ' + Math.round(rect.left) + '…' + Math.round(rect.right) + 'px');
    }
  }

  return {
    dir: doc.getAttribute('dir'),
    scrollWidth: doc.scrollWidth,
    clientWidth: limit,
    overflows,
    culprits: culprits.slice(0, 5),
  };
})()`;

export const screenshotStage: Stage = {
  id: "rtl-screenshots",
  name: "RTL layout at 390px",
  needsBrowser: true,
  async run(ctx) {
    const statics = await staticRoutes();
    const pages = statics.filter(
      (r) =>
        r.expectedStatus === 200 &&
        !r.path.endsWith(".xml") &&
        !r.path.endsWith(".txt"),
    );
    const shotDir = join(ctx.outDir, "screenshots");
    await mkdir(shotDir, { recursive: true });

    return withBrowser(async (browser) => {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        locale: "he-IL",
        // Animations mid-flight are the classic false diff.
        reducedMotion: "reduce",
      });
      const failures: string[] = [];
      const lines: string[] = [];
      let checked = 0;

      for (const route of pages) {
        const name =
          (route.path === "/"
            ? "home"
            : route.path.slice(1).replace(/\//g, "-")) + ".png";
        const page = await context.newPage();
        try {
          await page.goto(`${ctx.baseUrl}${route.path}`, {
            waitUntil: "networkidle",
            timeout: 45_000,
          });

          const probe = (await page.evaluate(OVERFLOW_PROBE)) as {
            dir: string | null;
            scrollWidth: number;
            clientWidth: number;
            overflows: boolean;
            culprits: string[];
          };
          checked += 1;

          if (probe.dir !== "rtl") {
            failures.push(
              `${route.path}: <html dir> is ${probe.dir ?? "unset"}, expected rtl`,
            );
          }
          if (probe.overflows) {
            const by = probe.scrollWidth - probe.clientWidth;
            failures.push(
              `${route.path}: scrolls ${by}px sideways at ${VIEWPORT.width}px` +
                (probe.culprits.length
                  ? ` — ${probe.culprits.join("; ")}`
                  : ""),
            );
          }

          const buffer = await page.screenshot({
            fullPage: true,
            mask: MASK_SELECTORS.map((s) => page.locator(s)),
            maskColor: "#FF00FF",
            animations: "disabled",
          });
          await writeFile(join(shotDir, name), buffer);

          // Recorded, never asserted on: the hash tells a human "this render
          // changed since the last run on this machine", which is useful next
          // to the screenshot and meaningless as a verdict across machines.
          const hash = createHash("sha256")
            .update(buffer)
            .digest("hex")
            .slice(0, 16);
          lines.push(
            `${probe.overflows || probe.dir !== "rtl" ? "FAIL" : "OK  "} ${route.path} ` +
              `dir=${probe.dir ?? "unset"} width=${probe.scrollWidth}/${probe.clientWidth} render=${hash}`,
          );
        } finally {
          await page.close();
        }
      }
      await context.close();

      const path = await evidence(ctx, "rtl-layout.txt", lines.join("\n"));
      if (failures.length) {
        return {
          status: "fail" as const,
          detail: `${failures.length} RTL/layout problem(s) across ${checked} pages`,
          failures: failures.slice(0, MAX_FAILURES),
          metrics: { checked },
          evidence: [path, relative(ROOT, shotDir)],
        };
      }
      return {
        status: "pass" as const,
        detail: `${checked} pages are rtl and fit ${VIEWPORT.width}px without sideways scroll`,
        metrics: { checked },
        evidence: [path, relative(ROOT, shotDir)],
      };
    });
  },
};

/* ------------------------------------------------------------------------ */
/* Sold pages still return 200. [D-33]                                       */
/*                                                                           */
/* The inbound link a sold item earned is the asset. Deleting the page throws */
/* it away, and a 404 on a page Google already ranks is a slow, invisible     */
/* loss — nobody files a bug for traffic that never arrives.                  */
/* ------------------------------------------------------------------------ */
export const soldPageStage: Stage = {
  id: "sold-200",
  name: "sold pages still return 200",
  needsBrowser: false,
  async run(ctx) {
    const sample = await dynamicRoutes(1);
    if (!sample.soldItemSlug) {
      return {
        status: "skipped" as const,
        detail: "no sold listing in the target database to check",
        metrics: { reason: "no-listings-in-target-database" },
      };
    }

    const url = `${ctx.baseUrl}/item/${sample.soldItemSlug}`;
    const response = await fetch(url, { redirect: "manual" });
    const body = response.ok ? await response.text() : "";
    const path = await evidence(
      ctx,
      "sold-page.txt",
      `${response.status} ${url}\nnoindex: ${/noindex/.test(body)}\n`,
    );

    if (response.status !== 200) {
      return {
        status: "fail" as const,
        detail: `sold item returned ${response.status}, expected 200`,
        failures: [`${url} → ${response.status}`],
        evidence: [path],
      };
    }
    return {
      status: "pass" as const,
      detail: "sold item page returns 200",
      metrics: { slug: sample.soldItemSlug },
      evidence: [path],
    };
  },
};

/* ------------------------------------------------------------------------ */
/* Sitemap coverage — every indexable route is in the sitemap, and every     */
/* sitemap URL resolves. Both directions, because each catches a different   */
/* failure: a missing entry is lost traffic, a dead entry is a crawl error.  */
/* ------------------------------------------------------------------------ */
export const sitemapStage: Stage = {
  id: "sitemap-coverage",
  name: "sitemap coverage vs live routes",
  needsBrowser: false,
  async run(ctx) {
    const index = await fetch(`${ctx.baseUrl}/sitemap.xml`);
    if (!index.ok) {
      return {
        status: "fail" as const,
        detail: `/sitemap.xml returned ${index.status}`,
        failures: [`/sitemap.xml → ${index.status}`],
      };
    }
    const indexXml = await index.text();
    const chunkUrls = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1] ?? "",
    );

    const sitemapPaths = new Set<string>();
    for (const chunkUrl of chunkUrls) {
      // The index carries absolute production URLs; the gate hits the local
      // origin, so only the path is portable.
      const path = new URL(chunkUrl).pathname;
      const response = await fetch(`${ctx.baseUrl}${path}`);
      if (!response.ok) {
        return {
          status: "fail" as const,
          detail: `sitemap chunk ${path} returned ${response.status}`,
          failures: [`${path} → ${response.status}`],
        };
      }
      const xml = await response.text();
      for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        sitemapPaths.add(new URL(match[1] ?? "").pathname);
      }
    }

    const { routes } = await allRoutes();
    // Indexability is read from each page's own source — auth gate or an
    // explicit `robots: { index: false }`. Deriving it means the sitemap check
    // and the page cannot disagree, which a hand-maintained exclusion list
    // guarantees they eventually will.
    const indexable = routes.filter((r) => r.indexable);

    const missing = indexable
      .filter((r) => !sitemapPaths.has(r.path))
      .map((r) => r.path);
    const dead: string[] = [];
    for (const path of [...sitemapPaths].slice(0, 60)) {
      const response = await fetch(`${ctx.baseUrl}${path}`, {
        redirect: "manual",
      });
      if (response.status !== 200) dead.push(`${path} → ${response.status}`);
    }

    const report = [
      `sitemap chunks: ${chunkUrls.length}`,
      `sitemap URLs:   ${sitemapPaths.size}`,
      `live routes:    ${indexable.length}`,
      "",
      "missing from sitemap:",
      ...(missing.length ? missing : ["  (none)"]),
      "",
      "in sitemap but not 200:",
      ...(dead.length ? dead : ["  (none)"]),
    ].join("\n");
    const path = await evidence(ctx, "sitemap-coverage.txt", report);

    const failures = [
      ...missing.map((p) => `missing from sitemap: ${p}`),
      ...dead.map((d) => `sitemap URL not 200: ${d}`),
    ];
    return failures.length
      ? {
          status: "fail" as const,
          detail: `${missing.length} route(s) missing, ${dead.length} dead sitemap URL(s)`,
          failures: failures.slice(0, MAX_FAILURES),
          metrics: {
            sitemapUrls: sitemapPaths.size,
            liveRoutes: indexable.length,
          },
          evidence: [path],
        }
      : {
          status: "pass" as const,
          detail: `${sitemapPaths.size} sitemap URLs, all resolving; ${indexable.length} routes covered`,
          metrics: {
            sitemapUrls: sitemapPaths.size,
            liveRoutes: indexable.length,
          },
          evidence: [path],
        };
  },
};

export async function probeBrowser(): Promise<{ ok: boolean; detail: string }> {
  const resolution = await resolveBrowser();
  return { ok: resolution.available, detail: resolution.detail };
}

export type { Page };
