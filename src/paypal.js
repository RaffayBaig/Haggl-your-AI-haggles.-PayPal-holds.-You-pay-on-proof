// PayPal Orders v2 with intent=AUTHORIZE:
//   create order -> buyer approves -> authorize (money is HELD)
//   -> capture (money moves) OR void (hold released, buyer pays nothing)
// If no PayPal keys are set, a clearly-labelled mock is used so the app still runs.
const crypto = require('crypto');
const env = require('./env');

let cachedToken = null;
let tokenExpires = 0;

async function accessToken() {
  if (cachedToken && Date.now() < tokenExpires - 60000) return cachedToken;
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${env.PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status}): ${data.error_description || JSON.stringify(data)}. Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.`);
  cachedToken = data.access_token;
  tokenExpires = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function ppFetch(path, { method = 'POST', body, requestId } = {}) {
  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (requestId) headers['PayPal-Request-Id'] = requestId;
  const res = await fetch(`${env.PAYPAL_API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.details && data.details[0] ? `${data.details[0].issue}: ${data.details[0].description}` : data.message || JSON.stringify(data);
    const err = new Error(`PayPal ${method} ${path} failed (${res.status}): ${detail}`);
    err.paypalDebugId = data.debug_id;
    throw err;
  }
  return data;
}

const fakeId = (p) => `${p}-MOCK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

async function createOrder({ deal, listing }) {
  const value = deal.agreedPrice.toFixed(2);
  if (env.PAYPAL_MOCK) return { id: fakeId('ORDER'), status: 'CREATED', mock: true };
  return ppFetch('/v2/checkout/orders', {
    requestId: `create-${deal.id}-${value}`,
    body: {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: deal.id,
          custom_id: deal.id,
          description: `${listing.title} (negotiated by Haggl agents)`.slice(0, 127),
          amount: { currency_code: env.CURRENCY, value },
        },
      ],
    },
  });
}

async function authorizeOrder(orderId) {
  if (env.PAYPAL_MOCK) {
    return { id: orderId, status: 'COMPLETED', mock: true, authorizationId: fakeId('AUTH'), payer: 'mock-buyer@example.com' };
  }
  const data = await ppFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, { requestId: `auth-${orderId}`, body: {} });
  const auth = data.purchase_units && data.purchase_units[0].payments && data.purchase_units[0].payments.authorizations
    ? data.purchase_units[0].payments.authorizations[0]
    : null;
  if (!auth) throw new Error('PayPal did not return an authorization');
  return {
    id: data.id,
    status: data.status,
    authorizationId: auth.id,
    authorizationStatus: auth.status,
    expiresAt: auth.expiration_time,
    payer: data.payer && data.payer.email_address,
  };
}

async function captureAuthorization(authorizationId) {
  if (env.PAYPAL_MOCK) return { id: fakeId('CAPTURE'), status: 'COMPLETED', mock: true };
  const data = await ppFetch(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, {
    requestId: `capture-${authorizationId}`,
    body: { final_capture: true },
  });
  return { id: data.id, status: data.status };
}

async function voidAuthorization(authorizationId) {
  if (env.PAYPAL_MOCK) return { status: 'VOIDED', mock: true };
  await ppFetch(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, { requestId: `void-${authorizationId}` });
  return { status: 'VOIDED' };
}

module.exports = { createOrder, authorizeOrder, captureAuthorization, voidAuthorization };
