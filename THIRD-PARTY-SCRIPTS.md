# Third-Party Script Audit — seatopia.fish

**Generated:** 2026-08-09 · **Theme:** `seatopia-july26/main` · **Commit at time of audit:** `8fc3a66`

---

## How this was built, and what it does and doesn't tell you

Every entry below was verified against one of four sources, not assumed:

| Source | Method |
| --- | --- |
| Theme source | `grep` across `layout/`, `sections/`, `snippets/`, `templates/`, `blocks/` — gives exact `file:line` |
| Live runtime | Fetched `https://seatopia.fish/` and extracted every external `<script src>` and injected URL |
| GTM container | Fetched and parsed `gtm.js?id=GTM-5L5Q9Q66` — tag types, IDs, and vendor payloads |
| Shopify config | `config/settings_data.json` app embeds + the live `webPixelsConfigList` manifest |

**Sizes are measured**, not estimated. Each URL was fetched twice — once with `Accept-Encoding: gzip, br` for wire size, once with `--compressed` for decoded size — and byte-counted. Decoded size is what matters for main-thread parse/compile cost; wire size is what matters for bandwidth.

**Load-time impact is partly inferred.** What is *measured*: the file size and the loading attribute (blocking / `async` / `defer` / runtime-injected). What is *inferred*: the impact rating, reasoned from those two facts. Where a real audit number exists it is cited explicitly. Nobody has run a per-script Lighthouse attribution, so treat ratings as a prioritisation aid, not a measurement.

### Three things this audit cannot see

1. **~20 Shopify APP web pixels return no name via the storefront manifest** — only numeric IDs. They execute inside the Web Pixels Manager sandbox. Their payloads are not measured here and are **not** included in the totals.
2. **`scriptTags` API access is denied** to the current token. That is a legacy injection surface, and it is where the unexplained duplicate `oaiq.min.js` most plausibly lives.
3. **Loader scripts understate their real cost.** Klaviyo (15 KB) and HubSpot (1.7 KB) are bootstrappers that pull much larger payloads at runtime. Their true weight is several times what is listed.

**So the totals below are a floor, not a ceiling.**

---

## Summary — the whole picture

| # | Script | Decoded | Wire | Loads on | Via | Blocking? |
| --- | --- | ---: | ---: | --- | --- | --- |
| 1 | Google Ads gtag `AW-991498054` | 471.9 KB | 156.8 KB | Every page | Hard-coded | `async` |
| 2 | Meta Pixel `fbevents.js` | 407.7 KB | 107.0 KB | Every page | **GTM** | `async` |
| 3 | GTM container `GTM-5L5Q9Q66` | 371.8 KB | 125.4 KB | Every page | Hard-coded | `async` |
| 4 | PostHog `array.js` | 243.5 KB | 78.4 KB | Every page | Hard-coded | `async` |
| 5 | Heatmap.com loader | 143.6 KB | 44.3 KB | Every page | Hard-coded | **deferred to idle** ✅ |
| 6 | Edacious `product.js` | 110.5 KB | 32.7 KB | Every page | Hard-coded | 🔴 **PARSER-BLOCKING** |
| 7 | Heatmap.com light (tracker) | 96.4 KB | 27.9 KB | Every page | Chained from #5 | deferred via #5 ✅ |
| 8 | jQuery 3.6.1 (cdnjs) | 89.7 KB | 28.0 KB | Every page | Hard-coded | 🔴 **PARSER-BLOCKING** |
| 9 | Twitter/X `uwt.js` | 50.1 KB | 13.7 KB | Every page | Hard-coded | `async` |
| 10 | OpenAI `oaiq.min.js` | 46.7 KB | 14.3 KB | Every page | Web Pixel | runtime — ⚠️ **loads 2×** |
| ~~11~~ | ~~Light Labs widget v5~~ | ~~39.4 KB~~ | ~~14.0 KB~~ | — | — | ✅ **REMOVED 2026-08-09** |
| 12 | Inflektion `modals.min.js` | 27.9 KB | 10.4 KB | Most pages | Hard-coded | `async` |
| 13 | Klaviyo onsite (loader) | 15.2 KB | 2.2 KB | Every page | App embed | `async` |
| 14 | Shopify Web Pixels Manager | **238.4 KB** | **69.6 KB** | Every page | Shopify | `async` |
| 15 | HubSpot (loader) | 1.7 KB | 0.7 KB | Every page | Hard-coded | `async defer` |
| 16 | Replo chunks | varies | varies | 33 templates | Hard-coded | `async` |
| | **Measured total (after Light Labs removal)** | **≈ 2.21 MB** | **≈ 696 KB** | | | |

