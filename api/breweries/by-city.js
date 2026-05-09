const data = require("../../breweries.json");
const { normalizeOpenBrewery, applyCors } = require("../../lib/util");

const JAX_CITIES = [
  "jacksonville",
  "jacksonville beach",
  "atlantic beach",
  "neptune beach",
  "fernandina beach",
  "amelia island",
  "st. augustine",
  "st augustine",
  "saint augustine"
];

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const city = String(req.query.city || "").trim();
  if (!city) return res.status(400).json({ error: "city query param required" });

  const cityLower = city.toLowerCase();

  // If they asked for a Jax-area city, serve curated data
  if (JAX_CITIES.some(c => cityLower.includes(c))) {
    const breweries = data.breweries.filter(b =>
      b.address.toLowerCase().includes(cityLower)
    );
    return res.status(200).json({
      source: "curated",
      city,
      count: breweries.length,
      breweries: breweries.length ? breweries : data.breweries
    });
  }

  // Otherwise fetch from Open Brewery DB
  try {
    const url = `https://api.openbrewerydb.org/v1/breweries?by_city=${encodeURIComponent(city)}&per_page=50`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: "Open Brewery DB unavailable" });
    }
    const raw = await response.json();
    const breweries = raw.map(b => normalizeOpenBrewery(b, null, null));

    return res.status(200).json({
      source: "openbrewerydb",
      city,
      count: breweries.length,
      breweries
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch breweries", details: err.message });
  }
};
