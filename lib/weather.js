// OpenWeatherMap wrapper + weather → brewery vibe mapping.
// Free tier: https://openweathermap.org/api (60 calls/min, 1M/month).

const cache = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 min — weather doesn't change that fast

async function getCurrentWeather(lat, lng) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return { ok: false, reason: "OPENWEATHER_API_KEY not set" };

  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return { ok: true, data: hit.data, cached: true };

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=imperial&appid=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, reason: `OpenWeather ${res.status}` };
    const j = await res.json();
    const data = {
      temp: Math.round(j.main?.temp ?? 0),
      feels_like: Math.round(j.main?.feels_like ?? 0),
      humidity: j.main?.humidity,
      conditions: j.weather?.[0]?.main || "",        // Clear, Clouds, Rain, Drizzle, Thunderstorm, Snow, Mist
      description: j.weather?.[0]?.description || "",
      icon: j.weather?.[0]?.icon || "",
      wind_mph: Math.round(j.wind?.speed ?? 0),
      city: j.name || "",
      sunset_at: j.sys?.sunset ? new Date(j.sys.sunset * 1000).toISOString() : null,
      raw_id: j.weather?.[0]?.id || 800
    };
    cache.set(key, { ts: Date.now(), data });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// Map weather → boosted vibes/tags + a one-line pitch.
// The score modifier is added to each brewery's right-now score.
function vibePlanFromWeather(w) {
  const c = (w.conditions || "").toLowerCase();
  const t = w.temp;

  // Storm / heavy rain / snow → cozy indoor
  if (/(thunder|storm|snow)/.test(c) || (c === "rain" && (w.raw_id || 0) >= 502)) {
    return {
      mood: "cozy_indoor",
      pitch: `${w.description} and ${t}°F — cozy indoor vibes only`,
      boost_vibes: ["cozy", "low_key", "neighborhood", "living_room_vibe", "chill_lounge", "historic_building"],
      boost_food: ["full_menu", "gastropub", "pizza", "bbq", "smoked_meats"],
      penalize_vibes: ["patio", "outdoor_seating", "rooftop", "beer_garden", "biergarten", "boat_dock", "waterfront"],
      emoji: /snow/.test(c) ? "❄️" : "⛈️"
    };
  }

  // Light rain / drizzle → covered patio is fine, but bias indoor
  if (/(rain|drizzle|mist|fog)/.test(c)) {
    return {
      mood: "indoor_lean",
      pitch: `${w.description} and ${t}°F — covered seating or a cozy taproom`,
      boost_vibes: ["cozy", "neighborhood", "big_taproom", "covered_patio", "chill_lounge"],
      boost_food: ["full_menu", "pizza"],
      penalize_vibes: ["beer_garden", "biergarten", "boat_dock"],
      emoji: "🌧️"
    };
  }

  // Hot (>= 87°F) → patios with shade, AC, frozen-style beer
  if (t >= 87) {
    return {
      mood: "hot_patio",
      pitch: `It's ${t}°F out — find a shaded patio or an AC-strong taproom`,
      boost_vibes: ["patio", "outdoor_seating", "beer_garden", "waterfront", "boat_dock", "outdoor_courtyard", "biergarten"],
      boost_food: ["tacos", "food_trucks"],
      penalize_vibes: ["historic_building"], // tend to be warmer
      emoji: "🥵"
    };
  }

  // Cold (< 55°F) → cozy indoor
  if (t < 55) {
    return {
      mood: "cold_cozy",
      pitch: `Brisk ${t}°F — cozy taprooms and rich beer`,
      boost_vibes: ["cozy", "fireplace", "historic_building", "neighborhood", "living_room_vibe"],
      boost_food: ["full_menu", "bbq", "smoked_meats"],
      penalize_vibes: ["beer_garden", "boat_dock", "waterfront"],
      emoji: "🥶"
    };
  }

  // Perfect (65-78°F, clear/clouds) → rooftop, waterfront, biergarten
  if (t >= 65 && t <= 78 && /(clear|clouds)/.test(c)) {
    return {
      mood: "perfect_outdoor",
      pitch: `${w.description}, ${t}°F — peak rooftop and waterfront weather`,
      boost_vibes: ["rooftop", "waterfront", "patio", "beer_garden", "biergarten", "boat_dock", "outdoor_courtyard"],
      boost_food: ["food_trucks", "tacos"],
      penalize_vibes: [],
      emoji: "☀️"
    };
  }

  // Mild — slight outdoor bias
  return {
    mood: "mild_outdoor",
    pitch: `${w.description}, ${t}°F — patios are open for business`,
    boost_vibes: ["patio", "outdoor_seating", "beer_garden"],
    boost_food: ["food_trucks"],
    penalize_vibes: [],
    emoji: "🌤️"
  };
}

module.exports = { getCurrentWeather, vibePlanFromWeather };
