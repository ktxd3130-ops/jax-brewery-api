// Lightweight HTML scraping helpers — no external deps.
// Used by /api/breweries/taps and /api/scrape/city.

const UA = "PintBot/1.0 (+https://pint.app; brewery discovery; respects robots.txt)";
const FETCH_TIMEOUT_MS = 8000;

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      signal: ctrl.signal,
      redirect: "follow"
    });
    if (!res.ok) return { ok: false, status: res.status, html: "" };
    const html = await res.text();
    return { ok: true, status: res.status, html, finalUrl: res.url };
  } catch (err) {
    return { ok: false, status: 0, html: "", error: err.message };
  } finally {
    clearTimeout(t);
  }
}

// Strip HTML tags + collapse whitespace
function textOf(s) {
  return (s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull <meta name="X" content="..."> or property="X"
function metaContent(html, name) {
  const re = new RegExp(
    `<meta\\s+(?:[^>]*?(?:name|property)=["']${name}["'][^>]*?content=["']([^"']*)["']|[^>]*?content=["']([^"']*)["'][^>]*?(?:name|property)=["']${name}["'])`,
    "i"
  );
  const m = html.match(re);
  return m ? (m[1] || m[2] || "").trim() : "";
}

// ----- Untappd venue page parsing -----
// Public venue pages at untappd.com/v/<slug>/<id> render the current beer menu in
// .menu-section blocks. We pull beer name, style, ABV, IBU, and short description.
function parseUntappdVenuePage(html) {
  const beers = [];
  // Each beer entry sits in a <div class="beer-item"> ... </div>
  const beerBlockRe = /<div class="beer-item[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
  const blocks = html.match(beerBlockRe) || [];

  for (const block of blocks) {
    const nameMatch = block.match(/<p class="(?:beer-name|name)"[^>]*>([\s\S]*?)<\/p>/i);
    const styleMatch = block.match(/<p class="style"[^>]*>([\s\S]*?)<\/p>/i);
    const abvMatch = block.match(/(\d+(?:\.\d+)?)\s*%\s*ABV/i);
    const ibuMatch = block.match(/(\d+(?:\.\d+)?)\s*IBU/i);
    const descMatch = block.match(/<p class="(?:beer-description|description)"[^>]*>([\s\S]*?)<\/p>/i);
    const ratingMatch = block.match(/data-rating="([\d.]+)"/i) ||
                        block.match(/(\d\.\d{2})\s*\/?\s*5/);

    const name = textOf(nameMatch?.[1] || "");
    if (!name) continue;
    beers.push({
      name,
      style: textOf(styleMatch?.[1] || ""),
      abv: abvMatch ? parseFloat(abvMatch[1]) : null,
      ibu: ibuMatch ? parseFloat(ibuMatch[1]) : null,
      description: textOf(descMatch?.[1] || "").slice(0, 280) || null,
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : null
    });
  }

  // Looser fallback: many newer Untappd pages just emit JSON-LD or simpler markup.
  if (!beers.length) {
    // Try ld+json with Menu schema
    const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = ldRe.exec(html))) {
      try {
        const json = JSON.parse(m[1]);
        const items = Array.isArray(json) ? json : [json];
        for (const it of items) {
          const sections = it.hasMenuSection || it.menuSection || [];
          for (const sec of [].concat(sections || [])) {
            for (const item of sec.hasMenuItem || sec.menuItem || []) {
              if (item?.name) {
                beers.push({
                  name: item.name,
                  style: item.menuItemCategory || "",
                  abv: null,
                  ibu: null,
                  description: item.description || null,
                  rating: null
                });
              }
            }
          }
        }
      } catch {}
    }
  }

  return beers.slice(0, 40);
}

// ----- Generic brewery website tap-list parsing -----
// Many brewery sites have a "Beer", "Taps", "On Tap", or "Menu" page.
// We hunt for headings near beer-style tokens (IPA, Stout, Pilsner, Sour, etc.).
const STYLE_TOKENS = [
  "IPA", "DIPA", "Pale Ale", "Stout", "Porter", "Lager", "Pilsner", "Pilsener",
  "Sour", "Saison", "Gose", "Hefeweizen", "Wheat", "Hazy", "NEIPA", "Kölsch",
  "Brown Ale", "Amber", "Red Ale", "Blonde", "Cream Ale", "Belgian", "Tripel",
  "Dubbel", "Quad", "Barleywine", "Bock", "Märzen", "Oktoberfest", "Kveik",
  "ESB", "Bitter", "Mild", "Cider", "Mead", "Fruited", "Berliner Weisse"
];
const STYLE_RE = new RegExp(`\\b(${STYLE_TOKENS.join("|")})\\b`, "i");

