import { and, eq, sql } from 'drizzle-orm';
import { verifyCandidates } from '../chain/receipt-validation.js';
import type { ChainReader, HistoryProvider } from '../chain/types.js';
import { insertEvents } from '../db/repositories/events.js';
import { normalizeAddress } from '../shared/addresses.js';
import type { Database } from '../db/client.js';
import { backfillCoverage, backfillJobs, type BackfillJobRow } from '../db/schema/index.js';

export interface CoverageRange {
  start: Date;
  end: Date;
}

export interface EnqueueBackfillInput {
  chainId: bigint;
  address: string;
  from: Date;
  to: Date;
}

export async function enqueueBackfillJob(
  db: Database,
  input: EnqueueBackfillInput,
): Promise<string> {
  const [row] = await db
    .insert(backfillJobs)
    .values({
      chainId: input.chainId,
      address: normalizeAddress(input.address),
      fromTimestamp: input.from,
      toTimestamp: input.to,
    })
    .returning({ id: backfillJobs.id });
  if (!row) throw new Error('Failed to enqueue backfill job');
  return row.id;
}

/**
 * Claim one due job with an expiring lease. A crashed worker's lease expires and
 * the job becomes claimable again (recovery).
 */
export async function claimBackfillJob(
  db: Database,
  options: { leaseMs: number; now?: Date },
): Promise<BackfillJobRow | null> {
  const now = options.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + options.leaseMs);
  const rows = (await db.execute(sql`
    update backfill_jobs
       set status = 'running',
           attempts = attempts + 1,
           lease_until = ${leaseUntil.toISOString()},
           updated_at = now()
     where id in (
       select id from backfill_jobs
        where status in ('pending','running')
          and available_at <= now()
          and (lease_until is null or lease_until < now())
        order by available_at
        for update skip locked
        limit 1
     )
     returning id, chain_id as "chainId", address, from_timestamp as "fromTimestamp",
               to_timestamp as "toTimestamp", provider_cursor as "providerCursor", status,
               attempts, available_at as "availableAt", lease_until as "leaseUntil",
               last_error as "lastError", coverage_ranges as "coverageRanges",
               created_at as "createdAt", updated_at as "updatedAt";
  `)) as unknown as BackfillJobRow[];
  return rows[0] ?? null;
}

export async function completeBackfillJob(
  db: Database,
  jobId: string,
  coverage?: CoverageRange,
): Promise<void> {
  const ranges = coverage
    ? [{ start: coverage.start.toISOString(), end: coverage.end.toISOString() }]
    : [];
  await db
    .update(backfillJobs)
    .set({
      status: 'completed',
      leaseUntil: null,
      updatedAt: new Date(),
      ...(ranges.length > 0
        ? {
            coverageRanges: sql`${backfillJobs.coverageRanges} || ${JSON.stringify(ranges)}::jsonb`,
          }
        : {}),
    })
    .where(eq(backfillJobs.id, jobId));
}

/** Persist page progress and release an incomplete job for another bounded tick. */
export async function continueBackfillJob(
  db: Database,
  jobId: string,
  providerCursor: string,
  retryInMs = 1_000,
): Promise<void> {
  await db
    .update(backfillJobs)
    .set({
      status: 'pending',
      providerCursor,
      leaseUntil: null,
      availableAt: new Date(Date.now() + retryInMs),
      updatedAt: new Date(),
    })
    .where(eq(backfillJobs.id, jobId));
}

export async function failBackfillJob(
  db: Database,
  jobId: string,
  input: { error: string; retryInMs?: number; permanent?: boolean },
): Promise<void> {
  const retryInMs = input.retryInMs ?? 30_000;
  await db
    .update(backfillJobs)
    .set({
      status: input.permanent ? 'failed' : 'pending',
      leaseUntil: null,
      lastError: input.error,
      availableAt: new Date(Date.now() + retryInMs),
      updatedAt: new Date(),
    })
    .where(eq(backfillJobs.id, jobId));
}

