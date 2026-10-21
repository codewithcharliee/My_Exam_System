export type AiMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AiRequestOptions = {
  messages: AiMessage[];
  model?: string;
  stream?: boolean;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' } | { type: 'text' };
};

export class AiProviderUnavailableError extends Error {
  constructor(message = 'AI service unavailable') {
    super(message);
    this.name = 'AiProviderUnavailableError';
  }
}

export function isAiProviderConfigured(): boolean {
  return Boolean((process.env.ABACUSAI_API_KEY ?? '').trim());
}

export function getAiProviderConfig() {
  return {
    apiKeyConfigured: isAiProviderConfigured(),
    baseUrl: process.env.ABACUSAI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: process.env.ABACUSAI_MODEL ?? 'models/gemini-3.8-flash',
  };
}

export async function callAiProvider(options: AiRequestOptions): Promise<Response> {
  const apiKey = (process.env.ABACUSAI_API_KEY ?? '').trim();
  const primaryModel = options.model ?? getAiProviderConfig().model;
  const fallbackModel = (process.env.ABACUSAI_FALLBACK_MODEL ?? 'models/gemini-3.5-flash').trim();
  let requestedModel = primaryModel;

  if (!apiKey) {
    throw new AiProviderUnavailableError('ABACUSAI_API_KEY is not configured');
  }

  let response = await fetch(getAiProviderConfig().baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: primaryModel,
      messages: options.messages,
      stream: options.stream ?? true,
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  });

  if ([404, 429, 503].includes(response.status) && fallbackModel && fallbackModel !== primaryModel) {
    console.warn('AI provider primary model unavailable; retrying with fallback model.', {
      status: response.status,
      primaryModel,
      fallbackModel,
    });
    await response.body?.cancel();
    requestedModel = fallbackModel;
    response = await fetch(getAiProviderConfig().baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: fallbackModel,
        messages: options.messages,
        stream: options.stream ?? true,
        ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      }),
    });
  }

  if (!response.ok) {
    console.error('AI provider request failed.', {
      status: response.status,
      model: requestedModel,
    });
    const message = response.status === 401 || response.status === 403
      ? 'AI provider rejected its configured credentials.'
      : response.status === 404
        ? 'The configured AI model or endpoint was not found.'
        : response.status === 429 || response.status >= 500
          ? 'AI provider is temporarily unavailable. Please try again shortly.'
          : `AI provider request failed (HTTP ${response.status}).`;
    throw new AiProviderUnavailableError(message);
  }

  return response;
}
