// Very small JSON-file database. Good enough for a hackathon demo.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seed = require('./seed');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let state;
function load() {
  if (fs.existsSync(DB_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('db.json was unreadable, starting fresh:', e.message);
    }
  }
  if (!state) state = { listings: seed.listings(), deals: [] };
  if (!Array.isArray(state.listings)) state.listings = seed.listings();
  if (!Array.isArray(state.deals)) state.deals = [];
  for (const d of state.deals) d.busy = false; // clear stale locks after a restart
  // Pick up real photos added since the last run.
  const fresh = Object.fromEntries(seed.listings().map((l) => [l.id, l]));
  for (const l of state.listings) {
    if (fresh[l.id]) Object.assign(l, { title: fresh[l.id].title, description: fresh[l.id].description, condition: fresh[l.id].condition });
    const photo = seed.findPhoto(l.id);
    if (photo) l.image = photo;
  }
  save();
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
  }, 50);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

// ---- Listings ----
// Floor price is private to the seller. publicListing() strips it.
function publicListing(l) {
  if (!l) return null;
  const { floorPrice, ...rest } = l;
  return rest;
}
function listListings() {
  return state.listings.slice().reverse();
}
function getListing(listingId) {
  return state.listings.find((l) => l.id === listingId) || null;
}
function createListing(data) {
  const listing = { id: id('lst'), createdAt: new Date().toISOString(), ...data };
  state.listings.push(listing);
  save();
  return listing;
}

// ---- Deals ----
function createDeal(data) {
  const deal = {
    id: id('deal'),
    createdAt: new Date().toISOString(),
    status: 'negotiating',
    turns: [],
    timeline: [],
    ...data,
  };
  state.deals.push(deal);
  save();
  return deal;
}
function getDeal(dealId) {
  return state.deals.find((d) => d.id === dealId) || null;
}
function findDealByOrder(orderId) {
  return state.deals.find((d) => d.paypal && d.paypal.orderId === orderId) || null;
}
function listDeals() {
  return state.deals.slice().reverse();
}
function logEvent(deal, type, text, extra = {}) {
  deal.timeline.push({ at: new Date().toISOString(), type, text, ...extra });
  save();
}

function saveUpload(base64, mimeType) {
  const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mimeType] || 'jpg';
  const name = `${id('img')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(base64, 'base64'));
  return `/uploads/${name}`;
}

function resetDemo() {
  state = { listings: seed.listings(), deals: [] };
  save();
}

load();

module.exports = {
  UPLOAD_DIR,
  save,
  publicListing,
  listListings,
  getListing,
  createListing,
  createDeal,
  getDeal,
  findDealByOrder,
  listDeals,
  logEvent,
  saveUpload,
  resetDemo,
};