/** Persist a verified coverage interval. Only call after a range truly succeeds. */
export async function recordCoverage(
  db: Database,
  input: { chainId: bigint; address: string; range: CoverageRange; source: string },
): Promise<void> {
  await db.insert(backfillCoverage).values({
    chainId: input.chainId,
    address: normalizeAddress(input.address),
    rangeStart: input.range.start,
    rangeEnd: input.range.end,
    source: input.source,
  });
}

export async function getCoverage(
  db: Database,
  input: { chainId: bigint; address: string },
): Promise<CoverageRange[]> {
  const rows = await db
    .select()
    .from(backfillCoverage)
    .where(
      and(
        eq(backfillCoverage.chainId, input.chainId),
        eq(backfillCoverage.address, normalizeAddress(input.address)),
      ),
    );
  return rows.map((row) => ({ start: row.rangeStart, end: row.rangeEnd }));
}

/** Pure coverage math: which parts of `requested` are NOT covered. */
export function computeCoverageGaps(
  requested: CoverageRange,
  covered: CoverageRange[],
): CoverageRange[] {
  const relevant = covered
    .filter((range) => range.end >= requested.start && range.start <= requested.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const gaps: CoverageRange[] = [];
  let cursor = requested.start;
  for (const range of relevant) {
    if (range.start.getTime() > cursor.getTime()) {
      gaps.push({
        start: cursor,
        end: new Date(Math.min(range.start.getTime(), requested.end.getTime())),
      });
    }
    if (range.end.getTime() > cursor.getTime()) {
      cursor = new Date(Math.min(range.end.getTime(), requested.end.getTime()));
    }
  }
  if (cursor.getTime() < requested.end.getTime()) {
    gaps.push({ start: cursor, end: requested.end });
  }
  return gaps;
}

export function isFullyCovered(requested: CoverageRange, covered: CoverageRange[]): boolean {
  return computeCoverageGaps(requested, covered).length === 0;
}

export interface ProcessBackfillDeps {
  db: Database;
  chainId: bigint;
  provider: HistoryProvider;
  reader: ChainReader;
  tokenMetadata?: ReadonlyMap<string, { decimals?: number; symbol?: string }>;
  pageLimit?: number;
  maxPages?: number;
}

export interface BackfillOutcome {
  inserted: number;
  candidates: number;
  pages: number;
  providerAvailable: boolean;
  complete: boolean;
  /** Cursor for the next page when this bounded processing tick is incomplete. */
  nextCursor?: string;
}

/**
 * Process one claimed backfill job: discover candidate transactions, VERIFY them
 * against canonical block/receipt/log data, and insert normalized events.
 *
 * Deliberately does NOT materialize alerts: historical backfill must never
 * produce live notifications. Coverage is recorded only on a complete run.
 */
export async function processBackfillJob(
  deps: ProcessBackfillDeps,
  job: BackfillJobRow,
): Promise<BackfillOutcome> {
  const pageLimit = deps.pageLimit ?? 100;
  const maxPages = deps.maxPages ?? 20;

  let cursor = job.providerCursor ?? undefined;
  let candidates = 0;
  let inserted = 0;
  let pages = 0;
  let complete = false;

  while (pages < maxPages) {
    pages += 1;
    const page = await deps.provider.getAddressHistory({
      address: job.address as `0x${string}`,
      fromTimestamp: job.fromTimestamp,
      toTimestamp: job.toTimestamp,
      ...(cursor ? { cursor } : {}),
      limit: pageLimit,
    });

    candidates += page.transactions.length;
    if (page.transactions.length > 0) {
      const verified = await verifyCandidates({
        reader: deps.reader,
        chainId: Number(deps.chainId),
        candidates: page.transactions,
        ...(deps.tokenMetadata ? { tokenMetadata: deps.tokenMetadata } : {}),
      });
      inserted += (await insertEvents(deps.db, verified.events)).length;
    }

    if (page.complete) {
      complete = true;
      break;
    }
    if (!page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  if (complete) {
    await recordCoverage(deps.db, {
      chainId: deps.chainId,
      address: job.address,
      range: { start: job.fromTimestamp, end: job.toTimestamp },
      source: deps.provider.kind,
    });
  }

  return {
    inserted,
    candidates,
    pages,
    providerAvailable: true,
    complete,
    ...(!complete && cursor ? { nextCursor: cursor } : {}),
  };
}
