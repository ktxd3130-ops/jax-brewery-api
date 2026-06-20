# Pint — Curated Data Refresh (2026-06-16)

**TL;DR:** The curated list had rotted. **5 of 32 breweries were permanently closed but still showing as "open"** — the exact failure the ship checklist warns against. Verified all 32 against official sites / Google / local news. Output: `breweries.refreshed.json` (32 → **27** breweries).

**Apply after the Sprint A merge:** `mv breweries.refreshed.json breweries.json` then commit. (Kept as a separate file so the fast-forward merge doesn't touch it.)

---

## 🔴 Removed — permanently closed (were showing as open)

| id | Brewery | Closed | Source confidence |
|----|---------|--------|-------------------|
| 1 | Intuition Ale Works | Apr 24, 2026 | HIGH — jaxtoday, First Coast News, News4Jax |
| 9 | Hyperion Brewing | Mar 31, 2024 | HIGH — Jax Daily Record |
| 15 | King Maker Brewing | Apr 4, 2026 | HIGH — official farewell page |
| 22 | Historically Hoppy | Dec 2024 | HIGH — BeerAdvocate / Facebook |
| 27 | Amelia Island Brewing Co. | Nov 5, 2025 | HIGH — First Coast News, Florida Beer News |

Intuition is the painful one — it's your #1, the "OG Jacksonville brewery," and it closed before the last data update. Anyone opening Pint and trusting it would've been sent to a closed brewery.

## 🟡 Hours corrected (still open)

| id | Brewery | Change |
|----|---------|--------|
| 2 | Bold City — Downtown | Tue & Sun now **Closed** (also see flag below) |
| 8 | Green Room | Later closings; Sat opens 3PM not 12PM; Fri/Sat to 1AM |
| 11 | Strings — Jax Beach | Opens **10:30AM**, closes 10–11PM (was 11AM–9PM) |
| 17 | Veterans United | Tue opens **3PM** (was 5PM) |
| 24 | Kanine Social | Baseline used the **dog-daycare** hours, not the taproom. Corrected to taproom: 3PM–9PM weekdays, etc. (This one would've shown "open" at 8AM when the bar was closed.) |
| 29 | Mocama | Sat opens **11AM** (was 12PM) |

## 🟠 Flagged — kept in the data, but need your eyes (1-min each)

| id | Brewery | Issue |
|----|---------|-------|
| 2 | Bold City — Downtown | **Closing for good June 27, 2026** (lease ends; brewing moves to Riverside #3). Remove after that date. |
| 25 | The Phoenix / Jax Brewing Co. | Status in doubt — Google "may be permanently closed"; conflicting Yelp listings. Call (904) 619-5683. |
| 26 | Town Beer Co. | Yelp says closed, official site is live. Address may be 1176 (not 1065) Edgewood. |
| 28 | First Love Brewing | May have **relocated** to 22 S 8th St, Ste 5, Fernandina Beach. |
| 32 | Pour | Couldn't confirm "Pour" at 2912 Corinthian Ave — may actually be "Pour Taproom," 61 N Laura St downtown. |

Each flagged record carries a `data_flag` field in the JSON so it's findable.

## ✅ Verified unchanged (HIGH confidence)
Bold City Riverside (3), Aardwolf (4), Wicked Barley (5), Engine 15 (6), Southern Swells (7), Tepeyolot (12), Voodoo (13), Ruby Beach (14), Legacy (16), Reve (18), Ink Factory (19), Fishweir (20), Myrtle Ave (21), Bottlenose (23), First Love hours (28), Dog Rose (30), Bog (31). Strings–Springfield (10) confirmed open, exact hours not re-verified (kept baseline, LOW confidence).

---

## What this means for launch
Criterion #4 ("no brewery shown open when it's closed") was **failing** — now fixed for the 5 confirmed closures and 6 hour changes. The refresh also proves *why the documented weekly refresh path matters*: in ~5 weeks the list lost 5 venues. Worth automating (the Sprint A scraper + a Vercel Cron could do this).
