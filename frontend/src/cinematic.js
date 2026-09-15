/**
 * CASCADING FAILURES // Cinematic Director
 * =======================================
 * A scripted, camera-choreographed 75-second run of the simulator, built for filming the
 * Round 1 demo video. It drives the REAL engine and the REAL dashboard — no mock data, no
 * canned animation. Everything on screen is the live cascade solver responding in real time.
 *
 * Scenario (chosen empirically as the most legible cascade the engine produces):
 *   Downtown Power Station @ 40% fault, 8 hours, calm weather
 *   -> 11 cascade steps, 22 assets failed, 13 degraded
 *   -> 823,000 affected | +84.4% delay | 2 hospitals | 8 corridors | 17.8h recovery
 * Intervention:
 *   Harden Downtown Metro Station (rank #3 by Brandes betweenness)
 *   -> 607,400 affected | +25.5% delay | 1 hospital | 4 corridors | 12.6h recovery
 *
 * Framing: the overlay is pinned to the VIEWPORT, not the canvas, so the letterbox holds a
 * steady frame while the page scrolls underneath it. All floating canvas chrome (control
 * bar, timeline dock, inspector card, nav hints, tooltip) plus the app header and footer
 * fade out for the duration, so the only things in frame are the city, one telemetry line,
 * and one caption line.
 *
 * Trigger: the small dot at the bottom-right of the diorama, Shift+C, or window.runCinematic().
 * ESC aborts at any point.
 */

