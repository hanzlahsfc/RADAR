import { describe, expect, it } from 'vitest';
import { loadEnv, redactedEnvSummary } from '../../src/config/env.js';
import { assertChainIdentity } from '../../src/chain/client.js';

describe('foundation safety gates', () => {
  it('rejects live worker configuration without documented finality verification', () => {
    expect(() =>
      loadEnv({
        role: 'worker',
        source: {
          DATABASE_URL: 'postgresql://radar:radar@localhost/radar',
          CHAIN_ID: '4663',
          RPC_HTTP_URL: 'https://rpc.example',
          HISTORY_PROVIDER: 'disabled',
          FINALITY_MODE: 'finalized',
        },
      }),
    ).toThrow(/configuration/);
  });
  it('rejects a provider chain mismatch before indexing', async () => {
    await expect(assertChainIdentity({ getChainId: async () => 1 }, 4663)).rejects.toThrow(/4663/);
  });
  it('does not expose explorer credentials in configuration summaries', () => {
    const env = loadEnv({
      role: 'migrate',
      source: {
        DATABASE_URL: 'postgresql://radar:radar@localhost/radar',
        EXPLORER_API_BASE_URL: 'https://user:password@example.com/api?token=secret',
      },
    });
    expect(JSON.stringify(redactedEnvSummary(env))).not.toMatch(/password|secret/);
  });
});
