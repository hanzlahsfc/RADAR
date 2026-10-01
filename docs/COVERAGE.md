# Data coverage contract

Coverage is reported by provider, source, chain, address and interval. “No supported activity found” is valid only after the full requested interval is successfully processed and marked complete.

| Source | Evidence | Phase 0 state |
|---|---|---|
| Native ETH | Block transaction value, successful receipt, canonical hash, timestamp | Decoder exists; RPC reads passed; live indexing unverified |
| ERC-20 | Transfer logs, receipt and canonical block | Decoder exists; historical coverage unverified |
| Internal ETH | Trace/debug provider output | Unsupported pending tested trace provider |
| Contract deployment | Receipt and deployed bytecode | Not automatically a token launch |
| Pons launch | Allowlisted ABI-verified factory event | Disabled pending authoritative evidence |
| Arbitrary 72-hour address history | Paginated transaction/token records verified against RPC | Blocked; tested Blockscout v2 routes returned 403 |

The public RPC answered chain-ID, block/tag, logs, transaction and receipt reads on 2026-10-01. This is not a history guarantee; see NETWORK_VERIFICATION.md.

Amounts remain exact base units. Token labels are untrusted. Transfer does not mean purchase; watch does not mean ownership. Paused watches suppress alerts; resuming uses a fresh activation point to avoid replaying old history as new alerts.
