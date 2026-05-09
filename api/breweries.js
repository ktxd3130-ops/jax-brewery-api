const data = require("../breweries.json");
const { applyCors } = require("../lib/util");

module.exports = (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  let breweries = [...data.breweries];
  const q = req.query || {};

  if (q.neighborhood) {
    const term = String(q.neighborhood).toLowerCase();
    breweries = breweries.filter(b =>
      b.neighborhood.toLowerCase().includes(term)
    );
  }
  if (q.dog_friendly === "true") {
    breweries = breweries.filter(b => b.dog_friendly === true);
  }
  if (q.kid_friendly === "true") {
    breweries = breweries.filter(b => b.kid_friendly === true);
  }
  if (q.search) {
    const term = String(q.search).toLowerCase();
    breweries = breweries.filter(b =>
      `${b.name} ${b.known_for} ${b.tap_highlights}`.toLowerCase().includes(term)
    );
  }

  res.status(200).json({
    metadata: data.metadata,
    count: breweries.length,
    breweries
  });
};
