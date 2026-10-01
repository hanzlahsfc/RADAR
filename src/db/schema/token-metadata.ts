import { bigint, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** Token symbol/name are UNTRUSTED text; keep the raw values for display escaping. */
export const tokenMetadata = pgTable(
  'token_metadata',
  {
    chainId: bigint('chain_id', { mode: 'bigint' }).notNull(),
    address: text('address').notNull(),
    symbol: text('symbol'),
    name: text('name'),
    decimals: integer('decimals'),
    rawSymbol: text('raw_symbol'),
    rawName: text('raw_name'),
    /** 'ok' | 'partial' | 'missing' | 'unknown' */
    status: text('status').notNull().default('unknown'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.chainId, table.address] })],
);

export type TokenMetadataRow = typeof tokenMetadata.$inferSelect;
