# RADAR status

**Current phase:** Phase 0 foundation is implemented and passes local offline acceptance. The first product demo is the Telegram single-address 72-hour timeline; its live history source still needs authenticated verification.

## Completed tasks

- Working branch `codex/radar-phase-0-foundation` is active; original repository files and prompt changes are preserved.
- Read the complete technical prompt and developer brief. Updated the prompt to focus the first demo on one address in Telegram.
- Added architecture, acceptance, network verification, coverage, and operations documentation.
- Pinned the Node 22 / pnpm stack and generated lockfile.
- Implemented bot/worker entry points, event adapters, PostgreSQL schema and migrations, Docker Compose, and CI.
- Live chain configuration is gated on explicit finality verification and startup chain-ID matching.
- Composite foreign keys enforce alert/account/watch/rule ownership.
- Backfills now preserve continuation cursors and only record full coverage after the provider says the requested history is complete. Claimed SQL rows are mapped to the expected model.
- Paused watches continue to count toward the five-address cap.
- Network verification exercises a second history page when a continuation cursor is available.
- Fixture validation handles reverted native transactions correctly.

## Verification

All checks below were rerun on 2026-10-02 with Node 22 unless noted.

- Strict typecheck: passed.
- Production TypeScript build: passed.
- ESLint: passed.
- Prettier check: passed.
- Full Vitest run: **120 tests passed across 18 files** (84 unit, 31 PostgreSQL integration, 5 deterministic E2E).
- Fixture verifier: **11 checks passed**.
- PostgreSQL 16 migration had previously applied successfully; integration tests currently pass against the local test database.
- `git diff --check`: passed.

## Network evidence and limits

- Official Robinhood RPC returned chain ID 4663, latest/safe/finalized blocks, bounded logs, and a sampled transaction/receipt in read-only checks on 2026-10-01.
- Documentation reviewed on 2026-10-02 identifies Blockscout PRO as a history API candidate at `https://api.blockscout.com`, chain ID 4663. It requires an API key even on the free tier and exposes separate transaction, token-transfer, and internal-transaction history.
- Earlier 403s came from unauthenticated legacy per-instance endpoints. They do not establish whether authenticated PRO requests work.
- Authenticated responses, pagination, record limits, history depth, token-only completeness, and provider-specific finality semantics remain unverified. Do not enable live indexing yet.

## Skipped checks and blockers

- Live Telegram smoke test: no bot token configured.
- Authenticated history and pagination check: no Blockscout API key configured.
- Pons factory/ABI/launch receipt: not verified; launch alerts must remain disabled.
- Hosted GitHub Actions and Docker image build: not run in this session.
- The accurate live 72-hour demo depends on a verified authenticated history source and finality decision.

## Next atomic task

Configure a Blockscout PRO API key in local environment (never commit it), exercise transaction and token-transfer pagination for a known address, verify a token-only transfer and coverage boundary, then document the exact results before enabling live history.
