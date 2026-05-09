// Haversine distance in miles
function haversine(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v === null || v === undefined || isNaN(v))) {
    return null;
  }
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

// Normalize Open Brewery DB record to our schema
function normalizeOpenBrewery(b, userLat, userLng) {
  const lat = parseFloat(b.latitude);
  const lng = parseFloat(b.longitude);
  const validCoords = !isNaN(lat) && !isNaN(lng);
  const distance = validCoords && userLat != null && userLng != null
    ? haversine(userLat, userLng, lat, lng)
    : null;

  const typeLabel = b.brewery_type
    ? b.brewery_type.charAt(0).toUpperCase() + b.brewery_type.slice(1)
    : "Local";

  return {
    id: b.id,
    name: b.name,
    neighborhood: b.city || "",
    address: [b.street, b.city, b.state, b.postal_code]
      .filter(Boolean)
      .join(", "),
    phone: b.phone || "",
    website: b.website_url || "",
    social: { instagram: "", facebook: "" },
    hours: {},
    known_for: `${typeLabel} brewery`,
    food: "Visit website for menu",
    dog_friendly: null,
    kid_friendly: null,
    events: "Check website for events",
    tap_highlights: "See current tap list at the brewery",
    status: "open",
    latitude: validCoords ? lat : null,
    longitude: validCoords ? lng : null,
    distance,
    source: "openbrewerydb"
  };
}

// CORS helper
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
}

module.exports = { haversine, normalizeOpenBrewery, applyCors };
