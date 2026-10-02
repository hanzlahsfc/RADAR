# Network verification record

**Documentation checked:** 2026-10-02. **Candidate network:** Robinhood Chain mainnet, chain ID 4663. **Live indexing:** disabled until authenticated history coverage and finality mapping are verified.

## Official sources

- [About Robinhood Chain](https://docs.robinhood.com/chain/): EVM-compatible Arbitrum L2; ETH is native gas.
- [Connecting to Robinhood Chain](https://docs.robinhood.com/chain/connecting/): chain ID 4663; public RPC https://rpc.mainnet.chain.robinhood.com; archive endpoints are needed for historical reads/indexing; Blockscout explorer.
- [Transaction Finality](https://docs.robinhood.com/chain/transaction-finality/): sequencer soft confirmation, Ethereum batch posting and Ethereum finality are distinct stages.
- [Robinhood Chain API on Blockscout](https://github.com/blockscout/docs/blob/main/robinhood-api.mdx): Blockscout documents its PRO API at `https://api.blockscout.com` for chain ID 4663. It requires an API key, including on the free tier, and documents separate address transaction, token-transfer, and internal-transaction paths. It lists a free tier (5 requests/second, 100,000 credits/day).
- [Blockscout v2 API schema](https://github.com/blockscout/blockscout-api-v2-swagger/blob/main/swagger.yaml): address transaction and token-transfer responses expose `items` and `next_page_params`; the address internal-transactions endpoint has its own pagination cursor. This schema repository is archived, so verify live response shape against the current PRO API before relying on it.
- [Blockscout PRO API migration announcement](https://mail.blockscout.com/p/news-july-1-is-pro-api-day): Blockscout announced transition from per-instance APIs to its unified PRO API on 2026-07-01.
- Developer brief requires verification of RPC, USDG, factories and history APIs. No USDG or Pons addresses are guessed.

## Read-only endpoint observations

On 2026-10-01, requests to the documented public RPC returned:

| Probe | Result |
|---|---|
| eth_chainId | HTTP 200, 0x1237 = 4663 |
| latest block | HTTP 200, 0x49ed21a, timestamp 0x6abe89ed |
| safe tag | HTTP 200, 0x49eb7be |
| finalized tag | HTTP 200, 0x49ea884 |
| eth_getLogs latest | HTTP 200, 24 logs |
| Sample transaction from log | 0xdaedf09a111610b71e7f0bc6e2e457369f25832bf0f3d951af851a6eb09b250a fetched |
| Its receipt | HTTP 200, success 0x1, block 0x49ed229, 16 logs |
| Legacy per-instance Blockscout v2 address transactions (unauthenticated) | HTTP 403 |
| Legacy per-instance Blockscout v2 token transfers (unauthenticated) | HTTP 403 |
| Legacy per-instance Blockscout v2 internal transactions (unauthenticated) | HTTP 403 |

No transaction was sent. These observations prove the tested public RPC answered those reads at that time, not archive retention, production availability, complete token coverage or economic finality. Official docs do not map this endpoint's tags to those finality stages. The HTTP 403 observations apply only to the tested unauthenticated legacy per-instance URLs; they do not show that the documented Blockscout PRO API fails or lacks the data.

## History API candidate and status (2026-10-02)

The documented authenticated candidate is Blockscout PRO API. For a registered key, its documented forms include:

- `GET https://api.blockscout.com/4663/api/v2/addresses/{address}/transactions?apikey=...`
- `GET https://api.blockscout.com/4663/api/v2/addresses/{address}/token-transfers?apikey=...`
- `GET https://api.blockscout.com/4663/api/v2/addresses/{address}/internal-transactions?apikey=...`

The PRO API documentation says an API key is required even on its free tier. Transaction discovery and token transfers are separate streams; internal transactions are separate as well. The published v2 schema describes cursor pagination using `next_page_params`, the current adapter uses the documented Etherscan-compatible PRO route rather than REST cursors. Authenticated connectivity and cursor continuation were previously checked. On 2026-10-02 at 11:48:54 UTC the expanded verifier completed the following read-only check:

| Evidence | Observation |
|---|---|
| Tested address | `0x7300d92984d11323e7855ab69b0a4d6613a3ff01` |
| Configured API | `https://api.blockscout.com/v2/api?chainid=4663`, local key redacted |
| Fixed window | 2026-09-29T11:48:19.438Z through 2026-10-02T11:48:19.438Z |
| Pagination | 8 merged pages, 50 records per active stream per page; continuation accepted; both streams completed |
| Candidates | 340 occurrences, 203 unique transaction hashes |
| Known token-only transaction | `0x9485ae07f70df6b8ea65a608425d6043cedbd18ddf242f7d5ec2163385fef285` was discovered |
| Canonical receipt comparison | Success at block 77960830; receipt hash matched RPC block; ERC-20 Transfer involving the tested address |
| Token contract / block time | `0xfa66f480987d86d8688480207e7ee6590f8cc6bb`, 2026-10-02T04:52:17Z |
| Token-only distinction | Top-level from `0xef8a2318ca5d773a3af1f1aeee7ccd488f110f4c` and to `0x0c52fde074222c38faaf599e17b729bf352f938d` are both different from the tested address |
| RPC checks | Chain ID, latest/safe/finalized blocks, known receipt, bounded logs passed |
| Report | 8 passed, 1 unsupported (internal transactions), 0 failed, 0 skipped |

An earlier attempt returned HTTP 500 from the explorer; a subsequent read-only retry succeeded. This demonstrates an actual provider outage, so completed coverage must not be inferred from failed requests. Another tested transfer was a top-level transaction for this address and correctly failed the token-only assertion.

This establishes a sampled 72-hour provider-completed walk and one independently verified token-only transaction. It does not prove every candidate receipt, every address, all token events, retention depth, or behavior at the provider's record cap. Internal transactions remain unsupported by the adapter.

## Provider limits and finality decision

[Blockscout account module documentation](https://docs.blockscout.com/devs/apis/rpc/account), reviewed 2026-10-02, documents up to 10,000 records for `txlist` and `tokentx`, with `page`/`offset` pagination and optional block bounds. The adapter now rejects a stream reaching that conservative cap before crossing the requested start timestamp. It also rejects malformed records, failure envelopes and invalid cursor state rather than persisting complete coverage. Live limit and retention-depth experiments are still unverified. Blockscout's Robinhood-specific documentation additionally lists a 1,000-record limit for its `txlistinternal` and `eth_getLogs` routes; that claim does not establish the limits of the separate public Robinhood RPC.

Robinhood's official [transaction finality documentation](https://docs.robinhood.com/chain/transaction-finality/), reviewed again 2026-10-02, describes sequencer soft confirmation, batch posting to Ethereum, and Ethereum finality. It does not explicitly map the tested public RPC's `safe` and `finalized` tags to these stages. **Decision:** retain `FINALITY_VERIFIED=false` and keep live indexing disabled until the endpoint's tag mapping is supported by provider evidence. A successful receipt/canonical block comparison establishes observed chain evidence, not economic finality.

## Enablement gate

The sampled authenticated 72-hour walk and known token-only receipt comparison now pass. Arbitrary-address completeness, live record-limit behavior, retention depth, and provider-specific finality mapping remain unverified. Do not enable live indexing or set FINALITY_VERIFIED=true until those checks and the finality decision are complete. Pons requires verified bytecode, ABI version, actual launch receipt and creator association.

Run `pnpm verify:network` with `VERIFY_ADDRESS`, `VERIFY_TX_HASH`, and `VERIFY_TOKEN_TX_HASH` in the ignored local environment. `VERIFY_HISTORY_MAX_PAGES` defaults to 50 (allowed range 1..500). A budget-exhausted walk reports incomplete coverage; missing or repeated cursors fail. The verifier never sends transactions or enables indexing.
