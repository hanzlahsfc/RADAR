# RADAR — Implementation Prompt

Build **RADAR**, a Telegram bot that monitors public wallet activity on Robinhood Chain. Implement the application, tests, migrations, local infrastructure, and documentation—not just a plan.

Use the developer brief as product context. The technical decisions below govern the Telegram implementation.

## 1. Product scope

Users must be able to:

- Start the bot in a private Telegram chat.
- Watch up to five public wallet addresses.
- Request the last 72 hours of supported activity.
- Receive alerts for incoming native ETH above a configured threshold, transfers above a configured threshold for an allowlisted ERC-20 token, and a verified launch event from a supported Pons factory involving a watched wallet.
- Pause or remove watches.
- Check indexing freshness and coverage limitations.

### First demo plan

Build the first demonstration as a Telegram bot. Its initial user flow should stay
focused:

1. A user starts the bot in a private chat and sends one public wallet address.
2. RADAR checks the requested 72-hour window and returns supported activity with
   transaction links, timestamps, amounts, counterparties, and honest coverage
   and freshness information.
3. If history is incomplete or the provider is unavailable, RADAR says so
   explicitly instead of presenting an empty timeline as complete.

Make this accurate, understandable, and easy to demonstrate before expanding
the user flow. Add saved watches, configurable alerts, and restart/retry
hardening after the single-address timeline is proven. Keep the bot as the
version-one interface; a dashboard, wallet sign-in, and payments are outside
the initial demo.

The main question the demo should answer is: **"What changed in this wallet
since I last checked?"** Show observed facts and link each event to its chain
evidence. Keep interpretations separate and label them as interpretations.

Version one is free and read-only. It requires no user wallet connection, private keys, custom smart contracts, token issuance, or payment integration.

A watched address does not imply ownership. Never label a transfer as a purchase without separately implemented swap decoding.

## 2. Mandatory stack

| Component | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Language | TypeScript, strict mode |
| Package manager | pnpm |
| Telegram integration | grammY |
| HTTP server | Fastify |
| Blockchain reads | viem |
| Database | PostgreSQL 16 |
| Schema and migrations | Drizzle ORM + Drizzle Kit |
| Configuration validation | Zod |
| Logging | Pino |
| Testing | Vitest |
| Formatting/lint | Prettier + ESLint |
| Local infrastructure | Docker Compose |
| CI | GitHub Actions |

Resolve compatible stable dependency versions during setup, pin them, and commit the lockfile. Do not invent package versions.

Use PostgreSQL for persistent jobs and the delivery outbox. Do not add Redis initially.

## 3. Repository layout

Use one package with separate executable entry points:

```text
src/
  entrypoints/
    bot.ts
    worker.ts
    migrate.ts
    verify-network.ts
    verify-fixtures.ts
  config/
    env.ts
    network.ts
    contracts.ts
  bot/
    create-bot.ts
    middleware/
      private-chat.ts
      account.ts
      rate-limit.ts
    commands/
      start.ts
      help.ts
      watch.ts
      unwatch.ts
      list.ts
      recent.ts
      alerts.ts
      pause.ts
      resume.ts
      status.ts
      delete-me.ts
    formatters/
      event.ts
      timeline.ts
      status.ts
  chain/
    client.ts
    types.ts
    history-provider.ts
    rpc-block-provider.ts
    explorer-history-provider.ts
    token-metadata.ts
    receipt-validation.ts
    adapters/
      native-transfer.ts
      erc20-transfer.ts
      pons-launch.ts
  indexer/
    scheduler.ts
    backfill.ts
    live.ts
    checkpoints.ts
    canonicality.ts
  alerts/
    rules.ts
    materialize.ts
    outbox.ts
    deliver.ts
  db/
    client.ts
    schema/
    repositories/
  shared/
    amounts.ts
    addresses.ts
    errors.ts
    retry.ts
    clock.ts

tests/
  unit/
  integration/
  fixtures/
  e2e/
drizzle/
docs/
  ARCHITECTURE.md
  NETWORK_VERIFICATION.md
  COVERAGE.md
  ACCEPTANCE.md
  RUNBOOK.md
.env.example
docker-compose.yml
Dockerfile
README.md
STATUS.md
```

Keep Telegram formatting separate from blockchain acquisition and decoding.

## 4. Environment configuration

