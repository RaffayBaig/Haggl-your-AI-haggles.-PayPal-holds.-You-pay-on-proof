// Haggl: AI agents haggle, PayPal holds the money, AI checks the delivery.
// Zero npm dependencies. Run with: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const env = require('./src/env');
const db = require('./src/db');
const ai = require('./src/ai');
const agents = require('./src/agents');
const paypal = require('./src/paypal');
const { verifyDelivery, PASS_CONFIDENCE } = require('./src/verify');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 15 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Upload too large (max 15 MB)'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
function serveStatic(req, res, baseDir, relPath) {
  const filePath = path.normalize(path.join(baseDir, relPath));
  if (!filePath.startsWith(baseDir)) return send(res, 403, { error: 'Forbidden' });
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Single-page app: unknown non-API paths get index.html
      if (baseDir === PUBLIC_DIR && !path.extname(relPath)) return serveStatic(req, res, PUBLIC_DIR, 'index.html');
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}
function num(v, name, { min = 0.01, max = 100000 } = {}) {
  const n = Math.round(Number(v) * 100) / 100;
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${name} must be a number between ${min} and ${max}`);
  return n;
}
function text(v, name, { required = true, max = 1000 } = {}) {
  const s = String(v == null ? '' : v).trim().slice(0, max);
  if (required && !s) throw new HttpError(400, `${name} is required`);
  return s;
}
function photoFrom(body) {
  const p = body.photo;
  if (!p || !p.base64 || !IMAGE_TYPES.includes(p.mimeType)) throw new HttpError(400, 'A JPG, PNG, WEBP or GIF photo is required');
  return { base64: String(p.base64).replace(/^data:[^,]+,/, ''), mimeType: p.mimeType };
}
function requireDeal(id) {
  const deal = db.getDeal(id);
  if (!deal) throw new HttpError(404, 'Deal not found');
  return deal;
}
function publicDeal(deal) {
  const { busy, pendingInjection, simulateJailbreak, ...rest } = deal;
  return { ...rest, listing: db.publicListing(db.getListing(deal.listingId)) };
}

// ---------- routes ----------
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
}

route('GET', '/api/config', async () => ({
  aiProvider: env.AI_PROVIDER,
  aiLabel: ai.providerLabel(),
  paypalMock: env.PAYPAL_MOCK,
  paypalClientId: env.PAYPAL_MOCK ? null : env.PAYPAL_CLIENT_ID,
  paypalEnv: env.PAYPAL_ENV,
  currency: env.CURRENCY,
  passConfidence: PASS_CONFIDENCE,
  buyerStyles: Object.keys(agents.BUYER_STYLES),
  maxTurns: agents.MAX_TURNS,
}));

route('GET', '/api/listings', async () => db.listListings().map(db.publicListing));

route('GET', '/api/listings/:id', async ({ params }) => {
  const l = db.getListing(params.id);
  if (!l) throw new HttpError(404, 'Listing not found');
  return db.publicListing(l);
});

route('POST', '/api/listings', async ({ body }) => {
  const askingPrice = num(body.askingPrice, 'Asking price');
  const floorPrice = num(body.floorPrice, 'Lowest price');
  if (floorPrice > askingPrice) throw new HttpError(400, 'Your lowest price cannot be higher than the asking price');
  const photo = photoFrom(body);
  const listing = db.createListing({
    title: text(body.title, 'Title', { max: 100 }),
    description: text(body.description, 'Description', { max: 800 }),
    condition: text(body.condition, 'Condition', { max: 40 }),
    askingPrice,
    floorPrice,
    sellerName: text(body.sellerName, 'Seller name', { max: 60 }),
    sellerStyle: text(body.sellerStyle, 'Seller style', { required: false, max: 160 }) || 'friendly but firm',
    location: text(body.location, 'Location', { required: false, max: 60 }) || 'Pakistan',
    image: db.saveUpload(photo.base64, photo.mimeType),
  });
  return db.publicListing(listing);
});

route('POST', '/api/deals', async ({ body }) => {
  const listing = db.getListing(body.listingId);
  if (!listing) throw new HttpError(404, 'Listing not found');
  const style = agents.BUYER_STYLES[body.style] ? body.style : 'polite';
  const language = 'English';
  const deal = db.createDeal({
    listingId: listing.id,
    language,
    buyer: {
      name: text(body.buyerName, 'Buyer name', { required: false, max: 60 }) || 'Ayesha',
      maxBudget: num(body.maxBudget, 'Budget'),
      style,
      note: text(body.note, 'Note', { required: false, max: 300 }),
    },
  });
  db.logEvent(deal, 'created', `Buyer sent a ${style} agent (budget $${deal.buyer.maxBudget}) to negotiate for "${listing.title}".`);
  return publicDeal(deal);
});

// Seller dashboard (demo: no login). Includes the seller's private floor price.
route('GET', '/api/deals', async () =>
  db.listDeals().map((d) => {
    const l = db.getListing(d.listingId) || {};
    return {
      id: d.id,
      createdAt: d.createdAt,
      status: d.status,
      agreedPrice: d.agreedPrice || null,
      turns: d.turns.length,
      guardrailBlocks: d.turns.filter((t) => t.violation).length,
      listing: { id: l.id, title: l.title, image: l.image, askingPrice: l.askingPrice, floorPrice: l.floorPrice },
      buyer: d.buyer,
      paypal: d.paypal || null,
      verification: d.verification ? { passed: d.verification.passed, confidence: d.verification.confidence } : null,
      timeline: d.timeline,
    };
  })
);

route('GET', '/api/deals/:id', async ({ params }) => publicDeal(requireDeal(params.id)));

route('POST', '/api/deals/:id/next', async ({ params }) => {
  const deal = requireDeal(params.id);
  if (deal.status !== 'negotiating') return { turn: null, deal: publicDeal(deal) };
  const turn = await agents.nextTurn(deal);
  return { turn, deal: publicDeal(deal) };
});

route('POST', '/api/deals/:id/inject', async ({ params, body }) => {
  const deal = requireDeal(params.id);
  if (deal.status !== 'negotiating') throw new HttpError(400, 'The negotiation is already over');
  deal.pendingInjection = text(body.text, 'Message', { max: 500 });
  db.save();
  return { ok: true };
});

route('POST', '/api/deals/:id/jailbreak', async ({ params }) => {
  const deal = requireDeal(params.id);
  if (deal.status !== 'negotiating') throw new HttpError(400, 'The negotiation is already over');
  deal.simulateJailbreak = true;
  db.save();
  return { ok: true };
});

route('POST', '/api/deals/:id/order', async ({ params }) => {
  const deal = requireDeal(params.id);
  if (!['agreed', 'payment_pending'].includes(deal.status)) throw new HttpError(400, `Can't pay for a deal that is "${deal.status}"`);
  const listing = db.getListing(deal.listingId);
  // The amount always comes from the server's record of the agreed price, never from the browser.
  const order = await paypal.createOrder({ deal, listing });
  deal.status = 'payment_pending';
  deal.paypal = { ...(deal.paypal || {}), orderId: order.id, mock: !!order.mock };
  db.logEvent(deal, 'order', `PayPal order ${order.id} created for $${deal.agreedPrice.toFixed(2)} (intent: AUTHORIZE).`);
  return { orderId: order.id, mock: !!order.mock };
});

