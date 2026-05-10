// /api/breweries/weather-pick?lat=X&lng=Y&radius=30
// Weather-aware brewery recommendations.
// Layers an OpenWeather lookup on top of the curated dataset and scores
// breweries whose vibes/food fit the current conditions.

const data = require("../../breweries.json");
const { haversine, applyCors } = require("../../lib/util");
const { getCurrentWeather, vibePlanFromWeather } = require("../../lib/weather");

function parseTime(t) {
  t = t.trim();
  const isPM = t.includes("PM");
  const isAM = t.includes("AM");
  let [hr, min] = t.replace(/[APM]/g, "").split(":").map(Number);
  if (isNaN(min)) min = 0;
  if (isPM && hr !== 12) hr += 12;
  if (isAM && hr === 12) hr = 0;
  return hr * 60 + min;
}

function isOpenNow(hours, day, nowMin) {
  if (!hours || !hours[day] || hours[day] === "Closed") return false;
  const parts = hours[day].split("–");
  if (parts.length !== 2) return false;
  const openMin = parseTime(parts[0]);
  let closeMin = parseTime(parts[1]);
  if (closeMin <= openMin) closeMin += 24 * 60;
  let testNow = nowMin;
  if (testNow < openMin && nowMin + 24 * 60 < closeMin) testNow += 24 * 60;
  return testNow >= openMin && testNow < closeMin;
}

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius || 30);
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: "lat and lng query params required" });
  }

  // Get weather (or fall back to neutral plan)
  const w = await getCurrentWeather(lat, lng);
  const weather = w.ok ? w.data : null;
  const plan = weather ? vibePlanFromWeather(weather) : {
    mood: "no_weather", pitch: "Weather lookup unavailable — set OPENWEATHER_API_KEY",
    boost_vibes: [], boost_food: [], penalize_vibes: [], emoji: "🍺"
  };

  // Time / day
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", hour: "numeric", minute: "numeric", hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const day = parts.weekday;
  const nowMin = parseInt(parts.hour) * 60 + parseInt(parts.minute);

  const scored = data.breweries
    .map(b => {
      let score = 0;
      const reasons = [];

      if (!isOpenNow(b.hours, day, nowMin)) return null;
      score += 40;

      const distance = haversine(lat, lng, b.latitude, b.longitude);
      if (distance == null || distance > radius) return null;
      score -= distance * 1.5;

      const boostedVibes = (b.vibes || []).filter(v => plan.boost_vibes.includes(v));
      const penalizedVibes = (b.vibes || []).filter(v => plan.penalize_vibes.includes(v));
      const boostedFood = (b.food_tags || []).filter(t => plan.boost_food.includes(t));

      score += boostedVibes.length * 30;
      score += boostedFood.length * 20;
      score -= penalizedVibes.length * 25;

      if (boostedVibes.length) {
        reasons.push(`${plan.emoji} ${boostedVibes[0].replace(/_/g, " ")} fits today's weather`);
      }
      if (boostedFood.length) {
        reasons.push(`🍽️ ${boostedFood[0].replace(/_/g, " ")}`);
      }
      reasons.push(`📍 ${distance} mi away`);

      return { brewery: b, score, reasons, distance, boostedVibes, boostedFood };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  res.status(200).json({
    weather: weather ? {
      temp: weather.temp,
      conditions: weather.conditions,
      description: weather.description,
      icon: weather.icon,
      city: weather.city,
      cached: w.cached || false
    } : null,
    weather_error: w.ok ? null : w.reason,
    plan: { mood: plan.mood, pitch: plan.pitch, emoji: plan.emoji },
    day,
    user_location: { lat, lng },
    count: scored.length,
    breweries: scored.map(s => ({
      ...s.brewery,
      distance: s.distance,
      score: Math.round(s.score),
      why: s.reasons,
      weather_match: { vibes: s.boostedVibes, food: s.boostedFood }
    }))
  });
};