Validate environment variables at startup. Provide safe example values without real credentials.

```dotenv
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=postgresql://radar:radar@localhost:5432/radar

TELEGRAM_BOT_TOKEN=
TELEGRAM_TRANSPORT=polling
TELEGRAM_WEBHOOK_SECRET=
PUBLIC_BASE_URL=
PORT=3000

CHAIN_ID=
RPC_HTTP_URL=
EXPLORER_BASE_URL=
EXPLORER_API_BASE_URL=
EXPLORER_API_KEY=

HISTORY_PROVIDER=explorer
FINALITY_MODE=
CONFIRMATION_DEPTH=
POLL_INTERVAL_MS=5000
INITIAL_BLOCK_BATCH_SIZE=100
MAX_BACKFILL_HOURS=72
MAX_WATCHES_PER_ACCOUNT=5
```

Rules:

- Fail startup if the configured chain ID differs from `eth_chainId`.
- Live mode must require a verified finality configuration.
- Never default silently to Ethereum mainnet or another network.
- Redact Telegram tokens, provider credentials, and credential-bearing URLs.
- Store contract addresses and supported token lists in validated configuration.
- The brief's network values are candidates to verify, not trusted defaults.

## 5. Network and provider verification

Before implementing live indexing, build `pnpm verify:network`.

It must:

1. Read `eth_chainId`.
2. Read the latest block and timestamp.
3. Check whether `safe` and `finalized` block tags are supported.
4. Fetch a known transaction and receipt.
5. Test bounded `eth_getLogs`.
6. Check historical address API pagination and limits.
7. Identify whether internal transactions are included or excluded.
8. Produce a concise report with secrets redacted.

Record verified endpoints, documentation sources, access date, finality semantics, provider limitations, and sample transaction hashes in `docs/NETWORK_VERIFICATION.md`.

Do not infer economic finality merely because a provider accepts a block tag. Confirm the chain's documented meaning.

If history access is unavailable, implement and test the provider interface using fixtures. Clearly mark live historical coverage as blocked rather than returning an empty successful result.

## 6. Blockchain data interfaces

Implement a provider abstraction:

```ts
type Address = `0x${string}`;
type Hash = `0x${string}`;

interface HistoryQuery {
  address: Address;
  fromTimestamp: Date;
  toTimestamp: Date;
  cursor?: string;
  limit: number;
}

interface HistoryPage {
  transactions: TransactionCandidate[];
  nextCursor?: string;
  complete: boolean;
}

interface HistoryProvider {
  getAddressHistory(query: HistoryQuery): Promise<HistoryPage>;
}

interface TransactionCandidate {
  hash: Hash;
  blockNumber: bigint;
}

interface ChainReader {
  getHead(): Promise<bigint>;
  getConfirmedHead(): Promise<bigint>;
  getBlock(number: bigint): Promise<NormalizedBlock>;
  getReceipt(hash: Hash): Promise<NormalizedReceipt>;
}
```

Define `NormalizedBlock` and `NormalizedReceipt` in `src/chain/types.ts` with the block, transaction, receipt-status, and log fields needed by the adapters.

Explorer data discovers candidate transactions. Verify displayed events against canonical block/receipt/log data. Ensure historical discovery covers supported token events as well as top-level transactions; do not assume a normal-transactions endpoint includes token-only activity.

For live native transfers, inspect top-level transactions in bounded block batches. Fetch receipts for matching transactions and exclude failed transactions.

For supported token events, query logs in bounded ranges and filter against watched addresses. Split ranges adaptively when the provider rejects oversized queries.

Do not perform a full-chain scan for each Telegram command.

## 7. Normalized events

Use this application-level event model:

```ts
type EventKind =
  | "native_transfer"
  | "erc20_transfer"
  | "token_launch";

interface ChainEvent {
  chainId: number;
  blockNumber: bigint;
  blockHash: Hash;
  transactionHash: Hash;

  // "native:0" or "log:<logIndex>:<decodedEventKind>"
  eventKey: string;

  kind: EventKind;
  timestamp: Date;

  fromAddress?: Address;
  toAddress?: Address;
  tokenAddress?: Address;

  amountRaw?: string;
  tokenDecimals?: number;
  tokenSymbol?: string;

  factoryAddress?: Address;
  creatorAddress?: Address;
  launchedTokenAddress?: Address;

  canonical: boolean;
  confirmationStatus: "pending" | "confirmed" | "orphaned";
}
```

