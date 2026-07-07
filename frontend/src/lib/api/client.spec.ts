import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from './client';

describe('ApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches the x-api-key header when apiKey is supplied to the constructor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({ ok: true }),
    } as unknown as Response);
    
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://test-api.internal/v1', {
      get: () => null,
      set: () => {},
    }, 'my-super-secret-api-key');

    await client.get('/health');

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://test-api.internal/v1/health');
    expect(init.headers).toBeDefined();
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('my-super-secret-api-key');
  });

  it('attaches authorization header if token is present alongside x-api-key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({ ok: true }),
    } as unknown as Response);

    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://test-api.internal/v1', {
      get: () => 'jwt-token-xyz',
      set: () => {},
    }, 'my-super-secret-api-key');

    await client.get('/health');

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-token-xyz');
    expect(headers['x-api-key']).toBe('my-super-secret-api-key');
  });
});
