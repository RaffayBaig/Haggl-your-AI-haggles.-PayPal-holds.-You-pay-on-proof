// "The AI can talk, but only code can move money."
// Every move an agent makes passes through here before it counts.
// The seller's floor and the buyer's budget are enforced in code,
// so a confused or jailbroken agent still cannot agree to a bad deal.

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function lastOffer(deal, role) {
  for (let i = deal.turns.length - 1; i >= 0; i--) {
    const t = deal.turns[i];
    if (t.role === role && typeof t.effectivePrice === 'number') return t.effectivePrice;
  }
  return null;
}

const SAFE_LINES = {
  English: {
    seller: (p) => `I can't go that low. My best price is $${p}.`,
    buyer: (p) => `That's more than I can spend. I can do $${p}.`,
  },
  'Roman Urdu': {
    seller: (p) => `Itna kam nahi ho sakta. Meri aakhri qeemat $${p} hai.`,
    buyer: (p) => `Itna budget nahi hai. Main $${p} de sakta hoon.`,
  },
  Urdu: {
    seller: (p) => `اتنا کم نہیں ہو سکتا۔ میری آخری قیمت $${p} ہے۔`,
    buyer: (p) => `اتنا بجٹ نہیں ہے۔ میں $${p} دے سکتا ہوں۔`,
  },
};
function safeLine(language, role, price) {
  return (SAFE_LINES[language] || SAFE_LINES.English)[role](price);
}

/**
 * Check one move. Returns { move, violation }.
 * If the move breaks a rule, `move` is replaced with a safe one and
 * `violation` explains what was blocked.
 */
function checkMove({ deal, listing, role, move }) {
  const floor = listing.floorPrice;
  const asking = listing.askingPrice;
  const budget = deal.buyer.maxBudget;
  const lang = deal.language;

  const sellerLast = lastOffer(deal, 'seller');
  const buyerLast = lastOffer(deal, 'buyer');

  const action = ['offer', 'accept', 'walk_away'].includes(move.action) ? move.action : 'offer';
  let price = move.price == null || move.price === '' ? null : round2(move.price);
  if (price !== null && !(price > 0)) price = null;

  const out = { ...move, action, price };

  if (role === 'seller') {
    const fallbackPrice = sellerLast !== null ? sellerLast : asking;

    if (action === 'accept') {
      if (buyerLast === null) {
        return { move: { ...out, action: 'offer', price: fallbackPrice }, violation: null, note: 'Nothing to accept yet; treated as an offer.' };
      }
      if (buyerLast < floor) {
        return {
          move: { ...out, action: 'offer', price: fallbackPrice, message: safeLine(lang, 'seller', fallbackPrice) },
          violation: `Seller agent tried to ACCEPT $${buyerLast}, which is below the seller's private floor. Blocked by code.`,
        };
      }
      return { move: { ...out, price: buyerLast }, violation: null };
    }

    if (action === 'offer') {
      if (price === null) return { move: { ...out, price: fallbackPrice }, violation: null, note: 'Offer had no price; kept the previous one.' };
      if (price > asking) price = asking;
      if (price < floor) {
        return {
          move: { ...out, price: fallbackPrice, message: safeLine(lang, 'seller', fallbackPrice) },
          violation: `Seller agent tried to offer $${price}, which is below the seller's private floor. Blocked by code.`,
        };
      }
      return { move: { ...out, price }, violation: null };
    }
    return { move: out, violation: null }; // walk_away
  }

  // Buyer
  const buyerFallback = buyerLast !== null ? buyerLast : round2(Math.min(budget, asking) * 0.6);

  if (action === 'accept') {
    if (sellerLast === null) return { move: { ...out, action: 'offer', price: buyerFallback }, violation: null };
    if (sellerLast > budget) {
      return {
        move: { ...out, action: 'offer', price: buyerFallback, message: safeLine(lang, 'buyer', buyerFallback) },
        violation: `Buyer agent tried to ACCEPT $${sellerLast}, which is over your budget of $${budget}. Blocked by code.`,
      };
    }
    return { move: { ...out, price: sellerLast }, violation: null };
  }
  if (action === 'offer') {
    if (price === null) return { move: { ...out, price: buyerFallback }, violation: null };
    if (price > budget) {
      return {
        move: { ...out, price: buyerFallback, message: safeLine(lang, 'buyer', buyerFallback) },
        violation: `Buyer agent tried to offer $${price}, over your budget of $${budget}. Blocked by code.`,
      };
    }
    return { move: { ...out, price }, violation: null };
  }
  return { move: out, violation: null };
}

/** Did this move close the deal? Returns the agreed price or null. */
function agreementPrice({ deal, role, move }) {
  if (move.action === 'accept') return move.price;
  if (move.action !== 'offer') return null;
  const other = lastOffer(deal, role === 'seller' ? 'buyer' : 'seller');
  if (other === null) return null;
  // Offers crossed: settle at the standing offer of the other side.
  if (role === 'seller' && move.price <= other) return other;
  if (role === 'buyer' && move.price >= other) return other;
  return null;
}

module.exports = { checkMove, agreementPrice, lastOffer, round2 };
