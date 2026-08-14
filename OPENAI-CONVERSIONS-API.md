# OpenAI Ads — fixing the two dashboard warnings

Status: diagnosis complete, implementation pending.
Pixel ID: `AuoyzYEEgsYQm9rGgehzmm`

> **The API key is NOT in this file, and must never be.** This repo syncs to
> GitHub and deploys to a public storefront. The key belongs in Shopify Flow's
> action config or a server-side secret store only. See "Key handling" at the end.

---

## The two warnings are separate problems

| Warning | Cause | Fix |
| --- | --- | --- |
| **No recent conversion events** (24h) | `order_created` is not reaching OpenAI | Conversions API from an order webhook |
| **0.0% email / external ID coverage** (4,555 events) | The pixel never sends a `user` object | Add `user` to the pixel and to CAPI |

They share no root cause. Fixing one does not fix the other.

### Warning 1 is not "no orders"

Verified against the Admin API: **229 orders since Aug 11**, most recent `#67130`
at 2026-08-14T00:32Z for $284.00. Real orders with real customers are landing
and are not being reported as conversions.

Checkout Extensibility is confirmed live (`CheckoutProfile 5215617275`,
`isPublished: true`), so `checkout_completed` is *not* blocked by a legacy
`checkout.liquid`. The browser-side root cause is still **unconfirmed** — the
Admin API token lacks `read_pixels`, so the deployed pixel body cannot be read
back for inspection. That is why the fix below moves conversions server-side
rather than guessing at the browser code.

### Warning 2 is a gap in the previous implementation

The pixel code in `OPENAI-PIXEL-SETUP.md` never sent user identity at all — it
sends only `type`, `amount`, `currency`, `contents`. Hence exactly 0.0% across
all 4,555 events. That is an omission in that document, not a regression.

The SDK *does* support identity, and also tries to capture emails automatically
by attaching `change`/`submit` listeners to email inputs (`Fn`, `On`, `zt` in
`oaiq.min.js`). **That auto-capture can never work here**: Shopify web pixels run
in a lax-sandboxed iframe and cannot read the top-frame DOM. Identity must be
passed explicitly.

---

## Contract, read out of `oaiq.min.js` (46,725 bytes)

**Identity is config-level in the SDK, event-level in the API.**

Allowed keys on `oaiq('init'|'config', {...})`:

```
["pixelId", "debug", "user"]
```

Allowed keys inside `user` (both SDK and CAPI):

```
["email_sha256", "external_id_sha256", "country", "city",
 "zip_code", "ip_address", "user_agent"]
```

**Hash detection.** The SDK tests each value against `/^[0-9a-f]{64}$/i`. A match
is treated as already hashed; anything else is treated as raw and hashed for you
via Web Crypto SHA-256. Email is lowercased first; `external_id` is not.

**Hash it yourself anyway.** Relying on SDK-side hashing means the raw address
exists in the browser payload path. Send a pre-computed SHA-256 of the trimmed,
lowercased email. Same result, no raw PII in flight.

---

## Conversions API — verified behaviour

Probed live with `validate_only: true` (nothing recorded):

```
POST https://bzr.openai.com/v1/events?pid=AuoyzYEEgsYQm9rGgehzmm
Authorization: Bearer <key>
Content-Type: application/json
```

✅ **Accepted** — `user` at the event level, alongside a full `contents` payload:

```json
{
  "validate_only": true,
  "events": [{
    "id": "<stable-event-id>",
    "type": "order_created",
    "timestamp_ms": 1786...,
    "source_url": "https://seatopia.fish/checkouts/thank_you",
    "action_source": "web",
    "user": {
      "email_sha256": "<64-hex>",
      "external_id_sha256": "<64-hex>"
    },
    "data": {
      "type": "contents",
      "amount": 28400,
      "currency": "USD",
      "contents": [
        { "id": "123", "name": "Test Product", "content_type": "product",
          "quantity": 2, "amount": 14200, "currency": "USD" }
      ]
    }
  }]
}
```
→ `{"accepted_events":1}`

❌ **Rejected** — unknown fields are a hard 400, not a silent drop:

```json
{"error":{"message":"Invalid event at events[0]. See errors for details.",
 "code":"invalid_event",
 "errors":[{"param":"events[0].data.nonsense","code":"unknown_data_field"}]}}
```

