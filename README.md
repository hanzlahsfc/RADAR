# RADAR

RADAR is a Telegram-first, read-only wallet activity tracker for Robinhood Chain. The first demo takes one public address and returns supported activity from the last 72 hours with transaction evidence and clear coverage/freshness.

## Chain concepts

An EVM transaction is an action submitted to the network. Its receipt records success/failure and emitted logs. Native ETH is carried on top-level transactions; ERC-20 transfers are typically Transfer logs. An indexer reads bounded ranges, verifies evidence and block hashes, stores facts and advances a cursor to resume. A reorg replaces recent blocks; comparing hashes identifies events to retract and replay.

A transfer alone does not prove a purchase. A watched address does not prove ownership. Internal transfers need separate trace coverage.

## Setup

Use Node 22.23.3 and pnpm 11.13.1. Copy .env.example to .env; start PostgreSQL 16 with docker compose up -d postgres; run pnpm install --frozen-lockfile and pnpm db:migrate.

Offline commands require no Telegram or chain credentials: pnpm typecheck, pnpm lint, pnpm format:check, pnpm test, pnpm verify:fixtures and pnpm build. PostgreSQL suites are pnpm test:integration and pnpm test:e2e. Run bot/worker with pnpm dev:bot and pnpm dev:worker.

See docs/NETWORK_VERIFICATION.md and docs/COVERAGE.md. Blockscout documents a key-required PRO API for Robinhood Chain; a sampled authenticated 72-hour walk and token-only receipt comparison passed. Live indexing remains gated on provider limits, retention depth, broader event coverage and finality mapping.
