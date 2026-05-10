// /api/scrape/city?city=Tampa[&max=15][&stream=1]
//
// Discovers + enriches breweries for any US city.
// - Default: returns the full JSON payload when scraping completes.
// - With ?stream=1: streams Server-Sent Events with progress updates so the
//   pint-glass animation can fill in real time.
//
// Cached in-memory per cold-start. Vercel Functions default timeout is 300s,
// which is plenty for ~25 breweries with ~8s per fetch worst case.

const { scrapeCity } = require("../../lib/cityScraper");
const { applyCors } = require("../../lib/util");

const cache = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 min

module.exports = async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const city = String(req.query.city || "").trim();
  if (!city) return res.status(400).json({ error: "city query param required" });
  const max = Math.min(parseInt(req.query.max) || 15, 30);
  const stream = req.query.stream === "1" || req.query.stream === "true";

  const cacheKey = `${city.toLowerCase()}|${max}`;
  const hit = cache.get(cacheKey);

  // ---- JSON mode (no streaming) ----
  if (!stream) {
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return res.status(200).json({ ...hit.data, cached: true });
    }
    try {
      const data = await scrapeCity(city, { max });
      cache.set(cacheKey, { ts: Date.now(), data });
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: "Scrape failed", details: err.message });
    }
  }

  // ---- SSE mode ----
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event, payload) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send("start", { city, max });

  // Heartbeat so connection doesn't idle-timeout on slow CDNs
  const hb = setInterval(() => res.write(`: heartbeat\n\n`), 15000);

  try {
    if (hit && Date.now() - hit.ts < TTL_MS) {
      send("progress", { phase: "cache", message: "Loaded from cache", current: 100, total: 100 });
      send("complete", { ...hit.data, cached: true });
    } else {
      const data = await scrapeCity(city, {
        max,
        onProgress: (ev) => send("progress", ev)
      });
      cache.set(cacheKey, { ts: Date.now(), data });
      send("complete", data);
    }
  } catch (err) {
    send("error", { message: err.message });
  } finally {
    clearInterval(hb);
    res.end();
  }
};
