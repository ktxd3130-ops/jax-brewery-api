// Multi-city brewery + distillery + tap-house scraper.
//
// Discovery:
//   - Open Brewery DB (https://api.openbrewerydb.org) — free, no key, ~all US breweries
//   - Google Places Text Search (when GOOGLE_PLACES_API_KEY is set):
//       - "craft breweries in <city>"   → type=brewery
//       - "distilleries in <city>"      → type=distillery
//       - "tap house OR beer bar in <city>" → type=tap_house  (only if it really pours
//                                              local craft, not just any bar)
//   - City aliases — small towns auto-expand to their twin city (e.g. "College Station"
//     also pulls "Bryan").
//
// Enrichment per venue:
//   - Website → social, food signals, vibe signals, taps, hours hints
//   - Untappd venue page (if discoverable) → tap list
//
// Designed to stream progress events; the caller drives the pint-glass animation.

// Cities that are commonly paired in local usage — when one is searched, the other is
// folded in. Keep lowercased; matching is substring-based.
const CITY_ALIASES = {
  "college station": ["Bryan"],
  "bryan": ["College Station"],
  "minneapolis": ["St. Paul"],
  "st. paul": ["Minneapolis"],
  "saint paul": ["Minneapolis"],
  "raleigh": ["Durham"],
  "durham": ["Raleigh"],
  "winston-salem": ["Greensboro"],
  "greensboro": ["Winston-Salem"],
  "tampa": ["St. Petersburg", "Clearwater"],
  "st. petersburg": ["Tampa"],
  "saint petersburg": ["Tampa"],
  "san francisco": ["Oakland"],
  "oakland": ["San Francisco"]
};

function aliasesFor(city) {
  const key = city.trim().toLowerCase();
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];
  // Substring fallback — "Bryan/College Station" should still match.
  for (const k of Object.keys(CITY_ALIASES)) {
    if (key.includes(k)) return CITY_ALIASES[k];
  }
  return [];
}

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
  const params = new URLSearchParams({ per_page: "50" });
  if (city) params.set("by_city", city);
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
        // Our venue-category taxonomy: brewery | distillery | tap_house | unique
        type: "brewery",
        // OBDB's own subtype: micro, brewpub, regional, large, contract, proprietor, bar
        obdb_subtype: b.brewery_type,
        name: b.name,
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

// Google Places Text Search — `query` is the search string, `type` is the venue type
// we tag onto results (brewery / distillery / tap_house).
async function googlePlacesTextSearch(query, type, options = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.results || [])
      .filter(p => {
        const text = `${p.name} ${(p.types || []).join(" ")}`.toLowerCase();
        if (options.requireKeywords) {
          return options.requireKeywords.some(k => text.includes(k));
        }
        return true;
      })
      .map(p => ({
        source_id: p.place_id,
        source: "google_places",
        type,
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

async function discoverFromGooglePlaces(city) {
  // Breweries — require a beer keyword to filter out random bars Google returns.
  return googlePlacesTextSearch(`craft breweries in ${city}`, "brewery", {
    requireKeywords: ["brew", "tap", "ale", "beer", "brewing"]
  });
}

async function discoverDistilleries(city) {
  return googlePlacesTextSearch(`distilleries in ${city}`, "distillery", {
    requireKeywords: ["distiller", "spirits", "rum", "whiskey", "whisky", "vodka", "gin"]
  });
}

async function discoverTapHouses(city) {
  // "Tap house" / "beer bar" — places that pour LOCAL craft but don't brew. We require
  // the result to look beer-y so we don't pull every sports bar.
  return googlePlacesTextSearch(`craft beer tap house in ${city}`, "tap_house", {
    requireKeywords: ["tap", "beer", "bottle", "growler", "draft"]
  });
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
  const includeDistilleries = opts.includeDistilleries !== false;
  const includeTapHouses = opts.includeTapHouses !== false;
  const minResults = opts.minResults || 7;

  // Aliases — small towns get folded in with their twin city (Bryan ↔ College Station).
  const aliases = aliasesFor(city);
  const allCities = [city, ...aliases];
  const aliasNote = aliases.length ? ` (+aliases: ${aliases.join(", ")})` : "";

  onProgress({ phase: "discover", message: `Searching Open Brewery DB for ${city}${aliasNote}…`, current: 0, total: 100 });
  const obdbResults = await Promise.all(allCities.map(c => discoverFromOpenBreweryDb(c)));
  const obdb = obdbResults.flat().map(b => ({ ...b, type: b.type || "brewery" }));
  onProgress({ phase: "discover", message: `Found ${obdb.length} breweries from Open Brewery DB`, current: 6, total: 100 });

  onProgress({ phase: "discover", message: `Searching Google Places…`, current: 10, total: 100 });
  const gpResults = await Promise.all(allCities.map(c => discoverFromGooglePlaces(c)));
  const gp = gpResults.flat();
  onProgress({ phase: "discover", message: `Found ${gp.length} breweries from Google Places`, current: 13, total: 100 });

  let distilleries = [];
  if (includeDistilleries) {
    onProgress({ phase: "discover", message: `Searching for distilleries…`, current: 15, total: 100 });
    const dResults = await Promise.all(allCities.map(c => discoverDistilleries(c)));
    distilleries = dResults.flat();
    onProgress({ phase: "discover", message: `Found ${distilleries.length} distilleries`, current: 17, total: 100 });
  }

  let tapHouses = [];
  if (includeTapHouses) {
    onProgress({ phase: "discover", message: `Searching for tap houses…`, current: 18, total: 100 });
    const tResults = await Promise.all(allCities.map(c => discoverTapHouses(c)));
    tapHouses = tResults.flat();
    onProgress({ phase: "discover", message: `Found ${tapHouses.length} tap houses`, current: 20, total: 100 });
  }

  let merged = mergeDiscoveries(obdb, gp, distilleries, tapHouses).slice(0, max);

  // Small-town fallback: if we're well under the threshold and have aliases left untried,
  // we already used them. As a last resort, try the parent state via OBDB by-name search.
  // (Future: hit Google Places with an expanded radius.)
  if (merged.length < minResults && obdb[0]?.state) {
    onProgress({ phase: "discover", message: `Only ${merged.length} so far — expanding to state…`, current: 21, total: 100 });
    const stateResults = await discoverFromOpenBreweryDb("", obdb[0].state);
    const stateMerged = mergeDiscoveries(merged, stateResults.map(b => ({ ...b, type: "brewery", _from_state: true })));
    merged = stateMerged.slice(0, max);
  }

  onProgress({
    phase: "merged",
    message: `Merged & deduped → ${merged.length} unique venues`,
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
    aliases_used: aliases,
    scraped_at: new Date().toISOString(),
    count: enriched.length,
    type_breakdown: {
      brewery: enriched.filter(b => (b.type || "brewery") === "brewery").length,
      distillery: enriched.filter(b => b.type === "distillery").length,
      tap_house: enriched.filter(b => b.type === "tap_house").length,
      unique: enriched.filter(b => b.type === "unique").length
    },
    sources_used: {
      open_brewery_db: obdb.length,
      google_places_breweries: gp.length,
      google_places_distilleries: distilleries.length,
      google_places_tap_houses: tapHouses.length
    },
    breweries: enriched
  };
}

module.exports = { scrapeCity, discoverFromOpenBreweryDb, discoverFromGooglePlaces, enrichBrewery };
