#!/usr/bin/env node
// CLI: refresh a city's brewery data into data/cities/<city>.json
//
// Usage:
//   node scripts/scrape.js Tampa
//   node scripts/scrape.js "St. Augustine" --max 20
//   node scripts/scrape.js Jacksonville --merge   (merges into breweries.json)
//
// Loads .env automatically if present (so OPENWEATHER_API_KEY / GOOGLE_PLACES_API_KEY work).

const fs = require("fs");
const path = require("path");

// Tiny .env loader (no deps)
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const { scrapeCity } = require("../lib/cityScraper");

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/scrape.js <city> [--max N] [--merge]");
  process.exit(1);
}

const flags = new Set(args.filter(a => a.startsWith("--")));
const positional = args.filter(a => !a.startsWith("--") && !/^\d+$/.test(a));
const maxIdx = args.indexOf("--max");
const max = maxIdx >= 0 ? parseInt(args[maxIdx + 1]) : 15;
const merge = flags.has("--merge");
const city = positional.join(" ").trim();

(async () => {
  const start = Date.now();
  console.log(`🍺 Scraping breweries in: ${city} (max ${max})`);
  console.log(`   Google Places: ${process.env.GOOGLE_PLACES_API_KEY ? "✓ enabled" : "✗ skipped"}\n`);

  let lastPct = -1;
  const result = await scrapeCity(city, {
    max,
    onProgress: (ev) => {
      const pct = ev.current ?? 0;
      if (pct !== lastPct) {
        const bar = "█".repeat(Math.floor(pct / 4)).padEnd(25, "░");
        process.stdout.write(`\r  [${bar}] ${pct.toString().padStart(3)}%  ${ev.message.slice(0, 50).padEnd(50)}`);
        lastPct = pct;
      }
    }
  });
  process.stdout.write("\n\n");

  const outDir = path.join(__dirname, "..", "data", "cities");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = city.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json";
  const outFile = path.join(outDir, fileName);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✓ Wrote ${result.count} breweries → data/cities/${fileName}  (${elapsed}s)`);
  console.log(`  Sources: OBDB ${result.sources_used.open_brewery_db}, Google ${result.sources_used.google_places}`);

  if (merge) {
    const breweriesPath = path.join(__dirname, "..", "breweries.json");
    const main = JSON.parse(fs.readFileSync(breweriesPath, "utf8"));
    const existingNames = new Set(main.breweries.map(b => b.name.toLowerCase()));
    let nextId = Math.max(...main.breweries.map(b => b.id || 0)) + 1;
    let added = 0;
    for (const b of result.breweries) {
      if (existingNames.has(b.name.toLowerCase())) continue;
      main.breweries.push({
        id: nextId++,
        name: b.name,
        neighborhood: b.city || "",
        address: b.address,
        phone: b.phone || "",
        website: b.website || "",
        social: b.social || { instagram: "", facebook: "" },
        hours: {},
        known_for: b.known_for || (
          b.type === "distillery" ? "Craft distillery"
          : b.type === "tap_house" ? "Tap house — pours local craft"
          : b.type === "unique" ? "Must-experience drink destination"
          : `${(b.obdb_subtype || "Local").charAt(0).toUpperCase() + (b.obdb_subtype || "local").slice(1)} brewery`
        ),
        type: b.type || "brewery",
        food: b.food_tags?.length ? b.food_tags.join(", ") : "Visit website for menu",
        dog_friendly: b.vibes?.includes("dog_park") || null,
        kid_friendly: b.vibes?.includes("family_focused") || null,
        events: "",
        tap_highlights: b.tap_highlights || "See current tap list at the brewery",
        status: "open",
        latitude: b.latitude,
        longitude: b.longitude,
        weekly_schedule: { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] },
        vibes: b.vibes || [],
        food_tags: b.food_tags || [],
        untappd_url: b.untappd_url,
        google_maps_url: b.google_maps_url,
        yelp_url: b.yelp_url,
        city: b.city || city,
        region: b.city || city,
        curator_take: null,
        source: "scraped"
      });
      added++;
    }
    main.metadata.last_updated = new Date().toISOString().slice(0, 10);
    main.metadata.total_breweries = main.breweries.length;
    fs.writeFileSync(breweriesPath, JSON.stringify(main, null, 2));
    console.log(`✓ Merged ${added} new breweries into breweries.json`);
  }
})().catch((err) => {
  console.error("\n✗ Scrape failed:", err.message);
  process.exit(1);
});
