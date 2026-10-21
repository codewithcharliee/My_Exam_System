import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const projectFile = (name) => fileURLToPath(new URL(name, import.meta.url));
dotenv.config({ path: projectFile('.env.local') });
dotenv.config({ path: projectFile('.env') });

const apiKey = (process.env.ABACUSAI_API_KEY ?? '').trim();
if (!apiKey) {
  throw new Error('ABACUSAI_API_KEY is not configured in .env.local or .env');
}

const baseUrl =
  process.env.ABACUSAI_BASE_URL ??
  'https://apps.abacus.ai/v1/chat/completions';
const model = process.env.ABACUSAI_MODEL ?? 'gpt-5.4-mini';
const headers = new Headers({ 'Content-Type': 'application/json' });
headers.append('Authorization', ['Bearer', apiKey].join(' '));

const response = await fetch(baseUrl, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Reply with only OK.' }],
    stream: false,
  }),
});

console.log(`Chat check: HTTP ${response.status}`);
const data = await response.json();
if (!response.ok) {
  console.error(JSON.stringify(data.error ?? { message: 'Request failed' }));
  process.exitCode = 1;
} else {
  const choice = data.choices?.[0];
  console.log(
    `Model: ${data.model ?? model}; finish: ${choice?.finish_reason ?? 'unknown'}; reply: ${choice?.message?.content?.trim() || '<empty>'}`,
  );
  if (!choice?.message?.content?.trim()) {
    process.exitCode = 1;
  }
}
