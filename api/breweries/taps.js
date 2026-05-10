// /api/breweries/taps?id=X
// Returns the current beer/tap list for a brewery.
//
// Strategy:
//   1. If brewery has untappd_url → scrape the public Untappd venue page (Untappd's
//      public API does NOT expose tap lists; tap lists are only on the paid Business API).
//   2. Else → scrape the brewery's own website, looking for a "/beer", "/taps",
//      "/menu" page and extracting beers via JSON-LD or heading heuristics.
//
// Cached in-memory for 1 hour per cold start. For production, swap for Vercel KV.

const data = require("../../breweries.json");
const { applyCors } = require("../../lib/util");
const {
  fetchHtml,
  parseUntappdVenuePage,
  parseGenericTapList,
  pickTapsPage
} = require("../../lib/scraper");

const cache = new Map();
const TTL_MS = 60 * 60 * 1000; // 1 hour

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const id = parseInt(req.query.id);
  if (isNaN(id)) return res.status(400).json({ error: "id query param required" });

  const brewery = data.breweries.find(b => b.id === id);
  if (!brewery) return res.status(404).json({ error: "Brewery not found" });

  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return res.status(200).json({ ...cached.data, cached: true });
  }

  let beers = [];
  let provider = "none";
  let sourceUrl = null;
  const notes = [];

  // 1) Try Untappd venue page (most reliable — Untappd renders the live menu)
  if (brewery.untappd_url) {
    sourceUrl = brewery.untappd_url;
    const r = await fetchHtml(brewery.untappd_url);
    if (r.ok) {
      beers = parseUntappdVenuePage(r.html);
      if (beers.length) provider = "untappd_scrape";
      else notes.push("Untappd page returned no parseable beers");
    } else {
      notes.push(`Untappd fetch failed: ${r.status || r.error}`);
    }
  }

  // 2) Fall back to brewery's own website
  if (!beers.length && brewery.website) {
    const home = await fetchHtml(brewery.website);
    if (home.ok) {
      // Try the homepage first — many breweries put taps right there
      let taps = parseGenericTapList(home.html);
      let usedUrl = brewery.website;

      if (taps.length < 3) {
        // Look for a dedicated taps/menu page
        const tapsPage = pickTapsPage(home.html, brewery.website);
        if (tapsPage) {
          const r = await fetchHtml(tapsPage);
          if (r.ok) {
            const more = parseGenericTapList(r.html);
            if (more.length > taps.length) { taps = more; usedUrl = tapsPage; }
          }
        }
      }

      if (taps.length) {
        beers = taps;
        provider = "website_scrape";
        sourceUrl = usedUrl;
      } else {
        notes.push("Website had no parseable beer list");
      }
    } else {
      notes.push(`Website fetch failed: ${home.status || home.error}`);
    }
  }

  const payload = {
    brewery_id: id,
    brewery_name: brewery.name,
    provider,
    source_url: sourceUrl,
    count: beers.length,
    beers,
    notes,
    fetched_at: new Date().toISOString(),
    disclaimer: provider === "untappd_scrape"
      ? "Tap list scraped from public Untappd venue page. Untappd's public API does not expose tap lists (Business API only)."
      : provider === "website_scrape"
      ? "Tap list parsed heuristically from brewery website. May be incomplete."
      : "No live tap data available — visit the brewery's Untappd or website."
  };

  cache.set(id, { ts: Date.now(), data: payload });
  res.status(200).json(payload);
};