Requirements:

- Preserve original integer amounts as decimal strings or `bigint`.
- Never use JavaScript floating-point arithmetic for token values or thresholds.
- Format amounts with verified token decimals.
- If decimals cannot be retrieved, display raw units and label the limitation.
- Treat symbols, names, and labels as untrusted text.
- Store event direction relative to a watch at presentation time; the same event can be incoming for one watch and outgoing for another.
- Represent self-transfers once per watch.

## 8. Database specification

Create migrations with these tables and constraints.

### accounts

```text
id uuid primary key
telegram_user_id bigint unique not null
telegram_chat_id bigint not null
timezone text not null default 'UTC'
created_at timestamptz not null
deleted_at timestamptz nullable
```

Store Telegram IDs safely without truncating them.

### watched_wallets

```text
id uuid primary key
account_id uuid references accounts
chain_id bigint not null
address text not null
label text nullable
active boolean not null default true
alert_start_block bigint not null
created_at timestamptz not null

unique(account_id, chain_id, address)
```

Normalize addresses consistently. Enforce the five-watch limit transactionally so simultaneous requests cannot exceed it. Model paused versus removed state explicitly if needed rather than overloading a boolean ambiguously.

### token_metadata

```text
chain_id bigint
address text
symbol text nullable
name text nullable
decimals integer nullable
fetched_at timestamptz
status text

primary key(chain_id, address)
```

### indexed_blocks

```text
chain_id bigint
block_number bigint
block_hash text
parent_hash text
block_timestamp timestamptz
canonical boolean

primary key(chain_id, block_hash)
```

Add a partial unique index allowing only one canonical hash for each chain/block number.

### events

Store the normalized event fields, raw source evidence, and timestamps.

```text
unique(chain_id, block_hash, transaction_hash, event_key)
```

Index:

- `(chain_id, from_address, block_number)`
- `(chain_id, to_address, block_number)`
- `(chain_id, token_address, block_number)`
- `(chain_id, creator_address, block_number)`

### index_cursors

```text
stream_key text primary key
chain_id bigint
last_processed_block bigint
last_processed_hash text
updated_at timestamptz
```

Separate cursors by source/stream so failure in token indexing cannot falsely advance native-transfer coverage.

### backfill_jobs

```text
id uuid primary key
chain_id bigint
address text
from_timestamp timestamptz
to_timestamp timestamptz
provider_cursor text nullable
status text
attempts integer
available_at timestamptz
lease_until timestamptz nullable
last_error text nullable
```

Persist explicit completed coverage ranges. An empty result is not evidence that the requested range was fully indexed.

### alert_rules

```text
id uuid primary key
watch_id uuid references watched_wallets
kind text
token_address text nullable
direction text
threshold_raw numeric(78,0) nullable
enabled boolean
created_at timestamptz
updated_at timestamptz
```

### alert_outbox

```text
id uuid primary key
account_id uuid
watch_id uuid
rule_id uuid
event_id uuid
status text
attempts integer
available_at timestamptz
lease_until timestamptz nullable
telegram_message_id bigint nullable
last_error text nullable
created_at timestamptz
sent_at timestamptz nullable

unique(rule_id, event_id)
```

### delivery_attempts

Record attempt time, outcome, retry classification, and sanitized error details.

### processed_telegram_updates

```text
update_id bigint primary key
processed_at timestamptz
```

Add a durable Telegram update inbox if needed for webhook acknowledgment before processing. Incoming updates must not disappear between acknowledgment and durable acceptance.

Add foreign keys, suitable check constraints, and indexes for job claiming and outbox delivery. Define bounded retention for raw updates and delivery diagnostics.

## 9. Telegram commands

Implement these exact command forms:

```text
/start
/help
/watch <address> [label]
/list
/unwatch <watch-id>
/recent <address>
/alerts <watch-id>
/alerts <watch-id> eth <minimum-eth>
/alerts <watch-id> token <token-address> <minimum-token-amount>
/alerts <watch-id> launches on
/alerts <watch-id> launches off
/pause <watch-id>
/resume <watch-id>
/status
/delete_me
```

Behavior:

