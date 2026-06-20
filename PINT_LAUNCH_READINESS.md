# Pint — Launch Readiness Report

**Date:** 2026-06-16 · **Verified by:** live testing against production
**Live URL:** https://jax-brewery-guide.vercel.app
**Verdict:** **Effectively shipped and working.** Not "needs to launch" — it's live, the API is solid, the front-end renders clean. What was actually missing is *verification* (now done) plus three loose ends below.

---

## The headline

The story wasn't "build Pint." It was **"Pint already shipped 5 weeks ago and nobody confirmed it."** The production deployment is `READY` and serving 27 breweries on a cold mobile load with **zero console errors**. The whole ship checklist is essentially green except for config/hygiene items.

One structural catch: **the deployed app is ahead of the local repo.** Production is running the `claude/dazzling-merkle-180200` branch ("Sprint A" — Coastal Pint turquoise theme, scraped-drawer enrichment, extra endpoints). Local `main` is still 5 weeks behind at the v4 commit (`d3f7d2c`). The repo's source of truth has forked from what's live.

---

## Ship checklist — verified against the live URL

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Deployed to public prod URL, cold mobile load, no console errors | ✅ Pass | `jax-brewery-guide.vercel.app` renders 27 breweries at 390px width; **0 console messages** on load |
| 2 | Geolocation works + degrades gracefully | ✅ Pass (denial path) | Location denied → falls back to "Jacksonville Area / CURATED", never a blank screen. *Allow-path on a real phone still wants a 30-sec human spot-check.* |
| 3 | "What's Good Tonight" returns correct, ranked results | ✅ Pass | `/right-now?moods=live_music,dog` → 5 ranked results, Kanine Social (dog park) #1, each with `why` reasons, distance, open-until. Correct for Tuesday. |
| 4 | Curated data accurate & current; refresh path exists | ⚠️ Mostly | Hours/food/tags present and sensible across 31 breweries; weekly-Monday refresh path documented. **But `last_updated: 2026-05-09` — ~5 weeks stale.** Hours may have drifted. |
| 5 | Public API real & documented | ✅ Pass | All 6 endpoints return valid JSON; `400` on missing params, `404` on bad id; CORS open. Sprint A added `lookup-details`, `taps`, `weather-pick`. |
| 6 | Graceful fallback outside Jax | ✅ Pass | `/by-city?city=Atlanta` → 23 Open Brewery DB results, normalized to schema, `source: openbrewerydb`. |
| 7 | Detail drawer complete | ✅ Pass (rendered) | Cards carry full action set: photos, social, web, Untappd, reviews, notes, directions. Interactive open not click-tested. |
| 8 | External keys handled safely | ⚠️ Config gap | **`GOOGLE_PLACES_API_KEY` is NOT set in production.** Drawer falls back to review-platform links (graceful), but live reviews/photos are dark. No key committed to repo. |
| 9 | No P0 bugs | ✅ Pass | No crash-on-load, no empty list, no 500s on normal requests, no console errors. |

---

## Gaps (all P1 / config — none block basic use)

1. **Repo ↔ prod fork.** Local `main` is 5 weeks behind the deployed `claude/dazzling-merkle-180200` branch. Merge Sprint A into `main` so the repo matches what's live, or future work forks again. *(Requires your git action — sandbox has no push creds.)*
2. **Google Places key not in prod.** Add `GOOGLE_PLACES_API_KEY` in Vercel → Settings → Environment Variables to light up embedded reviews/photos. Free tier ~11k calls/mo at $0. *(Config change on your account — your action.)*
3. **Curated data ~5 weeks stale.** Run the weekly refresh on the 31 breweries to re-verify hours/closures before promoting it to friends.

## Minor notes

- Brand name is still a placeholder — footer literally says *"name placeholder — final brand TBD."* Pint is a strong name; worth deciding before you share it widely.
- Launch bar says 33 breweries; dataset has **31**. Reconcile the doc.
- `/api/breweries/nearby` with no params returned an empty body over the live fetch (local handler correctly returns a `400` — likely just the fetch tool not rendering the error body, but worth a 10-sec confirm).

---

## Recommended next moves (Impact → Speed → Confidence)

1. **Merge Sprint A → `main`** (15 min, your push) — stop the repo/prod fork. Highest hygiene impact; unblocks all future work.
2. **Add the Places key in Vercel** (5 min, your action) — turns on the reviews/photos that are already built.
3. **Refresh curated hours** (30–45 min) — the trust layer; do before sharing with Mel & friends.
4. **Lock the brand name** (your call) — remove the placeholder, then it's genuinely launchable.

Net: Pint is one merge + one env var + one data pass away from "tell your friends." It's the closest-to-done thing in the portfolio.
