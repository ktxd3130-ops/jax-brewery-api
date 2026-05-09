# Brewery Guide

A geolocation + recommendation-aware craft brewery discovery app.

- **In Jacksonville?** → curated dataset with neighborhoods, vibes, weekly schedules, dog/kid friendly, food, live tap links, and reviews
- **Anywhere else?** → falls back to [Open Brewery DB](https://www.openbrewerydb.org/) for global coverage

## Features

- **Geolocation auto-detect** — opens with your local breweries
- **Map view** — see your location and breweries around you (Leaflet + OpenStreetMap)
- **"What's Good Tonight"** — pick a mood (live music, trivia, dog, date night, sports, etc.) and get ranked recommendations based on what's open *right now*, what's happening tonight, distance, and vibe match
- **Live tap lists** — every brewery card links to its Untappd venue page
- **Reviews & photos** — one-tap links to Google Maps and Yelp. Optional Google Places API integration (set `GOOGLE_PLACES_API_KEY` env var in Vercel) for embedded reviews + photos
- **City search** — type any city to discover its brewery scene

## API

| Endpoint | Description |
|---|---|
| `GET /api/breweries` | Full curated dataset. Filters: `?neighborhood=`, `?dog_friendly=true`, `?search=` |
| `GET /api/breweries/[id]` | Single curated brewery |
| `GET /api/breweries/nearby?lat=X&lng=Y&radius=25` | Nearby — curated near Jax, Open Brewery DB elsewhere |
| `GET /api/breweries/by-city?city=Atlanta` | Breweries in any US city |
| `GET /api/breweries/right-now?lat=X&lng=Y&moods=live_music,dog` | Smart recommendations with `why` reasons |
| `GET /api/breweries/details?id=X` | Reviews + photos (Google Places when key configured) |

CORS is open on all endpoints.

## Enabling Google Places reviews + photos

1. Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Places API** for the project
3. Create an API key, restrict it to Places API + your Vercel domain
4. In Vercel: Project → Settings → Environment Variables → add `GOOGLE_PLACES_API_KEY`
5. Redeploy. The `/api/breweries/details` endpoint will start returning live reviews + photos.

Free tier covers ~11k Place Details calls/month at $0 (then $17/1000 calls).

## Roadmap

- **Phase 1** ✅ Static dashboard + curated JSON
- **Phase 2** ✅ API endpoints + geolocation + global fallback
- **Phase 3** ✅ Right-Now recommendations + map view
- **Phase 3.5** ✅ Live tap links (Untappd) + review/photo links (Google Maps/Yelp) + Places API scaffold
- **Phase 4** Real-time tap list scraper (Vercel Cron + KV); embedded Google Places reviews; weather-aware recommendations
- **Phase 5** User accounts, check-ins, ratings
- **Phase 6** Native iOS/Android wrapper

## Refresh cadence

Curated data refreshes weekly (Mondays). Just regenerate `breweries.json`, commit, push — Vercel auto-deploys.

Built by Kendall Dale.
