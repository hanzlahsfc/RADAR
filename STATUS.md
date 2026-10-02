# RADAR status

**Current phase:** Phase 0 foundation passes local acceptance. The first Telegram 72-hour demo remains gated; a sampled authenticated history walk and token-only receipt comparison now pass.

## Completed tasks

- Continued on `codex/radar-phase-0-foundation`, preserving the previous session's eight pending files.
- Foundation includes bot/worker, PostgreSQL schema/migrations, chain adapters, backfills, checkpoints, alerts/outbox, private-chat commands and honest incomplete coverage.
- Authenticated Blockscout Etherscan-compatible PRO route configured locally; credentials remain ignored.
- History discovery queries native transaction and ERC-20 streams separately with descending pagination and bounded per-stream page sizes.
- Added conservative 10,000-record cap protection, strict record/timestamp parsing, failure-envelope rejection and cursor validation. These prevent false persisted complete coverage.
- Expanded network verification from two requests to a fixed-window walk with a configurable page budget, unique-candidate counts and missing/repeated-cursor rejection.
- Added known token-only discovery comparison against a successful canonical ERC-20 Transfer receipt, checking the address is neither top-level sender nor recipient.
- Updated provider evidence, acceptance and operations documentation.

## Verification (2026-10-02)

- Node 22 strict typecheck and production build: passed.
- ESLint and Prettier check: passed.
- Full Vitest, serial files against local PostgreSQL 16: **133 tests passed across 20 files** (97 unit, 31 integration, 5 deterministic E2E).
- Fixture verifier: **11 checks passed**.
- Initial full-suite attempt failed because PostgreSQL was stopped; Docker Desktop and the project's local container were started, then the suite passed.
- `git diff --check`: passed.

## Live checks and evidence

- Read-only verifier at 2026-10-02T11:48:54Z: **8 passed, 1 unsupported, 0 failed, 0 skipped**.
- Tested address: `0x7300d92984d11323e7855ab69b0a4d6613a3ff01`.
- Fixed window: 2026-09-29T11:48:19.438Z through 2026-10-02T11:48:19.438Z.
- Both history streams completed in 8 merged pages: 340 candidate occurrences, 203 unique transaction hashes.
- Token-only example `0x9485ae07f70df6b8ea65a608425d6043cedbd18ddf242f7d5ec2163385fef285` was discovered and verified against canonical successful receipt/log evidence at block 77960830.
- A prior probe encountered explorer HTTP 500; a subsequent read-only retry passed. Another transfer correctly failed the token-only assertion because it involved the address at the top level.
- Chain ID 4663, latest/safe/finalized block reads, sampled receipt and bounded logs passed.
- Official finality documentation reviewed again: stages are described, but the tested RPC's tag mapping is not explicit. Live indexing remains disabled with `FINALITY_VERIFIED=false`.

## Skipped checks and blockers

- Arbitrary-address/all-event completeness, retention depth and live record-cap behavior remain unverified. The successful walk is a sample, not a universal completeness claim.
- Provider-specific finality mapping remains unverified.
- Internal/trace-derived transfers remain unsupported by the adapter.
- Live Telegram smoke: not run. A token value is present locally; validity and messaging have not been checked.
- Pons factory/ABI/launch receipt remains unverified; launch alerts disabled.
- Hosted GitHub Actions and Docker application-image build were not run.
- Bot/worker startup cleanup and durable webhook acceptance review remain queued.

## Next atomic task

Verify provider retention and record-limit behavior, cross-check further history against bounded canonical logs, and obtain evidence mapping public RPC tags to chain finality stages. Keep live indexing gated. After those pass, exercise the single-address Telegram timeline using a dedicated test chat.