route('POST', '/api/deals/:id/authorize', async ({ params, body }) => {
  const deal = requireDeal(params.id);
  if (!deal.paypal || deal.paypal.orderId !== body.orderId) throw new HttpError(400, 'Order does not belong to this deal');
  if (deal.status === 'held') return publicDeal(deal);
  if (deal.status !== 'payment_pending') throw new HttpError(400, `Deal is "${deal.status}"`);
  const auth = await paypal.authorizeOrder(body.orderId);
  deal.status = 'held';
  deal.paypal = { ...deal.paypal, authorizationId: auth.authorizationId, authorizationStatus: auth.authorizationStatus || 'CREATED', expiresAt: auth.expiresAt, payer: auth.payer };
  db.logEvent(deal, 'held', `Buyer approved. $${deal.agreedPrice.toFixed(2)} is now HELD by PayPal (authorization ${auth.authorizationId}). Seller is not paid yet.`);
  return publicDeal(deal);
});

route('POST', '/api/deals/:id/verify', async ({ params, body }) => {
  const deal = requireDeal(params.id);
  if (deal.status !== 'held') throw new HttpError(400, `Deal is "${deal.status}", not waiting for delivery`);
  const listing = db.getListing(deal.listingId);
  const photo = photoFrom(body);
  const photoUrl = db.saveUpload(photo.base64, photo.mimeType);

  deal.status = 'verifying';
  db.logEvent(deal, 'verifying', 'Buyer uploaded a delivery photo. AI inspector is checking it.');
  let result;
  try {
    result = await verifyDelivery({ listing, photo, fileName: text(body.fileName, 'fileName', { required: false, max: 200 }) });
  } catch (e) {
    deal.status = 'held';
    db.logEvent(deal, 'warning', `Delivery check failed to run: ${e.message}`);
    throw new HttpError(502, `The AI inspector could not run: ${e.message}`);
  }
  deal.verification = { ...result, photoUrl, at: new Date().toISOString() };

  try {
    if (result.passed) {
      const cap = await paypal.captureAuthorization(deal.paypal.authorizationId);
      deal.status = 'completed';
      deal.paypal.captureId = cap.id;
      deal.paypal.captureStatus = cap.status;
      db.logEvent(deal, 'captured', `Item verified (${Math.round(result.confidence * 100)}% confidence). PayPal captured $${deal.agreedPrice.toFixed(2)}; seller paid (capture ${cap.id}).`);
    } else {
      await paypal.voidAuthorization(deal.paypal.authorizationId);
      deal.status = 'released';
      deal.paypal.authorizationStatus = 'VOIDED';
      db.logEvent(deal, 'voided', `Item did NOT match (${Math.round(result.confidence * 100)}% confidence). PayPal hold voided; buyer pays nothing.`);
    }
  } catch (e) {
    deal.status = 'held';
    db.logEvent(deal, 'warning', `PayPal step failed: ${e.message}`);
    throw new HttpError(502, e.message);
  }
  return publicDeal(deal);
});

route('POST', '/api/reset', async () => {
  db.resetDemo();
  return { ok: true };
});

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith('/api/')) {
    if (pathname.startsWith('/uploads/')) return serveStatic(req, res, db.UPLOAD_DIR, pathname.slice('/uploads/'.length));
    return serveStatic(req, res, PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
  }

  const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
  if (!r) return send(res, 404, { error: 'Not found' });
  const m = pathname.match(r.re);
  const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const data = await r.handler({ params, body, query: url.searchParams });
    send(res, 200, data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(`[${req.method} ${pathname}]`, e.message);
    send(res, status, { error: e.message, paypalDebugId: e.paypalDebugId });
  }
});

server.listen(env.PORT, () => {
  console.log('\n  Haggl is running');
  console.log(`  Open:    http://localhost:${env.PORT}`);
  console.log(`  Agents:  ${ai.providerLabel()}`);
  console.log(`  Photos:  ${ai.visionLabel()}`);
  console.log(`  PayPal:  ${env.PAYPAL_MOCK ? 'MOCK (add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env)' : `${env.PAYPAL_ENV} (${env.PAYPAL_API})`}\n`);
});
