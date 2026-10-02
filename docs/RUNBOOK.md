# Local and operations runbook

Install Node 22.23.3 and pnpm 11.13.1. Copy .env.example to .env; blank Telegram/chain values are intentional offline. Start PostgreSQL 16 with docker compose up -d postgres (host port 5433), run pnpm install --frozen-lockfile and pnpm db:migrate.

Run pnpm typecheck, pnpm lint, pnpm format:check, pnpm test, pnpm test:integration, pnpm test:e2e, pnpm verify:fixtures and pnpm build. Bot and worker run separately with pnpm dev:bot and pnpm dev:worker. Bot needs a Telegram token and database; worker needs a database. Live chain setup requires network verification.

Both processes expose /health/live and /health/ready. Freshness is separate so provider outages report stale data without restart loops.

## Migrations and containers

Run migrations once before app replicas roll out. In development use pnpm db:migrate; in production use node dist/src/entrypoints/migrate.js. Dockerfile defines bot and worker targets. Supply secrets through runtime secret storage.

## Backup and retention

Backup: pg_dump --format=custom --no-owner --file=radar.dump "$DATABASE_URL". Restore into an empty DB: pg_restore --no-owner --dbname="$DATABASE_URL" radar.dump. Encrypt backups and test restores.

Plan to retain processed Telegram payloads for 30 days and delivery diagnostics for 90 days. Automated cleanup is not implemented yet; schedule and monitor it before production.

## Provider recovery

Never turn incomplete pagination or provider failure into an empty successful timeline. Leave the interval uncovered and cursor at last complete range. Restore provider and replay from persisted cursor; inspect deep reorgs before resuming.
## Read-only Blockscout history check

Create a free PRO API key at https://dev.blockscout.com (Blockscout says the free tier does not require a credit card). Keep the key in the ignored local .env file; do not paste it into chat or commit it. Set CHAIN_ID=4663, RPC_HTTP_URL=https://rpc.mainnet.chain.robinhood.com, EXPLORER_BASE_URL=https://robinhoodchain.blockscout.com, EXPLORER_API_BASE_URL=https://api.blockscout.com/v2/api?chainid=4663, and EXPLORER_API_KEY=<your-key>. Set VERIFY_ADDRESS to a known busy Robinhood Chain address and VERIFY_TX_HASH to a known transaction hash, then run pnpm verify:network. This command only reads chain data. Set VERIFY_TOKEN_TX_HASH to a known token-only ERC-20 transaction within the current 72-hour window. VERIFY_HISTORY_MAX_PAGES defaults to 50 (1..500); the verifier walks all pages until both streams complete or the budget ends, and compares the known transaction with its successful canonical receipt. Reaching the budget is explicitly incomplete. A sampled success does not prove arbitrary-address coverage, retention depth, live cap behavior or finality semantics. Record actual responses and gaps in docs/NETWORK_VERIFICATION.md before enabling live indexing.
