import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Normalized, application-level chain events.
 *
 * `amount_raw` uses numeric(78,0): exact base-unit integers (uint256 fits in 78
 * decimal digits). Drizzle returns numeric as a string, so callers convert with
 * BigInt — never JavaScript floating point.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chainId: bigint('chain_id', { mode: 'bigint' }).notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
    blockHash: text('block_hash').notNull(),
    transactionHash: text('transaction_hash').notNull(),
    logIndex: integer('log_index'),
    /** "native:0" or "log:<logIndex>:<decodedEventKind>" */
    eventKey: text('event_key').notNull(),

    /** native_transfer | erc20_transfer | token_launch */
    kind: text('kind').notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),

    fromAddress: text('from_address'),
    toAddress: text('to_address'),
    tokenAddress: text('token_address'),

    amountRaw: numeric('amount_raw', { precision: 78, scale: 0 }),
    tokenDecimals: integer('token_decimals'),
    tokenSymbol: text('token_symbol'),

    factoryAddress: text('factory_address'),
    creatorAddress: text('creator_address'),
    launchedTokenAddress: text('launched_token_address'),

    canonical: boolean('canonical').notNull().default(true),
    /** pending | confirmed | orphaned */
    confirmationStatus: text('confirmation_status').notNull().default('confirmed'),

    /** Raw source evidence (untrusted). */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('events_identity_key').on(
      table.chainId,
      table.blockHash,
      table.transactionHash,
      table.eventKey,
    ),
    index('events_from_idx').on(table.chainId, table.fromAddress, table.blockNumber),
    index('events_to_idx').on(table.chainId, table.toAddress, table.blockNumber),
    index('events_token_idx').on(table.chainId, table.tokenAddress, table.blockNumber),
    index('events_creator_idx').on(table.chainId, table.creatorAddress, table.blockNumber),
    index('events_block_idx').on(table.chainId, table.blockNumber),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
