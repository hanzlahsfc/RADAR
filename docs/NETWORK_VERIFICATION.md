# Network verification record

**Documentation checked:** 2026-10-02. **Candidate network:** Robinhood Chain mainnet, chain ID 4663. **Live indexing:** disabled. Sampled history, provider cap/retention, and finalized-to-Ethereum mapping have passed read-only verification; controlled Telegram demo remains pending.

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

## Provider limit and retention verification (2026-10-02)

Public results are recorded in [the sanitized evidence artifact](evidence/2026-10-02-provider.json). These probes used the existing locally stored key and sent no transactions.

The tested token contract was `0x5fc5360d0400a0fd4f2af552add042d716f1d168`. `txlist` used it as the address; `tokentx` used `contractaddress` to sample the whole token stream. This distinction matters: contract-wide transfer history can reach a cap much faster than history for an individual wallet.

| Probe | Live result |
|---|---|
| Both streams, page 10,000 / offset 1 | One record each, status 1 |
| Both streams, page 10,001 / offset 1 | Rejected, status 0; no result array |
| Both streams, page 5,000 / offset 2 | Two records each, status 1 |
| Both streams, page 5,001 / offset 2 | Rejected: page multiplied by offset must not exceed 10,000 |
| Earliest sampled contract transaction | Block 57, 2026-05-05T17:59:51Z; receipt and canonical block matched |
| Earliest sampled token transfer | Block 433, 2026-05-12T17:50:03Z; receipt and canonical block matched |
| Public RPC block 1 | Returned block/time 2026-04-30T16:52:11Z |

The May transaction is `0xc51b4ac115d158a50eb9cb902a9d1359d25200e3582192f75c0ad80beba54930`; the May transfer is `0xeca4759fe907dd3b9ab35f340947d4f4f42be96897c9b1474a3f9284e8bca358`. These reads prove availability for those historical receipts/blocks. They do not establish complete retention, historical account state, or an archive service guarantee.

[Blockscout account module documentation](https://docs.blockscout.com/devs/apis/rpc/account) documents pagination and the 10,000-record bound. The adapter's cap rejection is supported by the live response: a heavily active address can consume its entire result window within 72 hours. Until block-window splitting is implemented, RADAR must report that case as incomplete. Blockscout's Robinhood-specific 1,000-record internal/log limit is separate from the public Robinhood RPC tested here.

## Canonical token-log comparisons

Two exact comparisons for `0x7300d92984d11323e7855ab69b0a4d6613a3ff01` passed:

| Fixed block range | RPC ERC-20 events | Explorer rows | Mismatches |
|---|---|---|---|
| 77960697 through 77960797 | 3, in one transaction | 3 | 0 |
| 77359158 through 77359258 | 1 | 1 | 0 |

RPC logs were queried separately for incoming and outgoing Transfer topics, deduplicated by block hash/log index, and matched to explorer occurrences using transaction hash, token, sender, recipient and exact integer amount. Repeated equal events were counted separately. An earlier hash-only comparison over 77960780 through 77960880 also matched the known token-only transaction. These are bounded samples; neither proves every address or every supported event.

## Finality mapping and demo policy

[Arbitrum's finality reference](https://docs.arbitrum.io/how-arbitrum-works/reference/finality-and-reorgs) explicitly covers Dedicated Blockchains: `latest` is sequencer confirmation, `safe` follows the parent chain's safe batch postings, and `finalized` follows finalized parent-chain batch postings. The tags depend on node configuration and can lag. A fixed L2 confirmation count does not establish Ethereum finality.

Robinhood's [node instructions](https://docs.robinhood.com/chain/run-a-full-node/) use Nitro. Its [official chain info](https://cdn.robinhood.com/assets/generated_assets/hoodchain_docsite/chain-node-configs/robinhood-chain-info.json) lists chain ID 4663, parent chain ID 1, and Sequencer Inbox `0xBd0D173EEb87D57A09521c24388a12789F33ba96`. The public RPC reported `nitro/v3.12.1-rc.2+70fa99a-20260929T140226Z/linux-amd64/go1.25.12`.

At the tag sample, latest was 2026-10-02T12:48:40Z, safe 12:38:26Z, and finalized 12:30:19Z. Subsequent finalized/L1 comparison established:

| Evidence | Observation |
|---|---|
| Public RPC finalized L2 block | 78236926 (`0x4a9ccfe`), hash `0x4c56879456f26231b91adc1c7275117b34af5f0567aca467a132b971456716fd` |
| Explorer batch association | Batch 299387, L2 blocks 78236708 through 78236926 |
| Ethereum posting transaction | `0xe72bf89e397e2aa9b71ba012bd37d18effd6cbfab230585f5c4d882652bd2848` |
| Ethereum RPC used | `https://ethereum-rpc.publicnode.com`, chain ID 1 |
| Posting receipt | Success in Ethereum block 26104693 (`0x18e5375`); receipt hash matched canonical block |
| Posting event | Matching SequencerBatchDelivered batch number from Robinhood's documented Sequencer Inbox |
| Ethereum finalized head | 26104693; posting block was at or below the finalized head |

The event signature was checked against [Offchain Labs' Sequencer Inbox interface](https://github.com/OffchainLabs/nitro-contracts/blob/main/src/bridge/ISequencerInbox.sol). Explorer batch-to-L2 association remains explorer evidence; the batch blob was not decompressed independently. The standard Nitro mapping is documented and corroborated for this sampled finalized head. The `safe` mapping is documented but was not independently compared with an Ethereum safe head. Ethereum batch-data finality is separate from assertion confirmation and the withdrawal challenge period.

**Demo policy:** use `FINALITY_MODE=finalized` when preparing the controlled demo. Do not replace it with an arbitrary L2 block depth. The sampled result does not establish an uptime or latency guarantee. Public `arb_findBatchContainingBlock` and `arb_getL1Confirmations` returned method-not-found; authenticated explorer batch association and Ethereum RPC were used instead. Blockscout's chain-1 RPC returned the posting receipt but did not supply a usable finalized head, so PublicNode supplied that comparison.

## Enablement state and next step

The read-only feasibility task is complete for the tested samples: authenticated 72-hour pagination, known token-only discovery, old receipt/block availability, live cap behavior, bounded exact log comparison, and documented/corroborated finalized mapping. Runtime configuration remains `FINALITY_VERIFIED=false`; live indexing was not enabled by these probes.

Prepare a controlled single-address Telegram demo using the tested history source and finalized policy, with a dedicated test chat. Before claiming broader coverage, add block-window splitting for addresses whose history reaches the 10,000-record bound and cross-check further address samples. Internal transfers and Pons remain unsupported/unverified.

Run `pnpm verify:network` with `VERIFY_ADDRESS`, `VERIFY_TX_HASH`, and optional `VERIFY_TOKEN_TX_HASH` in the ignored local environment. `VERIFY_HISTORY_MAX_PAGES` defaults to 50 (1..500). Budget exhaustion reports incomplete coverage; missing/repeated cursors fail. Known hashes must still be in the current requested window.