Plus ~20 unmeasured APP web pixels and the runtime payloads behind the Klaviyo and HubSpot loaders.

> **Correction 2026-08-09:** the Web Pixels Manager was originally recorded at 2.8 KB. That figure came from a 404 page returned by a guessed URL. The real bundle is at `seatopia.fish/cdn/wpm/b{hashVersion}m.js` and is **244,156 B decoded / 71,257 B wire** — making it the *fifth-largest* third party on the site, not the second-smallest. Totals below are corrected.

**Roughly 2.2 MB of decoded third-party JavaScript on every page load** (2.21 MB after the Light Labs removal on 2026-08-09). Items 1–4 alone are 1.46 MB — 72% of the measured total — and all four are analytics/advertising rather than customer-facing functionality.

---

## 1. Hard-coded in the theme

All of these live in `layout/theme.liquid` unless noted, which means **every page**.

### 🔴 jQuery 3.6.1 — `theme.liquid:73`

```
https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.1/jquery.min.js
```

- **Size:** 89.7 KB decoded / 28.0 KB wire
- **Guard:** none — every page, including checkout-adjacent pages
- **Loading:** **no `defer`, no `async`** → halts HTML parsing until downloaded and executed
- **Purpose:** dependency for `custom-jtpl.js`, `vendor.js`, `theme.js` (lines 81–83, all correctly deferred)
- **Suggested owner:** Product / Dev

**This is the highest-impact fix on the list.** A synchronous third-party request in `<head>` blocks parsing entirely — worse than the 348 ms heatmap reflow already fixed. It is also served from **cdnjs, not the Shopify CDN**, so it adds a DNS lookup + TLS handshake to a third-party origin on the critical path. Shopify's own theme-check flags it (`ParserBlockingScript`).

Complicating factor: the three dependent scripts are `defer`, which means they execute *after* parsing regardless. jQuery does not actually need to be synchronous — but confirm nothing inline depends on `$` before load before changing it.

### 🔴 Edacious — `theme.liquid:202`

```
https://cdn.edacious.com/embed/v1/product.js
```

- **Size:** 110.5 KB decoded / 32.7 KB wire
- **Guard:** none — **every page**
- **Loading:** **no `defer`, no `async`** → parser-blocking
- **Purpose:** nutrient-density / Certificate-of-Analysis data widget (`data-edacious-results`)
- **Suggested owner:** Merchandising / Content

Second parser-blocking script, and 110 KB of it. It is only *used* on product pages and a handful of landing pages (the Hyman LP data room), but loads on every page including the cart, blog, and account pages. Adding `defer` plus a template guard is a safe, contained win.

### Google Ads gtag — `theme.liquid:174`

```
https://www.googletagmanager.com/gtag/js?id=AW-991498054
```

- **Size:** 471.9 KB decoded / 156.8 KB wire — **the single largest third party on the site**
- **Guard:** none · **Loading:** `async` · Labelled "magic links" in source
- **Purpose:** Google Ads conversion tracking
- **Suggested owner:** Growth / Paid Media

**This overlaps with GTM.** The GTM container already carries a Google tag. Running a standalone `gtag.js` *and* GTM means two large Google payloads (472 KB + 372 KB = 844 KB decoded) doing substantially similar work. Consolidating Ads conversion into GTM would likely remove ~470 KB outright. Needs Paid Media to confirm nothing depends on the standalone tag first.

### PostHog — `theme.liquid:204–213`

