# Brewery Guide

A geolocation-aware craft brewery discovery app.

- **In Jacksonville?** → curated dataset with neighborhood, vibes, dog/kid friendly, events, tap highlights
- **Anywhere else?** → falls back to [Open Brewery DB](https://www.openbrewerydb.org/) for global coverage

## Live

- Site: https://jax-brewery-guide.vercel.app
- API: https://jax-brewery-guide.vercel.app/api/breweries
- JSON dataset: https://jax-brewery-guide.vercel.app/breweries.json

## API

| Endpoint | Description |
|---|---|
| `GET /api/breweries` | Full curated Jax dataset. Filters: `?neighborhood=`, `?dog_friendly=true`, `?kid_friendly=true`, `?search=` |
| `GET /api/breweries/[id]` | Single curated brewery |
| `GET /api/breweries/nearby?lat=X&lng=Y&radius=25` | Breweries within radius. Returns curated data near Jax, Open Brewery DB elsewhere |
| `GET /api/breweries/by-city?city=Atlanta` | Breweries in a city (Open Brewery DB) |

CORS is open on all endpoints.

## Project structure

```
├── index.html              # Geolocation-aware dashboard
├── breweries.json          # Curated Jax dataset (31 breweries)
├── api/
│   ├── breweries.js              # GET /api/breweries
│   └── breweries/
│       ├── [id].js               # GET /api/breweries/:id
│       ├── nearby.js             # GET /api/breweries/nearby
│       └── by-city.js            # GET /api/breweries/by-city
├── lib/
│   └── util.js             # Distance, normalization, CORS
├── vercel.json
├── package.json
└── README.md
```

## Roadmap

- **Phase 1** ✅ Static dashboard + curated JSON
- **Phase 2** ✅ API endpoints + geolocation + global fallback
- **Phase 3** Real-time hours scraping, event aggregation
- **Phase 4** User submissions, check-ins, ratings, photos
- **Phase 5** Native iOS/Android wrapper

## Refresh

Curated data refreshes weekly (Mondays). Just regenerate `breweries.json`, commit, and push — Vercel auto-deploys.

Built by Kendall Dale.