function parseGenericTapList(html, max = 20) {
  const beers = [];

  // 1) Try ld+json Menu / FoodEstablishment / ItemList
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(html))) {
    try {
      const json = JSON.parse(m[1]);
      const all = Array.isArray(json) ? json : [json];
      for (const node of all) {
        const sections = [].concat(node.hasMenuSection || node.menuSection || []);
        for (const sec of sections) {
          for (const item of [].concat(sec.hasMenuItem || sec.menuItem || [])) {
            if (item?.name) {
              beers.push({
                name: textOf(item.name),
                style: textOf(item.menuItemCategory || sec.name || ""),
                abv: null, ibu: null,
                description: textOf(item.description || "") || null,
                rating: null
              });
            }
          }
        }
      }
    } catch {}
  }
  if (beers.length) return beers.slice(0, max);

  // 2) Heuristic: walk headings/paragraphs and group ones containing style tokens.
  // Strip all script/style first.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  // Pull out h2/h3/h4/strong/p text with their ABV if present nearby.
  const elementRe = /<(h[1-4]|p|strong|li|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  const seen = new Set();
  let match;
  while ((match = elementRe.exec(cleaned)) && beers.length < max) {
    const inner = textOf(match[2]);
    if (!inner || inner.length < 4 || inner.length > 220) continue;
    // Must look like a beer entry — has a style word OR an ABV%
    const hasStyle = STYLE_RE.test(inner);
    const abvMatch = inner.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!hasStyle && !abvMatch) continue;
    // Avoid pure-CTA strings
    if (/(^|\s)(menu|tap|order now|view|see all|more)\s*$/i.test(inner)) continue;

    // Try to split "Name — Style 6.5%" or "Name | Style | 6.5% ABV"
    let name = inner;
    let style = "";
    const parts = inner.split(/[•·|—–-]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      name = parts[0];
      const styleHit = parts.find(p => STYLE_RE.test(p));
      style = styleHit || parts[1] || "";
    }
    if (name.length > 80) name = name.slice(0, 80);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    beers.push({
      name,
      style: textOf(style.replace(/\d+(?:\.\d+)?\s*%\s*ABV?/i, "").trim()),
      abv: abvMatch ? parseFloat(abvMatch[1]) : null,
      ibu: null,
      description: null,
      rating: null
    });
  }
  return beers.slice(0, max);
}

// ----- Brewery site enrichment (food, social, vibes) -----
function parseSocialLinks(html) {
  const social = { instagram: "", facebook: "", twitter: "", tiktok: "" };
  const ig = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)\/?/i);
  const fb = html.match(/https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.\-]+)\/?/i);
  const tw = html.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]+)\/?/i);
  const tk = html.match(/https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)\/?/i);
  if (ig) social.instagram = ig[0].replace(/\/+$/, "");
  if (fb) social.facebook = fb[0].replace(/\/+$/, "");
  if (tw) social.twitter = tw[0].replace(/\/+$/, "");
  if (tk) social.tiktok = tk[0].replace(/\/+$/, "");
  return social;
}

function parsePhone(html) {
  const m = html.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
  return m ? m[0] : "";
}

function parseFoodSignals(html) {
  const text = textOf(html).toLowerCase();
  const tags = new Set();
  const signals = {
    pizza: /\bpizza|wood[- ]?fired|stone oven|neapolitan/,
    tacos: /\btaco|taqueria|mexican\b/,
    burgers: /\bburger|smash burger|cheeseburger/,
    bbq: /\bbbq|barbeque|barbecue|smoked meats|brisket|ribs\b/,
    wings: /\bwings\b/,
    food_trucks: /\bfood truck|rotating food|truck rotation/,
    full_menu: /\bfull menu|gastropub|kitchen|chef|appetizers|entrees/,
    byof_friendly: /\bbring your own food|byo food|outside food welcome/,
    vegan: /\bvegan\b/,
    gluten_free: /\bgluten[- ]free\b/
  };
  for (const [tag, re] of Object.entries(signals)) {
    if (re.test(text)) tags.add(tag);
  }
  return [...tags];
}

function parseVibeSignals(html) {
  const text = textOf(html).toLowerCase();
  const tags = new Set();
  const signals = {
    dog_park: /\bdog[- ]friendly|dogs welcome|dog park/,
    family_focused: /\bfamily[- ]friendly|kids welcome|kid[- ]friendly/,
    patio: /\bpatio|outdoor seating|beer garden|biergarten/,
    waterfront: /\bwaterfront|riverfront|on the (river|water|bay)/,
    live_music_venue: /\blive music|bands? play|concert/,
    trivia_spot: /\btrivia night|trivia tuesday|trivia thursday/,
    sports_bar: /\bgame day|watch the game|big screens?/,
    rooftop: /\brooftop\b/
  };
  for (const [tag, re] of Object.entries(signals)) {
    if (re.test(text)) tags.add(tag);
  }
  return [...tags];
}

function pickHoursPage(html, baseUrl) {
  // Find any link that looks like hours, visit, contact — used as a fallback page to scrape.
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const label = textOf(m[2]).toLowerCase();
    if (/hours|visit|contact|location/.test(label)) {
      try { return new URL(m[1], baseUrl).toString(); } catch { return null; }
    }
  }
  return null;
}

function pickTapsPage(html, baseUrl) {
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  const candidates = [];
  while ((m = re.exec(html))) {
    const label = textOf(m[2]).toLowerCase();
    const href = m[1].toLowerCase();
    if (/(?:^|\W)(beer|taps|on tap|menu|tap list|whats? on)/.test(label) ||
        /\/(beer|taps|tap-list|on-tap|menu)\b/.test(href)) {
      try { candidates.push(new URL(m[1], baseUrl).toString()); } catch {}
    }
  }
  return candidates[0] || null;
}

module.exports = {
  fetchHtml,
  textOf,
  metaContent,
  parseUntappdVenuePage,
  parseGenericTapList,
  parseSocialLinks,
  parsePhone,
  parseFoodSignals,
  parseVibeSignals,
  pickHoursPage,
  pickTapsPage
};
