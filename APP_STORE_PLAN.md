# Pint — App Store Deployment Plan

**App:** Pint — "Fill Your Pint" (repo: `jax-brewery-api`)
**Date:** 2026-06-20
**Live web app:** https://jax-brewery-guide.vercel.app
**Goal:** Ship Pint to the Apple App Store (and Google Play as a fast-follow) as a native app, reusing the existing web codebase.

**Decisions locked (2026-06-20):**
- **Scope:** iPhone-only, **App Store first**. Google Play is a v1.1 fast-follow. No iPad QA in v1.
- **Push notifications:** **Deferred to v1.1** (no event feed or sending backend exists yet).
**Author:** Engineering assessment of the current repo state.

---

## 0. Reality check — what Pint actually is

The brief described the stack as "Next.js + serverless APIs." **It is not Next.js.** The actual architecture, confirmed by reading the repo:

| Layer | Reality |
|---|---|
| Front-end | A **single static `index.html`** (1,661 lines) — vanilla JS, no framework, no build step. **Leaflet loaded from a CDN** (`unpkg.com`). Google Fonts via `@import`. |
| API | **Vercel serverless functions** (`/api/*.js`), CommonJS (`module.exports`), not Next.js routes. 6 endpoints. |
| Data | A static **`breweries.json`** (~73 KB, 27–32 breweries) served directly + read by the functions. |
| Hosting | **Vercel**, `cleanUrls: true`, open CORS. Live and `READY`. |
| Build | **None.** `package.json` has no `dependencies`, no `scripts`, no bundler. It's literally an HTML file + JS functions. |

**Why this matters for the App Store:** the plan below is built around what's actually here. The no-build, single-file nature is a *gift* for a quick wrapper (nothing to compile) but a *liability* for native features (no module system, no PWA scaffolding, CDN dependencies that hurt offline). The recommended path is **Capacitor**, which wraps the existing `index.html` directly with minimal restructuring — not a Next.js-specific or React-Native rewrite.

---

## 1. Current state (git + deploy)

### Git
- Branch: `main`, clean working tree except untracked planning docs (`PINT_*.md`, `breweries.refreshed.json`, `.claude/`, this file).
- Local `main` == `origin/main` (0 ahead / 0 behind).
- A second branch exists locally and on origin: **`claude/dazzling-merkle-180200`** ("Sprint A").
- Recent commits: `d3f7d2c` (v4 food-first decisioning), `aaeacb5` (detail drawer), `28e5e71` (Right-Now + map), `b36b89b` (geolocation + global API), `2fd2328` (initial).

