# Pint — Finish line (3 steps, ~10 min on your machine)

Everything verifiable was verified; the data was refreshed; the brand is decided. These three need your auth/hands — I can't push to your repo or touch your Vercel env from here. Run them in order, on your Mac in the repo folder.

---

## 1. Merge Sprint A into `main` (clean fast-forward, ~30 sec)

Prod already runs this exact commit, so this changes nothing live — it just makes your repo's `main` match reality and stops the fork.

```bash
cd ~/Desktop/"Ai Building"/Jax-Brewery-API
git fetch origin
git checkout main
git merge --ff-only origin/claude/dazzling-merkle-180200
git push origin main
```

What it brings into `main`: the Coastal Pint turquoise theme, scraped-drawer enrichment, and 4 new endpoints (`lookup-details`, `taps`, `weather-pick`, `scrape/city`) + scraper/weather libs. No conflicts — `main` is a strict ancestor.

## 2. Apply the data refresh + lock the brand name (~2 min)

After the merge, swap in the corrected dataset (removes 5 closed breweries, fixes 6 hour sets, flags 5 for review — see `PINT_DATA_REFRESH.md`). It already has the brand placeholder flag flipped to `false`.

```bash
mv breweries.refreshed.json breweries.json
```

Then delete the placeholder line in `index.html` (around line 1212):

```
    name placeholder — final brand TBD
```

Just remove that one line (keep the JSON · API links above it). Then:

```bash
git add breweries.json index.html
git commit -m "Data refresh 6/16: remove 5 closed breweries, correct hours, flag 5; lock brand = Pint"
git push origin main
```

Vercel auto-deploys on push. Cold-load the site after to confirm.

## 3. Turn on reviews & photos — add the Google Places key (~5 min)

The drawer's review/photo feature is built but dark in prod because no key is set. To light it up:

1. **Get a key:** [console.cloud.google.com](https://console.cloud.google.com) → new project → enable **Places API** → create an API key → restrict it to Places API + your `jax-brewery-guide.vercel.app` domain.
2. **Add it to Vercel:** Vercel → `jax-brewery-guide` → Settings → Environment Variables → add `GOOGLE_PLACES_API_KEY` = your key (Production scope).
3. **Redeploy** (Vercel → Deployments → Redeploy, or just push any commit).

Free tier ≈ 11k Place Details calls/mo at $0; the app caches 24h per brewery. **Do not commit the key to the repo** — env var only.

> I can verify reviews/photos actually render once the key is live — just say the word and I'll re-test the drawer.

---

### After these three, Pint is genuinely "tell your friends" ready.
The flagged data items (Phoenix, Town Beer, Pour, First Love address — all in `PINT_DATA_REFRESH.md`) are 1-min phone/site checks you can do whenever; they're kept in the data, just marked. And the Sprint A scraper + a Vercel Cron could automate the weekly refresh so the list never rots 5 venues again.
