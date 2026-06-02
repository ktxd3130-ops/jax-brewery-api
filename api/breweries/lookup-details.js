// /api/breweries/lookup-details?name=X&address=Y[&place_id=Z]
//
// Used by the drawer to enrich a SCRAPED brewery (no numeric curated id) with
// Google Places photos, reviews, hours, business status, and price level.
//
// Strategy:
//   1. If place_id provided → skip the find-place hop, go straight to details.
//   2. Else → Places Find Place from Text with name + address → details.
//
// Same response shape as /api/breweries/details so the frontend can use one renderer.

const { applyCors } = require("../../lib/util");

const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const name = String(req.query.name || "").trim();
  const address = String(req.query.address || "").trim();
  const placeIdIn = String(req.query.place_id || "").trim();

  if (!name && !placeIdIn) {
    return res.status(400).json({ error: "name (or place_id) query param required" });
  }

  if (!apiKey) {
    return res.status(200).json({
      provider: "none",
      message: "Set GOOGLE_PLACES_API_KEY in Vercel to enable live photos & reviews",
      reviews: [], photos: []
    });
  }

  const cacheKey = placeIdIn || `${name}|${address}`.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return res.status(200).json({ ...cached.data, cached: true });
  }

  try {
    let placeId = placeIdIn;

    if (!placeId) {
      const query = `${name} ${address}`.trim();
      const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${apiKey}`;
      const findRes = await fetch(findUrl);
      const findData = await findRes.json();
      placeId = findData.candidates?.[0]?.place_id;
      if (!placeId) {
        const empty = { provider: "google", reviews: [], photos: [], note: "Place not found", lookup_query: query };
        cache.set(cacheKey, { ts: Date.now(), data: empty });
        return res.status(200).json(empty);
      }
    }

    const fields = [
      "rating", "user_ratings_total", "reviews", "photos",
      "current_opening_hours", "business_status", "price_level",
      "url", "formatted_phone_number", "website"
    ].join(",");
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    const result = detailsData.result || {};

    const photos = (result.photos || []).slice(0, 8).map(p => ({
      url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1000&photo_reference=${p.photo_reference}&key=${apiKey}`,
      width: p.width,
      height: p.height
    }));

    const reviews = (result.reviews || []).map(r => ({
      author: r.author_name,
      rating: r.rating,
      text: r.text,
      time: r.relative_time_description,
      profile_photo: r.profile_photo_url
    }));

    const payload = {
      provider: "google",
      place_id: placeId,
      rating: result.rating,
      review_count: result.user_ratings_total,
      reviews,
      photos,
      business_status: result.business_status || null,
      price_level: result.price_level ?? null,
      open_now: result.current_opening_hours?.open_now ?? null,
      hours_today: result.current_opening_hours?.weekday_text || null,
      google_url: result.url || null,
      phone: result.formatted_phone_number || null,
      website: result.website || null
    };

    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: "Lookup failed", details: err.message });
  }
};
