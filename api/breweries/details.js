// /api/breweries/details?id=X
// Returns reviews + photos. Uses Google Places API when GOOGLE_PLACES_API_KEY is set.
// Falls back to existing review platform links so the UI never breaks.

const data = require("../../breweries.json");
const { applyCors } = require("../../lib/util");

// In-memory cache (resets per cold start; for production use Vercel KV)
const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const id = parseInt(req.query.id);
  const brewery = data.breweries.find(b => b.id === id);
  if (!brewery) return res.status(404).json({ error: "Brewery not found" });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      brewery_id: id,
      provider: "none",
      message: "Set GOOGLE_PLACES_API_KEY env var in Vercel to enable live reviews & photos",
      review_links: {
        google_maps: brewery.google_maps_url,
        yelp: brewery.yelp_url,
        untappd: brewery.untappd_url
      },
      reviews: [],
      photos: []
    });
  }

  // Cache hit
  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return res.status(200).json(cached.data);
  }

  try {
    // 1) Find Place ID
    const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(brewery.name + " " + brewery.address)}&inputtype=textquery&fields=place_id&key=${apiKey}`;
    const findRes = await fetch(findUrl);
    const findData = await findRes.json();
    const placeId = findData.candidates?.[0]?.place_id;
    if (!placeId) {
      return res.status(200).json({ brewery_id: id, provider: "google", reviews: [], photos: [], note: "Place not found" });
    }

    // 2) Place Details — pull rating, reviews, photos, hours, status, price level
    const fields = [
      "rating", "user_ratings_total", "reviews", "photos",
      "current_opening_hours", "business_status", "price_level",
      "url", "formatted_phone_number"
    ].join(",");
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    const result = detailsData.result || {};

    const photos = (result.photos || []).slice(0, 6).map(p => ({
      url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${p.photo_reference}&key=${apiKey}`,
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
      brewery_id: id,
      provider: "google",
      rating: result.rating,
      review_count: result.user_ratings_total,
      reviews,
      photos,
      business_status: result.business_status || null,           // OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY
      price_level: result.price_level ?? null,                   // 0..4
      open_now: result.current_opening_hours?.open_now ?? null,
      hours_today: result.current_opening_hours?.weekday_text || null,
      google_url: result.url || null,
      phone: result.formatted_phone_number || null
    };

    cache.set(id, { ts: Date.now(), data: payload });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch details", details: err.message });
  }
};
