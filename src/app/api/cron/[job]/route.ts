import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { JOB_NAMES, runJob, type JobName } from '@/lib/jobs';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * These endpoints cancel orders and issue refunds. An unguarded one is a
 * public endpoint that moves money, so the bearer token is checked in
 * constant time before anything else happens. [D-20]
 */
function authorized(request: NextRequest): boolean {
  const header = request.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  const expected = env.cronSecret;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { job } = await ctx.params;
  if (!JOB_NAMES.includes(job as JobName)) {
    return NextResponse.json({ error: `unknown job ${job}` }, { status: 404 });
  }

  try {
    const result = await runJob(job as JobName);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[cron:${job}]`, error);
    return NextResponse.json({ error: 'job failed', job }, { status: 500 });
  }
}

/** Vercel Cron issues GET requests; both verbs run the same job. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  return POST(request, ctx);
}
