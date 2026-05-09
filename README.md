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
- **Phase 6** Native iOS/Android wrapper

## Refresh cadence

Curated data refreshes weekly (Mondays). Just regenerate `breweries.json`, commit, push — Vercel auto-deploys.

Built by Kendall Dale.
