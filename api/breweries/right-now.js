const data = require("../../breweries.json");
const { haversine, applyCors } = require("../../lib/util");

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Map mood keywords → matching event types and vibes
const MOOD_MAP = {
  live_music: { events: ["live_music"], vibes: ["live_music_venue"] },
  trivia: { events: ["trivia"], vibes: ["trivia_spot"] },
  comedy: { events: ["comedy", "open_mic"], vibes: ["comedy"] },
  sports: { events: ["sports_watch"], vibes: ["sports_bar"] },
  food: { events: [], vibes: ["full_kitchen", "gastropub", "pizza_focused", "smoked_food", "mexican_food", "southern_comfort_food", "elevated_pub_food"] },
  pizza: { events: [], vibes: ["pizza_focused", "stone_oven", "wood_fired"] },
  dog: { events: ["dog_social"], vibes: ["dog_park"], require_dog_friendly: true },
  family: { events: [], vibes: ["family_focused", "kid_play_area", "biergarten"], require_kid_friendly: true },
  date_night: { events: [], vibes: ["date_night", "cozy", "patio", "waterfront"] },
  outdoor: { events: [], vibes: ["beer_garden", "patio", "outdoor_seating", "waterfront", "biergarten", "boat_dock", "outdoor_courtyard"] },
  chill: { events: [], vibes: ["low_key", "cozy", "neighborhood", "chill_lounge", "living_room_vibe"] },
  lively: { events: [], vibes: ["lively", "sports_bar", "big_taproom", "20_plus_taps", "50_taps"] },
  release: { events: ["release"], vibes: ["barrel_aged_focus"] },
  tour: { events: ["tour"], vibes: ["tour_friendly"] },
  food_truck: { events: ["food_truck"], vibes: ["food_trucks", "byof_friendly"] }
};

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
  if (!hours || !hours[day] || hours[day] === "Closed") return { open: false };
  const parts = hours[day].split("–");
  if (parts.length !== 2) return { open: false };
  const openMin = parseTime(parts[0]);
  let closeMin = parseTime(parts[1]);
  if (closeMin <= openMin) closeMin += 24 * 60;
  let testNow = nowMin;
  if (testNow < openMin && nowMin + 24 * 60 < closeMin) testNow += 24 * 60;
  const open = testNow >= openMin && testNow < closeMin;
  const minsUntilClose = open ? closeMin - testNow : null;
  return { open, minsUntilClose, raw: hours[day] };
}

module.exports = (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius || 30);
  const moods = String(req.query.moods || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const now = new Date();
  // Convert to ET (Jacksonville). Server runs in UTC; offset for Eastern is -4 (EDT) or -5 (EST).
  // For demo simplicity using server local; in production use Intl.DateTimeFormat with America/New_York.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map(p => [p.type, p.value])
  );
  const day = parts.weekday; // "Sat"
  const nowMin = parseInt(parts.hour) * 60 + parseInt(parts.minute);

  // Score each brewery
  const scored = data.breweries.map(b => {
    const reasons = [];
    let score = 0;

    // 1) Open now (required, but soft — closes-soon penalty)
    const openInfo = isOpenNow(b.hours, day, nowMin);
    if (!openInfo.open) {
      return { brewery: b, score: -1, reasons: [], open: false, openInfo };
    }
    score += 50;
    if (openInfo.minsUntilClose < 60) {
      score -= 20;
      reasons.push(`⏰ Closes in ${openInfo.minsUntilClose}m`);
    }

    // 2) Distance
    let distance = null;
    if (!isNaN(lat) && !isNaN(lng)) {
      distance = haversine(lat, lng, b.latitude, b.longitude);
      if (distance != null) {
        if (distance > radius) {
          return { brewery: b, score: -1, reasons: [], open: true, openInfo };
        }
        score -= distance * 1.5; // every mile = -1.5 points
        reasons.push(`📍 ${distance} mi away`);
      }
    }

    // 3) Today's events
    const todayEvents = (b.weekly_schedule && b.weekly_schedule[day]) || [];
    todayEvents.forEach(ev => {
      score += 30;
      const emoji = {
        live_music: "🎤",
        trivia: "🧠",
        comedy: "😂",
        open_mic: "🎙️",
        sports_watch: "📺",
        run_club: "🏃",
        bingo: "🎱",
        food_truck: "🚚",
        farmers_market: "🥕",
        glass_blowing: "🔥",
        dog_social: "🐕",
        tour: "🍺",
        release: "🆕",
        specials: "💸",
        happy_hour: "💸"
      }[ev.type] || "🎉";
      reasons.unshift(`${emoji} ${ev.label}${ev.time ? ` · ${ev.time}` : ""}`);
    });

    // 4) Mood matching
    let moodMatched = false;
    moods.forEach(mood => {
      const cfg = MOOD_MAP[mood];
      if (!cfg) return;

      // Strict requirements
      if (cfg.require_dog_friendly && !b.dog_friendly) return;
      if (cfg.require_kid_friendly && !b.kid_friendly) return;

      // Vibe match
      const vibeMatches = (b.vibes || []).filter(v => cfg.vibes.includes(v));
      if (vibeMatches.length > 0) {
        score += 25 * vibeMatches.length;
        moodMatched = true;
      }

      // Today's events match
      const eventMatches = todayEvents.filter(e => cfg.events.includes(e.type));
      if (eventMatches.length > 0) {
        score += 50;
        moodMatched = true;
      }
    });

    // If user picked moods but this place matched none, deprioritize
    if (moods.length > 0 && !moodMatched) {
      score -= 30;
    }

    // 5) Quick wins
    if (b.dog_friendly && moods.includes("dog")) reasons.push("🐕 Dog friendly");
    if (b.kid_friendly && moods.includes("family")) reasons.push("👨‍👩‍👧 Kid friendly");
    if (openInfo.minsUntilClose >= 120 && !reasons.find(r => r.startsWith("⏰"))) {
      reasons.push(`✅ Open until ${openInfo.raw.split("–")[1]}`);
    }

    return { brewery: b, score, reasons, open: true, openInfo, distance, todayEvents };
  });

  // Filter to open + within radius, sort by score desc
  const ranked = scored
    .filter(s => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => ({
      ...s.brewery,
      distance: s.distance,
      score: Math.round(s.score),
      why: s.reasons,
      events_today: s.todayEvents,
      closes_in_minutes: s.openInfo.minsUntilClose
    }));

  res.status(200).json({
    source: "curated",
    day,
    moods,
    user_location: !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null,
    count: ranked.length,
    breweries: ranked
  });
};