### Deployment status
- **Production is live and serving traffic** at `jax-brewery-guide.vercel.app` (per `PINT_LAUNCH_READINESS.md`, verified 2026-06-16: 27 breweries, cold mobile load, zero console errors).
- **Repo ↔ prod fork:** production is reportedly running the `claude/dazzling-merkle-180200` (Sprint A) branch — Coastal Pint turquoise theme + extra endpoints — which is **ahead of `main`**. The repo's source of truth has diverged from what's live. **This must be resolved before building a native wrapper** (you'd otherwise wrap stale code). See Blocker B1.
- `GOOGLE_PLACES_API_KEY` is **not set** in prod, so reviews/photos in the drawer are dark (graceful fallback to platform links).
- Data is ~5 weeks stale; `breweries.refreshed.json` is the corrected dataset (removes 5 closed breweries) waiting to be applied.

### API endpoints present
`GET /api/breweries`, `/api/breweries/[id]`, `/api/breweries/nearby`, `/api/breweries/right-now`, `/api/breweries/details`, `/api/breweries/by-city`. All return JSON, open CORS. (Sprint A adds `lookup-details`, `taps`, `weather-pick`, `scrape/city` per the launch docs.)

---

## 2. App Store readiness assessment

### 2.1 Tech stack → wrapper implications
- No framework and no build means **nothing to port** — the web UI runs as-is inside a WebView.
- **CDN dependencies are the catch:** Leaflet JS/CSS and Google Fonts load over the network. Inside a native shell these (a) break offline and (b) can trip App Store Review Guideline **4.2 (minimum functionality)** if the app is "just a website." Both must be **bundled locally** into the app package.
- The serverless API stays on Vercel; the native app calls it over HTTPS. That's fine, but the app must **degrade gracefully when offline** (see 2.4) or Review may reject a blank screen.

### 2.2 Native wrapper strategy — **Recommendation: Capacitor**

| Option | Fit for Pint | Verdict |
|---|---|---|
| **Capacitor** (Ionic) | Wraps the existing `index.html` directly; first-class native plugins for Geolocation, Push, Splash, Status Bar; ships to both stores; tiny migration from a static SPA. | ✅ **Recommended** |
| **PWA + "Add to Home Screen"** | Zero native tooling, but **Apple does not accept PWAs in the App Store** and iOS PWAs can't do real push reliably. Good as a *parallel* web install, not an App Store path. | ⚠️ Supplement only |
| **React Native / Flutter** | Full rewrite of a working UI. Months of work for no near-term user benefit. | ❌ Reject |
| **WKWebView from scratch (no Capacitor)** | Reinvents Capacitor's plugin layer (permissions, push, deep links). | ❌ Reject |

**Plan:** Add Capacitor on top of the current repo. Point `webDir` at a folder containing `index.html` + locally-bundled vendor assets. Use `@capacitor/geolocation`, `@capacitor/push-notifications` (or OneSignal), `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/app` (deep links). Keep the live Vercel API as the backend; bundle `breweries.json` as an offline seed.

**Anti-rejection (Guideline 4.2):** A thin web wrapper risks rejection. Mitigate by leaning on genuinely native capabilities — real OS location permission, push notifications for events, offline cached data, native share, Maps hand-off — so the app does things a bookmark cannot.

### 2.3 Map view (Leaflet) on mobile
- Leaflet works inside a WebView, but today it's **CDN-loaded** → fails offline and adds load latency. **Action:** vendor `leaflet.js` + `leaflet.css` + marker images into the bundle.
- Default OSM tiles are raster over the network — the map area is **blank offline**. Acceptable for v1 (show a "map needs connection" state), but call it out. Optional later: a native map plugin or cached tiles.
- Verify touch gestures (pinch-zoom, momentum) and that map height renders correctly in the WebView viewport (a common mobile-Leaflet bug is `0px` map height inside flthis containers).
- Tap markers / "Directions" should hand off to **Apple Maps / Google Maps** via geo URLs rather than routing in-app.

### 2.4 Offline capability for brewery data
- Today: **everything is `fetch()`** from the network (`/breweries.json`, `/api/...`). No service worker, no cache. Offline = empty screen.
- **v1 plan:**
  1. **Bundle `breweries.json` in the app** as a seed so the core list renders instantly with zero network (also speeds cold start).
  2. **Cache last successful API responses** (Capacitor Preferences / IndexedDB) for `nearby` and `right-now`; show cached data with a "last updated" timestamp when offline.
  3. Show a non-blocking "You're offline — showing saved breweries" banner instead of a blank state.
- Live-only features (Google Places reviews/photos, live taps, weather pick) degrade to "needs connection" — fine.

### 2.5 Location services for "near me"
- Current code uses browser `navigator.geolocation.getCurrentPosition` with an 8s timeout and a graceful denial fallback to "Jacksonville Area / CURATED" — good UX foundation already in place (`index.html:1270–1331`).
- **Native requirements:**
  - Switch to **`@capacitor/geolocation`** so the OS permission dialog fires correctly in the shell.
  - **iOS `Info.plist`:** add `NSLocationWhenInUseUsageDescription` with a clear, honest purpose string (e.g. *"Pint uses your location to find breweries near you right now."*). **Missing or vague strings = automatic rejection.**
  - **Android:** `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` in the manifest.
  - Keep the existing denial fallback — Apple wants the app usable without location.

### 2.6 Push notifications for events
- **None exist today** — no client registration, no server, no token storage. This is net-new work.
- For a solo/indie launch, **OneSignal** (free tier) on top of Capacitor is the fastest path; alternatively `@capacitor/push-notifications` + APNs/FCM directly.
- iOS prerequisites: **Apple Push Notification service key (.p8)** from the Apple Developer account, **Push Notifications capability** enabled, and an **App ID with push entitlement**.
- **Recommendation: ship push as v1.1, not a launch blocker.** It needs an event data source (the scraper / curated events feed) and a sending backend, neither of which is wired up. Launch v1 without push; add "brewery event nearby" / "new taproom in your city" notifications once there's content to send. Don't request notification permission on first launch with nothing to send.

### 2.7 App Store assets & account needs

**Accounts / legal (start now — these have lead time):**
- [ ] **Apple Developer Program** membership ($99/yr) — enrollment + verification can take days.
- [ ] **Google Play Developer** account ($25 one-time) for the fast-follow.
- [ ] **Privacy Policy URL** (required; you collect location). Host on the Vercel site.
- [ ] **App Privacy "nutrition label"** answers (location = yes, "used for app functionality, not tracking" if you don't sell/track).
- [ ] Support URL + support email.
- [ ] Final **brand/name lock** — footer still said "name placeholder" until the data-refresh step; confirm "Pint" is the store name and check App Store name availability (generic names like "Pint" may collide — have a backup like "Pint — Brewery Finder").

**Visual assets:**
- [ ] **App icon** 1024×1024 (no alpha, no rounded corners) + all derived sizes (Capacitor `assets` tool generates these from one source).
- [ ] **Splash screen** source (light + dark).
- [ ] **iPhone screenshots** — 6.7" and 6.5" required; ideally 5–10 showing: Right-Now picks, map, detail drawer, food-first scoring, weather pick.
- [ ] **iPad screenshots** only if you mark it iPad-compatible (recommend iPhone-only for v1 to cut scope).
- [ ] Optional App Preview video.

**Listing copy:**
- [ ] App name + subtitle (30 chars), promotional text, description, **keywords** (100 chars — coordinate with ASO), category (Food & Drink), age rating (**17+ due to alcohol/frequent references** — be honest here; alcohol content is a common rating miss).

> ⚠️ **Alcohol-related app policy:** App Store apps featuring alcohol must set an appropriate age rating and must not facilitate alcohol *sales/ordering* to minors. Pint is a *finder* (informational), which is allowed, but expect Review to look at age rating and any ordering links. Keep it informational; route purchases out to the venue.

---

## 3. Build plan (phased)

### Phase 0 — Unblock the repo (½ day) — **do first**
1. Resolve the repo↔prod fork: merge `claude/dazzling-merkle-180200` (Sprint A) into `main` so the wrapper builds from what's actually live (`git merge --ff-only origin/claude/dazzling-merkle-180200` per `PINT_DO_THIS.md`).
2. Apply data refresh: `mv breweries.refreshed.json breweries.json`, remove the brand-placeholder line, commit. (Removes 5 closed breweries — a trust blocker for a public launch.)
3. Add `GOOGLE_PLACES_API_KEY` in Vercel (lights up reviews/photos) — optional for store submission but improves the experience reviewers see.
4. Confirm prod redeploys clean and matches `main`.

### Phase 1 — De-CDN & PWA hardening (1–2 days)
1. Create a `www/` (or `app/`) web dir as the Capacitor `webDir`; move `index.html` in.
2. **Bundle vendor assets locally:** Leaflet JS/CSS + marker icons; self-host the Inter font (drop the Google Fonts `@import`). No more `unpkg`/`fonts.googleapis` at runtime.
3. Make all API calls use an **absolute base URL** (`https://jax-brewery-guide.vercel.app`) since the WebView origin isn't the Vercel domain.
4. Add a **`manifest.json`** + icons + `theme-color` and `apple-touch-icon` meta (also enables the parallel PWA install).
5. Bundle `breweries.json` as an offline seed; add a tiny cache layer + offline banner (2.4).
6. Add CORS allowance for the Capacitor origin (`capacitor://localhost`, `https://localhost`) on the API (currently `*`, so already permissive — just verify).

### Phase 2 — Capacitor shell + native features (2–3 days)
1. `npm init`, add Capacitor (`@capacitor/core`, `cli`, `ios`, `android`), `npx cap init Pint <bundle-id>` (e.g. `com.kendalldale.pint`).
2. Add plugins: Geolocation, Splash Screen, Status Bar, App (deep links), Share.
3. Swap `navigator.geolocation` → `@capacitor/geolocation` with permission request + existing denial fallback.
4. iOS `Info.plist` location string; Android manifest location perms.
5. Generate icon/splash from source (`@capacitor/assets`).
6. `npx cap add ios && npx cap add android`; open in Xcode / Android Studio.

### Phase 3 — Device QA (2–3 days)
- Real iPhone: location allow/deny paths, map render + gestures, drawer open/close, offline mode, deep-link/share, safe-area insets (notch/Dynamic Island), cold-start time.
- Multiple screen sizes; light/dark.
- Verify no remote-resource failures (everything bundled).

### Phase 4 — Store prep & submit (2–4 days + review)
- App Store Connect record, bundle ID, signing/provisioning, TestFlight build.
- Internal + small external TestFlight round.
- Upload assets + listing + privacy answers + age rating.
- Submit; budget **1–3 days** typical review (longer if 4.2 questions arise).

### Phase 5 — v1.1 fast-follow (post-launch)
- Push notifications for events (2.6) once an event feed + sender exist.
- Automate weekly data refresh (Sprint A scraper + **Vercel Cron**) so the list never rots again.
- Google Play release.
- Cached map tiles / richer offline.

**Rough timeline:** ~2 working weeks to first submission, assuming the Apple Developer account is already approved. Account enrollment is the long pole — **start it today.**

---

## 4. Blockers & risks

### Blockers (must clear before/at submission)
- **B1 — Repo↔prod fork.** Wrapping must happen from a single source of truth. Merge Sprint A → `main` first (Phase 0). *Owner: you (git push creds).*
- **B2 — Apple Developer account.** No submission without it; enrollment has multi-day lead time. *Start now.*
- **B3 — CDN dependencies.** Leaflet + fonts loaded remotely break offline and weaken the "native app" case for Guideline 4.2. Must bundle locally (Phase 1).
- **B4 — Privacy policy + location usage string.** Missing/vague → automatic rejection. Required because the app uses location.
- **B5 — Stale/closed-brewery data.** Shipping an app that sends users to 5 permanently-closed breweries is a credibility (and arguably accuracy) failure. Apply `breweries.refreshed.json` (Phase 0).
- **B6 — Brand/name lock + App Store name availability.** "Pint" is generic and may already be taken on the store. Decide final store name early.

### Risks
- **R1 — Guideline 4.2 "minimum functionality."** A web wrapper can be rejected as "just a website." *Mitigation:* genuine native location, offline cache, native share/Maps hand-off, (later) push.
- **R2 — Alcohol content / age rating.** Must rate 17+ and stay informational (no minor-facing alcohol ordering). *Mitigation:* keep purchases routed out to venues; honest rating.
- **R3 — Mobile Leaflet quirks.** `0px` map height in flex containers, tile loading, gesture conflicts inside WebView. *Mitigation:* explicit map dimensions + device QA (Phase 3).
- **R4 — Offline UX.** Network-only fetch yields blank screens reviewers dislike. *Mitigation:* bundled seed + cache + offline banner (Phase 1/2.4).
- **R5 — Data freshness without automation.** The list lost 5 venues in ~5 weeks. A shipped app makes staleness more visible and harder to hotfix than a website. *Mitigation:* Vercel Cron + scraper (Phase 5), and decouple data from app binary (data already lives server-side — keep it that way so updates don't require an app release).
- **R6 — API single point of failure.** All dynamic features depend on the Vercel functions; an outage degrades the app. *Mitigation:* offline cache (R4) covers the core list; live features fail soft.
- **R7 — Google Places cost/quota.** If reviews/photos are enabled, watch the free-tier ceiling; the 24h cache helps. Restrict the key by API + referrer/bundle.
- **R8 — Push scope creep.** Easy to over-invest pre-launch. *Mitigation:* explicitly deferred to v1.1.

---

## 5. Immediate next actions (this week)
1. **Start the Apple Developer Program enrollment** (longest lead time). *(B2)*
2. **Merge Sprint A → `main`** + apply the data refresh + commit. *(B1, B5 — steps already written in `PINT_DO_THIS.md`)*
3. **Lock the store name** and check App Store availability. *(B6)*
4. **Write the Privacy Policy** and host it on the Vercel site. *(B4)*
5. ~~Decide iPhone-only vs. universal~~ — **Locked: iPhone-only, App Store first** (Google Play deferred to v1.1).
6. Greenlight Phase 1 (de-CDN + Capacitor) once the above are moving.

---

*Generated as an engineering deployment assessment. Corrects the stated stack (static HTML + Vercel serverless, not Next.js) and recommends a Capacitor wrapper as the lowest-risk path to the App Store.*
