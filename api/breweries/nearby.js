const data = require("../../breweries.json");
const { haversine, normalizeOpenBrewery, applyCors } = require("../../lib/util");

const JAX_LAT = 30.33;
const JAX_LNG = -81.66;
const JAX_REGION_RADIUS = 60; // miles — covers Jax + Amelia Island + St. Augustine

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius || 25);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: "lat and lng query params required" });
  }

  const distToJax = haversine(lat, lng, JAX_LAT, JAX_LNG);
  const inJaxRegion = distToJax !== null && distToJax <= JAX_REGION_RADIUS;

  if (inJaxRegion) {
    const breweries = data.breweries
      .map(b => ({
        ...b,
        distance: haversine(lat, lng, b.latitude, b.longitude)
      }))
      .filter(b => b.distance !== null && b.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    return res.status(200).json({
      source: "curated",
      city: "Jacksonville Area",
      user_location: { lat, lng },
      count: breweries.length,
      breweries
    });
  }

  // Fall back to Open Brewery DB for other cities
  try {
    const url = `https://api.openbrewerydb.org/v1/breweries?by_dist=${lat},${lng}&per_page=50`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: "Open Brewery DB unavailable" });
    }
    const raw = await response.json();
    const breweries = raw
      .map(b => normalizeOpenBrewery(b, lat, lng))
      .filter(b => b.distance !== null && b.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    const cityName = breweries[0]?.neighborhood || "Your area";

    return res.status(200).json({
      source: "openbrewerydb",
      city: cityName,
      user_location: { lat, lng },
      count: breweries.length,
      breweries
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch nearby breweries", details: err.message });
  }
};