```
https://us-assets.i.posthog.com/static/array.js
```

- **Size:** 243.5 KB decoded / 78.4 KB wire · Project key `phc_x4Efqnt6…` · host `us.i.posthog.com`
- **Guard:** none · **Loading:** `async` (inline injector)
- **Config:** `person_profiles: 'identified_only'`, `defaults: '2026-01-30'`
- **Purpose:** product analytics, feature flags, session replay, surveys
- **Suggested owner:** Product / Data

Fourth-largest payload. The bundle includes session-replay and survey machinery whether or not those features are in use. **Worth asking who actually reads PostHog** — it overlaps heavily with Heatmap.com (session behaviour) and GA4 (funnels). If nobody is querying it, this is 243 KB for nothing.

### Twitter / X conversion tracking — `theme.liquid:195`

- `https://static.ads-twitter.com/uwt.js` · 50.1 KB decoded / 13.7 KB wire
- Pixel ID `p81b1` · **Loading:** `async` · **Guard:** none
- **Suggested owner:** Growth / Paid Media

**Is X still an active channel?** If there is no live X ad spend, this is 50 KB and a third-party origin on every page for zero return. Cheapest possible removal if unused.

### Heatmap.com — `theme.liquid:99` ✅ recently deferred

- Loader 143.6 KB decoded, chains to `heatmap-light.min.js` 96.4 KB decoded — **240 KB combined**
- **Loading:** deferred to `requestIdleCallback` after `load` (commit `8fc3a66`)
- **Purpose:** scroll maps, click maps, session recording, revenue attribution
- **Suggested owner:** CRO / Analytics

Previously the largest forced-reflow contributor at **348 ms**. Now off the critical path. Note there is *also* a `heatmap-revenue` custom web pixel (below) — same vendor, second integration.

### ~~Light Labs widget~~ — ✅ REMOVED 2026-08-09

- **Was:** `https://app.lightlabs.com/assets/ll-pip-widget-v5.js` · 39.4 KB decoded / 14.0 KB wire, `async`, every page
- **Removed:** loader from `theme.liquid` **plus every embed** — 22 widget/iframe instances across 17 templates, including the `product.json` and `article.json` defaults
- **Verified:** all templates still parse, section/order integrity intact, 5 page types render with zero Liquid errors and zero Light Labs references

⚠️ **Prose references were deliberately left in place.** 22 templates still contain copy such as *"tested by Light Labs to ensure it meets the Seatopia Standard"*, and `sections/omega-map.liquid` uses Light Labs as a **named data source** — lab attributions, test numbers, and COA PDF links throughout the omega/microplastics dataset.

These are substantiation claims about who performs the testing, not vendor code. If Light Labs remains the lab, the copy is true and should stay. If the relationship is ending, the copy needs a comms/legal review rather than a find-and-replace — the omega-map data in particular cites specific test numbers and published COAs.

### HubSpot — `theme.liquid:296`

- `//js.hs-scripts.com/45964107.js` · loader 1.7 KB, **pulls a much larger runtime payload**
- **Loading:** `async defer` (correct) · **Guard:** none
- **Purpose:** CRM tracking / chat / forms
- **Suggested owner:** Sales / Lifecycle

Well-implemented. The open question is ownership: **is HubSpot still in use?** Klaviyo and Postscript cover email and SMS. If HubSpot is legacy, removing it also removes its runtime payload.

### Inflektion (affiliate) — `snippets/inf-header-scripts.liquid` + `inf-footer-scripts.liquid`

- `https://cleanseafoodtoyourdoor.com/core/modals.min.js` · 27.9 KB decoded / 10.4 KB wire
- Rendered from `theme.liquid:20` (header) and `:500` (footer)
- **Loading:** `async`, with `<link rel="preconnect">` — good practice
- **Guard:** ✅ **the only well-scoped script on the site.** Suppressed on any `page` whose `custom.enable_announcement_bar` metafield is `false`
- **Purpose:** affiliate attribution (EverFlow `EF.click`), announcement-bar modals
- **Suggested owner:** Affiliate / Partnerships

