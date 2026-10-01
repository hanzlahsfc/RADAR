# RADAR architecture decisions

**Date:** 2026-10-01. Product scope: RADAR developer brief; engineering contract: radar prompt.md.

RADAR is a Telegram-first, read-only Robinhood Chain public-wallet tracker. The first demo accepts one address and returns supported events from the last 72 hours with evidence links, freshness and coverage limits. Keep observed facts separate from interpretation. A token transfer alone does not prove a purchase; a watched address does not prove ownership; unsigned web activity is not visible onchain.

Use one strict TypeScript package on Node 22 with pnpm. grammY handles Telegram, Fastify serves health/webhooks, viem performs read-only EVM RPC, PostgreSQL 16 and Drizzle store accounts, events, jobs, cursors and delivery outbox. Zod validates process configuration, Pino emits structured redacted logs, and Vitest/ESLint/Prettier provide checks. Bot and worker are separate processes; PostgreSQL replaces the need for Redis initially.

Keep acquisition, evidence validation/decoding, persistence, alert evaluation, delivery and Telegram formatting separate. Explorer data discovers candidates; canonical blocks, transactions, receipts and logs verify events. Store base-unit integers exactly (PostgreSQL numeric(78,0)); never use floating point for blockchain amounts. Coverage is explicit by provider, stream, address and interval. Empty activity is only conclusive for completed coverage.

Enable live indexing only after chain ID matches eth_chainId, endpoint reads succeed, history pagination and token-only event coverage are proven, and finality semantics are documented. Robinhood distinguishes sequencer soft confirmation, L1 batch posting and Ethereum finality. RPC support for safe/finalized tags alone does not prove their economic meaning. Pons alerts remain disabled without verified factory deployment, bytecode, ABI and actual receipt evidence.

Telegram IDs use bigint. Watches are account-scoped and unique by account/chain/normalized address; the five-watch limit is transactional. Events deduplicate by chain/block hash/transaction hash/event key. Canonical-block uniqueness supports reorg detection. Outbox rule/event uniqueness prevents duplicate alerts during replay; leases support recovery after restart.

Learning notes: a transaction receipt records success/failure and emitted contract logs. Native ETH is on a top-level transaction; ERC-20 movement is typically a Transfer log. An indexer reads bounded ranges and saves a cursor to resume. Reorgs replace recent blocks, so block hashes reveal events that may need retracting.

The official public RPC returned read-only responses on 2026-10-01. Tested Blockscout address-history endpoints returned HTTP 403, so historical coverage is blocked pending a verified provider.
