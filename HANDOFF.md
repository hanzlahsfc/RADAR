# RADAR handoff

Updated: 2026-10-02 (Asia/Karachi)
Repository: C:\Users\Hanzlah\RADAR
Branch: codex/radar-phase-0-foundation

## Goal and constraints

First useful demo: a private Telegram user sends one public address and receives supported 72-hour activity, transaction evidence, freshness and honest coverage. Read `radar prompt.md` and the developer brief at `C:\Users\Hanzlah\Downloads\RADAR_Developer_Brief.pdf`. Preserve existing work, use the current branch, never commit to main, deploy, or make blockchain transactions.

## Current implementation

Phase 0 foundation exists: strict TypeScript/Node 22/pnpm, grammY/Fastify/viem, PostgreSQL 16/Drizzle, bot/worker processes, commands, chain adapters, backfill continuation, coverage, indexing checkpoints/reorgs, alerts/outbox, health and documentation. `/recent` queues uncovered history and reports incompleteness rather than a false empty result. Paused watches count toward the five retained-address limit.

This continuation preserved and extended eight uncommitted files from the previous session. Explorer history now guards the documented 10,000-record cap, malformed records/timestamps, failure envelopes and invalid cursor states. Network verification now walks the fixed 72-hour window with a page budget, counts unique candidates, rejects broken continuation, and optionally checks known token-only discovery against canonical receipt/log evidence. New tests cover these behaviors.

## Verification

- Full Vitest serial run: 133 passed across 20 files (97 unit, 31 PostgreSQL integration, 5 deterministic E2E).
- Typecheck and production build passed; fixture verifier: 11 checks passed.
- See STATUS.md for final lint/format/whitespace results and git status for commit state.
- PostgreSQL initially stopped; started Docker Desktop and the existing `radar-postgres` container on localhost:5433. The full suite then passed.

## Network state and local configuration

An ignored local `.env` contains a Blockscout PRO key and a Telegram token value. Never print or commit credentials. Telegram validity and live messaging remain untested.

Read-only authenticated probe at 2026-10-02T11:48:54Z passed 8 checks; internal transactions unsupported. Fixed window 2026-09-29T11:48:19.438Z through 2026-10-02T11:48:19.438Z for `0x7300d92984d11323e7855ab69b0a4d6613a3ff01`: 8 merged pages, 340 occurrences, 203 unique candidate hashes, both streams completed. Known token-only transaction `0x9485ae07f70df6b8ea65a608425d6043cedbd18ddf242f7d5ec2163385fef285` matched a successful canonical ERC-20 Transfer receipt at block 77960830.

One preceding history probe returned HTTP 500; retry succeeded. This remains a sampled provider-completed window, not proof of all-address completeness or every candidate receipt. Provider retention/live cap behavior and RPC finality mapping remain unverified. Keep `FINALITY_VERIFIED=false`; do not enable indexing. Official docs describe soft confirmation, batch posting and Ethereum finality but do not explicitly map the tested RPC tags.

Verifier settings: `VERIFY_ADDRESS`, `VERIFY_TX_HASH`, optional `VERIFY_TOKEN_TX_HASH` (must still be in the current window), `VERIFY_HISTORY_MAX_PAGES` (default 50, allowed 1..500). Example hash will eventually age outside the window. PRO endpoint tested: `https://api.blockscout.com/v2/api?chainid=4663`.

## Remaining work

1. Verify live record-limit behavior/retention depth and cross-check additional history against bounded canonical logs.
2. Obtain provider evidence for the public RPC's finality-tag mapping. Keep indexing gated until it is documented.
3. Exercise live single-address Telegram history only after the gates pass, using a dedicated test chat. Do not send messages to others without authorization.
4. Review startup-failure cleanup and durable webhook acceptance.
5. Keep STATUS.md, docs/ACCEPTANCE.md and docs/NETWORK_VERIFICATION.md current; run relevant checks before commits.

Useful commands (Node 22 executable is local):

- `C:/Users/Hanzlah/node22-radar.exe node_modules/typescript/bin/tsc --noEmit`
- `C:/Users/Hanzlah/node22-radar.exe node_modules/typescript/bin/tsc -p tsconfig.build.json`
- `C:/Users/Hanzlah/node22-radar.exe node_modules/vitest/vitest.mjs run --no-file-parallelism`
- `C:/Users/Hanzlah/node22-radar.exe --import tsx src/entrypoints/verify-network.ts`

Do not run database tests against a populated user database; integration/E2E tests truncate their shared local test tables.