Note the vendor domain is a **Seatopia-controlled marketing domain**, not an obvious third party. Worth documenting so it is not mistaken for unknown code later.

### Replo — 133 snippets, 33 templates

- `https://replocdn.com/w/4d241ead-…/<chunk>.min.js` · **Loading:** `async`
- **Purpose:** visual page-builder chunks for Replo-built landing pages
- **Suggested owner:** Growth / Landing Pages

133 chunk snippets exist but only **33 templates** reference one. That implies **~100 orphaned Replo snippets** — dead files carried in every theme deploy. They do not execute unless referenced, so this is repo hygiene and deploy size, not runtime cost.

---

## 2. Loaded via Google Tag Manager

Container **`GTM-5L5Q9Q66`**, hard-coded at `theme.liquid:102–108` (`async`), noscript fallback at `:253`.

The container is **much lighter than expected** — it is not the main third-party vector:

| Tag | Type | Detail |
| --- | --- | --- |
| Google tag | `__googtag` | GA4 **`G-V9NSCVQN78`** |
| GA4 event | `__gaawe` | event tag |
| Custom HTML | `__html` | **Meta Pixel `2022660071507488`** → `connect.facebook.net/en_US/fbevents.js` |
| Click listener | `__cl` | trigger only |

**Only two vendors fire through GTM: GA4 and Meta.** Everything else is hard-coded in the theme or installed as a Shopify app/pixel. That is the opposite of the usual arrangement and the core structural finding of this audit — see §5.

### ⚠️ Bug: broken Meta noscript fallback

The Meta tag's `<noscript>` fallback contains an unreplaced template placeholder:

```html
<img src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1">
```

`YOUR_PIXEL_ID` was never substituted. The JS path works, so most traffic is tracked; the no-JS fallback fires at a non-existent pixel. Low traffic impact, trivial fix, but it indicates the tag was pasted without review — worth checking whether other tags were handled the same way.

---

## 3. Shopify app embeds

From `config/settings_data.json`. These inject scripts outside the theme's control.

| App | Block | Status | Suggested owner |
| --- | --- | --- | --- |
| Judge.me | `judgeme_core` | ✅ Enabled | Merchandising |
| Judge.me | `reviews_tab` | ⛔ Disabled | — |
| Judge.me | `popup_widget` | ⛔ Disabled | — |
| Klaviyo | `klaviyo-onsite-embed` | ✅ Enabled | Lifecycle / Retention |
| Triple Whale | `triple_pixel_snippet` | ✅ Enabled | Growth / Paid Media |
| Postscript | `sdk` | ✅ Enabled | Lifecycle / SMS |
| Alia | `customer-app-frame` | ✅ Enabled | Growth / CRO |
| Checkmate | `checked_network` | ✅ Enabled | Ops |
| Stay AI | `bundle-cart-settings` | ⛔ Disabled | — |

---

## 4. Shopify Web Pixels

From the live `webPixelsConfigList`. **27 pixels total: 20 APP + 7 CUSTOM.**

### Custom pixels (hand-written, editable in Settings → Customer events)

| Pixel | ID | Runtime | Purpose | Suggested owner |
| --- | --- | --- | --- | --- |
| `heatmap-revenue` | 49971451 | LAX | Heatmap revenue attribution | CRO / Analytics |
| `Instant` | 86081787 | LAX | Instant page builder | Growth |
| `Microsoft clarity` | 109150459 | LAX | Session recording / heatmaps | CRO / Analytics |
| `Inflektion - Add To Cart` | 132317435 | LAX | Affiliate event | Affiliate |
| `Inflektion - Checkout Started` | 132350203 | LAX | Affiliate event | Affiliate |
| `Inflektion - Conversion Pixel` | 132382971 | LAX | Affiliate conversion | Affiliate |
| ⚠️ `OpenAIAds` | 150077691 | LAX | OpenAI ads attribution | Growth / Paid Media |

### ⚠️ Open P0: `oaiq.min.js` loads twice

