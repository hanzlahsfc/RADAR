# Phase 0 acceptance matrix

**Implemented** means source/config/schema exists. **Tested** means the named check passed. **Unverified** means live behavior is not proven. **Blocked** means dependent behavior must not be described as operational.

| Requirement | State | Concrete check |
|---|---|---|
| Requested branch; no production deploy or chain writes | Tested | git branch --show-current; probes were read-only |
| Node 22, pnpm, strict TypeScript | Implemented | .nvmrc, packageManager, pnpm typecheck/build |
| Required runtime and tooling stack | Implemented | Exact package pins and pnpm lockfile |
| PostgreSQL 16 / migrations | Implemented | Compose, pnpm db:migrate, integration suite |
| Exact amount persistence | Implemented | numeric(78,0); amount unit tests |
| Offline build/tests without credentials | Tested | Unit, fixture and build commands without tokens |
| Config validation and credential-redacted logging | Implemented | Zod config, Pino redaction and sanitizer tests |
| Separate bot/worker processes and health endpoints | Implemented | Entry points and Fastify live/ready handlers |
| Official network/finality docs reviewed | Tested | docs/NETWORK_VERIFICATION.md |
| Actual public RPC responses | Tested, partial | Chain ID, blocks, logs, transaction and receipt on 2026-10-01 |
| Provider finality semantics | Unverified | safe/finalized return blocks; economic meaning not mapped |
| History provider discovery | Implemented/documented; live unverified | Blockscout PRO API documents chain 4663, key-required API access, and separate transaction/token-transfer/internal-transaction endpoints; see docs/NETWORK_VERIFICATION.md |
| Authenticated historical pagination, limits, and token-only coverage | Blocked | Requires a Blockscout PRO API key plus live response, pagination, depth, and coverage checks. Prior 403 was from unauthenticated legacy per-instance routes and does not test PRO API |
| Arbitrary address 72-hour history | Blocked | Needs verified archive provider with token-only coverage |
| Live Telegram integration | Unverified | No bot token configured |
| Pons factory/ABI/launch verification | Blocked | No authoritative deployment/receipt established |
| CI | Implemented | Workflow exists; hosted CI run pending |

Phase 0 is complete after typecheck, lint, format, unit, migrations, integration, deterministic E2E, fixtures and production build pass, with live chains gated on documented verification. An unavailable/incomplete provider must never look like a complete empty timeline.
