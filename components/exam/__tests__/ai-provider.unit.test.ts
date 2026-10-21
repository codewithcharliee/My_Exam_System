import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderUnavailableError, callAiProvider } from '@/lib/ai/provider';

describe('AI provider model fallback', () => {
  beforeEach(() => {
    vi.stubEnv('ABACUSAI_API_KEY', 'test-provider-key');
    vi.stubEnv('ABACUSAI_BASE_URL', 'https://provider.example/v1/chat/completions');
    vi.stubEnv('ABACUSAI_MODEL', 'models/gemini-3.8-flash');
    vi.stubEnv('ABACUSAI_FALLBACK_MODEL', 'models/gemini-3.5-flash');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries a temporarily unavailable primary model with the fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await callAiProvider({
      messages: [{ role: 'user', content: 'test prompt' }],
      stream: true,
      responseFormat: { type: 'json_object' },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('models/gemini-3.5-flash');
  });

  it('does not retry when the primary model succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await callAiProvider({ messages: [{ role: 'user', content: 'test prompt' }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a clear error when the provider rejects credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callAiProvider({ messages: [{ role: 'user', content: 'test prompt' }] }))
      .rejects.toThrow(new AiProviderUnavailableError('AI provider rejected its configured credentials.'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not call the provider when the API key is missing', async () => {
    vi.stubEnv('ABACUSAI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(callAiProvider({ messages: [{ role: 'user', content: 'test prompt' }] }))
      .rejects.toThrow('ABACUSAI_API_KEY is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