`bzrcdn.openai.com/sdk/oaiq.min.js` (46.7 KB decoded) is requested **twice** per page load.

Ruled out as the second source: the theme (zero references anywhere in the repo), all nine app embeds, the GTM container, and all 16 sales channels. There is exactly **one** OpenAI pixel.

Since one pixel produces two requests, the likely cause is **that pixel injecting the SDK twice** — common when a custom pixel subscribes to multiple events and appends a script each time with no idempotency guard. Fix would be in Settings → Customer events → OpenAIAds.

`scriptTags` could not be inspected (API access denied) and remains the one unchecked surface.

**Diagnostic:** DevTools → Network → filter `oaiq` → enable the **Initiator** column. Both rows from `web-pixels-manager` ⇒ the pixel is double-injecting. Different initiators ⇒ a ScriptTag or app.

**Do not delete the pixel** to make the second request disappear — it powers OpenAI ads attribution.

### Investigation round 2 — 2026-08-09

Re-ran with the full pixel manifest parsed (29 entries, including `apiClientId` on every APP pixel):

- **20 APP pixels** — every one identified by `apiClientId`. **None is OpenAI.** OpenAI is not installed as a Shopify app on this store.
- **7 CUSTOM pixels** — exactly one OpenAI-related: `OpenAIAds`, id `150077691`, `runtimeContext: LAX`, `scriptVersion: 3`, empty `configuration`.
- **2 Shopify built-ins** (`shopify-app-pixel`, `shopify-custom-pixel`).

Combined with the theme grep (zero hits), the GTM container (zero hits), and sales channels (no OpenAI channel), **every injection surface except legacy `scriptTags` is now eliminated.** One pixel is producing two requests.

Custom pixel source is not publicly retrievable — the Web Pixels Manager evaluates LAX pixel code in the main frame rather than fetching it from a readable URL, so it cannot be inspected from outside the admin.

### The fix — apply in Settings → Customer events → OpenAIAds

Wrap whatever injects the SDK in a double idempotency guard:

```js
(function () {
  var SRC = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';

  // Guard 1: module-scope flag, catches re-entry within this pixel
  // Guard 2: DOM check, catches injection from any other context
  if (window.__seatopiaOaiqLoaded ||
      document.querySelector('script[src*="oaiq.min.js"]')) {
    return;
  }
  window.__seatopiaOaiqLoaded = true;

  var s = document.createElement('script');
  s.src = SRC;
  s.async = true;
  document.head.appendChild(s);
})();
```

Both guards are needed. The flag alone misses a second injection from a different execution context; the DOM query alone can race if two injections happen in the same tick.

**Also check the event subscriptions.** The most common cause of exactly-two-loads is a pixel that injects inside its event handler while subscribing to more than one event — or subscribing to `page_viewed`, which the manager both publishes live *and* replays from `replayQueue` at init. Script injection belongs at the top level of the pixel, executed once, never inside a `analytics.subscribe()` callback.


### Three vendors doing overlapping session analytics

**Microsoft Clarity**, **Heatmap.com** (two integrations — hard-coded script *and* a revenue pixel), and **PostHog** (session replay) all record broadly similar behavioural data. Combined that is Clarity's payload + 240 KB + 243.5 KB. Consolidating to one is likely the largest single reduction available after the Google overlap.

---

## 5. Findings, ranked by value

