# Pint — craft brewery discovery

A geolocation + weather-aware + recommendation-driven craft brewery discovery app.

- **In Jacksonville?** → curated dataset with rich detail drawers, vibes, weekly schedules, dog/kid friendly, food, live tap scraping, embedded reviews
- **Anywhere else?** → live multi-source scraper builds a city's brewery scene on demand, with a pint-glass loading animation that fills as it goes

## Features

- **In-app brewery detail drawer** — tap any card → full-screen drawer with hours, weekly events, **live tap list**, embedded reviews, mini map, directions, and call/website CTAs.
- **Geolocation auto-detect** — opens with your local breweries.
- **Map view** — see your location and breweries around you (Leaflet).
- **"What's Good Tonight"** — pick a mood (live music, trivia, dog, date night, sports, etc.) and get ranked recommendations for what's open *right now*.
- **🌤️ Weather Pick** *(new in Phase 5)* — uses the live OpenWeatherMap forecast to bias toward patios, rooftops, beer gardens (when it's nice), or cozy taprooms (when it's not).
- **🍺 Live tap scraping** *(new in Phase 5)* — Untappd's public API doesn't expose tap lists (Business API only), so we scrape the public Untappd venue page → falls back to the brewery's own website for the current beer menu.
- **🌎 Multi-city scraper** *(new in Phase 5)* — type any US city and Pint discovers + enriches the entire brewery scene live (Open Brewery DB + Google Places + per-brewery website scrape). A pint-glass animation fills with progress in real time.
- **Reviews & photos** — embedded directly in the drawer when Google Places API is configured (free tier available); review platform links always present as fallback.

## API

| Endpoint | Description |
|---|---|
| `GET /api/breweries` | Full curated dataset. Filters: `?neighborhood=`, `?dog_friendly=true`, `?search=` |
| `GET /api/breweries/[id]` | Single curated brewery |
| `GET /api/breweries/nearby?lat=X&lng=Y&radius=25` | Nearby — curated near Jax, Open Brewery DB elsewhere |
| `GET /api/breweries/by-city?city=Atlanta` | Curated cities only (Jax/Amelia/St Aug). Falls through to OBDB. |
| `GET /api/breweries/right-now?lat=X&lng=Y&moods=live_music,dog` | Smart recommendations with `why` reasons |
| `GET /api/breweries/details?id=X` | Reviews + photos + hours + price level (Google Places) |
| **`GET /api/breweries/lookup-details?name=X&address=Y`** | Same as `/details` but for non-curated venues (scraped cities). Drives the hero photo banner. |
| `GET /api/breweries/taps?id=X` | Live tap list (Untappd venue scrape → website fallback) |
| `GET /api/breweries/weather-pick?lat=X&lng=Y` | Weather-aware brewery picks |
| `GET /api/scrape/city?city=Tampa[&max=15][&stream=1]` | Discover + enrich any US city — breweries, distilleries, and tap houses. With `stream=1`, returns SSE progress events that drive the pint-glass animation. Auto-folds in city aliases (e.g. College Station ↔ Bryan). |

### Venue types

Pint now models four venue categories on the `type` field:

| Type | What it is | Where it comes from |
|---|---|---|
| `brewery` | Makes their own beer on-site | OBDB + Google Places "craft breweries" |
| `distillery` | Spirits, on-site | Google Places "distilleries in <city>" |
| `tap_house` | Pours local craft but doesn't brew | Google Places "craft beer tap house" |
| `unique` | Curated must-experience destinations | Hand-added to `breweries.json` (Pour in Jax is the first) |

### Small-town radius auto-widen

`/api/breweries/nearby` now expands the radius by 50% per pass (up to 4 expansions, ~125 mi cap) when fewer than 7 results are found. The response surfaces `radius_used` and `radius_expansions` so the UI can tell the user "widened to 75 mi" instead of silently showing distant places. Distance stays the primary sort key.

CORS open on all endpoints.

## Environment variables

Copy `.env.example` → `.env` for local dev, or set them in Vercel → Project → Settings → Environment Variables.

| Var | Required for | Free tier |
|---|---|---|
| `OPENWEATHER_API_KEY` | `/weather-pick` | 60 calls/min, 1M/month — [signup](https://openweathermap.org/api) |
| `GOOGLE_PLACES_API_KEY` | `/details`, richer `/scrape/city` | $200/mo credit ≈ 11k Place Details — [Cloud Console](https://console.cloud.google.com) |

When neither key is set, every endpoint still works — it falls back gracefully to the curated dataset and Open Brewery DB.

## Untappd: why we scrape instead of using the API

Untappd's public API exists, but **tap-list endpoints are explicitly not supported** there ("Venue Beer List … NOT SUPPORTED in the Public API"). Tap lists are paywalled behind their Business tier. The public venue pages at `untappd.com/v/<slug>` *do* render the menu, so `/api/breweries/taps` parses those, with the brewery's own website as a fallback. Cached 1h per cold start.

## Multi-city scraper

```bash
# CLI — writes data/cities/<city>.json
npm run scrape -- Tampa --max 15
npm run scrape -- "St. Petersburg" --max 20

# Or merge directly into breweries.json
node scripts/scrape.js Sarasota --max 20 --merge
```

Discovery layers:
1. **Open Brewery DB** — free, no key, ~all US breweries
2. **Google Places Text Search** — when `GOOGLE_PLACES_API_KEY` is set, fills coverage gaps and adds Google rating + review count

Per-brewery enrichment:
1. Fetch brewery website → extract social links, phone, food signals (pizza/tacos/BBQ/etc), vibe signals (patio/waterfront/dog-friendly/etc)
2. Find tap list page → parse JSON-LD Menu schema, then fall back to heading/style heuristics
3. Build Untappd / Google Maps / Yelp deep-links

A demo Tampa scrape lives at [`data/cities/tampa.json`](data/cities/tampa.json).

## Roadmap

- **Phase 1** ✅ Static dashboard + curated JSON
- **Phase 2** ✅ API + geolocation + global fallback
- **Phase 3** ✅ Right-Now recommendations + map view
- **Phase 3.5** ✅ Live tap links + review platform links
- **Phase 4** ✅ In-app brewery detail drawer + lazy-loaded reviews/photos via Places API
- **Phase 5** ✅ Live tap scraper · weather-aware picks · multi-city scraper · pint-glass loading animation
- **Phase 6** Vercel Cron + KV-backed scheduled tap-list refresh; user accounts & check-ins
- **Phase 7** Native iOS/Android wrapper

Built by Kendall Dale.
