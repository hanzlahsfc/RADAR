# RADAR status

**Current phase:** Phase 0 foundation passes local acceptance. Read-only provider feasibility is documented and sampled: history, cap/retention, exact log comparisons and finalized batch posting on Ethereum passed. The controlled Telegram demo is next; indexing remains disabled.

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
- The initial finality record lacked a tag mapping. Follow-up Arbitrum documentation plus Nitro identity, official Ethereum parent configuration, and the L1 posting comparison now support a finalized demo policy. Live indexing remains disabled with `FINALITY_VERIFIED=false`.

## Skipped checks and blockers

- Broad all-address/all-event completeness and archive state remain unverified. Live cap behavior and historical receipt/block samples now pass; cap splitting for busy addresses remains pending.
- Finalized mapping is documented by Arbitrum and corroborated with a sampled Ethereum posting receipt. Safe mapping was not independently compared with an Ethereum safe head.
- Internal/trace-derived transfers remain unsupported by the adapter.
- Live Telegram smoke: not run. A token value is present locally; validity and messaging have not been checked.
- Pons factory/ABI/launch receipt remains unverified; launch alerts disabled.
- Hosted GitHub Actions and Docker application-image build were not run.
- Bot/worker startup cleanup and durable webhook acceptance review remain queued.

## Provider follow-up verification (2026-10-02)

- Both transaction and contract-wide token streams accepted page 5,000 with offset 2 and rejected page 5,001: page multiplied by offset must not exceed 10,000. Offset-1 positions 10,000/10,001 showed the same boundary.
- Old contract transaction at block 57 (2026-05-05) and token transfer at block 433 (2026-05-12) matched canonical RPC receipts/blocks. Public RPC returned block 1 dated 2026-04-30. These are retention samples, not full archive guarantees.
- Exact ERC-20 occurrence comparisons over 77960697..77960797 (3 events) and 77359158..77359258 (1 event) matched token/address/amount data with no discrepancies.
- Public node identifies as Nitro. Arbitrum documents finalized parent-batch inheritance for Dedicated Blockchains; Robinhood's official config specifies Ethereum parent chain 1.
- Sampled L2 finalized block 78236926 belongs to batch 299387. Its posting transaction `0xe72bf89e397e2aa9b71ba012bd37d18effd6cbfab230585f5c4d882652bd2848` succeeded in canonical Ethereum block 26104693, at the Ethereum finalized head, with a matching event from the official Sequencer Inbox.
- Nitro batch RPC methods were unavailable. Authenticated explorer association and public Ethereum RPC supplied the comparison. Full batch decompression was not performed.
- Sanitized public evidence: `docs/evidence/2026-10-02-provider.json`.
- This follow-up changes documentation/evidence only. Evidence consistency, credential exclusion, Prettier and git whitespace checks passed. Previous 133-test implementation result remains the latest full suite.

## Next atomic task

Prepare a controlled single-address Telegram demo using the tested history source and `FINALITY_MODE=finalized`. Establish a dedicated private test chat and authorization for messaging, validate the local token, then exercise `/recent` with receipt-linked results and coverage. Keep the measured 10,000-record restriction explicit; add block-window splitting before claiming broad busy-address coverage. Do not enable indexing during preparation alone.
