# Brewery Guide

A geolocation + recommendation-aware craft brewery discovery app.

- **In Jacksonville?** → curated dataset with rich detail drawers, vibes, weekly schedules, dog/kid friendly, food, live tap links, reviews
- **Anywhere else?** → falls back to [Open Brewery DB](https://www.openbrewerydb.org/) for global coverage

## Features

- **In-app brewery detail drawer** — tap any card → full-screen drawer with hours, weekly events, tap highlights, reviews, mini map, directions, and call/website CTAs. No bouncing to other apps.
- **Geolocation auto-detect** — opens with your local breweries
- **Map view** — see your location and breweries around you (Leaflet)
- **"What's Good Tonight"** — pick a mood (live music, trivia, dog, date night, sports, etc.) and get ranked recommendations based on what's open *right now*, what's happening tonight, distance, and vibe match
- **Live tap lists** — every brewery card links to its Untappd venue page
- **Reviews & photos** — embedded directly in the drawer when Google Places API is configured (free tier available); review platform links always present as fallback
- **City search** — type any city to discover its brewery scene

## API

| Endpoint | Description |
|---|---|
| `GET /api/breweries` | Full curated dataset. Filters: `?neighborhood=`, `?dog_friendly=true`, `?search=` |
| `GET /api/breweries/[id]` | Single curated brewery |
| `GET /api/breweries/nearby?lat=X&lng=Y&radius=25` | Nearby — curated near Jax, Open Brewery DB elsewhere |
| `GET /api/breweries/by-city?city=Atlanta` | Breweries in any US city |
| `GET /api/breweries/right-now?lat=X&lng=Y&moods=live_music,dog` | Smart recommendations with `why` reasons |
| `GET /api/breweries/details?id=X` | Reviews + photos (Google Places when configured) |

CORS open on all endpoints.

## Enabling embedded reviews + photos (5 minutes)

1. Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Places API** (and optionally Places API New)
3. Create an API key, restrict it to Places API + your Vercel domain
4. Vercel → Project → Settings → Environment Variables → add `GOOGLE_PLACES_API_KEY`
5. Redeploy. The drawer will start showing live reviews + photos automatically.

Free tier: ~11k Place Details calls/month at $0. Each card open = 1 call (cached 24h).

## Roadmap

- **Phase 1** ✅ Static dashboard + curated JSON
- **Phase 2** ✅ API + geolocation + global fallback
- **Phase 3** ✅ Right-Now recommendations + map view
- **Phase 3.5** ✅ Live tap links + review platform links
- **Phase 4** ✅ In-app brewery detail drawer + lazy-loaded reviews/photos via Places API
- **Phase 5** Real-time tap list scraper (Vercel Cron + KV); weather-aware recommendations; user accounts & check-ins
- **Phase 6** 🚧 Native iOS/Android wrapper (Capacitor) — **in progress, see below**

## Native app (iOS/Android via Capacitor)

Pint is being packaged for the **App Store** (iPhone first) and **Google Play** (fast-follow) using **Capacitor**, which wraps the existing web app in a native shell. See `APP_STORE_PLAN.md` for the full deployment plan and `STORE_LISTING.md` for store copy.

### Repo layout for native
| Path | Purpose |
|---|---|
| `index.html` (root) | The **web** app, served live at `jax-brewery-guide.vercel.app`. Untouched. |
| `www/` | The **mobile bundle** Capacitor packages (`webDir`). A self-contained copy of the web app with all third-party assets vendored locally. |
| `www/vendor/leaflet/` | Leaflet 1.9.4 (css/js/marker images) — self-hosted (was a CDN) so the map works offline and passes App Store guideline 4.2. |
| `www/assets/fonts/` | Inter (weights 300–800), self-hosted (was Google Fonts). |
| `www/manifest.json` | PWA manifest (also enables "Add to Home Screen" on the web). |
| `www/breweries.json` | Bundled offline seed — the core list loads with zero network. |
| `resources/` | `icon.png` (1024) + `splash.png` (2732) masters for `@capacitor/assets`. |
| `capacitor.config.json` | App id `com.kendalldale.pint`, `webDir: www`, splash/geolocation config. |
| `privacy.html` | Privacy policy — deploys to `/privacy` (required for store submission). |

### ✅ Done (Phase 1 scaffolding)
- Mobile bundle (`www/`) created without disturbing the live web deploy.
- De-CDN'd: Leaflet + Inter fonts vendored locally (offline-safe, no third-party runtime requests).
- PWA manifest + iOS meta tags (`apple-mobile-web-app-*`, `theme-color`, `viewport-fit=cover` for safe areas).
- `API_BASE` added so WebView calls reach the live Vercel API (CORS already open); all four `/api/*` fetches prefixed.
- Offline seed: `breweries.json` bundled; core list renders with no connection.
- App icon designed (`www/assets/img/icon.svg`) and rasterized to real PNGs (icon set + splash master).
- Capacitor config + `package.json` deps/scripts in place.
- Store listing copy + privacy policy drafted.

### ⏳ Remaining (your machine — needs Xcode / accounts / push creds)
1. **Phase 0 first** — merge Sprint A → `main` and apply the data refresh (`PINT_DO_THIS.md`) so the wrapper builds from current code.
2. `npm install` to pull Capacitor.
3. `npx cap init` is pre-done via `capacitor.config.json`; run `npm run cap:add:ios` (and `:android`).
4. `npm run icons` to generate native icon/splash sets from `resources/`.
5. Swap `navigator.geolocation` → `@capacitor/geolocation`; add `NSLocationWhenInUseUsageDescription` to `Info.plist`.
6. Open in Xcode (`npm run ios`), set signing, run on device, then TestFlight → submit.
7. Apple Developer Program enrollment (long lead time — start now), name availability check, deploy `privacy.html`.

> Re-sync the bundle after editing the root web app: `npm run sync:web` (copies `index.html` + `breweries.json` into `www/`), then re-apply the `www`-only changes (vendored asset paths, manifest tags, `API_BASE`). Long-term, consider a small build step or unifying the two so the copy isn't manual.

## Refresh cadence

Curated data refreshes weekly (Mondays). Just regenerate `breweries.json`, commit, push — Vercel auto-deploys.

Built by Kendall Dale.
