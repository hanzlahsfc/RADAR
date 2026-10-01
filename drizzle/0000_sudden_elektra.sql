CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "accounts_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE "watched_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"chain_id" bigint NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"active" boolean DEFAULT true NOT NULL,
	"alert_start_block" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "watched_wallets_account_chain_address_key" UNIQUE("account_id","chain_id","address"),
	CONSTRAINT "watched_wallets_removed_inactive" CHECK ("watched_wallets"."removed_at" IS NULL OR "watched_wallets"."active" = false)
);
--> statement-breakpoint
CREATE TABLE "token_metadata" (
	"chain_id" bigint NOT NULL,
	"address" text NOT NULL,
	"symbol" text,
	"name" text,
	"decimals" integer,
	"raw_symbol" text,
	"raw_name" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "token_metadata_chain_id_address_pk" PRIMARY KEY("chain_id","address")
);
--> statement-breakpoint
CREATE TABLE "indexed_blocks" (
	"chain_id" bigint NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"parent_hash" text NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"canonical" boolean DEFAULT true NOT NULL,
	CONSTRAINT "indexed_blocks_chain_id_block_hash_pk" PRIMARY KEY("chain_id","block_hash")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" bigint NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"log_index" integer,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"from_address" text,
	"to_address" text,
	"token_address" text,
	"amount_raw" numeric(78, 0),
	"token_decimals" integer,
	"token_symbol" text,
	"factory_address" text,
	"creator_address" text,
	"launched_token_address" text,
	"canonical" boolean DEFAULT true NOT NULL,
	"confirmation_status" text DEFAULT 'confirmed' NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_identity_key" UNIQUE("chain_id","block_hash","transaction_hash","event_key")
);
--> statement-breakpoint
CREATE TABLE "index_cursors" (
	"stream_key" text PRIMARY KEY NOT NULL,
	"chain_id" bigint NOT NULL,
	"last_processed_block" bigint NOT NULL,
	"last_processed_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backfill_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" bigint NOT NULL,
	"address" text NOT NULL,
	"from_timestamp" timestamp with time zone NOT NULL,
	"to_timestamp" timestamp with time zone NOT NULL,
	"provider_cursor" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"coverage_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backfill_jobs_status_check" CHECK ("backfill_jobs"."status" IN ('pending','running','completed','failed','cancelled')),
	CONSTRAINT "backfill_jobs_window_check" CHECK ("backfill_jobs"."to_timestamp" >= "backfill_jobs"."from_timestamp")
);
--> statement-breakpoint
CREATE TABLE "backfill_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" bigint NOT NULL,
	"address" text NOT NULL,
	"range_start" timestamp with time zone NOT NULL,
	"range_end" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watch_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_address" text,
	"direction" text DEFAULT 'both' NOT NULL,
	"threshold_raw" numeric(78, 0),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_rules_kind_check" CHECK ("alert_rules"."kind" IN ('eth_native','erc20_transfer','token_launch')),
	CONSTRAINT "alert_rules_direction_check" CHECK ("alert_rules"."direction" IN ('in','out','both'))
);
--> statement-breakpoint
CREATE TABLE "alert_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"watch_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"telegram_message_id" bigint,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "alert_outbox_rule_event_key" UNIQUE("rule_id","event_id"),
	CONSTRAINT "alert_outbox_status_check" CHECK ("alert_outbox"."status" IN ('pending','sending','sent','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbox_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"retry_classification" text DEFAULT 'unknown' NOT NULL,
	"error_sanitized" text
);
--> statement-breakpoint
CREATE TABLE "processed_telegram_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_update_inbox" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "watched_wallets" ADD CONSTRAINT "watched_wallets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_watch_id_watched_wallets_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watched_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_outbox" ADD CONSTRAINT "alert_outbox_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_outbox" ADD CONSTRAINT "alert_outbox_watch_id_watched_wallets_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watched_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_outbox" ADD CONSTRAINT "alert_outbox_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_outbox" ADD CONSTRAINT "alert_outbox_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_outbox_id_alert_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."alert_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watched_wallets_account_idx" ON "watched_wallets" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "watched_wallets_active_scan_idx" ON "watched_wallets" USING btree ("chain_id","address") WHERE "watched_wallets"."active" = true AND "watched_wallets"."removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "indexed_blocks_canonical_number_key" ON "indexed_blocks" USING btree ("chain_id","block_number") WHERE "indexed_blocks"."canonical" = true;--> statement-breakpoint
CREATE INDEX "indexed_blocks_number_idx" ON "indexed_blocks" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE INDEX "events_from_idx" ON "events" USING btree ("chain_id","from_address","block_number");--> statement-breakpoint
CREATE INDEX "events_to_idx" ON "events" USING btree ("chain_id","to_address","block_number");--> statement-breakpoint
CREATE INDEX "events_token_idx" ON "events" USING btree ("chain_id","token_address","block_number");--> statement-breakpoint
CREATE INDEX "events_creator_idx" ON "events" USING btree ("chain_id","creator_address","block_number");--> statement-breakpoint
CREATE INDEX "events_block_idx" ON "events" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE INDEX "index_cursors_chain_idx" ON "index_cursors" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "backfill_jobs_claim_idx" ON "backfill_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "backfill_jobs_address_idx" ON "backfill_jobs" USING btree ("chain_id","address");--> statement-breakpoint
CREATE INDEX "backfill_coverage_address_idx" ON "backfill_coverage" USING btree ("chain_id","address");--> statement-breakpoint
CREATE INDEX "alert_rules_watch_idx" ON "alert_rules" USING btree ("watch_id");--> statement-breakpoint
CREATE INDEX "alert_rules_enabled_idx" ON "alert_rules" USING btree ("kind") WHERE "alert_rules"."enabled" = true;--> statement-breakpoint
CREATE INDEX "alert_outbox_claim_idx" ON "alert_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "alert_outbox_account_idx" ON "alert_outbox" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "alert_outbox_watch_idx" ON "alert_outbox" USING btree ("watch_id");--> statement-breakpoint
CREATE INDEX "delivery_attempts_outbox_idx" ON "delivery_attempts" USING btree ("outbox_id");--> statement-breakpoint
CREATE INDEX "delivery_attempts_time_idx" ON "delivery_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "telegram_update_inbox_unprocessed_idx" ON "telegram_update_inbox" USING btree ("processed_at");