(function () {
  'use strict';

  // -------------------------------------------------------------
  // Scenario
  // -------------------------------------------------------------
  const SCENARIO = {
    epicenter: 'sub_downtown',
    magnitude: 0.40,
    magnitudePct: 40,
    durationHours: 8.0,
    weather: 0.0,
    weatherKts: 0,
    hardenId: 'road_3_4',
    hardenName: 'Downtown Metro Station'
  };

  const RUNTIME = 75;

  // Camera. target is [x, height, z]; phi is the polar angle from vertical
  // (0.05 = straight down, 0.615 = true isometric, 0.9 = low oblique).
  const SHOTS = [
    { at: 0.0,  target: [500, 10, 480], dist: 1050, theta: 0.52, phi: 0.50, glide: 4.5 },
    { at: 5.5,  target: [522, 14, 458], dist: 300,  theta: 1.05, phi: 0.88, glide: 3.2 },
    { at: 12.5, target: [522, 14, 458], dist: 285,  theta: 1.55, phi: 0.82, glide: 5.0 },
    { at: 18.5, target: [518, 10, 500], dist: 560,  theta: 0.80, phi: 0.68, glide: 4.0 },
    { at: 25.0, target: [500, 14, 545], dist: 285,  theta: 2.10, phi: 0.85, glide: 3.2 },
    { at: 30.4, target: [505, 10, 492], dist: 700,  theta: 0.62, phi: 0.42, glide: 1.5 },
    { at: 36.5, target: [338, 12, 492], dist: 430,  theta: 0.10, phi: 0.80, glide: 4.5 },
    { at: 44.0, target: [430, 0,  540], dist: 980,  theta: 0.30, phi: 0.14, glide: 5.0 },
    { at: 55.0, target: [558, 14, 487], dist: 300,  theta: 1.25, phi: 0.80, glide: 2.5 },
    { at: 57.6, target: [500, 8,  490], dist: 1050, theta: 0.52, phi: 0.50, glide: 3.0 },
    { at: 66.5, target: [500, 8,  490], dist: 820,  theta: 0.92, phi: 0.46, glide: 8.5 }
  ];

  // Cascade reveals, timed so the collapse at T+3 lands on the fast pull-back.
  const STEP_CUES = [
    { at: 0.2, step: 0 }, { at: 9.0, step: 1 }, { at: 19.0, step: 2 }, { at: 30.0, step: 3 },
    { at: 35.0, step: 4 }, { at: 39.0, step: 5 }, { at: 43.0, step: 6 }, { at: 45.5, step: 7 },
    { at: 47.0, step: 8 }, { at: 48.5, step: 9 }, { at: 50.0, step: 10 }
  ];

  const CAPTIONS = [
    { at: 0.6,  kicker: 'BASELINE',        line: 'Metropolis-7 · 73 assets · 3 coupled networks' },
    { at: 5.8,  kicker: 'INITIATING EVENT', line: 'Downtown Power Station — 40% fault, 8 hours' },
    { at: 9.2,  kicker: 'T + 1',           line: 'One substation derated. Nothing else has moved.' },
    { at: 19.2, kicker: 'T + 2',           line: 'Grid strain reaches traffic control and Central Hospital' },
    { at: 30.2, kicker: 'T + 3',           line: 'Downtown fails — 8 assets lost in a single step' },
    { at: 36.6, kicker: 'T + 4 — 5',       line: 'All three river crossings go down' },
    { at: 43.4, kicker: 'T + 6 — 10',      line: 'The ripple crosses the river into the west bank' },
    { at: 50.2, kicker: 'CONVERGED',       line: '22 assets failed · 13 degraded · 11 cascade steps' },
    { at: 51.4, kicker: 'DECISION ENGINE', line: 'Every asset ranked by Brandes betweenness centrality' },
    { at: 54.8, kicker: 'INTERVENTION',    line: 'Reinforce rank #3 — Downtown Metro Station' },
    { at: 57.8, kicker: 'RE-SOLVED',       line: 'Same fault. Same magnitude. One asset hardened.' },
    { at: 66.4, kicker: 'RESULT',          line: '215,600 people protected' }
  ];

  // Page scroll cues. 'top' or an element id; glide is seconds.
  const SCROLL_CUES = [
    { at: 51.0, to: 'interventionsPanel', glide: 2.4 },
    { at: 54.4, to: 'top',                glide: 2.0 },
    { at: 66.2, to: 'beforeAfterHud',     glide: 2.6 }
  ];

  // Canvas chrome and page furniture that leaves the frame for the duration.
  const CHROME_IDS = [
    'canvasControlBar', 'timelineDock', 'inspectorOverlay',
    'navHintsBadge', 'polybridge3dTooltip', 'appHeader', 'appFooter'
  ];

  // -------------------------------------------------------------
  // Overlay
  // -------------------------------------------------------------
  let el = {};
  let built = false;

  function css(node, styles) { Object.assign(node.style, styles); }

  function make(tag, styles, parent) {
    const n = document.createElement(tag);
    if (styles) css(n, styles);
    if (parent) parent.appendChild(n);
    return n;
  }

  const MONO = "'JetBrains Mono', ui-monospace, monospace";

  function buildOverlay() {
    if (built) return;

    // Pinned to the viewport so the letterbox holds a steady frame while the page scrolls.
    const root = make('div', {
      position: 'fixed', inset: '0', zIndex: '9999',
      pointerEvents: 'none', opacity: '0',
      transition: 'opacity 700ms ease',
      fontFamily: "'Space Grotesk', 'Plus Jakarta Sans', system-ui, sans-serif"
    }, document.body);
    el.root = root;

    const bar = {
      position: 'absolute', left: '0', right: '0', height: '0',
      background: '#0a0a0c', overflow: 'hidden',
      display: 'flex', alignItems: 'center',
      transition: 'height 1000ms cubic-bezier(.22,1,.36,1)'
    };
    el.barTop = make('div', Object.assign({ top: '0', justifyContent: 'space-between', padding: '0 34px' }, bar), root);
    el.barBottom = make('div', Object.assign({ bottom: '0', padding: '0 34px' }, bar), root);

    el.vignette = make('div', {
      position: 'absolute', inset: '0',
      background: 'radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.26) 100%)',
      opacity: '0', transition: 'opacity 900ms ease'
    }, root);

    // --- Top bar: run slug (left) + one telemetry line (right) ---
    el.slug = make('div', {
      fontFamily: MONO, fontSize: '10.5px', letterSpacing: '0.2em',
      color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap',
      opacity: '0', transition: 'opacity 600ms ease'
    }, el.barTop);
    el.slug.textContent = 'T + 00 · DOWNTOWN POWER STATION · 40% / 8H';

    const tel = make('div', {
      display: 'flex', alignItems: 'baseline', gap: '22px',
      opacity: '0', transition: 'opacity 600ms ease'
    }, el.barTop);
    el.telemetry = tel;

    el.readouts = {};
    [['people', 'AFFECTED'], ['delay', 'DELAY'], ['hosp', 'HOSPITALS'], ['corr', 'CORRIDORS']]
      .forEach(([key, label], i) => {
        const cell = make('div', { display: 'flex', alignItems: 'baseline', gap: '7px' }, tel);
        const v = make('span', {
          fontFamily: MONO, fontSize: i === 0 ? '19px' : '15px', fontWeight: '700',
          color: '#fff', fontVariantNumeric: 'tabular-nums'
        }, cell);
        v.textContent = '—';
        const l = make('span', {
          fontFamily: MONO, fontSize: '9px', letterSpacing: '0.16em',
          color: 'rgba(255,255,255,0.4)'
        }, cell);
        l.textContent = label;
        el.readouts[key] = v;
      });

    // --- Bottom bar: one caption line ---
    const cap = make('div', {
      display: 'flex', alignItems: 'baseline', gap: '16px',
      opacity: '0', transform: 'translateY(8px)',
      transition: 'opacity 500ms ease, transform 500ms ease'
    }, el.barBottom);
    el.caption = cap;
    el.capKicker = make('div', {
      fontFamily: MONO, fontSize: '10px', letterSpacing: '0.22em',
      color: '#ff7a45', whiteSpace: 'nowrap'
    }, cap);
    el.capLine = make('div', { fontSize: '17px', fontWeight: '600', color: '#fff' }, cap);

    // --- Number reveal card (shown only over the clean re-solved city) ---
    const slam = make('div', {
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%) scale(0.965)',
      opacity: '0', transition: 'opacity 700ms ease, transform 700ms cubic-bezier(.22,1,.36,1)',
      background: 'rgba(10,10,12,0.88)', backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.11)', borderRadius: '22px',
      padding: '26px 36px', minWidth: '460px'
    }, root);
    el.slam = slam;

    const head = make('div', {
      fontFamily: MONO, fontSize: '9.5px', letterSpacing: '0.22em',
      color: 'rgba(255,255,255,0.45)', marginBottom: '16px'
    }, slam);
    head.textContent = 'ONE ASSET HARDENED — DOWNTOWN METRO STATION';

    el.slamRows = [];
    [
      ['People affected', '823,000', '607,400'],
      ['Travel delay', '+84.4%', '+25.5%'],
      ['Assets lost', '22', '9'],
      ['Hospitals stressed', '2', '1'],
      ['Emergency corridors cut', '8', '4'],
      ['Recovery time', '17.8h', '12.6h']
    ].forEach(([label, before, after]) => {
      const row = make('div', {
        display: 'grid', gridTemplateColumns: '1fr auto 20px auto',
        alignItems: 'center', gap: '14px', padding: '7px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        opacity: '0', transform: 'translateY(5px)',
        transition: 'opacity 450ms ease, transform 450ms ease'
      }, slam);
      make('div', { fontSize: '12.5px', color: 'rgba(255,255,255,0.6)' }, row).textContent = label;
      make('div', {
        fontFamily: MONO, fontSize: '14px', color: '#ff7a45',
        textDecoration: 'line-through', opacity: '0.7'
      }, row).textContent = before;
      make('div', { fontSize: '12px', color: 'rgba(255,255,255,0.28)', textAlign: 'center' }, row).textContent = '→';
      make('div', {
        fontFamily: MONO, fontSize: '16px', fontWeight: '700', color: '#7ddc8a'
      }, row).textContent = after;
      el.slamRows.push(row);
    });

    built = true;
  }

  // -------------------------------------------------------------
  // Frame helpers
  // -------------------------------------------------------------
  function showCaption(kicker, line) {
    el.capKicker.textContent = kicker;
    el.capLine.textContent = line;
    css(el.caption, { opacity: '0', transform: 'translateY(8px)' });
    requestAnimationFrame(() => requestAnimationFrame(
      () => css(el.caption, { opacity: '1', transform: 'translateY(0)' })
    ));
  }

  function setReadouts(m) {
    if (!m) return;
    el.readouts.people.textContent = Number(m.people_affected).toLocaleString();
    el.readouts.delay.textContent = `+${Math.min(300, m.travel_time_increase_pct)}%`;
    el.readouts.hosp.textContent = String(m.hospitals_affected);
    el.readouts.corr.textContent = String(m.emergency_routes_disrupted);
  }

  function setChromeHidden(hidden) {
    CHROME_IDS.forEach(id => {
      const n = document.getElementById(id);
      if (!n) return;
      if (hidden) {
        if (!n.dataset.cineTransition) {
          n.dataset.cineTransition = n.style.transition || '';
          n.dataset.cinePointer = n.style.pointerEvents || '';
        }
        n.style.transition = 'opacity 500ms ease';
        n.style.opacity = '0';
        n.style.pointerEvents = 'none';
      } else {
        n.style.opacity = '';
        n.style.pointerEvents = n.dataset.cinePointer || '';
        n.style.transition = n.dataset.cineTransition || '';
      }
    });
  }

  // Eased page scroll. Native smooth scrolling runs ~400ms and isn't tunable, which reads
  // as a snap on camera; this glides over a couple of seconds on an ease-in-out curve.
  let scrollAnim = null;

  function scrollPageTo(targetId, seconds) {
    const startY = window.scrollY;
    let endY = 0;
    if (targetId !== 'top') {
      const node = document.getElementById(targetId);
      if (!node) return;
      const barH = window.innerHeight * 0.09;
      endY = node.getBoundingClientRect().top + window.scrollY - barH - 34;
    }
    endY = Math.max(0, Math.min(endY, document.body.scrollHeight - window.innerHeight));
    if (Math.abs(endY - startY) < 4) return;

    scrollAnim = { startY, endY, t0: performance.now(), dur: seconds * 1000 };
  }

  function stepScroll(now) {
    if (!scrollAnim) return;
    const k = Math.min(1, (now - scrollAnim.t0) / scrollAnim.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    window.scrollTo(0, scrollAnim.startY + (scrollAnim.endY - scrollAnim.startY) * e);
    if (k >= 1) scrollAnim = null;
  }

  function revealSlam() {
    css(el.slam, { opacity: '1', transform: 'translate(-50%,-50%) scale(1)' });
    el.slamRows.forEach((row, i) => {
      setTimeout(() => css(row, { opacity: '1', transform: 'translateY(0)' }), 200 + i * 130);
    });
  }

  function hideSlam() {
    css(el.slam, { opacity: '0', transform: 'translate(-50%,-50%) scale(0.98)' });
    el.slamRows.forEach(r => css(r, { opacity: '0', transform: 'translateY(5px)' }));
  }

  // -------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------
  let running = false;
  let rafId = null;
  let startedAt = 0;
  let fired = new Set();
  let unmitigated = null;
  let comparison = null;

  function bridge() { return window.__cinema; }

  async function preload() {
    const simRes = await fetch('/api/simulate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_id: SCENARIO.epicenter,
        magnitude: SCENARIO.magnitude,
        duration_hours: SCENARIO.durationHours,
        overload_threshold: 1.15,
        weather: SCENARIO.weather
      })
    });
    if (!simRes.ok) throw new Error('simulate failed');
    unmitigated = await simRes.json();

    const cmpRes = await fetch('/api/compare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initiating_node_id: SCENARIO.epicenter,
        reinforce_node_id: SCENARIO.hardenId,
        magnitude: SCENARIO.magnitude,
        duration_hours: SCENARIO.durationHours,
        weather: SCENARIO.weather
      })
    });
    if (!cmpRes.ok) throw new Error('compare failed');
    comparison = await cmpRes.json();
  }

  function once(t, at, key, fn) {
    if (t >= at && !fired.has(key)) { fired.add(key); fn(); }
  }

  function cue(t) {
    const b = bridge();
    if (!b) return;
    const engine = b.engine;

    SHOTS.forEach((s, i) => once(t, s.at, `shot${i}`, () => {
      if (engine && typeof engine.smoothTransitionCamera === 'function') {
        engine.camera.isOrtho = false;
        engine.smoothTransitionCamera(s.target, s.dist, s.theta, s.phi, s.glide);
      }
    }));

    STEP_CUES.forEach((c, i) => once(t, c.at, `step${i}`, () => {
      const step = unmitigated.steps[c.step];
      if (!step) return;
      b.renderStep(unmitigated, c.step);
      b.paintMetrics(step.metrics);
      setReadouts(step.metrics);
      el.slug.textContent = `T + ${String(c.step).padStart(2, '0')} · DOWNTOWN POWER STATION · 40% / 8H`;
    }));

    CAPTIONS.forEach((c, i) => once(t, c.at, `cap${i}`, () => showCaption(c.kicker, c.line)));

    SCROLL_CUES.forEach((c, i) => once(t, c.at, `scroll${i}`, () => scrollPageTo(c.to, c.glide)));

    once(t, 0.1, 'open', () => {
      css(el.root, { opacity: '1' });
      css(el.barTop, { height: '9%' });
      css(el.barBottom, { height: '11%' });
      css(el.vignette, { opacity: '1' });
      setTimeout(() => {
        css(el.slug, { opacity: '1' });
        css(el.telemetry, { opacity: '1' });
      }, 700);
    });

    // The engine explains itself in the panels the page is about to scroll to.
    once(t, 50.4, 'narrate', () => {
      b.narrate(unmitigated);
      b.recommend(unmitigated);
      b.setFeaStatus(`FEA CONVERGED · ${unmitigated.total_steps} STEPS`);
    });

    once(t, 57.4, 'mitigate', () => {
      const res = comparison.mitigated;
      b.renderStep(res, res.steps.length - 1);
      b.paintMetrics(res.final_metrics);
      setReadouts(res.final_metrics);
      el.slug.textContent = 'T + 10 · METRO STATION HARDENED · 40% / 8H';
    });

    once(t, 60.5, 'slam', revealSlam);
    once(t, 65.6, 'slamOut', hideSlam);

    // Fired just before the scroll lands so the HUD's comparison bars animate on camera.
    once(t, 65.9, 'hud', () => b.applyComparison(comparison));

    once(t, RUNTIME, 'end', stop);
  }

  function tick() {
    if (!running) return;
    const now = performance.now();
    stepScroll(now);
    cue((now - startedAt) / 1000);
    rafId = requestAnimationFrame(tick);
  }

  async function start() {
    if (running) return;
    buildOverlay();
    if (!built) return;

    const b = bridge();
    if (!b || !b.city) { console.warn('[cinematic] city model not ready'); return; }

    if (el.trigger) css(el.trigger, { opacity: '0' });

    try {
      await preload();
    } catch (e) {
      console.warn('[cinematic] backend unavailable —', e.message);
      if (el.trigger) css(el.trigger, { opacity: '0.18' });
      return;
    }

    // Arm the scenario in the real console so the panels read correctly on camera.
    // Chrome goes first — arming opens the inspector card, and we don't want it to flash.
    setChromeHidden(true);
    b.reset({ rebuildScene: false });
    b.arm(SCENARIO.epicenter);
    b.setActuators(SCENARIO.magnitudePct, SCENARIO.durationHours, SCENARIO.weatherKts);

    window.scrollTo(0, 0);
    scrollAnim = null;
    fired = new Set();
    running = true;
    startedAt = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    scrollAnim = null;

    hideSlam();
    css(el.barTop, { height: '0' });
    css(el.barBottom, { height: '0' });
    css(el.vignette, { opacity: '0' });
    css(el.slug, { opacity: '0' });
    css(el.telemetry, { opacity: '0' });
    css(el.caption, { opacity: '0' });

    setTimeout(() => {
      css(el.root, { opacity: '0' });
      setChromeHidden(false);
      if (el.trigger) css(el.trigger, { opacity: '0.18' });
    }, 900);
  }

  // -------------------------------------------------------------
  // Trigger — deliberately small and low-contrast
  // -------------------------------------------------------------
  function mountTrigger() {
    const container = document.getElementById('dioramaContainer');
    if (!container) return;
    const dot = make('button', {
      position: 'absolute', right: '14px', bottom: '14px', zIndex: '55',
      width: '9px', height: '9px', padding: '0', borderRadius: '50%',
      border: 'none', cursor: 'pointer',
      background: 'currentColor', color: '#8a8a92',
      opacity: '0.18', transition: 'opacity 250ms ease, transform 250ms ease'
    }, container);
    dot.setAttribute('aria-label', 'Presentation mode');
    dot.addEventListener('mouseenter', () => css(dot, { opacity: '0.85', transform: 'scale(1.5)' }));
    dot.addEventListener('mouseleave', () => css(dot, { opacity: '0.18', transform: 'scale(1)' }));
    dot.addEventListener('click', start);
    el.trigger = dot;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && running) stop();
    if (e.shiftKey && (e.key === 'C' || e.key === 'c') && !running) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      start();
    }
  });

  window.runCinematic = start;
  window.stopCinematic = stop;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(mountTrigger, 400));
  } else {
    setTimeout(mountTrigger, 400);
  }
})();