- Only accept account-changing commands in private chats.
- `/watch` adds the watch, records the activation block, and schedules historical backfill.
- Historical backfill does not generate live notifications.
- Repeating `/watch` returns the existing watch.
- `/recent` responds promptly with a processing message if backfill is needed.
- Paginate results and keep each message within Telegram limits.
- `/pause` suppresses alerts; `/resume` starts from the current confirmed point without flooding old notifications.
- `/unwatch` disables associated rules and cancels unsent alerts.
- `/delete_me` requires explicit confirmation, then removes account-specific data and pending deliveries.
- Watching public addresses never asks for a seed phrase or signature.

Example alert:

```text
RADAR · Incoming ETH

Wallet: Launch wallet
Received: 0.4000 ETH
From: 0x1234…abcd
Time: 14:03 UTC
Status: Confirmed

[View transaction]
```

Use deterministic templates initially. Do not add an LLM dependency.

## 10. Historical timeline implementation

For each request:

1. Validate the address.
2. Compute the requested 72-hour interval.
3. Check persisted coverage.
4. Serve verified cached events where available.
5. Enqueue missing bounded ranges.
6. Retrieve candidate transactions with pagination.
7. Verify receipts, blocks, and logs.
8. Insert normalized events idempotently.
9. Persist coverage only after the range is successfully processed.
10. Render a timeline with freshness and coverage information.

Explicitly distinguish:

```text
No supported activity found in a fully indexed interval.
```

from:

```text
History is incomplete because the data provider is unavailable.
```

## 11. Continuous indexing and reorg handling

The worker must:

- Poll the confirmed head.
- Acquire a per-stream lease or advisory lock.
- Process bounded block batches.
- Insert events and update the cursor in the same database transaction.
- Release locks on completion/failure.
- Resume safely after restart.
- Maintain a recent block-hash window.

If hashes disagree:

1. Find the common ancestor within the retained window.
2. Mark replaced blocks/events as orphaned.
3. Cancel unsent alerts referencing orphaned events.
4. Rewind affected cursors.
5. Replay canonical blocks.
6. Mark already-delivered affected alerts as corrected where possible.
7. If the fork exceeds the retained window, stop that stream and report degraded status instead of guessing.

Use a finality policy verified for the target network. Document the tradeoff between alert speed and confirmation confidence.

## 12. Alert evaluation and delivery

Create alert records transactionally from confirmed canonical events. Ensure alert materialization has its own durable progress or runs atomically with event ingestion so a crash cannot leave saved events permanently unevaluated.

Rules:

- ETH thresholds use wei.
- Token thresholds use the token's base units.
- Threshold comparison is inclusive: `amount >= threshold`.
- Default token-transfer rule covers incoming and outgoing transfers.
- Self-transfers generate no duplicate message.
- Only events after watch activation qualify for live alerts.
- Replayed events must not recreate the same logical alert.

Delivery:

- Claim outbox rows using database locking and expiring leases.
- Send outside long-running database transactions.
- Store successful Telegram message IDs.
- Respect Telegram's retry instructions for rate limits.
- Retry transient errors with bounded exponential backoff and jitter.
- Stop delivery to blocked or unavailable chats.
- Recheck watch/account state before sending.
- Document that a timeout after Telegram accepts a message can cause an ambiguous outcome; do not promise exactly-once delivery.

## 13. Pons launch adapter

Do not guess Pons addresses or ABI fields.

Before enabling:

1. Locate the authoritative factory deployment.
2. Verify deployed bytecode exists on the configured network.
3. Obtain and record the ABI source and version.
4. Locate an actual launch transaction.
5. Decode its receipt.
6. Define which decoded field associates the launch with the watched address.
7. Add the transaction as a fixture.

The adapter must reject:

- Events from nonallowlisted factories.
- Unknown event signatures.
- Failed transactions.
- Unsupported deployment versions.
- Launch claims based only on a token transfer or transaction sender.

If verification cannot be completed, leave launch alerts disabled and expose that status. Continue implementing ETH and ERC-20 monitoring.

## 14. Testing requirements

Use behavior-focused tests.

### Unit tests

- Address validation and normalization.
- Exact amount parsing and formatting.
- Threshold boundaries.
- Missing token metadata.
- Malicious formatting in token names.
- Native and ERC-20 decoding.
- Self-transfers.
- Unsupported launch events.

### Database integration tests

