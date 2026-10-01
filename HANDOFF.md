# RADAR Handoff

Updated: 2026-10-02 (Asia/Karachi)
Repository: C:\Users\Hanzlah\RADAR
Branch: codex/radar-phase-0-foundation

## Goal and constraints

Continue RADAR toward its first useful demo: in a private Telegram chat, a user sends one public address and receives a supported 72-hour activity timeline with transaction evidence links, freshness, and honest coverage. The user is learning blockchain, so explain concepts briefly while implementing.

Read radar prompt.md completely and use the developer brief at C:\Users\Hanzlah\Downloads\RADAR_Developer_Brief.pdf for product context. The prompt already contains an updated Telegram-first demo plan. Preserve user work. Never commit to main, deploy, or make blockchain transactions.

## Current implementation

Phase 0 foundation is implemented on the requested branch. The repo includes strict TypeScript on Node 22, pnpm lockfile, grammY/Fastify/viem, PostgreSQL 16/Drizzle schema and migrations, Zod config, Pino redaction, Vitest, ESLint/Prettier, Docker Compose, CI, separate bot/worker entry points, chain adapters, repositories, indexer/alerts modules, and docs.

The bot has the required command handlers including /recent. Live history cannot yet be claimed complete. For /recent, missing 72-hour coverage queues a backfill and reports processing/incompleteness rather than returning a false empty timeline.

Recent fixes:
- Backfill now stores its continuation cursor and is requeued when its bounded page budget ends. It records coverage/completes only when history is complete. SQL claim rows are aliased to the expected camelCase fields.
- Paused watches count toward the five retained-address limit.
- verify:network probes a second history page when a cursor is available.
- Docs correct the old Blockscout 403 interpretation.

## Verification on 2026-10-02

- Typecheck, production build, ESLint, and Prettier check passed on Node 22.
- Full Vitest: 120 passed across 18 files (84 unit, 31 PostgreSQL integration, 5 deterministic E2E).
- Fixture verifier: 11 checks passed.
- Git diff whitespace check passed before commit.
- Working tree was staged on codex/radar-phase-0-foundation; commit status should be checked when resuming.

## Network/provider state

Robinhood Chain docs specify chain ID 4663. Read-only public RPC checks on 2026-10-01 returned chain ID, latest/safe/finalized tags, bounded logs, and a sample transaction/receipt.

Blockscout documentation reviewed 2026-10-02 describes a candidate authenticated PRO API at https://api.blockscout.com for chain ID 4663. It requires an API key even for free access and exposes distinct address transaction, token-transfer, and internal-transaction endpoints. The previous 403s were from unauthenticated legacy per-instance routes; they do not test PRO API.

Authenticated responses, actual paging, record/depth limits, token-only event completeness, and finality semantics remain unverified. Do not enable live indexing until those are verified. No Telegram token or Blockscout API key is configured. No transaction has been sent and nothing has been deployed.

## Remaining items

1. Check git status/branch and read this file plus STATUS.md.
2. Obtain/configure a Blockscout PRO key locally (never commit it). Probe a known address, transactions and token transfers, and continuation paging. Update docs with exact evidence; keep the feature blocked if pagination/coverage is not proven.
3. Exercise the live /recent flow once the authenticated history source is verified and Telegram credentials are available.
4. Review lifecycle cleanup on bot/worker startup failures and durable webhook update acceptance. Do not let those distract from the first history demo.
5. Keep STATUS.md and docs/ACCEPTANCE.md current. Run the relevant suite before committing further changes.

Useful checks:
- C:/Users/Hanzlah/node22-radar.exe node_modules/typescript/bin/tsc --noEmit
- C:/Users/Hanzlah/node22-radar.exe node_modules/typescript/bin/tsc -p tsconfig.build.json
- C:/Users/Hanzlah/node22-radar.exe node_modules/vitest/vitest.mjs run

To resume in a new Codex CLI session, open C:\Users\Hanzlah\RADAR and say: “Continue RADAR from HANDOFF.md; check the branch and resume with Remaining items 1–3.”
