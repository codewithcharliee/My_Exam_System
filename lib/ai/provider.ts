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
    baseUrl: process.env.ABACUSAI_BASE_URL ?? 'https://apps.abacus.ai/v1/chat/completions',
    model: process.env.ABACUSAI_MODEL ?? 'gpt-5.4-mini',
  };
}

export async function callAiProvider(options: AiRequestOptions): Promise<Response> {
  const apiKey = (process.env.ABACUSAI_API_KEY ?? '').trim();

  if (!apiKey) {
    throw new AiProviderUnavailableError('ABACUSAI_API_KEY is not configured');
  }

  const response = await fetch(getAiProviderConfig().baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? getAiProviderConfig().model,
      messages: options.messages,
      stream: options.stream ?? true,
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  });

  if (!response.ok) {
    throw new AiProviderUnavailableError('AI service unavailable');
  }

  return response;
}
