import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { alertOutbox } from './alert-outbox.js';

/**
 * Diagnostic record of each delivery attempt. `error_sanitized` must never
 * contain credentials. Retention is bounded by a maintenance job (see RUNBOOK).
 */
export const deliveryAttempts = pgTable(
  'delivery_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    outboxId: uuid('outbox_id')
      .notNull()
      .references(() => alertOutbox.id, { onDelete: 'cascade' }),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
    /** sent | retryable_failure | permanent_failure | rate_limited */
    outcome: text('outcome').notNull(),
    /** transient | permanent | rate_limit | blocked | unknown */
    retryClassification: text('retry_classification').notNull().default('unknown'),
    errorSanitized: text('error_sanitized'),
  },
  (table) => [
    index('delivery_attempts_outbox_idx').on(table.outboxId),
    index('delivery_attempts_time_idx').on(table.attemptedAt),
  ],
);

export type DeliveryAttemptRow = typeof deliveryAttempts.$inferSelect;