Send only allow-listed fields. `amount` is integer **minor units** — `$284.00`
→ `28400`.

---

## Recommended architecture

**Conversions via CAPI, upper funnel via the pixel.**

Server-side conversions are immune to ad blockers, consent gating, and the
sandbox restrictions that are plausibly breaking the browser path today. Keep
the pixel for `page_viewed` / `contents_viewed`, which already work (4,555
events proves delivery is fine).

### Deduplication matters

If the browser pixel *is* still sending `order_created` for some sessions, and
CAPI also sends it, the order double-counts. Prevent that by using the **same
stable event id in both**:

- CAPI: `events[0].id`
- Pixel: `eventOptions.event_id`

Use the Shopify order ID for both. Then OpenAI collapses the pair.

### Option A — Shopify Flow (no server, recommended)

Trigger **Order created** → action **Send HTTP request**.

- URL: `https://bzr.openai.com/v1/events?pid=AuoyzYEEgsYQm9rGgehzmm`
- Method: `POST`
- Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`
- Body (Flow supports Liquid, and Shopify Liquid ships a `sha256` filter):

```liquid
{
  "events": [{
    "id": "{{ order.id }}",
    "type": "order_created",
    "timestamp_ms": {{ order.createdAt | date: '%s' }}000,
    "source_url": "https://seatopia.fish/checkouts/thank_you",
    "action_source": "web",
    "user": {
      "email_sha256": "{{ order.email | strip | downcase | sha256 }}"{% if order.customer %},
      "external_id_sha256": "{{ order.customer.id | sha256 }}"{% endif %}
    },
    "data": {
      "type": "contents",
      "amount": {{ order.currentTotalPriceSet.shopMoney.amount | times: 100 | round }},
      "currency": "{{ order.currentTotalPriceSet.shopMoney.currencyCode }}"
    }
  }]
}
```

**Verify before trusting it:** run once with `"validate_only": true` added at the
top level and confirm `{"accepted_events":1}`, then remove it. Confirm Flow's
Liquid subset actually exposes `sha256` — if it does not, fall back to Option B.
An unhashed email here would be both a validation failure and a PII leak.

Guest checkouts have no `order.customer`, hence the `{% if %}` — omit the field
rather than send an empty string, which would fail the hex check.

### Option B — order webhook to a small function

`orders/create` webhook → Cloudflare Worker / Vercel function → CAPI. More
moving parts, but full control over hashing, retries, and line-item mapping,
and the key lives in a real secret store.

---

## Also fix the pixel's identity gap

Independent of CAPI — this is what clears the 0.0% coverage warning on the
4,555 non-conversion events.

As soon as identity is known (`init.data.customer`, or
`checkout_contact_info_submitted`, or `checkout_completed`):

```js
// Pre-hash: never hand the SDK a raw address.
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function identify(email, customerId) {
  const user = {};
  if (email)      user.email_sha256       = await sha256Hex(String(email).trim().toLowerCase());
  if (customerId) user.external_id_sha256 = await sha256Hex(String(customerId));
  if (Object.keys(user).length) oaiq('config', { user: user });
}
```

Call `identify(...)` **before** the `measure` for that event — the SDK merges the
stored user config at measure time, so ordering matters.

---

## Verification

1. Flow/function fires with `validate_only: true` → `{"accepted_events":1}`.
2. Switch to `validate_only: false`, place one real order.
3. OpenAI dashboard: "No recent conversion events" clears within ~24h (the
   warning is scoped to complete UTC hours, so allow a full cycle).
4. Email / External ID coverage climbs above 0.0%.
5. Confirm no double counting — one conversion per order, not two.

Do not judge any of this on a 100%-discount test order. Order `#66688` reported
`amount: 0`, which is indistinguishable from a broken payload.

---

## Key handling

The service-account key was shared in plaintext in a chat transcript and should
be treated as compromised — **rotate it after implementation**.

Wherever it lands, it must not be:
- committed to this repo,
- placed in any theme file, snippet, or web pixel body (all client-readable),
- pasted into a Notion page or ticket.

Shopify Flow's action config and a server-side environment variable are both
acceptable. A web pixel is **not** — pixel bodies are served to the browser, and
a Bearer key there is world-readable. This is the same exposure pattern as the
DeepBlue key currently hardcoded at `sections/omega-quant-account.liquid:178,181`
and publicly visible in the page source of `/pages/omega-index`.
