# 🐛 Bugfix Log — Pre-Submission Debug Pass

A full line-by-line review of `backend/` and `frontend/` turned up 5 real bugs.
All were reproduced with a runnable script before fixing, and re-verified after.
No behavior was changed beyond what's described below — no new features added.

---

## 🔴 Critical — would have broken the live demo

### Bug 1: `travel_time_increase_pct` exploded to ~1,962,795.6% during the
### "Downtown Grid Blackout" preset (the flagship demo scenario)

**File:** `backend/graph_engine.py` — `compute_impact_metrics()`

**Cause:** Failed road edges were floored at a flat capacity of `0.1`. When a full
cascade fails most/all road edges at once (as the Downtown Blackout preset does —
97/97 edges in testing), total road capacity collapses to near-zero while total
load stays huge, so `load / capacity` explodes into the millions of percent. The
frontend (`app.js`) rendered this straight into the UI with no clamping, so it
would have shown **"+1962795.6% delay"** on screen in front of judges.

**Fix:** Failed edges now retain a capacity-proportional floor (10% of their own
rated capacity) instead of a flat constant, and the final surge percentage is
capped at a realistic ceiling (300%) representing "total gridlock." Added a
matching defensive clamp in `app.js` as a second safety net.

---

## 🟠 Major — silently wrong results

### Bug 2: "West hospital" / "East hospital" scenarios silently routed to the
### wrong hospital

**File:** `backend/nlp_engine.py` — `parse_query()`

**Cause:** The `hosp_central` branch was checked *before* the east/west branches,
and its condition (`"hospital" in q and "trauma" not in q`) was broad enough to
match almost any hospital-related sentence — so queries like *"west hospital
collapses"* or *"east hospital fails"* matched the central branch first and never
reached their own logic.

**Fix:** Reordered so the east/west checks run first; tightened the catch-all to
only fire on an explicit reference to the central/general/Metropolis facility.

### Bug 3: Duration parser had false positives from missing word boundaries

**File:** `backend/nlp_engine.py` — `parse_query()`

**Cause:** The regex `(hour|hr|h|day|d|minute|min)` had no word boundary, so a
lone "d" or "h" inside an unrelated word (e.g. the "d" in "dollars") matched as
"day"/"hour" and silently overrode the scenario duration. Example: *"5 dollars
worth of damage happens"* parsed as **5 days (120 hours)**.

**Fix:** Added a trailing `\b` word boundary so units only match on real words.

---

## 🟡 Minor — display/rounding

### Bug 4: Failed nodes showed nonsensical `load_ratio` values

**File:** `backend/graph_engine.py` — `Node.to_dict()`

**Cause:** `load_ratio` divided load by `max(1.0, effective_capacity)`. Failed
nodes have `effective_capacity == 0`, so the "ratio" became the raw load number
itself (e.g. `2465.95` instead of a real ratio).

**Fix:** Falls back to the node's original design capacity (`base_capacity`) when
effective capacity is zero, and caps the displayed ratio at `9.99` for clean UI
rendering.

### Bug 5: `emergency_routes_disrupted` lost fractional "half-disrupted" credit

**File:** `backend/graph_engine.py` — `compute_impact_metrics()`

**Cause:** Half-degraded ambulance routes add `+0.5` to the running total, but
the final value was cast with `int()`, which truncates rather than rounds — e.g.
a total of `2.5` (two failed + one half-degraded route) was reported as `2`,
silently dropping the degraded route.

**Fix:** Switched `int()` → `round()`.

---

## 🏗️ Structural note (not a bug — no code changed)

The project has **two separate, disconnected frontends**:
- `frontend/index.html` + `frontend/app.js` — plain JS/HTML, this is what
  `start.py` actually serves at `localhost:8000`.
- `frontend/src/App.jsx` + components — a React app that needs its own
  `npm install && npm run dev` (port 5173) with API calls proxied to the Python
  backend. `start.py` never touches this.

Worth the team agreeing on which one is "the real app" before demo day, since
edits to the `.jsx` files won't show up in `python3 start.py`.

---

## Verification

- `python3 tests/test_cascade.py` — 6/6 tests pass (unchanged, no regressions).
- Each bug above was reproduced with a standalone script *before* the fix and
  re-run *after* to confirm the corrected behavior.
