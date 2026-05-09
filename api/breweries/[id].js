const data = require("../../breweries.json");
const { applyCors } = require("../../lib/util");

module.exports = (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id } = req.query;
  const brewery = data.breweries.find(b => String(b.id) === String(id));
  if (!brewery) {
    return res.status(404).json({ error: "Brewery not found" });
  }
  res.status(200).json(brewery);
};
