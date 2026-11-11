// Tiny .env loader so the project needs zero npm packages.
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value.includes('#')) {
      // Allow comments after a value: KEY=value # note
      value = value.slice(0, value.indexOf('#')).trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const env = {
  PORT: Number(process.env.PORT || 3000),

  // AI: "gemini", "groq", "anthropic" or "mock"
  AI_PROVIDER: (process.env.AI_PROVIDER || '').toLowerCase(),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  GROQ_VISION_MODEL: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',

  // PayPal sandbox
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || '',
  PAYPAL_ENV: (process.env.PAYPAL_ENV || 'sandbox').toLowerCase(),
  CURRENCY: process.env.CURRENCY || 'USD',
};

// Pick the AI provider automatically if it wasn't set.
if (!env.AI_PROVIDER) {
  if (env.GROQ_API_KEY) env.AI_PROVIDER = 'groq';
  else if (env.GEMINI_API_KEY) env.AI_PROVIDER = 'gemini';
  else if (env.ANTHROPIC_API_KEY) env.AI_PROVIDER = 'anthropic';
  else env.AI_PROVIDER = 'mock';
}

// The delivery photo check can use a different provider than the haggling agents.
env.VISION_PROVIDER = (process.env.VISION_PROVIDER || env.AI_PROVIDER).toLowerCase();

env.PAYPAL_MOCK = !(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
env.PAYPAL_API = env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

module.exports = env;