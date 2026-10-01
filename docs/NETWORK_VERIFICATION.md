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

The PRO API documentation says an API key is required even on its free tier. Transaction discovery and token transfers are separate streams; internal transactions are separate as well. The published v2 schema describes cursor pagination using `next_page_params`, but this project has not yet made authenticated requests to these routes. No live page, completeness boundary, retention depth, exact rate/record limits for the needed endpoints, or token-only coverage has been verified. Therefore this is a documented provider candidate, not an enabled or verified history source.

## Enablement gate

Public RPC is rate limited. Authenticated PRO API history remains unverified pending a key and real responses. Pagination, depth, limits, token-only completeness and trace coverage remain blocked/unverified. Native transactions and ERC-20 transfers are separate data sources.

Run pnpm verify:network with the provider, known transaction and address. Configure the documented Blockscout PRO base and API key, then verify authenticated transaction and token-transfer responses, walk more than one page (or prove the result is a single complete page), test known examples including token-only activity, and establish historical depth/limits and finality mapping. Record evidence here; only then enable the relevant live features and set FINALITY_VERIFIED=true after the finality decision. A tag response alone is insufficient. Pons requires verified bytecode, ABI version, actual launch receipt and creator association.