- Concurrent five-watch limit enforcement.
- Account isolation.
- Duplicate events and Telegram updates.
- Atomic cursor advancement.
- Worker lease recovery.
- Outbox retries and cancellation.
- Reorg rollback/replay.
- Account deletion.

### End-to-end tests

- Start → watch → recent → alert → pause → resume → unwatch.
- Provider outage produces a visible stale-data state.
- Restart resumes without losing indexed progress.
- Historical backfill does not generate alert floods.
- A second account watching the same wallet receives only its own configured alerts.

Live checks must use dedicated test accounts. Never make transfers or purchases merely to satisfy a test without explicit authorization.

## 15. Required commands

Implement and document:

```text
pnpm dev:bot
pnpm dev:worker

pnpm build
pnpm start:bot
pnpm start:worker

pnpm db:generate
pnpm db:migrate

pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:integration
pnpm test:e2e

pnpm verify:network
pnpm verify:fixtures
```

`test:e2e` must have a deterministic local mode. Live Telegram smoke tests must be separately enabled and must never be reported as passed when skipped.

## 16. Local infrastructure and deployment

Provide:

- PostgreSQL Docker Compose service with health check and persistent volume.
- Bot and worker Docker build targets or separate commands from one image.
- Graceful shutdown for both processes.
- A migration step executed once before application rollout.
- Health endpoints:
  - `/health/live`: process is responsive.
  - `/health/ready`: database and required configuration are usable.
- Separate indexing freshness status; provider failure should be visible without causing endless container restarts.
- Deployment instructions for an always-running container environment.
- Database backup/restore instructions.

Production Telegram mode uses an HTTPS webhook with a validated secret. Persist accepted updates before acknowledgment. Local polling and production webhooks must not run simultaneously for the same bot.

## 17. Implementation sequence

Implement in this order:

1. **Phase 0:** decisions, network probe, project skeleton, database, CI.
2. **Phase 1:** Telegram private-chat onboarding and single-address `/recent`
   flow, including explicit incomplete-coverage and provider-outage responses.
3. **Phase 2:** verified 72-hour historical timeline. This is the first demo
   milestone: one address in, an accurate, evidence-linked timeline out.
4. **Phase 3:** Telegram accounts, up to five saved watches, and backfill
   scheduling.
5. **Phase 4:** continuous indexing, checkpoints, and reorg handling.
6. **Phase 5:** ETH and supported-token alerts with durable delivery.
7. **Phase 6:** verified Pons launch adapter.
8. **Phase 7:** end-to-end verification, operational documentation, and
   private-beta readiness.

Do not start payments, token gating, a frontend dashboard, or AI explanations before these phases are complete.

## 18. Working protocol

For each task:

1. Define one atomic outcome and acceptance criteria.
2. Add a failing behavioral test before production logic.
3. For configuration/documentation work, use a relevant validation check rather than artificial tests.
4. Implement the scoped change.
5. Run the relevant verification commands.
6. Exercise the real flow where credentials are available.
7. Have another agent independently review the change.
8. Resolve material findings.
9. Commit the change.
10. Update `STATUS.md` and `docs/ACCEPTANCE.md`.

`STATUS.md` must record:

```text
Current phase
Completed tasks
Verification commands and results
Live checks performed
Skipped checks and reasons
Open blockers
Next atomic task
```

Explain new blockchain concepts briefly as they arise; this project is also a learning exercise.

## 19. First action and completion criteria

Inspect the repository and applicable instructions. Preserve existing work. Work on:

```text
codex/radar-phase-0-foundation
```

Do not modify `main`.

Begin with **Phase 0.1: architecture decisions and network/data feasibility**. Then implement the skeleton and proceed through the roadmap.

When credentials are missing, finish all independent implementation and deterministic tests, then request only the specific missing configuration. Never fabricate live data or mark an unverified integration complete.

The first usable milestone and live demonstration is:

> A user sends a public address to the Telegram bot and receives an accurate,
> evidence-linked list of supported activity from the last 72 hours, with clear
> coverage and freshness.

The MVP is complete when the bot additionally monitors saved wallets, delivers configured alerts, survives restart and provider failures, and passes the acceptance matrix.

## Technical references

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Robinhood Chain documentation](https://docs.robinhood.com/chain/)
- [Pons v2 documentation](https://docs.ponsfamily.com/v2)

Verify live network and contract details during Phase 0 rather than copying them unchecked.
