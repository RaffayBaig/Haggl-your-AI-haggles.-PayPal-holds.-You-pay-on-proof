// Proof-of-delivery: an AI vision model compares the buyer's photo with the listing.
// The decision to capture or void is made in code from the model's structured answer.
const fs = require('fs');
const path = require('path');
const env = require('./env');
const ai = require('./ai');

const PASS_CONFIDENCE = 0.7;

const SYSTEM = `You are a strict, fair delivery inspector for an online marketplace.
A buyer has paid, and the money is on hold. You decide whether the item in the buyer's delivery photo
is the item described in the listing. Your answer decides whether the seller gets paid, so be careful.

Check: is it the same kind of item? Do colour, materials and key features match?
Is the condition consistent with the listing (e.g. "New" must not look worn or broken)?
Is it a real photo of a physical item (not a screenshot, drawing or stock image)?

Reply with ONLY JSON:
{
  "match": true | false,
  "confidence": number between 0 and 1,
  "what_i_see": "one sentence describing the delivery photo",
  "checks": [ { "label": "short check name", "pass": true|false, "detail": "short reason" } ],
  "verdict": "one sentence explaining your decision to the buyer and seller"
}
Give 3 to 5 checks.`;

function listingPhoto(listing) {
  // Only real photos can be sent to the model (not our SVG placeholders).
  if (!listing.image || /\.svg$/i.test(listing.image)) return null;
  let file;
  if (listing.image.startsWith('/uploads/')) file = path.join(__dirname, '..', 'data', listing.image);
  else if (listing.image.startsWith('/img/')) file = path.join(__dirname, '..', 'public', listing.image);
  else return null;
  if (!fs.existsSync(file)) return null;
  const ext = path.extname(file).slice(1).toLowerCase();
  const mimeType = { png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
  return { base64: fs.readFileSync(file).toString('base64'), mimeType };
}

async function verifyDelivery({ listing, photo, fileName = '' }) {
  if (env.VISION_PROVIDER === 'mock') {
    const bad = /wrong|fake|mismatch/i.test(fileName);
    return {
      match: !bad,
      confidence: bad ? 0.12 : 0.93,
      what_i_see: bad ? 'Mock mode: file name says this is the wrong item.' : 'Mock mode: assuming the photo shows the listed item.',
      checks: [
        { label: 'Same item type', pass: !bad, detail: 'Mock check (add an AI key for real vision).' },
        { label: 'Matches description', pass: !bad, detail: 'Mock check.' },
        { label: 'Condition', pass: true, detail: 'Mock check.' },
      ],
      verdict: bad ? 'Mock: item does not match, releasing the hold.' : 'Mock: item matches, paying the seller.',
      passed: !bad,
      mock: true,
    };
  }

  const ref = listingPhoto(listing);
  const images = ref ? [ref, photo] : [photo];
  const prompt = `LISTING
Title: ${listing.title}
Description: ${listing.description}
Condition: ${listing.condition}
${ref ? 'The FIRST image is the seller\'s listing photo. The SECOND image is the buyer\'s delivery photo.' : 'The image is the buyer\'s delivery photo.'}

Does the delivery photo show this listed item?`;

  const result = await ai.generateJSON({ system: SYSTEM, prompt, images, temperature: 0.1, provider: env.VISION_PROVIDER });
  const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
  return {
    match: result.match === true,
    confidence,
    what_i_see: String(result.what_i_see || ''),
    checks: Array.isArray(result.checks) ? result.checks.slice(0, 6) : [],
    verdict: String(result.verdict || ''),
    // The rule that moves money lives here, in code:
    passed: result.match === true && confidence >= PASS_CONFIDENCE,
  };
}

module.exports = { verifyDelivery, PASS_CONFIDENCE };