| # | Finding | Impact | Effort |
| --- | --- | --- | --- |
| 1 | **jQuery is parser-blocking** in `<head>` from a third-party CDN | 🔴 High — blocks HTML parsing, feeds TBT | Low |
| 2 | **Edacious is parser-blocking** and loads on every page though used on few | 🔴 High — 110 KB blocking | Low |
| 3 | **Google Ads gtag + GTM overlap** — 844 KB decoded of Google payload | 🔴 High — possible ~470 KB saving | Medium (needs Paid Media sign-off) |
| 4 | **Three overlapping session-analytics vendors** (Clarity, Heatmap ×2, PostHog) | 🟠 Medium-High | Medium (org decision) |
| 5 | **`oaiq.min.js` loads twice** | 🟠 Medium — 47 KB wasted + P0 ticket open | Low once source identified |
| 6 | ~~Light Labs + Edacious load site-wide~~ → **Edacious only** (Light Labs removed) | 🟠 Medium — 110 KB on most pages | Low |
| 7 | **Twitter/X pixel** — 50 KB, channel may be inactive | 🟡 Low-Medium | Trivial if unused |
| 8 | **HubSpot** — possibly legacy alongside Klaviyo + Postscript | 🟡 Low-Medium | Trivial if unused |
| 9 | **Meta noscript fallback broken** (`YOUR_PIXEL_ID`) | 🟡 Low traffic, signals unreviewed tags | Trivial |
| 10 | **~100 orphaned Replo snippets** | 🟢 Repo hygiene, no runtime cost | Low |

### Recommended sequence

**Do now — pure engineering, no stakeholder needed**
1. Add `defer` to Edacious (`theme.liquid:202`) and template-guard it to product + relevant LP templates
2. Add `defer` to jQuery (`theme.liquid:73`) after confirming no inline `$` usage precedes it; consider self-hosting on the Shopify CDN to drop a third-party origin
3. ~~Template-guard Light Labs~~ — ✅ done, removed entirely 2026-08-09
4. Fix the Meta `YOUR_PIXEL_ID` placeholder in GTM

**Needs an owner decision — biggest wins, but not engineering calls**
5. Is standalone Google Ads `gtag` still needed alongside GTM? (~470 KB)
6. Which session-analytics vendor is the system of record — Clarity, Heatmap, or PostHog? Retire the other two
7. Is X/Twitter an active paid channel? Is HubSpot still in use?

**Track separately**
8. Resolve the duplicate `oaiq.min.js` (needs DevTools Initiator or `read_script_tags` scope)

---

## 6. Ownership matrix

Suggested owners — these reflect what each tool *does*, not knowledge of how Seatopia is organised. Treat as a starting proposal.

| Owner | Scripts | Standing responsibility |
| --- | --- | --- |
| **Growth / Paid Media** | Google Ads gtag, GTM, Meta Pixel, Twitter/X, Triple Whale, OpenAIAds | Confirm every ad pixel maps to live spend; retire pixels when a channel is paused |
| **CRO / Analytics** | Heatmap.com (script + revenue pixel), Microsoft Clarity, Instant | Pick one session-analytics system of record |
| **Product / Data** | PostHog, GA4 | Own funnels and product analytics; confirm PostHog is actually queried |
| **Lifecycle / Retention** | Klaviyo, Postscript, HubSpot | Confirm HubSpot is not redundant |
| **Merchandising / Brand Trust** | Edacious, Judge.me (~~Light Labs~~ removed) | Scope to templates that render the widgets |
| **Affiliate / Partnerships** | Inflektion (×4: script + 3 pixels) | Only correctly-guarded integration — use as the model |
| **Product / Dev** | jQuery, Replo, theme assets, Web Pixels Manager | Loading strategy, guards, orphan cleanup |
| **Ops** | Checkmate, Stay AI | — |

### The structural problem

**Only 2 of ~16 third-party vendors run through GTM.** Everything else is hard-coded in `theme.liquid` or installed as an app/pixel. That means:

- Marketing cannot add or remove most tags without a developer and a theme deploy
- Every tag change becomes a production deploy — with the SOP-bypass risk already logged in the Release Log
- There is no single place to audit what is running, which is why this document had to be assembled from four separate sources

**The strategic fix is to migrate marketing/advertising tags into GTM** so ownership sits with the team that owns the spend, and `theme.liquid` holds only what genuinely must be in the document. That is a project, not a task — but it is the answer to "who should own them."

### Suggested standing process

