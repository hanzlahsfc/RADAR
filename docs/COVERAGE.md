# Data coverage contract

Coverage is reported by provider, source, chain, address and interval. “No supported activity found” is valid only after the full requested interval is successfully processed and marked complete.

| Source | Evidence | Phase 0 state |
|---|---|---|
| Native ETH | Block transaction value, successful receipt, canonical hash, timestamp | Decoder exists; RPC reads passed; live indexing unverified |
| ERC-20 | Transfer logs, receipt and canonical block | Decoder exists; sampled token-only receipt and exact log comparisons passed |
| Internal ETH | Trace/debug provider output | Unsupported pending tested trace provider |
| Contract deployment | Receipt and deployed bytecode | Not automatically a token launch |
| Pons launch | Allowlisted ABI-verified factory event | Disabled pending authoritative evidence |
| Arbitrary 72-hour address history | Paginated transaction/token records verified against RPC | Sampled authenticated PRO walk passed; 10,000-record result window can block busy addresses; live demo pending |

Read-only checks on 2026-10-02 corroborated sampled history and retention, the provider result-window cap, and finalized batch posting on Ethereum. See NETWORK_VERIFICATION.md and its evidence artifact. Public RPC historical receipt/block availability does not guarantee archive state or all-address completeness.

The Etherscan-compatible PRO API rejects page multiplied by offset above 10,000. If a stream reaches that bound before the requested start, leave the range incomplete. Block-window splitting is not implemented. A successful sample must not be used to mark a failed or capped address complete.

Amounts remain exact base units. Token labels are untrusted. Transfer does not mean purchase; watch does not mean ownership. Paused watches suppress alerts; resuming uses a fresh activation point to avoid replaying old history as new alerts.
