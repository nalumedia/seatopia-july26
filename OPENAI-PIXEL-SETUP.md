# OpenAI Ads Pixel — diagnosis and replacement code

**Date:** 2026-08-09 · **Pixel:** `OpenAIAds`, Shopify custom pixel id `150077691`
**Location:** Shopify admin → Settings → Customer events → OpenAIAds
**Not theme code.** Nothing in this repo controls this pixel; the file is kept here as the reference for what should be pasted into admin.

---

## Diagnosis

### The pixel is working. It is only sending the wrong half of the funnel.

| Evidence | Reading |
| --- | --- |
| Event Stream shows `contents_viewed` arriving via `pixel_sdk` with correct amounts (`10300`, `23000`, `21500`, `5600`) and `contents[]` arrays | The pixel is installed, initialised, authenticated, and transmitting. Minor-unit conversion is already correct. |
| Every visible row is `contents_viewed` — no `page_viewed`, no `items_added`, no `checkout_started` | The pixel subscribes to **product views only**. On a store with traffic, `page_viewed` would dominate the stream if it were subscribed. |
| Conversion Events tab defines exactly one conversion: **Order Created** (`6a5e704fc1e881a382a1507074f0ad22`) | The conversion you are measuring is `order_created`. |
| No conversions reported | **`order_created` is never sent.** The pixel has no `checkout_completed` subscription. |

The conversion event is configured correctly on OpenAI's side. The pixel simply never emits it.

### Secondary issue: the SDK loads twice

Tracked separately, same root cause area — one pixel producing two `oaiq.min.js` requests. The replacement below fixes this with a double idempotency guard, so both issues close together.

---

## What the SDK actually requires

Read directly out of `bzrcdn.openai.com/sdk/oaiq.min.js` rather than assumed:

**Call signature**

```js
oaiq('measure', eventName, eventData, eventOptions)
```

Other commands: `init`, `config`, `consent`, `measureSingle`.

