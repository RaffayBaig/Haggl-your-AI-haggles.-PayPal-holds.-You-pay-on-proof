# Haggl demo video script (about 2 min 45 s)

**Before recording**
- Switch to Claude (`AI_PROVIDER=anthropic`) or use Gemini, whichever bargains better in your tests.
- Reset demo data (Seller dashboard → Reset).
- Have two photos ready: the real item (e.g. your own headphones) and a different object (e.g. a shoe or a mug).
- Optional but strong: use **Sell** to list something you own, with a real photo, so the inspector compares two real photos.
- Record the browser full screen at 1080p. Use OBS or the Windows Game Bar (Win+G). Talk slowly.

---

**0:00–0:15 · Hook** (on the home page)
> "In a bazaar, nobody pays the sticker price, and nobody pays before they see the goods. Online, we lost both. Haggl brings them back with AI agents and PayPal."

**0:15–0:35 · The idea** (point at the three steps)
> "On Haggl, every listing has an AI seller agent that knows a secret lowest price. You send your own AI agent with a secret budget. They haggle. PayPal holds the money. And the seller only gets paid after an AI inspector checks your delivery photo."

**0:35–1:15 · Live negotiation** (open the camera or headphones, choose *Tough*, press Send)
> "My agent opens low... the seller defends the price..." Click 💭 on one bubble: "Each agent has private thoughts the other side never sees." Point at the price meter as the markers close in.

**Optional · Failed negotiation** (set a budget far below the asking price)
> "And when the numbers can't work, they don't pretend: the gap stops closing, Haggl calls a deadlock, and nobody pays."

**1:15–1:45 · The security moment** (start a second deal if needed, then press 😈 *Try to trick the seller*, then 💥 *Simulate jailbroken seller*)
> "What if someone tricks the AI? Here I inject fake 'admin instructions'... and here I simulate the seller agent being completely jailbroken, agreeing to sell for one dollar." When the red card appears: "Blocked, by code, not by the AI. The AI can talk, but only code can move money."

**1:45–2:15 · PayPal hold** (deal agreed → PayPal button → sandbox login → approve)
> "The price the agents agreed is sent to PayPal from our server, with intent AUTHORIZE. The money is now held. The seller hasn't been paid yet." Point at step 2 turning green.

**2:15–2:35 · AI verification** (upload the wrong object first)
> "The package arrives... but it's the wrong item." The inspector says no match → "PayPal voids the hold. I pay nothing." (Optional: show a second deal where the right photo leads to capture: "Seller paid.")

**2:35–2:45 · Close** (Seller dashboard)
> "Negotiations, payouts, released holds, blocked attacks: all logged. Haggl: your AI haggles, PayPal holds, you pay on proof."
