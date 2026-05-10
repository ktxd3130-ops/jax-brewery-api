// Multi-city brewery scraper.
//
// Discovery:
//   - Open Brewery DB (https://api.openbrewerydb.org) — free, no key, ~all US breweries
//   - Google Places Text Search (when GOOGLE_PLACES_API_KEY is set) — fills gaps + better
//     coverage of pubs/taprooms not in OBDB
//
// Enrichment per brewery:
//   - Brewery website → social, food signals, vibe signals, taps, hours hints
//   - Untappd venue page (if discoverable) → tap list
//
// Designed to stream progress events; the caller drives the pint-glass animation.

const {
  fetchHtml,
  parseUntappdVenuePage,
  parseGenericTapList,
  parseSocialLinks,
  parsePhone,
  parseFoodSignals,
  parseVibeSignals,
  pickTapsPage,
  textOf
} = require("./scraper");

const SLUG_BASE = "https://untappd.com/v/";

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function discoverFromOpenBreweryDb(city, state = "") {
  const params = new URLSearchParams({ by_city: city, per_page: "50" });
  if (state) params.set("by_state", state);
  const url = `https://api.openbrewerydb.org/v1/breweries?${params}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "PintBot/1.0" } });
    if (!r.ok) return [];
    const raw = await r.json();
    return raw
      .filter(b => b.brewery_type !== "closed" && b.brewery_type !== "planning")
      .map(b => ({
        source_id: b.id,
        source: "openbrewerydb",
        name: b.name,
        type: b.brewery_type,
        address: [b.street, b.city, b.state, b.postal_code].filter(Boolean).join(", "),
        city: b.city,
        state: b.state,
        phone: b.phone || "",
        website: b.website_url || "",
        latitude: b.latitude ? parseFloat(b.latitude) : null,
        longitude: b.longitude ? parseFloat(b.longitude) : null
      }));
  } catch {
    return [];
  }
}

async function discoverFromGooglePlaces(city) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  const query = encodeURIComponent(`craft breweries in ${city}`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&type=bar&key=${apiKey}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.results || [])
      .filter(p => /brew|tap|ale|beer/i.test(`${p.name} ${(p.types || []).join(" ")}`))
      .map(p => ({
        source_id: p.place_id,
        source: "google_places",
        name: p.name,
        address: p.formatted_address || "",
        latitude: p.geometry?.location?.lat ?? null,
        longitude: p.geometry?.location?.lng ?? null,
        google_rating: p.rating ?? null,
        google_review_count: p.user_ratings_total ?? null,
        price_level: p.price_level ?? null,
        place_id: p.place_id,
        website: ""
      }));
  } catch {
    return [];
  }
}

// Merge discoveries from multiple sources, dedup by name+address
function mergeDiscoveries(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const b of list) {
      const key = `${slugify(b.name)}|${slugify((b.address || "").split(",")[0] || "")}`;
      if (!merged.has(key)) {
        merged.set(key, b);
      } else {
        // Merge: prefer non-empty fields
        const existing = merged.get(key);
        merged.set(key, {
          ...existing,
          ...Object.fromEntries(Object.entries(b).filter(([, v]) => v != null && v !== ""))
        });
      }
    }
  }
  return [...merged.values()];
}

// Try to find this brewery's untappd venue URL by guessing slugs. Fast, no extra API.
function guessUntappdUrl(name, city, state) {
  // Without the venue ID we can only build a search URL, not a direct page.
  // Untappd search URLs work and the public venue pages render server-side.
  const q = encodeURIComponent(`${name} ${city || ""}`.trim());
  return `https://untappd.com/search?q=${q}&type=venue`;
}

async function enrichBrewery(b) {
  const out = { ...b };

  if (b.website) {
    const home = await fetchHtml(b.website);
    if (home.ok) {
      const html = home.html;

      // Social
      const social = parseSocialLinks(html);
      out.social = social;

      // Phone (only if not present)
      if (!out.phone) {
        const phone = parsePhone(html);
        if (phone) out.phone = phone;
      }

      // Food + vibe signals
      out.food_tags = parseFoodSignals(html);
      out.vibes = parseVibeSignals(html);

      // Quick description from <meta description>
      const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i)
                     || html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      if (descMatch) out.known_for = textOf(descMatch[1]).slice(0, 240);

      // Try to find tap list — homepage first, then linked taps page
      let taps = parseGenericTapList(html);
      if (taps.length < 3) {
        const tapsUrl = pickTapsPage(html, b.website);
        if (tapsUrl) {
          const r = await fetchHtml(tapsUrl);
          if (r.ok) {
            const more = parseGenericTapList(r.html);
            if (more.length > taps.length) {
              taps = more;
              out.taps_url = tapsUrl;
            }
          }
        }
      }
      if (taps.length) {
        out.taps = taps.slice(0, 12);
        out.tap_highlights = taps.slice(0, 4).map(t => t.name).join(" · ");
      }
    }
  }

  // Always populate a search URL the user can click
  out.untappd_url = guessUntappdUrl(b.name, b.city, b.state);
  out.google_maps_url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address}`)}`;
  out.yelp_url = `https://www.yelp.com/search?find_desc=${encodeURIComponent(b.name)}&find_loc=${encodeURIComponent(b.address)}`;

  return out;
}

// Main entry point — yields progress events as it works.
// onProgress(event): { phase, message, current, total, brewery? }
async function scrapeCity(city, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const max = opts.max || 25;

  onProgress({ phase: "discover", message: `Searching Open Brewery DB for ${city}…`, current: 0, total: 100 });
  const obdb = await discoverFromOpenBreweryDb(city);
  onProgress({ phase: "discover", message: `Found ${obdb.length} from Open Brewery DB`, current: 8, total: 100 });

  onProgress({ phase: "discover", message: `Searching Google Places…`, current: 12, total: 100 });
  const gp = await discoverFromGooglePlaces(city);
  onProgress({ phase: "discover", message: `Found ${gp.length} from Google Places`, current: 18, total: 100 });

  const merged = mergeDiscoveries(obdb, gp).slice(0, max);
  onProgress({
    phase: "merged",
    message: `Merged & deduped → ${merged.length} unique breweries`,
    current: 22,
    total: 100,
    discovered_count: merged.length
  });

  const enriched = [];
  for (let i = 0; i < merged.length; i++) {
    const b = merged[i];
    onProgress({
      phase: "enrich",
      message: `Scraping ${b.name}…`,
      current: 22 + Math.round(((i + 1) / merged.length) * 75),
      total: 100,
      brewery_name: b.name,
      enriched_count: i,
      discovered_count: merged.length
    });
    try {
      const e = await enrichBrewery(b);
      enriched.push(e);
    } catch (err) {
      enriched.push({ ...b, _error: err.message });
    }
  }

  onProgress({
    phase: "done",
    message: `Done — ${enriched.length} breweries ready`,
    current: 100,
    total: 100,
    enriched_count: enriched.length,
    discovered_count: merged.length
  });

  return {
    city,
    scraped_at: new Date().toISOString(),
    count: enriched.length,
    sources_used: {
      open_brewery_db: obdb.length,
      google_places: gp.length
    },
    breweries: enriched
  };
}

module.exports = { scrapeCity, discoverFromOpenBreweryDb, discoverFromGooglePlaces, enrichBrewery };
