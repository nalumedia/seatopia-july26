/* ══════════════════════════════════════════════════════════════════════════
   OpenAI Ads — Seatopia custom web pixel  (full replacement body)
   Paste over the ENTIRE existing OpenAIAds pixel in
   Shopify Admin → Settings → Customer events → OpenAIAds.

   Fixes vs. the Aug 9 version:
     1. Sends `user` identity  → clears the 0.0% email / external-ID warning.
        The previous version sent no identity at all. The SDK's automatic
        email capture cannot help: Shopify web pixels run in a lax-sandboxed
        iframe and cannot read the top-frame DOM.
     2. Tags `order_created` with event_id = numeric Shopify order ID, so the
        server-side Conversions API event dedups against this one.

   NEVER put an API key in this file. Pixel bodies are served to the browser.
   The CAPI Bearer token belongs in Shopify Flow / a server secret store.

   Field names and event→type pairings follow the taxonomy enforced inside
   oaiq.min.js. Unknown fields cause the SDK to DROP the event.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var PIXEL_ID = 'AuoyzYEEgsYQm9rGgehzmm';
  var SDK_SRC  = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';

  /* ── 1. Load the SDK exactly once ───────────────────────────────────────
     Note: the DOM guard only sees this sandbox's document, not the storefront
     page. It catches re-entry within this pixel, which is the case that has
     actually occurred here.                                                */
  if (!window.__seatopiaOaiqLoaded) {
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

  /* ── 2. Helpers ───────────────────────────────────────────────────────── */

  // Shopify sends decimals ("129.99"); OpenAI requires integer minor units.
  // Assumes a 2-decimal currency (USD/CAD/EUR fine; JPY would need 1x).
  function minor(v) {
    var n = parseFloat(v);
    return isFinite(n) ? Math.round(n * 100) : undefined;
  }

  function cur(c) {
    return (typeof c === 'string' && /^[A-Za-z]{3}$/.test(c)) ? c : undefined;
  }

  // Strip undefined/null — the SDK validates against an allow-list and an
  // explicit undefined can still trip the unknown-field check.
  function clean(o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] === undefined || o[k] === null) delete o[k];
    });
    return o;
  }

  // CRITICAL FOR DEDUP: Shopify hands out order IDs in two shapes —
  // "gid://shopify/Order/6543210" here vs. "6543210" in Flow. Both sides must
  // normalise to the SAME string or OpenAI will count the order twice.
  // Flow-side equivalent: {{ order.id | split: '/' | last }}
  function numericId(v) {
    if (v === undefined || v === null) return undefined;
    var m = String(v).match(/(\d+)\s*$/);
    return m ? m[1] : String(v);
  }

  function sha256Hex(str) {
    try {
      if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === 'undefined') {
        return Promise.resolve(undefined);      // insecure context — skip identity
      }
      return window.crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(str))
        .then(function (buf) {
          return Array.prototype.map
            .call(new Uint8Array(buf), function (b) {
              return ('00' + b.toString(16)).slice(-2);
            })
            .join('');
        })
        .catch(function () { return undefined; });
    } catch (e) {
      return Promise.resolve(undefined);
    }
  }

  /* Push identity into SDK config.
     We pre-hash rather than handing the SDK a raw address. Two reasons:
       - no raw PII in the payload path;
       - a 64-hex value matches the SDK's /^[0-9a-f]{64}$/i check and is applied
         SYNCHRONOUSLY, avoiding its async userConfigHashingPending race with
         the measure call that follows.
     Only allow-listed keys: email_sha256, external_id_sha256, country, city,
     zip_code, ip_address, user_agent.                                        */
  var lastIdentity = '';
  function identify(email, customerId) {
    var jobs = [
      email      ? sha256Hex(String(email).trim().toLowerCase()) : Promise.resolve(undefined),
      customerId ? sha256Hex(numericId(customerId))              : Promise.resolve(undefined)
    ];
    return Promise.all(jobs).then(function (r) {
      var user = clean({ email_sha256: r[0], external_id_sha256: r[1] });
      if (!Object.keys(user).length) return;
      var sig = user.email_sha256 + '|' + user.external_id_sha256;
      if (sig === lastIdentity) return;          // don't re-send identical config
      lastIdentity = sig;
      try { oaiq('config', { user: user }); } catch (e) {}
    }).catch(function () {});
  }

  /* Build a Content object from a ProductVariant.
     The variant lives under a DIFFERENT key per event:
       checkout.lineItems[]  -> lineItem.variant
       product_added_to_cart -> cartLine.merchandise
       product_viewed        -> event.data.productVariant
     so the caller passes it explicitly.
     Allowed item fields: id, name, content_type, quantity, amount, currency. */
  function toContent(variant, quantity, fallbackCurrency, paidUnit) {
    var v = variant || {};
    return clean({
      id:           v.id != null ? String(v.id) : undefined,
      // Prefer the PRODUCT title — v.title is the variant name ("2-Pack"),
      // which is meaningless on its own in OpenAI's reporting.
      name:         (v.product && v.product.title) || v.title || undefined,
      content_type: 'product',
      quantity:     typeof quantity === 'number' ? quantity : undefined,
      // What the customer actually paid. v.price is the CURRENT list price and
      // can differ (order #66688: $52.00 list vs $46.80 charged).
      amount:       paidUnit !== undefined ? paidUnit : minor(v.price && v.price.amount),
      currency:     cur((v.price && v.price.currencyCode) || fallbackCurrency)
    });
  }

  // Unit price paid, from the line total after line-level discounts.
  function paidUnitAmount(li) {
    var q = (typeof li.quantity === 'number' && li.quantity > 0) ? li.quantity : 1;
    var n = parseFloat(li.finalLinePrice && li.finalLinePrice.amount);
    return isFinite(n) ? Math.round((n / q) * 100) : undefined;
  }

  function send(name, data, opts) {
    if (typeof window.oaiq !== 'function') return;
    try { window.oaiq('measure', name, clean(data), opts); } catch (e) {}
  }

  /* ── 3. Seed identity for logged-in visitors ──────────────────────────── */
  try {
    var c0 = (typeof init !== 'undefined') && init && init.data && init.data.customer;
    if (c0 && (c0.email || c0.id)) identify(c0.email, c0.id);
  } catch (e) {}

  /* ── 4. Capture identity as soon as checkout reveals it ───────────────── */
  ['checkout_contact_info_submitted',
   'checkout_address_info_submitted',
   'checkout_started'].forEach(function (evt) {
    analytics.subscribe(evt, function (event) {
      var ck = (event.data && event.data.checkout) || {};
      if (ck.email) identify(ck.email, ck.order && ck.order.customer && ck.order.customer.id);
    });
  });

  /* ── 5. Upper funnel ──────────────────────────────────────────────────── */

  analytics.subscribe('page_viewed', function () {
    send('page_viewed', { type: 'contents' });
  });

  analytics.subscribe('product_viewed', function (event) {
    var v = event.data && event.data.productVariant;
    if (!v) return;
    var item = toContent(v, 1, v.price && v.price.currencyCode);
    send('contents_viewed', {
      type:     'contents',
      amount:   item.amount,
      currency: item.currency,
      contents: [item]
    });
  });

  analytics.subscribe('product_added_to_cart', function (event) {
    var line = event.data && event.data.cartLine;
    if (!line) return;
    // cartLine.merchandise — NOT .variant
    var item = toContent(line.merchandise, line.quantity,
                         line.cost && line.cost.totalAmount &&
                         line.cost.totalAmount.currencyCode);
    send('items_added', {
      type:     'contents',
      amount:   minor(line.cost && line.cost.totalAmount && line.cost.totalAmount.amount),
      currency: item.currency,
      contents: [item]
    });
  });

  analytics.subscribe('checkout_started', function (event) {
    var ck = (event.data && event.data.checkout) || {};
    var currency = cur(ck.totalPrice && ck.totalPrice.currencyCode);
    send('checkout_started', {
      type:     'contents',
      amount:   minor(ck.totalPrice && ck.totalPrice.amount),
      currency: currency,
      contents: (ck.lineItems || []).map(function (li) {
        return toContent(li.variant, li.quantity, currency, paidUnitAmount(li));
      })
    });
  });

  /* ── 6. THE CONVERSION ────────────────────────────────────────────────── */
  analytics.subscribe('checkout_completed', function (event) {
    var ck       = (event.data && event.data.checkout) || {};
    var currency = cur(ck.totalPrice && ck.totalPrice.currencyCode);

    // Same ID the Flow/CAPI event uses, so OpenAI collapses the pair.
    var orderId = numericId(
      (ck.order && ck.order.id) || ck.token || (event.id)
    );

    var payload = {
      type:     'contents',
      amount:   minor(ck.totalPrice && ck.totalPrice.amount),
      currency: currency,
      contents: (ck.lineItems || []).map(function (li) {
        return toContent(li.variant, li.quantity, currency, paidUnitAmount(li));
      })
    };
    var opts = orderId ? { event_id: orderId } : undefined;

    // Attach identity BEFORE measuring — the SDK merges stored user config at
    // measure time, so ordering matters. Send regardless if hashing fails.
    identify(ck.email, ck.order && ck.order.customer && ck.order.customer.id)
      .then(function () { send('order_created', payload, opts); })
      .catch(function () { send('order_created', payload, opts); });
  });
})();
