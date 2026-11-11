// One interface for every AI provider. Switch with AI_PROVIDER in .env.
// No SDKs: plain fetch calls, so there is nothing to npm install.
const env = require('./env');

async function callGemini({ system, prompt, images, temperature }) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing in .env');
  const parts = [{ text: prompt }];
  for (const img of images) parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${data.error ? data.error.message : JSON.stringify(data).slice(0, 300)}`);
  }
  const cand = data.candidates && data.candidates[0];
  const text = cand && cand.content && Array.isArray(cand.content.parts)
    ? cand.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('')
    : '';
  if (!text) {
    const reason = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || 'empty response';
    throw new Error(`Gemini returned no text (${reason})`);
  }
  return text;
}

async function callAnthropic({ system, prompt, images, temperature }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is missing in .env');
  const content = [];
  for (const img of images) content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.base64 } });
  content.push({ type: 'text', text: prompt + '\n\nRespond with only the JSON object.' });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      temperature,
      system,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Anthropic error ${res.status}: ${data.error ? data.error.message : JSON.stringify(data).slice(0, 300)}`);
  }
  return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
}

// Groq uses the OpenAI-compatible chat API. Text turns use GROQ_MODEL;
// the delivery photo check uses GROQ_VISION_MODEL (a model that can see images).
async function callGroq({ system, prompt, images, temperature }) {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is missing in .env');
  const hasImages = images.length > 0;
  const userContent = hasImages
    ? [{ type: 'text', text: prompt }, ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } }))]
    : prompt;
  const body = {
    model: hasImages ? env.GROQ_VISION_MODEL : env.GROQ_MODEL,
    temperature,
    // Room for models that "think" before answering, so the JSON isn't cut off.
    max_tokens: 4096,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
  };
  if (!hasImages) body.response_format = { type: 'json_object' };
  // gpt-oss models "think" before answering; keep that short to save free-tier tokens.
  if (/gpt-oss/.test(body.model)) body.reasoning_effort = 'low';

  // Free tier is rate-limited per minute. On a 429, wait as long as Groq asks and try again.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json().catch(() => ({}));
    const msg = data.error ? data.error.message : JSON.stringify(data).slice(0, 300);
    if (res.status === 429 && attempt < 3 && !/per day|TPD|RPD/i.test(msg)) {
      const wait = Math.min(30, Number(res.headers && res.headers.get && res.headers.get('retry-after')) || 8);
      console.log(`[groq] rate limited, waiting ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000 + 250));
      continue;
    }
    if (res.status === 400 && body.reasoning_effort && /reasoning/i.test(msg)) {
      delete body.reasoning_effort; // model doesn't take this setting
      continue;
    }
    if (!res.ok) throw new Error(`Groq error ${res.status}: ${msg}`);
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Groq returned no text');
    return text;
  }
}

// Pull the first JSON object out of a model reply, even if it added extra words.
function parseJSON(text) {
  // Some models (e.g. Qwen 3) "think out loud" in <think> tags before answering; drop that part.
  const cleaned = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Model did not return JSON');
  }
}

// images: optional array of { base64, mimeType } (jpeg/png/webp/gif)
// provider: optional override (used by the photo check); defaults to AI_PROVIDER.
async function generateJSON({ system, prompt, images = [], temperature = 0.7, provider = env.AI_PROVIDER }) {
  const call = { anthropic: callAnthropic, groq: callGroq }[provider] || callGemini;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await call({ system, prompt, images, temperature });
      return parseJSON(text);
    } catch (e) {
      lastErr = e;
      // Don't retry auth or quota problems; they won't fix themselves.
      if (/ 4(00|01|03|04|29)\b|API key|missing/i.test(e.message)) break;
    }
  }
  throw lastErr;
}

function visionLabel() {
  const p = env.VISION_PROVIDER;
  if (p === 'groq') return `Groq (${env.GROQ_VISION_MODEL})`;
  if (p === 'gemini') return `Google Gemini (${env.GEMINI_MODEL})`;
  if (p === 'anthropic') return `Anthropic Claude (${env.ANTHROPIC_MODEL})`;
  return 'Mock';
}

function providerLabel() {
  if (env.AI_PROVIDER === 'gemini') return `Google Gemini (${env.GEMINI_MODEL})`;
  if (env.AI_PROVIDER === 'groq') return `Groq (${env.GROQ_MODEL})`;
  if (env.AI_PROVIDER === 'anthropic') return `Anthropic Claude (${env.ANTHROPIC_MODEL})`;
  return 'Mock AI (no key set)';
}

module.exports = { generateJSON, parseJSON, providerLabel, visionLabel };