1. **No new hard-coded marketing tags.** Marketing/ads tags go in GTM; functional widgets go in the theme with a template guard.
2. **Every new third party gets a row here**, with an owner, before it ships.
3. **Quarterly review** — any tag whose owner cannot name a live use case gets removed.
4. **Log tag changes** in the [Release Log](https://app.notion.com/p/410c8a945939427d971774a3f99395da) like any other release.

---

## Appendix — measured sizes

Fetched 2026-08-09. Wire = `Accept-Encoding: gzip, br`; decoded = after decompression.

| Script | Wire (B) | Decoded (B) |
| --- | ---: | ---: |
| `gtag/js?id=AW-991498054` | 156,847 | 471,888 |
| `connect.facebook.net/en_US/fbevents.js` | 106,994 | 407,669 |
| `gtm.js?id=GTM-5L5Q9Q66` | 125,364 | 371,772 |
| `us-assets.i.posthog.com/static/array.js` | 78,393 | 243,544 |
| `c.heatmap.com/scripts/heatmap.min.js` | 44,271 | 143,637 |
| `cdn.edacious.com/embed/v1/product.js` | 32,689 | 110,470 |
| `dashboard.heatmap.com/heatmap-light.min.js` | 27,921 | 96,368 |
| `cdnjs.cloudflare.com/…/jquery.min.js` | 27,990 | 89,664 |
| `static.ads-twitter.com/uwt.js` | 13,718 | 50,066 |
| `bzrcdn.openai.com/sdk/oaiq.min.js` | 14,251 | 46,725 |
| ~~`app.lightlabs.com/assets/ll-pip-widget-v5.js`~~ *(removed)* | ~~13,952~~ | ~~39,396~~ |
| `cleanseafoodtoyourdoor.com/core/modals.min.js` | 10,433 | 27,909 |
| `static.klaviyo.com/onsite/js/…/klaviyo.js` | 2,158 | 15,215 |
| `cdn/wpm/b{hash}m.js` (Web Pixels Manager) | 71,257 | 244,156 |
| `js.hs-scripts.com/45964107.js` | 670 | 1,701 |
| **Total (as audited)** | **726,908** (≈710 KB) | **2,360,180** (≈2.25 MB) |
| **Total (after Light Labs removal)** | **712,956** (≈696 KB) | **2,320,784** (≈2.21 MB) |

Excludes ~20 unmeasured APP web pixels, the runtime payloads behind the Klaviyo and HubSpot loaders, per-page Replo chunks, and the second (duplicate) `oaiq.min.js` request.

---

## 7. Shopify `shop-js` cart-sync module chain — investigated 2026-08-09

Flagged by the Network Dependency Tree audit as the second half of the 6,437 ms critical path:

```
loader.init-shop-cart-sync  1,492 ms
  -> client.init-shop-cart-sync  1,849 ms
    -> chunk.init  1,843 ms
      -> chunk.document  ...
```

### Finding: this chain is not serialized. It is already parallel.

The audit renders a **dependency tree**, not a fetch waterfall. Two independent lines of evidence:

**1. The loader statically declares every module up front.** `loader.init-shop-cart-sync.en.esm.js` is 884 bytes and contains nothing but 19 static imports:

```js
import"./client.init-shop-cart-sync_C__F0MSP.en.esm.js";
import"./chunk.init_C38vVjDl.esm.js";
import"./chunk.document_CC4DPZSc.esm.js";
import"./chunk.window_BV7pwtSs.esm.js";
... 15 more
```

`client.init-shop-cart-sync`, `chunk.init`, **and** `chunk.document` are all **direct siblings** imported by the loader. The moment the loader parses, all 19 are discovered and fetched concurrently. `chunk.init` does import `chunk.document`, which is why the audit nests them — but that dependency creates no extra round trip, because `chunk.document` is already in flight from the loader's own import list.

**2. The audit's own timings confirm it.** `chunk.init` completes at **1,843 ms** — *six milliseconds before* its supposed parent `client.init-shop-cart-sync` at **1,849 ms**. A child cannot finish before its parent in a serial chain. They are siblings racing in parallel.

**Actual depth is 2 network round trips, not 4:**

1. HTML parsed -> fetch loader (884 B)
2. Loader parsed -> 19 modules fetched **in parallel**

### Module graph, measured

20 files, **114,149 B** total. `chunk.index` alone is 74,149 B — 65% of the graph.

| Module | Bytes |
| --- | ---: |
| `chunk.index_BZ-S_qkG` | 74,149 |
| `chunk.preact-module_Cvpcobqs` | 11,353 |
| `chunk.utils_1bb8Zmgu` | 9,328 |
| `client.shop-cart-sync_Ci1sEvGc` | 6,089 |
| `client.init-shop-cart-sync_C__F0MSP` | 1,732 |
| `chunk.useEventListener_HPVVxID2` | 1,460 |
| `chunk.tslib-es6_i06t5CRd` | 1,428 |
| `chunk.window_BV7pwtSs` | 1,270 |
| `chunk.validators_Cj2qrO-d` | 1,058 |
| `chunk.v4_CSBSzmbm` | 950 |
| `loader.init-shop-cart-sync` | 884 |
| `chunk.useUserRecognitionSignal__HUL1x_T` | 786 |
| `chunk.init_C38vVjDl` | 672 |
| `chunk.authorize_BuQdLYn9` | 639 |
| `chunk.storage_BGV5Ustn` | 570 |
| `chunk.document_CC4DPZSc` | 537 |
| `chunk.errors_CTUuk3kr` | 451 |
| `chunk.casing_Bd8FVtoj` | 360 |
| `chunk.defineInitFunction_D4of-Jj4` | 290 |
| `chunk.hooks_cwSw8mqO` | 143 |

### What the theme controls: nothing

- Injected by `{{ content_for_header }}` (`theme.liquid:66`). **Zero `shop-js` references exist anywhere in the theme.**
- Driven by `window.Shopify.SignInWithShop.eligible = true`, set by the platform.
- Modules are **same-origin** (`//seatopia.fish/cdn/shopifycloud/...`), so `preconnect` offers nothing — no DNS or TLS setup to save.
- The loader is discovered at **byte 15,272** of the HTML, well before jQuery at 31,299. Nothing in the theme delays the parser reaching it, so there is no ordering fix available either.
- Shopify's published docs describe the **Shop SDK** as an imperative alternative for custom integrations, but document no way to override, defer, or preload the auto-injected `init-shop-cart-sync` chain from a theme.

### The one remaining lever, and why it is not recommended

The only avoidable cost is the **first round trip** — the loader must arrive before its 19 imports are discovered. `<link rel="modulepreload">` in `<head>` would collapse that, letting the 19 (notably the 74 KB `chunk.index`) start immediately.

**But the chunk filenames are content-hashed** — `_C__F0MSP`, `_BZ-S_qkG`, `_CC4DPZSc`. Shopify ships new `shop-js` builds without notice, and:

- No Liquid API exposes the current hashes
- `window.Shopify.featureAssets['shop-js']` lists only the *unhashed loader* paths, not chunk hashes, and is JS-runtime anyway — far too late to emit a head hint
- A stale hint degrades gracefully but silently: a wasted request plus a console warning, with no alert that the optimisation stopped working

Hardcoding ~19 content hashes into `theme.liquid` buys roughly one round trip and creates a permanent, silent maintenance liability. **Not recommended without a way to pin or verify the version.**

### Recommended next steps

1. **Correct the audit expectation.** This chain is not the 1.8 s serial problem it appears to be. Realistic upside is ~1 round trip, not several seconds. The font chain fix in `8fc3a66` was the substantive half of the 6,437 ms path.
2. **Decide whether Sign in with Shop is worth 114 KB.** Turning it off removes the entire graph and both round trips. It is a genuine conversion feature (Shop Pay accelerated login, cart persistence across devices) on a Plus store — a merchandising and revenue call, not an engineering one.
3. **Raise with Shopify.** As Plus, ask the merchant success manager whether `shop-js` can emit its own `modulepreload` hints, or expose a stable versioned manifest themes could preload against. This is the correct durable fix and it belongs on Shopify's side.
4. **Spend the effort on jQuery and Edacious instead.** Two parser-blocking scripts totalling 200 KB remain on the critical path, and both are fully within the theme's control (see §5).