**Event name → data type** (the SDK's internal map — a mismatch is rejected)

| Event | `type` |
| --- | --- |
| `page_viewed`, `contents_viewed`, `items_added`, `checkout_started`, `order_created` | `contents` |
| `lead_created`, `registration_completed`, `appointment_scheduled` | `customer_action` |
| `subscription_created`, `trial_started` | `plan_enrollment` |
| `custom` | `custom` |

**Allowed fields — these lists are enforced**

- `contents` event: `type`, `amount`, `currency`, `contents`
- `customer_action` event: `type`, `amount`, `currency`
- each `contents[]` item: `id`, `name`, `content_type`, `quantity`, `amount`, `currency`
- `eventOptions`: `event_id`, `eventId`, `custom_event_name`, `opt_out`

**Validation behaviour.** The SDK validates before sending and will log `[oaiq] validation failed; event dropped` or `[oaiq] validation warning` to the console. Unknown fields, a `currency` failing `/^[A-Za-z]{3}$/`, or non-integer `amount` will cost you the event. Your dashboard currently shows **2 warnings** — check the browser console with `debug: true` to read them.

**Money must be integer minor units.** `$129.99` → `12999`. Shopify returns decimals, so every amount needs `Math.round(x * 100)`.

---

## Replacement pixel code

Paste over the existing OpenAIAds pixel body. Pixel ID `AuoyzYEEgsYQm9rGgehzmm` is already filled in — nothing left to substitute.

```js
/* ── OpenAI Ads pixel — Seatopia ──────────────────────────────────────────
   Fixes:
     1. order_created was never sent -> no conversions recorded
     2. oaiq.min.js was loading twice
   Field names and event/type pairings follow the taxonomy enforced inside
   oaiq.min.js. Do not add fields outside the allowed lists; the SDK drops
   events that fail validation.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  var PIXEL_ID = 'AuoyzYEEgsYQm9rGgehzmm';   // Seatopia OpenAI Ads pixel
  var SDK_SRC  = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';

  /* ---- 1. Load the SDK exactly once ------------------------------------
     Two guards on purpose. The flag catches re-entry inside this pixel;
     the DOM query catches an injection from any other execution context.
     Either alone leaves a hole.                                           */
  if (!window.__seatopiaOaiqLoaded &&
      !document.querySelector('script[src*="oaiq.min.js"]')) {
    window.__seatopiaOaiqLoaded = true;

    window.oaiq = window.oaiq || function () {
      (window.oaiq.q = window.oaiq.q || []).push(arguments);
    };
    oaiq('init', { pixelId: PIXEL_ID });

    var s = document.createElement('script');
    s.src = SDK_SRC;
    s.async = true;
    document.head.appendChild(s);
  }

  /* ---- 2. Helpers ------------------------------------------------------ */

  // Shopify sends decimals ("129.99"); OpenAI requires integer minor units.
  // NOTE: assumes a 2-decimal currency. USD/CAD/EUR fine. JPY would need 1x.
  function minor(v) {
    var n = parseFloat(v);
    return isFinite(n) ? Math.round(n * 100) : undefined;
  }

  function cur(c) {
    return (typeof c === 'string' && /^[A-Za-z]{3}$/.test(c)) ? c : undefined;
  }

  // Strip undefined keys — the SDK validates against an allow-list and an
  // explicit undefined can still trip the unknown-field check.
  function clean(o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] === undefined || o[k] === null) delete o[k];
    });
    return o;
  }

  // Build an OpenAI Content object from a ProductVariant.
  //
  // The variant lives under a DIFFERENT key depending on the event:
  //   checkout.lineItems[]  -> lineItem.variant
  //   product_added_to_cart -> cartLine.merchandise
  //   product_viewed        -> event.data.productVariant
  // Pass the variant explicitly so the caller owns that mapping.
  function toContent(variant, quantity, fallbackCurrency, nameFallback, paidUnit) {
    var v = variant || {};
    return clean({
      id:           v.id != null ? String(v.id) : undefined,
      // Prefer the PRODUCT title. v.title is the variant name ("2-Pack"),
      // which reads as meaningless in OpenAI's reporting on its own.
      name:         nameFallback ||
                    (v.product && v.product.title) ||
                    v.title || undefined,
      content_type: 'product',
      quantity:     typeof quantity === 'number' ? quantity : undefined,
      // paidUnit (from finalLinePrice) is what the customer was actually
      // charged. v.price is the CURRENT list price and can differ — order
      // #66688 had variant.price $52.00 against $46.80 actually charged.
      // Fall back to list price only when finalLinePrice is unavailable.
      amount:       paidUnit !== undefined ? paidUnit
                                           : minor(v.price && v.price.amount),
      currency:     cur((v.price && v.price.currencyCode) || fallbackCurrency)
    });
  }

  // Unit price actually paid, derived from the line total after line-level
  // discounts. Requires Checkout Extensibility; returns undefined without it.
  function paidUnitAmount(li) {
    var q = (typeof li.quantity === 'number' && li.quantity > 0) ? li.quantity : 1;
    var flp = li.finalLinePrice && li.finalLinePrice.amount;
    var n = parseFloat(flp);
    return isFinite(n) ? Math.round((n / q) * 100) : undefined;
  }

  function send(name, data, opts) {
    if (typeof window.oaiq !== 'function') return;
    try { window.oaiq('measure', name, clean(data), opts); } catch (e) {}
  }

  /* ---- 3. THE MISSING CONVERSION --------------------------------------- */
  analytics.subscribe('checkout_completed', function (event) {
    var c = (event.data && event.data.checkout) || {};
    var currency = cur(c.totalPrice && c.totalPrice.currencyCode);

    send('order_created', {
      type:     'contents',
      amount:   minor(c.totalPrice && c.totalPrice.amount),
      currency: currency,
      contents: (c.lineItems || []).map(function (li) {
        return toContent(li.variant, li.quantity, currency, li.title,
                         paidUnitAmount(li));
      })
    }, {
      // Dedupe key. Prevents double-counting if the thank-you page is
      // reloaded or the event is replayed.
      event_id: String((c.order && c.order.id) || c.token || event.id || '')
    });
  });

  /* ---- 4. Rest of the funnel ------------------------------------------- */

  analytics.subscribe('checkout_started', function (event) {
    var c = (event.data && event.data.checkout) || {};
    var currency = cur(c.totalPrice && c.totalPrice.currencyCode);
    send('checkout_started', {
      type:     'contents',
      amount:   minor(c.totalPrice && c.totalPrice.amount),
      currency: currency,
      contents: (c.lineItems || []).map(function (li) {
        return toContent(li.variant, li.quantity, currency, li.title,
                         paidUnitAmount(li));
      })
    });
  });

  analytics.subscribe('product_added_to_cart', function (event) {
    var line = (event.data && event.data.cartLine) || {};
    var cost = (line.cost && line.cost.totalAmount) || {};
    var currency = cur(cost.currencyCode);
    send('items_added', {
      type:     'contents',
      amount:   minor(cost.amount),
      currency: currency,
      // cartLine.merchandise is the ProductVariant — NOT cartLine.variant
      contents: [toContent(line.merchandise, line.quantity, currency)]
    });
  });

  analytics.subscribe('product_viewed', function (event) {
    var pv = (event.data && event.data.productVariant) || {};
    var currency = cur(pv.price && pv.price.currencyCode);
    send('contents_viewed', {
      type:     'contents',
      amount:   minor(pv.price && pv.price.amount),
      currency: currency,
      contents: [toContent(pv, 1, currency)]
    });
  });

  analytics.subscribe('page_viewed', function () {
    send('page_viewed', { type: 'contents' });
  });
})();
```

---

## Sandbox reality — read before trusting the duplicate-load fix

Shopify runs custom pixels in a **lax sandbox**: an `iframe` with `sandbox="allow-scripts allow-forms"`. Per Shopify's docs, pixels in the lax sandbox **cannot access the top frame**, and `window.location` returns the *sandbox* URL rather than the page URL.

What this means for the code above:

**Works as intended.** `document.createElement('script')` + `document.head.appendChild()` injects into the sandbox iframe's own document. The SDK loads there and `fetch`es to `bzr.openai.com`. This is precisely the supported pattern — Shopify describes the lax sandbox as existing so "legacy JavaScript pixels [can] be inserted onto the page using an iframe." It is also how the existing `contents_viewed` events were already reaching OpenAI.

**Caveat on the duplicate-load guard.** `document.querySelector('script[src*="oaiq.min.js"]')` queries the **sandbox's** DOM, not the top frame. So:

- If both loads originate from this pixel, the guard stops the second one. ✅
- If the second load originates in the **main page** — a legacy `ScriptTag`, an app, anything outside the sandbox — this guard is blind to it and the duplicate will persist. ❌

`scriptTags` could not be inspected (API access denied), so that possibility is not eliminated. **Confirm with DevTools → Network → filter `oaiq` → Initiator column after deploying.** Two rows still present means the second source is outside the pixel.

**Do not add URL-based logic to this pixel.** Anything reading `window.location` gets the sandbox URL, not the customer's actual page. Use the event payload's `context.document` instead.

## Consent settings affect delivery

Current configuration (Settings → Customer events → OpenAIAds → Customer privacy):

- **Permission: Required** — Marketing ✅, Analytics ✅, Preferences ⬜
- **Data sale: "Data collected qualifies as data sale"** — the pixel stops collecting when a customer opts out of data sale

Consequence: visitors who decline Marketing or Analytics in the cookie banner generate **no events at all** — including no `order_created`. Opted-out CCPA visitors are likewise suppressed.

This is almost certainly correct from a compliance standpoint and should not be loosened casually. But it does mean OpenAI's conversion counts will read lower than Shopify's order counts, and the gap is consent-driven, not a tracking bug. Worth knowing before anyone reconciles the two numbers and files a defect.

## Verifying the fix

1. Paste, save, and place a **test order** (a cheap SKU or a 100%-off discount).
2. Watch OpenAI → Conversions → **Event Stream**. An `order_created` row should appear within a minute or two, `API Channel: pixel_sdk`, with `amount` in minor units and a populated `contents[]`.
3. Confirm **Conversion Events → Order Created** starts counting.
4. In the browser console on the thank-you page, check for `[oaiq]` warnings. To see full validation detail, temporarily initialise with `oaiq('init', { pixelId: PIXEL_ID, debug: true })`.
5. Network tab, filter `oaiq` — should now be **one** request, not two.

## Two things to confirm before trusting the numbers

- **Checkout events require Checkout Extensibility.** On a Plus store using a legacy `checkout.liquid`, custom pixels do not fire on checkout and `checkout_completed` will never arrive. If step 2 produces nothing, verify checkout extensibility status first — that would be the real blocker, not this code.
- **`page_viewed` will dominate volume.** It is included for funnel completeness, but if event volume or cost is a concern, drop that subscription. It is the last block in the file.

## Currency caveat

`minor()` multiplies by 100. Correct for USD and every currency Seatopia sells in today. If a zero-decimal currency (JPY, KRW) is ever added, that function needs a per-currency exponent or the amounts will be inflated 100×.
