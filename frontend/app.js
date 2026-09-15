/**
 * CASCADING FLOWS // Urban Resilience & Poly Bridge 3D Structural Simulation
 * ==============================================================================
 * Controller bridging Diorama UI with Poly Bridge 3D WebGL Engine & Cascade Physics
 */

(function () {
  'use strict';

  // --- State ---
  let cityData = null;
  let simulationResult = null;
  let currentStepIndex = 0;
  let isPlaying = false;   // the playback clock only runs once a cascade has been simulated
  let playbackSpeed = 2;
  let simSeconds = 0;
  let activeFocus = 'T-01';
  let polybridge = null;
  let currentViewMode = '3d'; // '3d' or 'svg'
  // Set by the hypothesis bar when a question names more than one asset at once ("what if
  // X and Y both fail?"). While set, solveCascade() simulates all of them simultaneously
  // (a compound event) instead of just the single focused asset. Cleared by any single-asset
  // selection (3D click, dropdown, preset pill, focus button, reset).
  let compoundNodeIds = null;

  // Node details mapped to Diorama taxonomy & FEA stress models
  const nodeDetails = {
    'T-01': {
      backendId: 'road_3_2', // Central Bridge
      title: 'Central Bridge',
      tension: '142.8% [Overload]',
      status: 'CRITICAL STRAIN',
      mat: 'Nordic Pine Deck & Steel Cable',
      impact: 'Downtown Power Station, Downtown Metro Station, Central Hospital (Ambulance)',
      shearTime: '14m 20s',
      pop: 185000,
      strainPct: '+18.4% strain',
      congestionKm: '78.6 km',
      congestionRatio: '190% Baseline',
      traumaDelay: '+34m Delay',
      corridorsSevered: '3 Corridors',
      powerDeficit: '380 MWh',
      stabilizationTime: '38h 45m',
      bars: { transit: 89.4, grid: 76.8, med: 41.2 },
      trussColors: ['#c85a32', '#e03e2d', '#ba1a1a', '#e03e2d', '#c85a32'],
      badge: '142% OVERLOAD',
      slider: {
        magnitude: 85,
        duration: 8.0,
        weather: 48,
        strainLimit: '450 MPa',
        batteryBuffer: '12.5h Reserve'
      },
      beforeAfter: {
        popBaseline: '48,200 citizens',
        popMitigated: '12,400 citizens',
        popDelta: '74% Reduction',
        popPct: 26,
        transitBaseline: '+140% delay',
        transitMitigated: '+25% delay',
        transitDelta: '82% Efficiency Gain',
        transitPct: 18,
        failuresBaseline: '12 assets failed',
        failuresMitigated: '2 isolated nodes',
        failuresDelta: '83% Cascade Prevention',
        failuresPct: 17,
        ratio: '4.2x'
      },
      matrix: { E: 0.72, T: 0.95, H: 0.84, W: 0.25, mult: '3.4x' }
    },
    'H-01': {
      backendId: 'hosp_central', // Central Hospital
      title: 'Central Hospital',
      tension: '92.4% [Near Capacity]',
      status: 'ISOLATION THREAT',
      mat: 'Reinforced Concrete & Heliport',
      impact: 'Metro Sectors 7, 8, 9 Intakes',
      shearTime: 'Generator 14h',
      pop: 245000,
      strainPct: '+24.6% strain',
      congestionKm: '92.4 km',
      congestionRatio: '210% Baseline',
      traumaDelay: '+48m Delay',
      corridorsSevered: '5 Corridors',
      powerDeficit: '290 MWh',
      stabilizationTime: '44h 15m',
      bars: { transit: 72.0, grid: 65.4, med: 88.6 },
      trussColors: ['#3d6a4e', '#d86b3d', '#c85a32', '#d86b3d', '#3d6a4e'],
      badge: '92% CAPACITY',
      slider: {
        magnitude: 80,
        duration: 6.0,
        weather: 24,
        strainLimit: '280 MPa',
        batteryBuffer: '14.0h Reserve'
      },
      beforeAfter: {
        popBaseline: '62,500 citizens',
        popMitigated: '14,800 citizens',
        popDelta: '76% Reduction',
        popPct: 24,
        transitBaseline: '+185% delay',
        transitMitigated: '+30% delay',
        transitDelta: '84% Efficiency Gain',
        transitPct: 16,
        failuresBaseline: '15 assets failed',
        failuresMitigated: '3 isolated nodes',
        failuresDelta: '80% Cascade Prevention',
        failuresPct: 20,
        ratio: '4.8x'
      },
      matrix: { E: 0.45, T: 0.68, H: 0.98, W: 0.35, mult: '3.1x' }
    },
    'E-01': {
      backendId: 'sub_downtown', // Downtown Power Station
      title: 'Downtown Power Station',
      tension: '108.6% [Thermal Trip]',
      status: 'OVERHEATING',
      mat: 'Step-down Bus & Hydro Conduit',
      impact: 'Downtown Grid & Bridge Power',
      shearTime: '22m 10s',
      pop: 310000,
      strainPct: '+31.2% strain',
      congestionKm: '64.2 km',
      congestionRatio: '175% Baseline',
      traumaDelay: '+26m Delay',
      corridorsSevered: '2 Corridors',
      powerDeficit: '520 MWh',
      stabilizationTime: '52h 30m',
      bars: { transit: 64.2, grid: 95.8, med: 54.0 },
      trussColors: ['#d86b3d', '#e03e2d', '#c85a32', '#d86b3d', '#3d6a4e'],
      badge: '108% THERMAL',
      slider: {
        magnitude: 100,
        duration: 10.0,
        weather: 38,
        strainLimit: '600 MVA',
        batteryBuffer: '8.0h Reserve'
      },
      beforeAfter: {
        popBaseline: '84,000 citizens',
        popMitigated: '18,200 citizens',
        popDelta: '78% Reduction',
        popPct: 22,
        transitBaseline: '+120% delay',
        transitMitigated: '+20% delay',
        transitDelta: '83% Efficiency Gain',
        transitPct: 17,
        failuresBaseline: '18 assets failed',
        failuresMitigated: '3 isolated nodes',
        failuresDelta: '83% Cascade Prevention',
        failuresPct: 17,
        ratio: '5.2x'
      },
      matrix: { E: 0.98, T: 0.82, H: 0.88, W: 0.65, mult: '4.5x' }
    },
    'T-02': {
      backendId: 'road_3_4', // Downtown Metro Station
      title: 'Downtown Metro Station',
      tension: '84.0% [Heavy Delay]',
      status: 'CONGESTED',
      mat: 'Japandi Glulam Timber & Steel',
      impact: 'East/West Commuter Loops',
      shearTime: 'Stable Flow',
      pop: 142000,
      strainPct: '+12.1% strain',
      congestionKm: '45.0 km',
      congestionRatio: '145% Baseline',
      traumaDelay: '+18m Delay',
      corridorsSevered: '1 Corridor',
      powerDeficit: '180 MWh',
      stabilizationTime: '24h 00m',
      bars: { transit: 84.0, grid: 52.0, med: 35.0 },
      trussColors: ['#3d6a4e', '#3d6a4e', '#d86b3d', '#3d6a4e', '#3d6a4e'],
      badge: '84% CONGESTION',
      slider: {
        magnitude: 65,
        duration: 4.0,
        weather: 20,
        strainLimit: '320 kN',
        batteryBuffer: '16.0h Reserve'
      },
      beforeAfter: {
        popBaseline: '36,400 citizens',
        popMitigated: '8,600 citizens',
        popDelta: '76% Reduction',
        popPct: 24,
        transitBaseline: '+95% delay',
        transitMitigated: '+18% delay',
        transitDelta: '81% Efficiency Gain',
        transitPct: 19,
        failuresBaseline: '9 assets failed',
        failuresMitigated: '1 isolated node',
        failuresDelta: '89% Cascade Prevention',
        failuresPct: 11,
        ratio: '3.9x'
      },
      matrix: { E: 0.38, T: 0.88, H: 0.42, W: 0.15, mult: '2.4x' }
    },
    'E-02': {
      backendId: 'sub_north',
      title: 'North Power Station',
      tension: '79.2% [Elevated]',
      status: 'HEAVY LOAD',
      mat: 'High-Voltage Switchyard',
      impact: 'North Riverfront & Transit Feed',
      shearTime: 'Stable Flow',
      pop: 118000,
      strainPct: '+14.5% strain',
      congestionKm: '38.0 km',
      congestionRatio: '135% Baseline',
      traumaDelay: '+12m Delay',
      corridorsSevered: '1 Corridor',
      powerDeficit: '210 MWh',
      stabilizationTime: '28h 00m',
      bars: { transit: 55.0, grid: 88.0, med: 40.0 },
      trussColors: ['#3d6a4e', '#d86b3d', '#3d6a4e', '#d86b3d', '#3d6a4e'],
      badge: '79% LOAD',
      slider: {
        magnitude: 75,
        duration: 6.0,
        weather: 32,
        strainLimit: '420 MVA',
        batteryBuffer: '11.0h Reserve'
      },
      beforeAfter: {
        popBaseline: '42,000 citizens',
        popMitigated: '9,800 citizens',
        popDelta: '77% Reduction',
        popPct: 23,
        transitBaseline: '+75% delay',
        transitMitigated: '+15% delay',
        transitDelta: '80% Efficiency Gain',
        transitPct: 20,
        failuresBaseline: '8 assets failed',
        failuresMitigated: '1 isolated node',
        failuresDelta: '88% Cascade Prevention',
        failuresPct: 12,
        ratio: '4.1x'
      },
      matrix: { E: 0.85, T: 0.45, H: 0.55, W: 0.40, mult: '2.8x' }
    },
    'W-01': {
      backendId: 'clinic_south',
      title: 'Water Treatment Plant',
      tension: '74.0% [Nominal]',
      status: 'STABLE PUMPING',
      mat: 'Hydraulic Turbines & Intake Sluice',
      impact: 'South Bay & Hospital Backup Line',
      shearTime: 'Optimal',
      pop: 96000,
      strainPct: '+10.2% strain',
      congestionKm: '26.0 km',
      congestionRatio: '120% Baseline',
      traumaDelay: '+8m Delay',
      corridorsSevered: '0 Corridors',
      powerDeficit: '95 MWh',
      stabilizationTime: '18h 00m',
      bars: { transit: 40.0, grid: 62.0, med: 78.0 },
      trussColors: ['#3d6a4e', '#3d6a4e', '#3d6a4e', '#3d6a4e', '#3d6a4e'],
      badge: '74% PRESSURE',
      slider: {
        magnitude: 70,
        duration: 8.0,
        weather: 26,
        strainLimit: '350 PSI',
        batteryBuffer: '18.0h Reserve'
      },
      beforeAfter: {
        popBaseline: '51,000 citizens',
        popMitigated: '11,500 citizens',
        popDelta: '77% Reduction',
        popPct: 23,
        transitBaseline: '+50% delay',
        transitMitigated: '+10% delay',
        transitDelta: '80% Efficiency Gain',
        transitPct: 20,
        failuresBaseline: '10 assets failed',
        failuresMitigated: '2 isolated nodes',
        failuresDelta: '80% Cascade Prevention',
        failuresPct: 20,
        ratio: '3.8x'
      },
      matrix: { E: 0.52, T: 0.30, H: 0.75, W: 0.95, mult: '3.2x' }
    }
  };

  // -------------------------------------------------------------
  // 1. Initialization
  // -------------------------------------------------------------
  async function init() {
    initMatrixTable();
    setupDomHandlers();
    setupTimelineLoop();
    initPolyBridge3DEngine();

    // Fetch live city data from backend
    try {
      const res = await fetch('/api/city');
      if (res.ok) {
        cityData = await res.json();
      }
    } catch (e) {
      console.warn('API fetch offline, initializing local Metropolis-7 model.');
    }

    if (!cityData) {
      cityData = createLocalCityModel();
    }

    // Failure Point menu now has a full asset inventory to offer
    renderFailurePointList();

    // Pass data into 3D engine
    if (polybridge && cityData) {
      polybridge.updateScene(cityData, simulationResult, 0);
    }

    // Default select Central Bridge (data only — keep the inspector card closed until the
    // user actually clicks a building or picks an asset)
    window.selectNode('T-01', { reveal: false });

    // Start calm: nothing has failed until the user runs a scenario. (The 3D scene was already
    // built failure-free above, so skip the rebuild.)
    applyNominalBaseline({ rebuildScene: false });
  }

  // -------------------------------------------------------------
  // 2. 3D WebGL Poly Bridge Engine Initialization
  // -------------------------------------------------------------
  function initPolyBridge3DEngine() {
    const canvas = document.getElementById('polybridge3dCanvas');
    if (!canvas) return;

    if (typeof PolyBridge3D === 'undefined' && window.PolyBridge3D) {
      // already attached
    }

    if (typeof window.PolyBridge3D !== 'function') {
      console.warn('PolyBridge3D class not yet loaded.');
      return;
    }

    polybridge = new window.PolyBridge3D(canvas, {
      onSelectNode: (node) => {
        if (!node) return;
        handle3DNodeClick(node);
      },
      onHoverNode: (node, coords) => {
        handle3DNodeHover(node, coords);
      },
      onBackgroundClick: () => {
        hideInspector();
      }
    });

    window.polybridgeInstance = polybridge;
  }

  // Resolves a raw city-graph node (as returned by /api/city or /api/nl-query lookups) to a
  // nodeDetails key, building a full inspector profile for it on first use if it isn't one of
  // the 4 primary presets. Shared by 3D canvas clicks and the hypothesis bar so both paths
  // (and any future one) target the exact same asset the same way.
  function ensureNodeDetails(node) {
    const reverseMap = {
      'road_3_2': 'T-01',
      'hosp_central': 'H-01',
      'sub_downtown': 'E-01',
      'road_3_4': 'T-02'
    };

    const targetKey = reverseMap[node.id] || node.id;

    // If dynamic node, populate nodeDetails entry with complete profiles
    if (!nodeDetails[targetKey]) {
      const loadRatio = node.load / Math.max(1, node.capacity);
      const isStressed = loadRatio > 1.0;
      const basePop = node.population_served || 35000;
      const mitPop = Math.round(basePop * 0.28);
      const popRed = Math.round(((basePop - mitPop) / basePop) * 100);

      nodeDetails[targetKey] = {
        backendId: node.id,
        title: node.name,
        tension: `${Math.round(loadRatio * 100)}% [${isStressed ? 'Overload' : 'Nominal'}]`,
        status: node.status === 'failed' ? 'FAILED' : (isStressed ? 'CRITICAL STRAIN' : 'OPERATIONAL'),
        mat: node.domain === 'power' ? 'Step-down Transformer & High-Voltage Bus' : (node.domain === 'health' ? 'Reinforced Concrete & Heliport' : 'Steel Truss & Asphalt Pavement'),
        impact: `Downstream Sector: ${node.district}`,
        shearTime: isStressed ? '28m 40s' : 'Stable Flow',
        pop: basePop,
        strainPct: `+${Math.round(loadRatio * 20)}% strain`,
        congestionKm: `${Math.round(loadRatio * 60)} km`,
        congestionRatio: `${Math.round(loadRatio * 140)}% Baseline`,
        traumaDelay: `+${Math.round(loadRatio * 24)}m Delay`,
        corridorsSevered: isStressed ? '2 Corridors' : '0 Corridors',
        powerDeficit: node.domain === 'power' ? `${Math.round(node.load)} MWh` : '120 MWh',
        stabilizationTime: '32h 00m',
        bars: {
          transit: Math.min(100, Math.round(loadRatio * 85)),
          grid: node.domain === 'power' ? 95 : 60,
          med: node.domain === 'health' ? 90 : 45
        },
        trussColors: isStressed ? ['#c85a32', '#ba1a1a', '#ba1a1a', '#e03e2d', '#c85a32'] : ['#3d6a4e', '#3d6a4e', '#3d6a4e', '#3d6a4e', '#3d6a4e'],
        badge: `${Math.round(loadRatio * 100)}% LOAD`,
        slider: {
          magnitude: Math.min(100, Math.round(loadRatio * 90)),
          duration: 8.0,
          weather: 25,
          strainLimit: `${Math.round(loadRatio * 400)} MPa`,
          batteryBuffer: '12.0h Reserve'
        },
        beforeAfter: {
          popBaseline: `${Number(basePop).toLocaleString()} citizens`,
          popMitigated: `${Number(mitPop).toLocaleString()} citizens`,
          popDelta: `${popRed}% Reduction`,
          popPct: Math.round((mitPop / basePop) * 100),
          transitBaseline: `+${Math.round(loadRatio * 120)}% delay`,
          transitMitigated: `+${Math.round(loadRatio * 25)}% delay`,
          transitDelta: '80% Efficiency Gain',
          transitPct: 20,
          failuresBaseline: '10 assets failed',
          failuresMitigated: '2 isolated nodes',
          failuresDelta: '80% Cascade Prevention',
          failuresPct: 20,
          ratio: '3.9x'
        },
        matrix: {
          E: node.domain === 'power' ? 0.95 : 0.40,
          T: node.domain === 'road' ? 0.90 : 0.35,
          H: node.domain === 'health' ? 0.95 : 0.30,
          W: 0.25,
          mult: '3.0x'
        }
      };
    }

    return targetKey;
  }

  function handle3DNodeClick(node) {
    window.selectNode(ensureNodeDetails(node));
  }

  function handle3DNodeHover(node, coords) {
    const tooltip = document.getElementById('polybridge3dTooltip');
    if (!tooltip) return;

    if (!node || !coords) {
      tooltip.classList.add('hidden');
      return;
    }

    const ttName = document.getElementById('ttName');
    const ttDomain = document.getElementById('ttDomain');
    const ttLoad = document.getElementById('ttLoad');

    if (ttName) ttName.textContent = node.name;
    if (ttDomain) ttDomain.textContent = (node.domain || 'INFRA').toUpperCase();
    if (ttLoad) {
      const pct = Math.round((node.load / Math.max(1, node.capacity)) * 100);
      ttLoad.textContent = `Load: ${pct}%`;
      ttLoad.className = pct > 100 ? 'text-terracotta font-semibold' : 'text-moss font-semibold';
    }

    const rect = document.getElementById('dioramaContainer').getBoundingClientRect();
    const x = coords.x - rect.left + 14;
    const y = coords.y - rect.top + 14;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // 3. Node Selection & Inspector Card Update
  // -------------------------------------------------------------
  function showInspector() {
    const overlay = document.getElementById('inspectorOverlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  function hideInspector() {
    const overlay = document.getElementById('inspectorOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // opts.reveal (default true) controls whether the floating inspector card is opened.
  // Pass { reveal: false } for background/initialization selections that should update
  // state without popping the card open on top of the diorama.
  window.selectNode = function (nodeId, opts) {
    activeFocus = nodeId;
    // Selecting a single asset always means "focus just this one" — the hypothesis bar
    // re-arms compound mode right after this call when the question named several assets.
    compoundNodeIds = null;
    const data = nodeDetails[nodeId] || nodeDetails['T-01'];
    if (!opts || opts.reveal !== false) showInspector();

    // Update 3D engine target marker
    if (polybridge) {
      polybridge.selectedNodeId = data.backendId;
    }

    // Inspector Card UI
    const titleEl = document.getElementById('inspectTitle');
    const statusEl = document.getElementById('inspectStatus');
    const tensionEl = document.getElementById('inspectTension');
    const matEl = document.getElementById('inspectMat');
    const impactEl = document.getElementById('inspectImpact');
    const shearEl = document.getElementById('inspectShear');
    const badgeEl = document.getElementById('bridgeOverloadBadge');

    if (titleEl) titleEl.textContent = data.title;
    if (statusEl) statusEl.textContent = data.status;
    if (tensionEl) tensionEl.textContent = data.tension;
    if (matEl) matEl.textContent = data.mat;
    if (impactEl) impactEl.textContent = data.impact;
    if (shearEl) shearEl.textContent = data.shearTime;
    if (badgeEl) badgeEl.textContent = data.badge;

    // Dropdown Sync (legacy 4-option select, if a page still has one)
    const select = document.getElementById('focusAssetSelect');
    if (select && select.value !== nodeId) {
      const matchOpt = Array.from(select.options).find(o => o.value === nodeId);
      if (matchOpt) select.value = nodeId;
    }

    // Failure Point menu trigger + info chips
    syncFailurePointTrigger(nodeId);

    // Preset pills highlight
    document.querySelectorAll('.preset-pill').forEach(pill => {
      const wanted = nodeId === 'T-01' ? ['harbor', 'bridge'] : (nodeId === 'E-01' ? ['substation'] : (nodeId === 'H-01' ? ['hospital'] : []));
      const isMatch = wanted.includes(pill.dataset.preset);
      pill.classList.toggle('border-stone-dark', isMatch);
      pill.classList.toggle('bg-surface-container', isMatch);
    });

    updateSlidersForNode(nodeId, data);
    updateMatrixHighlight(nodeId);
    if (simulationResult) {
      updateTelemetry(data);
      updateBeforeAfterHud(nodeId, data);
      updateTrussColors(data.trussColors);
    } else {
      // Nothing has failed yet: keep every readout at baseline and just arm this asset.
      renderNominalTelemetry();
    }
  };

  // -------------------------------------------------------------
  // 3b. Failure Point Menu — every city asset as an initiating-failure candidate
  // -------------------------------------------------------------
  // Replaces the old 4-option "Focus Element" <select>. Lists all nodes from cityData
  // (73 in Metropolis-7: 10 grid, 7 healthcare, 56 road), grouped by domain, searchable and
  // keyboard-navigable. Picking one routes through the exact same path as a 3D click
  // (ensureNodeDetails -> selectNode), pans the 3D camera to it, and re-solves the cascade
  // with the current actuator settings so the choice is reflected immediately.
  const FP_DOMAIN_META = {
    power:  { order: 0, label: 'POWER GRID',   icon: 'bolt',           dot: 'bg-amber-warm', text: 'text-amber-warm', soft: 'bg-amber-soft',      chip: 'bg-amber-soft text-amber-warm' },
    health: { order: 1, label: 'HEALTHCARE',   icon: 'local_hospital', dot: 'bg-terracotta', text: 'text-terracotta', soft: 'bg-terracotta-soft', chip: 'bg-terracotta-soft text-terracotta' },
    road:   { order: 2, label: 'ROAD NETWORK', icon: 'signpost',       dot: 'bg-moss',       text: 'text-moss-dark',  soft: 'bg-moss-soft',       chip: 'bg-moss-soft text-moss-dark' }
  };
  const FP_TYPE_ICON = { bridge: 'route', hospital: 'local_hospital', clinic: 'medical_services', substation: 'bolt', power_hub: 'electrical_services', intersection: 'signpost' };

  const fpState = { open: false, domain: 'all', query: '', highlight: -1, visible: [] };

  function fpEscape(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function fpDomainMeta(domain) {
    return FP_DOMAIN_META[domain] || FP_DOMAIN_META.road;
  }

  function fpTypeLabel(type) {
    return String(type || 'asset').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function fpLoadPct(node) {
    return Math.round((Number(node.load) || 0) / Math.max(1, Number(node.capacity) || 0) * 100);
  }

  function fpLoadPillClass(pct) {
    if (pct > 100) return 'bg-terracotta-soft text-terracotta';
    if (pct >= 85) return 'bg-amber-soft text-amber-warm';
    return 'bg-moss-soft text-moss-dark';
  }

  // Rank of each node in the precomputed Brandes betweenness ranking (1 = worst SPOF).
  function fpCriticalRanks() {
    const ranks = {};
    if (cityData && Array.isArray(cityData.critical_assets)) {
      cityData.critical_assets.forEach((a, i) => { if (a && a.node_id) ranks[a.node_id] = i + 1; });
    }
    return ranks;
  }

  // Which nodes the *last* simulation broke, so the list can show it inline.
  function fpNodeStatus(nodeId) {
    if (!simulationResult) return null;
    if ((simulationResult.failed_node_ids || []).includes(nodeId)) return 'FAILED';
    if ((simulationResult.degraded_node_ids || []).includes(nodeId)) return 'DEGRADED';
    return null;
  }

  function fpCurrentBackendId() {
    const d = nodeDetails[activeFocus];
    return d ? d.backendId : activeFocus;
  }

  function fpAllNodes() {
    if (!cityData || !Array.isArray(cityData.nodes)) return [];
    return cityData.nodes.slice().sort((a, b) => {
      const da = fpDomainMeta(a.domain).order, db = fpDomainMeta(b.domain).order;
      if (da !== db) return da - db;
      const pa = Number(a.population_served) || 0, pb = Number(b.population_served) || 0;
      if (pa !== pb) return pb - pa; // most people served first within a domain
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function fpFilteredNodes() {
    const q = fpState.query.trim().toLowerCase();
    return fpAllNodes().filter(n => {
      if (fpState.domain !== 'all' && n.domain !== fpState.domain) return false;
      if (!q) return true;
      const hay = `${n.name} ${n.id} ${n.type || ''} ${n.district || ''} ${fpTypeLabel(n.type)}`.toLowerCase();
      return q.split(/\s+/).every(term => hay.includes(term));
    });
  }

  function renderFailurePointList() {
    const list = document.getElementById('failurePointList');
    const count = document.getElementById('failurePointCount');
    if (!list) return;

    const nodes = fpFilteredNodes();
    const total = fpAllNodes().length;
    fpState.visible = nodes;
    if (fpState.highlight >= nodes.length) fpState.highlight = nodes.length - 1;

    if (count) {
      count.textContent = nodes.length === total ? `${total} assets` : `${nodes.length} of ${total} assets`;
    }

    if (!nodes.length) {
      list.innerHTML = '<div class="text-[11px] text-stone-light text-center py-6">No assets match that search.</div>';
      return;
    }

    const ranks = fpCriticalRanks();
    const currentId = fpCurrentBackendId();
    let html = '';
    let lastDomain = null;

    nodes.forEach((node, idx) => {
      const meta = fpDomainMeta(node.domain);
      if (node.domain !== lastDomain) {
        lastDomain = node.domain;
        const domainCount = nodes.filter(n => n.domain === node.domain).length;
        html += `<div class="px-2.5 pt-2 pb-1 text-[10px] font-mono tracking-wider text-stone flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>${meta.label} · ${domainCount}
        </div>`;
      }

      const selected = node.id === currentId;
      const highlighted = idx === fpState.highlight;
      const pct = fpLoadPct(node);
      const rank = ranks[node.id];
      const status = fpNodeStatus(node.id);
      const icon = FP_TYPE_ICON[node.type] || meta.icon;
      const rowClass = selected
        ? 'bg-moss-soft ring-1 ring-moss/40'
        : (highlighted ? 'bg-surface-container' : 'hover:bg-surface-container/60');

      html += `<button type="button" role="option" aria-selected="${selected}" data-node-id="${fpEscape(node.id)}" data-index="${idx}"
          class="fp-option w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors ${rowClass}">
        <span class="w-6 h-6 rounded-lg ${meta.soft} ${meta.text} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[15px]">${icon}</span>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-semibold text-stone-dark truncate">${fpEscape(node.name)}</span>
          <span class="block text-[10px] text-stone font-mono truncate">${fpEscape(node.id)} · ${fpEscape(fpTypeLabel(node.type))} · ${fpEscape(node.district || '')}</span>
        </span>
        ${rank ? `<span class="hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-terracotta-soft text-terracotta shrink-0" title="Single point of failure rank">SPOF #${rank}</span>` : ''}
        ${status ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded-full ${status === 'FAILED' ? 'bg-terracotta text-white' : 'bg-amber-soft text-amber-warm'} shrink-0" title="State after the last cascade run">${status}</span>` : ''}
        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded-full ${fpLoadPillClass(pct)} shrink-0" title="Baseline load / capacity">${pct}%</span>
        <span class="material-symbols-outlined text-[15px] text-moss shrink-0 ${selected ? '' : 'invisible'}">check</span>
      </button>`;
    });

    list.innerHTML = html;

    if (fpState.highlight >= 0) {
      const el = list.querySelector(`[data-index="${fpState.highlight}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }

  // Keeps the trigger button + info chips in step with whatever is focused, no matter which
  // path selected it (this menu, a 3D click, a preset pill, the hypothesis bar, reset).
  function syncFailurePointTrigger(nodeKey) {
    const d = nodeDetails[nodeKey];
    const backendId = d ? d.backendId : nodeKey;
    const node = cityData && Array.isArray(cityData.nodes) ? cityData.nodes.find(n => n.id === backendId) : null;

    const nameEl = document.getElementById('fpBtnName');
    const idEl = document.getElementById('fpBtnId');
    const iconEl = document.getElementById('fpBtnIcon');
    const loadEl = document.getElementById('fpBtnLoad');
    const domainChip = document.getElementById('fpDomainChip');
    const districtChip = document.getElementById('fpDistrictChip');
    const popChip = document.getElementById('fpPopChip');
    const critChip = document.getElementById('fpCritChip');
    if (!nameEl) return;

    if (!node) {
      nameEl.textContent = d ? d.title : nodeKey;
      if (idEl) idEl.textContent = backendId;
      return;
    }

    const meta = fpDomainMeta(node.domain);
    const pct = fpLoadPct(node);
    const rank = fpCriticalRanks()[node.id];

    nameEl.textContent = node.name;
    if (idEl) idEl.textContent = node.id;
    if (iconEl) {
      iconEl.textContent = FP_TYPE_ICON[node.type] || meta.icon;
      iconEl.className = `material-symbols-outlined text-[16px] ${meta.text} shrink-0`;
    }
    if (loadEl) {
      loadEl.textContent = `${pct}% Load`;
      loadEl.className = `ml-auto text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${fpLoadPillClass(pct)} shrink-0`;
    }
    if (domainChip) {
      domainChip.textContent = meta.label;
      domainChip.className = `px-2 py-0.5 rounded-full ${meta.chip} font-semibold`;
    }
    if (districtChip) districtChip.textContent = node.district || '—';
    if (popChip) {
      const pop = Number(node.population_served) || 0;
      popChip.textContent = pop >= 1000 ? `${Math.round(pop / 1000)}k served` : `${pop} served`;
    }
    if (critChip) {
      critChip.classList.toggle('hidden', !rank);
      if (rank) critChip.textContent = `SPOF #${rank}`;
    }

    if (fpState.open) renderFailurePointList();
    syncActuatorsSummary();
  }

  function openFailurePointMenu() {
    const menu = document.getElementById('failurePointMenu');
    const btn = document.getElementById('failurePointBtn');
    const chevron = document.getElementById('fpBtnChevron');
    const search = document.getElementById('failurePointSearch');
    if (!menu) return;
    fpState.open = true;
    // Fresh search each time (the domain filter is kept), so a stale query never hides assets.
    fpState.query = '';
    if (search) search.value = '';
    // Start with the current failure point highlighted so ↑/↓ moves relative to it.
    const currentId = fpCurrentBackendId();
    fpState.highlight = Math.max(0, fpFilteredNodes().findIndex(n => n.id === currentId));
    menu.classList.remove('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    renderFailurePointList();
    if (search) search.focus();
  }

  function closeFailurePointMenu(opts) {
    const menu = document.getElementById('failurePointMenu');
    const btn = document.getElementById('failurePointBtn');
    const chevron = document.getElementById('fpBtnChevron');
    if (!menu) return;
    fpState.open = false;
    menu.classList.add('hidden');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      if (opts && opts.refocus) btn.focus();
    }
    if (chevron) chevron.style.transform = '';
  }

  // Picks `nodeId` (a raw city-graph id, e.g. "sub_north") as the initiating failure.
  function selectFailurePoint(nodeId, opts) {
    const node = cityData && Array.isArray(cityData.nodes) ? cityData.nodes.find(n => n.id === nodeId) : null;
    if (!node) return;
    const key = ensureNodeDetails(node);
    window.selectNode(key);
    if (polybridge && typeof polybridge.focusOnNode === 'function') polybridge.focusOnNode(node.id);
    closeFailurePointMenu({ refocus: true });
    if (!opts || opts.solve !== false) solveCascade();
  }

  function moveFailurePointHighlight(delta) {
    const n = fpState.visible.length;
    if (!n) return;
    fpState.highlight = ((fpState.highlight < 0 ? (delta > 0 ? -1 : 0) : fpState.highlight) + delta + n) % n;
    renderFailurePointList();
  }

  function setupFailurePointMenu() {
    const panel = document.getElementById('failurePointPanel');
    const btn = document.getElementById('failurePointBtn');
    const menu = document.getElementById('failurePointMenu');
    const search = document.getElementById('failurePointSearch');
    const list = document.getElementById('failurePointList');
    if (!panel || !btn || !menu) return;

    btn.addEventListener('click', () => {
      if (fpState.open) closeFailurePointMenu(); else openFailurePointMenu();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!fpState.open) openFailurePointMenu();
      }
    });

    if (search) {
      search.addEventListener('input', () => {
        fpState.query = search.value;
        fpState.highlight = fpFilteredNodes().length ? 0 : -1;
        renderFailurePointList();
      });
    }

    document.querySelectorAll('.fp-filter').forEach(chip => {
      chip.addEventListener('click', () => {
        fpState.domain = chip.dataset.domain || 'all';
        document.querySelectorAll('.fp-filter').forEach(c => {
          const active = c === chip;
          c.classList.toggle('bg-stone-dark', active);
          c.classList.toggle('text-white', active);
          c.classList.toggle('bg-surface-dim', !active);
          c.classList.toggle('hover:bg-surface-container', !active);
        });
        fpState.highlight = fpFilteredNodes().length ? 0 : -1;
        renderFailurePointList();
        if (search) search.focus();
      });
    });

    if (list) {
      list.addEventListener('click', (e) => {
        const option = e.target.closest('.fp-option');
        if (option && option.dataset.nodeId) selectFailurePoint(option.dataset.nodeId);
      });
      list.addEventListener('mousemove', (e) => {
        const option = e.target.closest('.fp-option');
        if (!option) return;
        const idx = Number(option.dataset.index);
        if (!Number.isNaN(idx) && idx !== fpState.highlight) {
          fpState.highlight = idx;
          list.querySelectorAll('.fp-option').forEach(o => {
            const isHi = Number(o.dataset.index) === idx;
            if (o.getAttribute('aria-selected') === 'true') return;
            o.classList.toggle('bg-surface-container', isHi);
            o.classList.toggle('hover:bg-surface-container/60', !isHi);
          });
        }
      });
    }

    // Keyboard navigation while the menu is open (keys arrive on the search box or list).
    menu.addEventListener('keydown', (e) => {
      if (!fpState.open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveFailurePointHighlight(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveFailurePointHighlight(-1); }
      else if (e.key === 'Home') { e.preventDefault(); fpState.highlight = 0; renderFailurePointList(); }
      else if (e.key === 'End') { e.preventDefault(); fpState.highlight = fpState.visible.length - 1; renderFailurePointList(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = fpState.visible[fpState.highlight] || fpState.visible[0];
        if (pick) selectFailurePoint(pick.id);
      }
      else if (e.key === 'Escape') { e.preventDefault(); closeFailurePointMenu({ refocus: true }); }
    });

    // Click / tap anywhere outside the panel closes it.
    document.addEventListener('mousedown', (e) => {
      if (fpState.open && !panel.contains(e.target)) closeFailurePointMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (fpState.open && e.key === 'Escape' && !menu.contains(e.target)) closeFailurePointMenu({ refocus: true });
    });
  }

  // Exposed so the console / other modules can drive it: window.selectFailurePoint('sub_north')
  window.selectFailurePoint = selectFailurePoint;

  // -------------------------------------------------------------
  // 3d. Harmonic Stress Actuators panel — collapsible console
  // -------------------------------------------------------------
  const ACTUATORS_STORAGE_KEY = 'cf-actuators-open';

  // Header summary chips (visible while collapsed): armed failure point + actuator settings.
  function syncActuatorsSummary() {
    const name = document.getElementById('fpBtnName');
    const mag = document.getElementById('rangeMagnitude');
    const dur = document.getElementById('rangeDuration');
    const wea = document.getElementById('rangeWeather');
    if (name) setText('actSumAsset', name.textContent);
    if (mag) setText('actSumMag', `${Math.round(parseFloat(mag.value))}%`);
    if (dur) setText('actSumDur', `${parseFloat(dur.value)}h`);
    if (wea) {
      const w = parseFloat(wea.value);
      setText('actSumWea', w > 40 ? `${w} KTS` : `${w}°C`);
    }
  }

  function setActuatorsOpen(open, opts) {
    const body = document.getElementById('actuatorsBody');
    const inner = document.getElementById('actuatorsBodyInner');
    const toggle = document.getElementById('actuatorsToggle');
    const chevron = document.getElementById('actuatorsChevron');
    const summary = document.getElementById('actuatorsSummary');
    const tolerance = document.getElementById('actuatorsTolerance');
    if (!body || !inner || !toggle) return;
    const instant = !!(opts && opts.instant);

    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
    if (summary) summary.style.display = open ? 'none' : '';
    if (tolerance) tolerance.style.display = open ? '' : 'none';

    if (instant) body.style.transition = 'none';
    if (open) {
      body.classList.remove('grid-rows-[0fr]');
      body.classList.add('grid-rows-[1fr]');
      if (instant) {
        inner.classList.replace('overflow-hidden', 'overflow-visible');
      } else {
        // Keep clipping until the glide ends, then release so the Failure Point popover can
        // hang below the panel. Guarded so a quick re-collapse can't leave content unclipped.
        const onEnd = (e) => {
          if (e.propertyName !== 'grid-template-rows') return;
          body.removeEventListener('transitionend', onEnd);
          if (toggle.getAttribute('aria-expanded') === 'true') inner.classList.replace('overflow-hidden', 'overflow-visible');
        };
        body.addEventListener('transitionend', onEnd);
      }
    } else {
      closeFailurePointMenu();
      inner.classList.replace('overflow-visible', 'overflow-hidden');
      body.classList.remove('grid-rows-[1fr]');
      body.classList.add('grid-rows-[0fr]');
    }
    if (instant) requestAnimationFrame(() => { body.style.transition = ''; });

    if (!opts || opts.persist !== false) {
      try { localStorage.setItem(ACTUATORS_STORAGE_KEY, open ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    }
  }

  function setupActuatorsPanel() {
    const toggle = document.getElementById('actuatorsToggle');
    if (!toggle) return;
    let open = false;
    try { open = localStorage.getItem(ACTUATORS_STORAGE_KEY) === '1'; } catch (e) { /* default collapsed */ }
    setActuatorsOpen(open, { instant: true, persist: false });
    toggle.addEventListener('click', () => {
      setActuatorsOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    ['rangeMagnitude', 'rangeDuration', 'rangeWeather'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', syncActuatorsSummary);
    });
    syncActuatorsSummary();
  }

  // -------------------------------------------------------------
  // 3c. Nominal baseline — "nothing has failed yet"
  // -------------------------------------------------------------
  // The dashboard only shows damage the engine actually simulated. At startup, and again after
  // Reset State, every readout sits at its calm baseline; selecting an asset merely arms it as
  // the failure point. The first Solve FEA / preset / menu pick flips the readouts to damage
  // telemetry.
  const NOMINAL_SLIDERS = { magnitude: 50, duration: 8, weather: 24 };
  const NOMINAL_TRUSS = ['#3d6a4e', '#3d6a4e', '#3d6a4e', '#3d6a4e', '#3d6a4e'];
  const HARDENING_PLACEHOLDER = '<div class="text-[11px] text-stone-light font-sans text-center py-4">Run a simulation to see which specific assets are worth hardening for this scenario.</div>';
  const NARRATIVE_PLACEHOLDER = '<p class="text-stone-light">Run a simulation to generate a briefing.</p>';

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function setWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${pct}%`;
  }

  // Every readout whose colour flips between calm and damage presentation:
  // [elementId, tone while damage is on screen, tone while nominal]. Whichever of the text /
  // soft-pill / solid-fill classes the element already carries is swapped to the new tone.
  const TONE_CLASSES = {
    terracotta: { text: 'text-terracotta', soft: 'bg-terracotta-soft', fill: 'bg-terracotta' },
    amber:      { text: 'text-amber-warm', soft: 'bg-amber-soft',      fill: 'bg-amber-warm' },
    moss:       { text: 'text-moss',       soft: 'bg-moss-soft',       fill: 'bg-moss' }
  };
  const TELEMETRY_TONES = [
    ['headerStrainBadge', 'terracotta', 'moss'],
    ['telemetryBadge', 'terracotta', 'moss'],
    ['kpiStrainPct', 'terracotta', 'moss'],
    ['kpiCongestionRatio', 'terracotta', 'moss'],
    ['kpiTraumaDelay', 'terracotta', 'moss'],
    ['kpiCorridorsSevered', 'terracotta', 'moss'],
    ['kpiPowerDeficit', 'amber', 'moss'],
    ['barTransitVal', 'terracotta', 'moss'],
    ['barGridVal', 'amber', 'moss'],
    ['barMedVal', 'moss', 'moss'],
    ['barTransitFill', 'terracotta', 'moss'],
    ['barGridFill', 'amber', 'moss'],
    ['barMedFill', 'moss', 'moss'],
    ['inspectStatus', 'terracotta', 'moss'],
    ['inspectTension', 'terracotta', 'moss'],
    ['inspectShear', 'terracotta', 'moss']
  ];

  function paintTelemetry(mode) {
    const all = Object.values(TONE_CLASSES);
    TELEMETRY_TONES.forEach(([id, damaged, nominal]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const tone = TONE_CLASSES[mode === 'nominal' ? nominal : damaged];
      const hasText = all.some(t => el.classList.contains(t.text));
      const hasSoft = all.some(t => el.classList.contains(t.soft));
      const hasFill = all.some(t => el.classList.contains(t.fill));
      all.forEach(t => el.classList.remove(t.text, t.soft, t.fill));
      if (hasText) el.classList.add(tone.text);
      if (hasSoft) el.classList.add(tone.soft);
      if (hasFill) el.classList.add(tone.fill);
    });
    const ping = document.getElementById('inspectPing');
    if (ping) ping.className = mode === 'nominal' ? 'w-2.5 h-2.5 rounded-full bg-moss' : 'w-2.5 h-2.5 rounded-full bg-terracotta animate-ping';
    if (mode === 'nominal') {
      const dot = document.getElementById('headerStatusDot');
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-moss';
    }
  }

  // Baseline utilisation of one network (sum of design load / sum of design capacity), so the
  // domain bars show something true about the city instead of a scenario's stress numbers.
  function baselineDomainLoad(domain) {
    if (!cityData || !Array.isArray(cityData.nodes)) return 0;
    let load = 0, cap = 0;
    cityData.nodes.forEach(n => {
      if (n.domain !== domain) return;
      load += Number(n.base_load != null ? n.base_load : n.load) || 0;
      cap += Number(n.base_capacity != null ? n.base_capacity : n.capacity) || 0;
    });
    return Math.round((load / Math.max(1, cap)) * 1000) / 10;
  }

  // Tri-colour tension bar in the inspector after a run: red = share of the city that failed,
  // amber = degraded, green = still healthy (derived from the run's resilience score).
  function setInspectorStressBar(resilienceScore) {
    const red = Math.max(0, Math.min(100, Math.round(100 - resilienceScore)));
    const amber = Math.min(100 - red, Math.round(red * 0.6));
    setWidth('inspectBarTerra', red);
    setWidth('inspectBarAmber', amber);
    setWidth('inspectBarMoss', 100 - red - amber);
  }

  function renderNominalTelemetry() {
    const data = nodeDetails[activeFocus] || nodeDetails['T-01'];
    const node = cityData && Array.isArray(cityData.nodes) ? cityData.nodes.find(n => n.id === data.backendId) : null;
    const loadPct = node ? fpLoadPct(node) : 0;
    const baseline = (cityData && cityData.baseline_metrics) || {};
    const score = typeof baseline.resilience_score === 'number' ? baseline.resilience_score : 100;

    paintTelemetry('nominal');

    // Header
    setText('headerStatusText', 'All Systems Nominal');
    setText('headerStrainBadge', `${loadPct}% [NOMINAL]`);
    setText('headerSolverText', 'VERLET-4 SOLVER: CALM');

    // Impact telemetry
    setText('telemetryBadge', 'NOMINAL');
    setText('kpiPopAffected', '0');
    setText('kpiStrainPct', '0% strain');
    setText('kpiPopSub', 'No service disruption — every sector operating within design load');
    setText('kpiCongestionRatio', '100% Baseline');
    setText('kpiCongestionKm', '0 km');
    setWidth('flowBarFlowing', 100);
    setWidth('flowBarSlow', 0);
    setWidth('flowBarGridlock', 0);
    setText('kpiTraumaDelay', '+0m Delay');
    setText('kpiCorridorsSevered', '0 Corridors');
    setText('kpiGeneratorReserve', '100% (standby)');
    setText('kpiPowerDeficit', '0 MWh');
    setText('kpiStabilizationTime', 'Stable');
    setText('kpiFeaStatus', 'FEA STABLE');

    // Domain bars = each network's real baseline utilisation
    const bars = { transit: baselineDomainLoad('road'), grid: baselineDomainLoad('power'), med: baselineDomainLoad('health') };
    setWidth('barTransitFill', bars.transit); setText('barTransitVal', `${bars.transit}%`);
    setWidth('barGridFill', bars.grid);       setText('barGridVal', `${bars.grid}%`);
    setWidth('barMedFill', bars.med);         setText('barMedVal', `${bars.med}%`);

    // Before vs. After HUD has nothing to compare yet
    setText('hudEfficacyBadge', 'NO SCENARIO');
    [
      ['hudPopDelta', 'hudPopBaseline', 'hudPopMitigated', 'hudPopBar'],
      ['hudTransitDelta', 'hudTransitBaseline', 'hudTransitMitigated', 'hudTransitBar'],
      ['hudFailuresDelta', 'hudFailuresBaseline', 'hudFailuresMitigated', 'hudFailuresBar']
    ].forEach(([delta, base, mit, bar]) => {
      setText(delta, '—');
      setText(base, 'Baseline (—)');
      setText(mit, 'Mitigated (—)');
      setWidth(bar, 0);
    });
    setText('hudResilienceRatio', 'Resilience Ratio: —');

    // Inspector card + isometric SVG: the focused asset is armed, not failed
    setText('inspectStatus', 'OPERATIONAL');
    setText('inspectTension', `${loadPct}% [Nominal]`);
    setText('inspectShear', 'Stable Flow');
    setWidth('inspectBarMoss', Math.min(100, loadPct));
    setWidth('inspectBarAmber', 0);
    setWidth('inspectBarTerra', 0);
    setText('bridgeOverloadBadge', 'NOMINAL');
    updateTrussColors(NOMINAL_TRUSS);

    setText('footerResilienceIndex', `Resilience Index: ${(score / 10).toFixed(1)} / 10`);
  }

  function resetTimeline() {
    isPlaying = false;
    simSeconds = 0;
    setText('timelineClock', 'T +00:00:00');
    setText('playIcon', 'play_arrow');
    setWidth('scrubberFill', 0);
    const thumb = document.getElementById('scrubberThumb');
    if (thumb) thumb.style.left = '0%';
  }

  function startTimeline() {
    simSeconds = 0;
    isPlaying = true;
    setText('timelineClock', 'T +00:00:00');
    setText('playIcon', 'pause');
  }

  // Full calm state: no result, neutral actuators, baseline readouts, clock stopped, 3D scene
  // rebuilt failure-free. Pass { rebuildScene: false } when the scene is already clean.
  function applyNominalBaseline(opts) {
    simulationResult = null;
    compoundNodeIds = null;

    // Neutral actuator defaults, set silently (no 'input' event, so nothing auto-solves)
    const rangeMag = document.getElementById('rangeMagnitude');
    const rangeDur = document.getElementById('rangeDuration');
    const rangeWea = document.getElementById('rangeWeather');
    if (rangeMag) rangeMag.value = NOMINAL_SLIDERS.magnitude;
    if (rangeDur) rangeDur.value = NOMINAL_SLIDERS.duration;
    if (rangeWea) rangeWea.value = NOMINAL_SLIDERS.weather;
    setText('valMagnitude', `${NOMINAL_SLIDERS.magnitude}% [Elastic]`);
    setText('valDuration', `${NOMINAL_SLIDERS.duration.toFixed(1)} Hours`);
    setText('valWeather', `${NOMINAL_SLIDERS.weather}°C Ambient`);
    syncActuatorsSummary();

    renderNominalTelemetry();
    resetTimeline();

    const hardening = document.getElementById('hardeningList');
    if (hardening) hardening.innerHTML = HARDENING_PLACEHOLDER;
    const log = document.getElementById('narrativeLogBody');
    if (log) log.innerHTML = NARRATIVE_PLACEHOLDER;

    if ((!opts || opts.rebuildScene !== false) && polybridge && cityData) {
      polybridge.updateScene(cityData, null, 0);
    }
    if (fpState.open) renderFailurePointList();
  }

  function updateTelemetry(data) {
    // Top Active Strain Badge in Header
    const headerStrain = document.getElementById('headerStrainBadge');
    if (headerStrain) headerStrain.textContent = data.tension;
    // Scenario numbers are on screen: colour the readouts as damage telemetry.
    paintTelemetry('damaged');

    // Disrupted Population
    const pop = document.getElementById('kpiPopAffected') || document.getElementById('telemetryPop');
    if (pop) pop.textContent = Number(data.pop).toLocaleString();

    // Strain Pct
    const strain = document.getElementById('kpiStrainPct') || document.getElementById('telemetryStrainPct');
    if (strain) strain.textContent = data.strainPct;

    // Congestion Ratio & Km
    const ratio = document.getElementById('kpiCongestionRatio') || document.getElementById('telemetryCongestionRatio');
    if (ratio) ratio.textContent = data.congestionRatio;

    const km = document.getElementById('kpiCongestionKm') || document.getElementById('telemetryCongestionKm');
    if (km) km.textContent = data.congestionKm;

    // Trauma Delay & Severed Corridors
    const delay = document.getElementById('kpiTraumaDelay') || document.getElementById('telemetryTraumaDelay');
    if (delay) delay.textContent = data.traumaDelay;

    const severed = document.getElementById('kpiCorridorsSevered') || document.getElementById('telemetryCorridorsSevered');
    if (severed) severed.textContent = data.corridorsSevered;

    // Power Deficit & Stabilization Time
    const mwh = document.getElementById('kpiPowerDeficit') || document.getElementById('telemetryPowerMwh');
    if (mwh) mwh.textContent = data.powerDeficit;

    const stab = document.getElementById('kpiStabilizationTime') || document.getElementById('telemetryStabilizationTime');
    if (stab) stab.textContent = data.stabilizationTime;

    // Domain Stress Fill Bars
    const barT = document.getElementById('barTransitFill') || document.getElementById('domainBarTransit');
    const barG = document.getElementById('barGridFill') || document.getElementById('domainBarGrid');
    const barM = document.getElementById('barMedFill') || document.getElementById('domainBarMed');
    const valT = document.getElementById('barTransitVal') || document.getElementById('domainValTransit');
    const valG = document.getElementById('barGridVal') || document.getElementById('domainValGrid');
    const valM = document.getElementById('barMedVal') || document.getElementById('domainValMed');

    if (barT) barT.style.width = `${data.bars.transit}%`;
    if (barG) barG.style.width = `${data.bars.grid}%`;
    if (barM) barM.style.width = `${data.bars.med}%`;
    if (valT) valT.textContent = `${data.bars.transit}%`;
    if (valG) valG.textContent = `${data.bars.grid}%`;
    if (valM) valM.textContent = `${data.bars.med}%`;

    // Telemetry status badge
    const badge = document.getElementById('telemetryBadge');
    if (badge) {
      const isCritical = data.status.includes('CRITICAL') || data.status.includes('OVERHEAT') || data.status.includes('OVERLOAD');
      badge.textContent = isCritical ? 'HIGH EXPOSURE' : 'CONTAINED';
      badge.className = isCritical
        ? 'text-[11px] font-mono px-2 py-0.5 rounded-full bg-terracotta-soft text-terracotta font-semibold'
        : 'text-[11px] font-mono px-2 py-0.5 rounded-full bg-moss-soft text-moss font-semibold';
    }
  }

  function updateSlidersForNode(nodeId, data) {
    if (!data.slider) return;
    const rangeMag = document.getElementById('rangeMagnitude');
    const valMag = document.getElementById('valMagnitude');
    const rangeDur = document.getElementById('rangeDuration');
    const valDur = document.getElementById('valDuration');
    const rangeWea = document.getElementById('rangeWeather');
    const valWea = document.getElementById('valWeather');
    const strainLimit = document.getElementById('strainLimitReadout');
    const batteryBuffer = document.getElementById('batteryBufferReadout');

    if (rangeMag) {
      rangeMag.value = data.slider.magnitude;
      if (valMag) valMag.textContent = `${data.slider.magnitude}% [${data.slider.magnitude > 80 ? 'Critical' : 'Elastic'}]`;
    }
    if (rangeDur) {
      rangeDur.value = data.slider.duration;
      if (valDur) valDur.textContent = `${data.slider.duration} Hours`;
    }
    if (rangeWea) {
      rangeWea.value = data.slider.weather;
      if (valWea) {
        valWea.textContent = typeof data.slider.weather === 'number' && data.slider.weather > 40
          ? `${data.slider.weather} KTS Gale`
          : `${data.slider.weather}°C Ambient`;
      }
    }
    if (strainLimit && data.slider.strainLimit) strainLimit.textContent = data.slider.strainLimit;
    if (batteryBuffer && data.slider.batteryBuffer) batteryBuffer.textContent = data.slider.batteryBuffer;
    syncActuatorsSummary();
  }

  // Which asset to reinforce for a Before/After comparison. Reinforcing the *same* node that's
  // failing is a no-op — its capacity boost never applies because the failure magnitude forces
  // its effective capacity directly, regardless of rated capacity — so /api/compare always came
  // back as a flat 0% improvement no matter the scenario, which is exactly why the HUD looked
  // frozen. A generically "high centrality" node isn't much better: unless it actually sits in
  // *this* failure's blast radius, boosting its capacity does nothing measurable either. So:
  // prefer the node most cross-domain dependent on the failing asset (e.g. the hospital a
  // substation powers) — that's the one whose hardening plausibly changes this scenario's
  // outcome — falling back to its most heavily loaded direct neighbor, then the topology's
  // top-ranked critical asset.
  function getReinforceTargetId(excludeId) {
    if (!cityData) return excludeId;
    // excludeId may be a single node id or (for a compound event) an array of them.
    const excludeSet = new Set(Array.isArray(excludeId) ? excludeId : [excludeId]);

    if (Array.isArray(cityData.dependency_edges)) {
      const deps = cityData.dependency_edges.filter(d => excludeSet.has(d.from_node) && !excludeSet.has(d.to_node));
      if (deps.length) {
        deps.sort((a, b) => (b.degrade_factor || 0) - (a.degrade_factor || 0));
        return deps[0].to_node;
      }
    }
    if (Array.isArray(cityData.edges)) {
      const neighborEdges = cityData.edges.filter(e =>
        (excludeSet.has(e.source) || excludeSet.has(e.target)) && !(excludeSet.has(e.source) && excludeSet.has(e.target))
      );
      if (neighborEdges.length) {
        neighborEdges.sort((a, b) => (b.load / Math.max(1, b.capacity)) - (a.load / Math.max(1, a.capacity)));
        const best = neighborEdges[0];
        return excludeSet.has(best.source) ? best.target : best.source;
      }
    }
    if (Array.isArray(cityData.critical_assets)) {
      const top = cityData.critical_assets.find(a => !excludeSet.has(a.node_id));
      if (top) return top.node_id;
    }
    return Array.isArray(excludeId) ? excludeId[0] : excludeId;
  }

  // Turns a /api/compare response (unmitigated vs. hardened-reinforcement cascade) into the
  // beforeAfter shape updateBeforeAfterHud() renders, so the HUD reflects the scenario that was
  // actually just simulated instead of staying frozen on each asset's static preset numbers.
  function applyComparisonToBeforeAfter(data, comp) {
    const unmit = comp && comp.unmitigated && comp.unmitigated.final_metrics;
    const mit = comp && comp.mitigated && comp.mitigated.final_metrics;
    const summary = comp && comp.comparison_summary;
    if (!unmit || !mit || !summary) return;

    const pctOf = (part, whole) => Math.min(100, Math.max(0, Math.round((part / Math.max(1, whole)) * 100)));
    const failBaseline = unmit.roads_overloaded + unmit.hospitals_affected;
    const failMitigated = mit.roads_overloaded + mit.hospitals_affected;

    data.beforeAfter = {
      popBaseline: `${Number(unmit.people_affected).toLocaleString()} citizens`,
      popMitigated: `${Number(mit.people_affected).toLocaleString()} citizens`,
      popDelta: `${summary.population_reduction_pct}% Reduction`,
      popPct: pctOf(mit.people_affected, unmit.people_affected),
      transitBaseline: `+${unmit.travel_time_increase_pct}% delay`,
      transitMitigated: `+${mit.travel_time_increase_pct}% delay`,
      transitDelta: `${summary.travel_time_saved_pct} pt Delay Cut`,
      transitPct: pctOf(mit.travel_time_increase_pct, unmit.travel_time_increase_pct),
      failuresBaseline: `${failBaseline} assets affected`,
      failuresMitigated: `${failMitigated} assets affected`,
      failuresDelta: `${summary.emergency_routes_preserved} Corridors Preserved`,
      failuresPct: pctOf(failMitigated, failBaseline),
      ratio: `${(unmit.people_affected / Math.max(1, mit.people_affected)).toFixed(1)}x`
    };
  }

  function updateBeforeAfterHud(nodeId, data) {
    if (!data.beforeAfter) return;
    const ba = data.beforeAfter;

    const popBase = document.getElementById('hudPopBaseline');
    const popMit = document.getElementById('hudPopMitigated');
    const popDelta = document.getElementById('hudPopDelta');
    const popBar = document.getElementById('hudPopBar');

    const transitBase = document.getElementById('hudTransitBaseline');
    const transitMit = document.getElementById('hudTransitMitigated');
    const transitDelta = document.getElementById('hudTransitDelta');
    const transitBar = document.getElementById('hudTransitBar');

    const failBase = document.getElementById('hudFailuresBaseline');
    const failMit = document.getElementById('hudFailuresMitigated');
    const failDelta = document.getElementById('hudFailuresDelta');
    const failBar = document.getElementById('hudFailuresBar');

    const badge = document.getElementById('hudEfficacyBadge');
    const ratio = document.getElementById('hudResilienceRatio');

    if (popBase) popBase.textContent = `Baseline (${ba.popBaseline})`;
    if (popMit) popMit.textContent = `Mitigated (${ba.popMitigated})`;
    if (popDelta) popDelta.textContent = ba.popDelta;
    if (popBar) popBar.style.width = `${ba.popPct}%`;

    if (transitBase) transitBase.textContent = `Baseline (${ba.transitBaseline})`;
    if (transitMit) transitMit.textContent = `Mitigated (${ba.transitMitigated})`;
    if (transitDelta) transitDelta.textContent = ba.transitDelta;
    if (transitBar) transitBar.style.width = `${ba.transitPct}%`;

    if (failBase) failBase.textContent = `Baseline (${ba.failuresBaseline})`;
    if (failMit) failMit.textContent = `Mitigated (${ba.failuresMitigated})`;
    if (failDelta) failDelta.textContent = ba.failuresDelta;
    if (failBar) failBar.style.width = `${ba.failuresPct}%`;

    if (badge) badge.textContent = ba.popDelta.replace(' Reduction', ' MITIGATED');
    if (ratio) ratio.textContent = `Resilience Ratio: ${ba.ratio}`;
  }

  function initMatrixTable() {
    const tbody = document.getElementById('matrixTableBody');
    if (!tbody) return;

    const rows = [
      { id: 'T-01', name: 'Central Bridge', domain: 'Transport', E: 0.72, T: 0.95, H: 0.84, W: 0.25, mult: '3.4x' },
      { id: 'E-01', name: 'Downtown Power Station', domain: 'Power', E: 0.98, T: 0.82, H: 0.88, W: 0.65, mult: '4.5x' },
      { id: 'H-01', name: 'Central Hospital', domain: 'Healthcare', E: 0.45, T: 0.68, H: 0.98, W: 0.35, mult: '3.1x' },
      { id: 'T-02', name: 'Downtown Metro Station', domain: 'Transit', E: 0.38, T: 0.88, H: 0.42, W: 0.15, mult: '2.4x' },
      { id: 'E-02', name: 'North Power Station', domain: 'Power', E: 0.85, T: 0.45, H: 0.55, W: 0.40, mult: '2.8x' },
      { id: 'W-01', name: 'Water Treatment Plant', domain: 'Water', E: 0.52, T: 0.30, H: 0.75, W: 0.95, mult: '3.2x' }
    ];

    const getPill = (val) => {
      if (val > 0.70) return `<span class="px-2 py-0.5 rounded-full font-mono text-[11px] font-bold bg-terracotta-soft text-terracotta">${val.toFixed(2)} [CRIT]</span>`;
      if (val > 0.30) return `<span class="px-2 py-0.5 rounded-full font-mono text-[11px] font-medium bg-amber-warm/15 text-amber-warm">${val.toFixed(2)} [MOD]</span>`;
      return `<span class="px-2 py-0.5 rounded-full font-mono text-[11px] font-medium bg-moss-soft text-moss">${val.toFixed(2)} [LOW]</span>`;
    };

    tbody.innerHTML = rows.map(r => `
      <tr class="hover:bg-surface-container/60 transition-colors cursor-pointer matrix-row" id="matrixRow_${r.id}" onclick="window.selectNode('${r.id}')">
        <td class="py-3 px-4 font-serif font-bold text-stone-dark flex items-center gap-2">
          <span class="w-2 h-2 rounded-full ${r.id === 'T-01' ? 'bg-terracotta' : (r.id === 'E-01' ? 'bg-amber-warm' : (r.id === 'H-01' ? 'bg-moss' : 'bg-stone'))}"></span>
          <span>${r.name}</span>
          <span class="active-badge hidden ml-2 px-1.5 py-0.5 rounded text-[10px] bg-terracotta text-white font-mono font-bold animate-pulse">ACTIVE</span>
        </td>
        <td class="py-3 px-3 text-center">${getPill(r.E)}</td>
        <td class="py-3 px-3 text-center">${getPill(r.T)}</td>
        <td class="py-3 px-3 text-center">${getPill(r.H)}</td>
        <td class="py-3 px-3 text-center">${getPill(r.W)}</td>
        <td class="py-3 px-3 text-center font-mono font-bold text-primary">${r.mult}</td>
      </tr>
    `).join('');
  }

  function updateMatrixHighlight(nodeId) {
    document.querySelectorAll('.matrix-row').forEach(row => {
      row.classList.remove('bg-terracotta/10', 'ring-2', 'ring-terracotta/60');
      const badge = row.querySelector('.active-badge');
      if (badge) badge.classList.add('hidden');
    });

    const activeRow = document.getElementById(`matrixRow_${nodeId}`);
    if (activeRow) {
      activeRow.classList.add('bg-terracotta/10', 'ring-2', 'ring-terracotta/60');
      const badge = activeRow.querySelector('.active-badge');
      if (badge) badge.classList.remove('hidden');
    }
  }

  function updateTrussColors(colors) {
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`trussChord${i}`);
      if (el && colors[i - 1]) {
        el.setAttribute('stroke', colors[i - 1]);
      }
    }
  }

  // -------------------------------------------------------------
  // 4. Simulation Solver Trigger
  // -------------------------------------------------------------
  async function solveCascade() {
    const data = nodeDetails[activeFocus] || nodeDetails['T-01'];
    const magInput = document.getElementById('rangeMagnitude');
    const durInput = document.getElementById('rangeDuration');
    const weaInput = document.getElementById('rangeWeather');

    const mag = magInput ? parseFloat(magInput.value) / 100.0 : 0.85;
    const dur = durInput ? parseFloat(durInput.value) : 8.0;
    // BUGFIX: Ambient Weather was never sent to the backend at all, and Closure Duration only
    // fed the after-the-fact recovery-hours estimate — so dragging either slider never actually
    // changed which nodes failed or any KPI, only Shock Magnitude did. The engine now folds
    // weather (normalized 0-1) and duration into a real cascade stress multiplier, so all three
    // actuators have to be sent on every run.
    const wea = weaInput ? parseFloat(weaInput.value) / 75.0 : 0.3;

    // Compound mode (armed by the hypothesis bar when a question names several assets at
    // once) simulates all of them simultaneously instead of just the focused asset.
    const isCompound = Array.isArray(compoundNodeIds) && compoundNodeIds.length > 1;
    const initiatingId = isCompound ? compoundNodeIds : data.backendId;

    // Animate button spinner
    const btns = [document.getElementById('recalcBtn'), document.getElementById('headerSimulateBtn')];
    btns.forEach(b => {
      if (!b) return;
      b.disabled = true;
      b.innerHTML = '<span class="material-symbols-outlined text-[15px] animate-spin">refresh</span><span>Solving FEA...</span>';
    });

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isCompound ? {
          node_ids: initiatingId,
          magnitude: mag,
          duration_hours: dur,
          overload_threshold: 1.15,
          weather: wea
        } : {
          node_id: initiatingId,
          magnitude: mag,
          duration_hours: dur,
          overload_threshold: 1.15,
          weather: wea
        })
      });
      if (res.ok) {
        simulationResult = await res.json();
        const m = simulationResult.final_metrics;
        data.pop = m.people_affected;
        // BUGFIX: clamp defensively on the frontend too (belt-and-suspenders on top
        // of the backend cap) so a runaway metric never renders as e.g. "+1962795%".
        const clampedStrain = Math.min(300, Math.max(0, m.travel_time_increase_pct));
        data.strainPct = `+${clampedStrain}% delay`;
        data.corridorsSevered = `${m.emergency_routes_disrupted} Corridors`;
        data.stabilizationTime = `${m.estimated_recovery_hours}h 00m`;
        updateTelemetry(data);

        // Post-run readouts the static asset profiles don't carry
        setText('kpiPopSub', `${m.total_nodes_failed} assets failed · ${m.total_nodes_degraded} degraded · ${m.hospitals_affected} hospital${m.hospitals_affected === 1 ? '' : 's'} stressed`);
        setText('kpiGeneratorReserve', `${m.hospitals_affected > 0 ? 'Engaged' : 'Standby'} (${m.estimated_recovery_hours}h to stabilize)`);
        setText('kpiFeaStatus', `FEA CONVERGED · ${simulationResult.total_steps || (simulationResult.steps || []).length} STEPS`);
        setText('footerResilienceIndex', `Resilience Index: ${(m.resilience_score / 10).toFixed(1)} / 10`);
        setInspectorStressBar(m.resilience_score);
        startTimeline();

        // Hardening Interventions & narrative log both react to *this* scenario's actual
        // simulated damage instead of staying fixed on three hardcoded cards.
        renderHardeningRecommendations(simulationResult);
        renderCascadeNarrativeLog(simulationResult);
        if (fpState.open) renderFailurePointList();

        // Update 3D scene with simulation result
        if (polybridge && cityData) {
          polybridge.updateScene(cityData, simulationResult, simulationResult.steps ? simulationResult.steps.length - 1 : 0);
        }

        // Refresh the Before vs. After HUD against *this* scenario (current node, magnitude,
        // duration) instead of leaving it frozen on the asset's static preset numbers.
        try {
          const compRes = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              initiating_node_id: initiatingId,
              reinforce_node_id: getReinforceTargetId(initiatingId),
              magnitude: mag,
              duration_hours: dur,
              weather: wea
            })
          });
          if (compRes.ok) {
            applyComparisonToBeforeAfter(data, await compRes.json());
            updateBeforeAfterHud(activeFocus, data);
          }
        } catch (e) {
          console.warn('Compare API offline, Before vs. After HUD left at last known state.');
        }
      }
    } catch (e) {
      console.warn('Simulate API offline, computed via local non-linear FEA matrix.');
    }

    setTimeout(() => {
      btns.forEach(b => {
        if (!b) return;
        b.disabled = false;
        b.innerHTML = b.id === 'headerSimulateBtn'
          ? '<span class="material-symbols-outlined text-[16px]">play_arrow</span><span>Simulate Flow</span>'
          : '<span class="material-symbols-outlined text-[15px]">refresh</span><span>Solve FEA</span>';
      });

      // Update status dot & text
      const dot = document.getElementById('headerStatusDot');
      const txt = document.getElementById('headerStatusText');
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-terracotta animate-ping';
      if (txt) txt.textContent = `${data.title.split('#')[0].trim()} — Stress Peak Recorded`;
    }, 500);
  }

  // -------------------------------------------------------------
  // 5. Hardening Intervention Solver
  // -------------------------------------------------------------
  // Reinforces a *specific* asset (nodeId) against whatever scenario is currently armed
  // (the focused node or a compound event, at the actuators' current magnitude/duration/
  // weather) and folds the result into the telemetry + Before/After HUD. Replaces the old
  // fixed 3-tier version — recommendations are now generated per-scenario by
  // renderHardeningRecommendations() below, so any of them can be the reinforcement target.
  window.applyHardeningToNode = async function (nodeId, label) {
    const data = nodeDetails[activeFocus] || nodeDetails['T-01'];
    const isCompound = Array.isArray(compoundNodeIds) && compoundNodeIds.length > 1;
    const initiatingId = isCompound ? compoundNodeIds : data.backendId;

    const statusEl = document.getElementById('headerStatusText');
    if (statusEl) statusEl.textContent = `Hardening Applied: ${label}`;

    try {
      const magInput = document.getElementById('rangeMagnitude');
      const durInput = document.getElementById('rangeDuration');
      const weaInput = document.getElementById('rangeWeather');
      const mag = magInput ? parseFloat(magInput.value) / 100.0 : 0.85;
      const dur = durInput ? parseFloat(durInput.value) : 8.0;
      const wea = weaInput ? parseFloat(weaInput.value) / 75.0 : 0.3;

      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiating_node_id: initiatingId,
          reinforce_node_id: nodeId,
          magnitude: mag,
          duration_hours: dur,
          weather: wea
        })
      });
      if (res.ok) {
        const comp = await res.json();
        const saved = comp.comparison_summary.population_protected;
        data.pop = Math.max(10000, data.pop - saved);
        data.tension = '72.4% [Stabilized]';
        data.status = 'HARDENED / SECURED';
        data.bars.transit = Math.max(20, data.bars.transit - 35);
        data.bars.med = Math.min(95, data.bars.med + 40);
        applyComparisonToBeforeAfter(data, comp);
        updateTelemetry(data);
        window.selectNode(activeFocus);
        return comp;
      }
    } catch (e) {
      console.warn('Hardening comparison failed', e);
    }

    // Fallback mitigation (API offline)
    data.pop = Math.max(15000, data.pop - 110000);
    data.tension = '74.2% [Stabilized]';
    data.status = 'HARDENED / SECURED';
    data.bars.transit = Math.max(25, data.bars.transit - 28);
    data.bars.med = Math.min(92, data.bars.med + 35);
    updateTelemetry(data);
    window.selectNode(activeFocus);
    return null;
  };

  // Turns the *actual* simulation result into 1-3 concrete hardening recommendations —
  // the specific nodes that failed or came under the most strain this run, ranked by
  // population served — instead of three hardcoded cards that never changed no matter
  // what scenario was run.
  function renderHardeningRecommendations(simResult) {
    const list = document.getElementById('hardeningList');
    if (!list || !simResult || !cityData) return;

    const nodesById = simResult.nodes || {};
    const failedIds = simResult.failed_node_ids || [];
    const degradedIds = simResult.degraded_node_ids || [];
    const initIds = simResult.initiating_node_ids || [simResult.initiating_node_id].filter(Boolean);

    // Candidates: every node this cascade actually touched, excluding the epicenter(s)
    // themselves (hardening the thing that was directly hit doesn't stop its own failure —
    // see getReinforceTargetId's comment for why) — ranked by how many people they serve.
    const seen = new Set();
    const candidates = [...failedIds, ...degradedIds]
      .filter(id => !initIds.includes(id) && !seen.has(id) && seen.add(id))
      .map(id => nodesById[id])
      .filter(Boolean)
      .sort((a, b) => (b.population_served || 0) - (a.population_served || 0))
      .slice(0, 3);

    if (!candidates.length) {
      list.innerHTML = `
        <div class="text-[11px] text-stone-light font-sans text-center py-4">
          No secondary assets were pushed into failure by this scenario — nothing urgent to harden right now.
        </div>`;
      return;
    }

    const domainMeta = {
      power: { color: 'amber-warm', icon: '⚡', verb: 'Redundancy Loop', mult: 3200 },
      road: { color: 'terracotta', icon: '🌉', verb: 'Structural Retrofit', mult: 1800 },
      health: { color: 'moss', icon: '🏥', verb: 'Priority Access Corridor', mult: 2600 }
    };

    list.innerHTML = candidates.map((node, i) => {
      const meta = domainMeta[node.domain] || domainMeta.road;
      const costM = Math.max(0.2, Math.round((node.population_served / meta.mult) * 10) / 10);
      const label = `${node.name} ${meta.verb}`;
      const statusWord = failedIds.includes(node.id) ? 'failed' : 'critically degraded';
      return `
        <div class="bg-surface-dim hover:bg-surface-container p-3 rounded-2xl border border-surface-container-highest/50 transition-colors cursor-pointer group" data-node-id="${node.id}" data-label="${label.replace(/"/g, '&quot;')}">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-5 h-5 rounded-lg bg-${meta.color} text-white font-mono text-[10px] font-bold flex items-center justify-center">0${i + 1}</span>
              <span class="font-serif font-bold text-xs text-stone-dark group-hover:text-${meta.color} transition-colors">${label}</span>
            </div>
            <span class="text-xs font-mono font-semibold text-stone bg-surface px-2 py-0.5 rounded-lg border border-surface-container-highest/40">$${costM}M</span>
          </div>
          <p class="text-[11px] text-stone mt-1.5 leading-relaxed">
            ${meta.icon} ${node.name} (${node.district}) ${statusWord} in this run, cutting off ${Number(node.population_served).toLocaleString()} residents' service. Hardening it absorbs the redistributed load before it tips over.
          </p>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-node-id]').forEach(card => {
      card.addEventListener('click', () => window.applyHardeningToNode(card.dataset.nodeId, card.dataset.label));
    });
  }

  // Renders the plain-English cascade narrative (root cause -> domino progression ->
  // investment recommendation) the backend already computes per simulation, so the user can
  // read *how* the interventions above would actually play out instead of just seeing numbers.
  function renderCascadeNarrativeLog(simResult) {
    const log = document.getElementById('narrativeLogBody');
    if (!log) return;
    const expl = simResult && simResult.explanation;
    if (!expl) {
      log.innerHTML = '<p class="text-stone-light">Run a simulation to generate a briefing.</p>';
      return;
    }
    const toHtml = (text) => (text || '').replace(/\*\*(.+?)\*\*/g, '<strong class="text-stone-dark">$1</strong>');
    const domino = (expl.domino_points || []).map(p => `<p class="mt-2">${toHtml(p)}</p>`).join('');
    log.innerHTML = `
      <p class="text-stone-dark font-medium">${toHtml(expl.root_cause)}</p>
      ${domino}
      <p class="mt-2.5 pt-2.5 border-t border-surface-container-highest/60">${toHtml(expl.investment_recommendation)}</p>
    `;
  }

  // -------------------------------------------------------------
  // 6. Timeline & Clock Loop
  // -------------------------------------------------------------
  function setupTimelineLoop() {
    const clock = document.getElementById('timelineClock');
    const playToggle = document.getElementById('timelinePlayToggle');
    const playIcon = document.getElementById('playIcon');

    if (playToggle) {
      playToggle.addEventListener('click', () => {
        isPlaying = !isPlaying;
        if (playIcon) playIcon.textContent = isPlaying ? 'pause' : 'play_arrow';
      });
    }

    // Speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.speed-btn').forEach(b => {
          b.className = 'speed-btn px-2 py-0.5 rounded-lg text-stone hover:text-stone-dark';
        });
        this.className = 'speed-btn px-2 py-0.5 rounded-lg bg-surface text-stone-dark font-semibold shadow-xs';
        playbackSpeed = parseInt(this.dataset.speed, 10) || 2;
      });
    });

    setInterval(() => {
      if (!isPlaying || !clock) return;
      simSeconds += playbackSpeed;
      const h = Math.floor(simSeconds / 3600);
      const m = Math.floor((simSeconds % 3600) / 60);
      const s = simSeconds % 60;
      clock.textContent = `T +${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      // Update Scrubber Fill
      const pct = (simSeconds % 12000) / 120.0;
      const scrubberFill = document.getElementById('scrubberFill');
      const scrubberThumb = document.getElementById('scrubberThumb');
      if (scrubberFill) scrubberFill.style.width = `${pct}%`;
      if (scrubberThumb) scrubberThumb.style.left = `${pct}%`;
    }, 1000);
  }

  // -------------------------------------------------------------
  // 7. DOM Event Handlers & View Switcher
  // -------------------------------------------------------------
  function setupDomHandlers() {
    // Recalculate / Simulate Buttons
    const recalcBtn = document.getElementById('recalcBtn');
    const headerSimBtn = document.getElementById('headerSimulateBtn');
    if (recalcBtn) recalcBtn.addEventListener('click', solveCascade);
    if (headerSimBtn) headerSimBtn.addEventListener('click', solveCascade);

    // Preset Pills
    document.querySelectorAll('.preset-pill').forEach(pill => {
      pill.addEventListener('click', function () {
        const type = this.dataset.preset;
        if (type === 'harbor' || type === 'bridge') window.selectNode('T-01');
        else if (type === 'substation') window.selectNode('E-01');
        else if (type === 'hospital') window.selectNode('H-01');
        solveCascade();
      });
    });

    // Failure Point menu (all assets) — supersedes the old 4-option Focus Element select.
    setupFailurePointMenu();
    setupActuatorsPanel();
    const focusSelect = document.getElementById('focusAssetSelect');
    if (focusSelect) {
      focusSelect.addEventListener('change', function () {
        window.selectNode(this.value);
        if (polybridge) {
          polybridge.focusOnNode(this.value);
        }
      });
    }

    // View Mode Toggle (3D WebGL vs Isometric SVG vs Topological Matrix)
    const btnView3D = document.getElementById('btnView3D');
    const btnViewSVG = document.getElementById('btnViewSVG');
    const btnViewMatrix = document.getElementById('btnViewMatrix');
    const navTabMatrix = document.getElementById('navTabMatrix');
    const navTabDiorama = document.getElementById('navTabDiorama');
    const navTabHardening = document.getElementById('navTabHardening');
    const btnCloseMatrix = document.getElementById('btnCloseMatrix');
    const matrixOverlay = document.getElementById('matrixViewOverlay');
    const canvas3D = document.getElementById('polybridge3dCanvas');
    const svgDiorama = document.getElementById('dioramaSvg');

    function setViewMode(mode) {
      currentViewMode = mode;
      if (matrixOverlay) matrixOverlay.classList.add('hidden');

      if (mode === '3d') {
        if (canvas3D) canvas3D.classList.remove('hidden');
        if (svgDiorama) svgDiorama.classList.add('hidden');
        if (btnView3D) btnView3D.className = 'px-2.5 py-1 rounded-xl bg-stone-dark text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm';
        if (btnViewSVG) btnViewSVG.className = 'px-2.5 py-1 rounded-xl bg-surface-dim hover:bg-surface-container text-stone-dark text-xs font-medium flex items-center gap-1.5 transition-all';
        if (btnViewMatrix) btnViewMatrix.className = 'px-2.5 py-1 rounded-xl bg-surface-dim hover:bg-surface-container text-stone-dark text-xs font-medium flex items-center gap-1.5 transition-all';
        if (navTabDiorama) navTabDiorama.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-surface text-stone-dark shadow-soft';
        if (navTabMatrix) navTabMatrix.className = 'px-3.5 py-1.5 text-xs font-medium rounded-xl text-stone hover:text-stone-dark transition-colors';
      } else if (mode === 'svg') {
        if (canvas3D) canvas3D.classList.add('hidden');
        if (svgDiorama) svgDiorama.classList.remove('hidden');
        if (btnViewSVG) btnViewSVG.className = 'px-2.5 py-1 rounded-xl bg-stone-dark text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm';
        if (btnView3D) btnView3D.className = 'px-2.5 py-1 rounded-xl bg-surface-dim hover:bg-surface-container text-stone-dark text-xs font-medium flex items-center gap-1.5 transition-all';
        if (btnViewMatrix) btnViewMatrix.className = 'px-2.5 py-1 rounded-xl bg-surface-dim hover:bg-surface-container text-stone-dark text-xs font-medium flex items-center gap-1.5 transition-all';
        if (navTabDiorama) navTabDiorama.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-surface text-stone-dark shadow-soft';
        if (navTabMatrix) navTabMatrix.className = 'px-3.5 py-1.5 text-xs font-medium rounded-xl text-stone hover:text-stone-dark transition-colors';
      } else if (mode === 'matrix') {
        if (matrixOverlay) matrixOverlay.classList.remove('hidden');
        if (btnViewMatrix) btnViewMatrix.className = 'px-2.5 py-1 rounded-xl bg-stone-dark text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm';
        if (btnView3D) btnView3D.className = 'px-2.5 py-1 rounded-xl bg-surface-dim hover:bg-surface-container text-stone-dark text-xs font-medium flex items-center gap-1.5 transition-all';
        if (btnViewSVG) btnViewSVG.className = 'px-2.5 py-1 rounded-xl bg-surface-dim hover:bg-surface-container text-stone-dark text-xs font-medium flex items-center gap-1.5 transition-all';
        if (navTabMatrix) navTabMatrix.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-surface text-stone-dark shadow-soft';
        if (navTabDiorama) navTabDiorama.className = 'px-3.5 py-1.5 text-xs font-medium rounded-xl text-stone hover:text-stone-dark transition-colors';
      }
    }

    if (btnView3D) btnView3D.addEventListener('click', () => setViewMode('3d'));
    if (btnViewSVG) btnViewSVG.addEventListener('click', () => setViewMode('svg'));
    if (btnViewMatrix) btnViewMatrix.addEventListener('click', () => setViewMode('matrix'));
    if (navTabMatrix) navTabMatrix.addEventListener('click', () => setViewMode('matrix'));
    if (navTabDiorama) navTabDiorama.addEventListener('click', () => setViewMode('3d'));
    if (btnCloseMatrix) btnCloseMatrix.addEventListener('click', () => setViewMode(currentViewMode === 'matrix' ? '3d' : currentViewMode));
    if (navTabHardening) {
      navTabHardening.addEventListener('click', () => {
        const hud = document.getElementById('beforeAfterHud');
        if (hud) hud.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    // Camera Presets & Focus Buttons
    const btnCamOrbit = document.getElementById('btnCamOrbit');
    const btnCamIso = document.getElementById('btnRecenter');
    const btnCamTopDown = document.getElementById('btnCamTopDown');

    // Highlight the preset button matching the camera actually in use. The diorama opens on the
    // orbit framing (the engine's default camera), so that is the active one at startup.
    const camPresetButtons = { orbit: btnCamOrbit, iso: btnCamIso, topdown: btnCamTopDown };
    const highlightCamPreset = (preset) => {
      Object.entries(camPresetButtons).forEach(([key, btn]) => {
        if (!btn) return;
        const active = key === preset;
        btn.classList.toggle('bg-surface-container', active);
        btn.classList.toggle('text-stone-dark', active);
        btn.classList.toggle('text-stone', !active);
        btn.classList.toggle('hover:bg-surface-dim', !active);
      });
    };
    highlightCamPreset('orbit');

    if (btnCamOrbit) btnCamOrbit.addEventListener('click', () => {
      setViewMode('3d');
      highlightCamPreset('orbit');
      if (polybridge) polybridge.setPresetView('orbit');
    });
    if (btnCamIso) btnCamIso.addEventListener('click', () => {
      setViewMode('3d');
      highlightCamPreset('iso');
      if (polybridge) polybridge.setPresetView('iso');
    });
    if (btnCamTopDown) btnCamTopDown.addEventListener('click', () => {
      setViewMode('3d');
      highlightCamPreset('topdown');
      if (polybridge) polybridge.setPresetView('topdown');
    });

    const btnFocusBridge = document.getElementById('btnFocusBridge');
    const btnFocusHospital = document.getElementById('btnFocusHospital');
    const btnFocusSubstation = document.getElementById('btnFocusSubstation');

    if (btnFocusBridge) btnFocusBridge.addEventListener('click', () => {
      setViewMode('3d');
      window.selectNode('T-01');
      if (polybridge) polybridge.focusOnNode('T-01');
    });
    if (btnFocusHospital) btnFocusHospital.addEventListener('click', () => {
      setViewMode('3d');
      window.selectNode('H-01');
      if (polybridge) polybridge.focusOnNode('H-01');
    });
    if (btnFocusSubstation) btnFocusSubstation.addEventListener('click', () => {
      setViewMode('3d');
      window.selectNode('E-01');
      if (polybridge) polybridge.focusOnNode('E-01');
    });

    // Actuator Range Sliders with Dynamic FEA Live Feedback
    const rangeMag = document.getElementById('rangeMagnitude');
    const valMag = document.getElementById('valMagnitude');
    const rangeDur = document.getElementById('rangeDuration');
    const valDur = document.getElementById('valDuration');
    const rangeWea = document.getElementById('rangeWeather');
    const valWea = document.getElementById('valWeather');

    let sliderDebounce = null;
    const handleSliderInput = () => {
      const mag = parseFloat(rangeMag?.value || 85);
      const dur = parseFloat(rangeDur?.value || 8);
      const wea = parseFloat(rangeWea?.value || 48);

      if (valMag) valMag.textContent = `${mag}% [${mag > 80 ? 'Critical' : 'Elastic'}]`;
      if (valDur) valDur.textContent = `${dur.toFixed(1)} Hours`;
      if (valWea) {
        valWea.textContent = wea > 40 ? `${wea} KTS Gale` : `${wea}°C Ambient`;
      }

      // Dynamically recalculate strain & tension
      const dynamicTension = Math.min(198, Math.round(mag * 1.15 + dur * 2.4 + wea * 0.42));
      const strainBadge = document.getElementById('headerStrainBadge');
      if (strainBadge) {
        strainBadge.textContent = `${dynamicTension}% [${dynamicTension > 100 ? 'CRITICAL' : 'ELEVATED'}]`;
      }
      paintTelemetry('damaged');
      const inspectTension = document.getElementById('inspectTension');
      if (inspectTension) {
        inspectTension.textContent = `${dynamicTension}% [${dynamicTension > 100 ? 'Overload' : 'Strained'}]`;
      }

      // Live update domain bars
      const barT = document.getElementById('barTransitFill');
      const barG = document.getElementById('barGridFill');
      const barM = document.getElementById('barMedFill');
      const transitPct = Math.min(100, Math.round(mag * 0.95));
      const gridPct = Math.min(100, Math.round(dur * 8.5));
      const medPct = Math.min(100, Math.round(wea * 1.2));
      if (barT) barT.style.width = `${transitPct}%`;
      if (barG) barG.style.width = `${gridPct}%`;
      if (barM) barM.style.width = `${medPct}%`;

      // BUGFIX: persist the live actuator readout onto the focused asset's data model, not just
      // the DOM. solveCascade() re-renders this same data via updateTelemetry() once its debounced
      // API call resolves; without this, the header strain badge and domain bars would snap back
      // to the asset's static preset numbers moments after the actuators changed them.
      const data = nodeDetails[activeFocus] || nodeDetails['T-01'];
      data.tension = `${dynamicTension}% [${dynamicTension > 100 ? 'CRITICAL' : 'ELEVATED'}]`;
      data.status = dynamicTension > 100 ? 'CRITICAL STRAIN' : 'STABLE FLOW';
      data.bars = { transit: transitPct, grid: gridPct, med: medPct };

      // Debounce call to solveCascade so diorama updates in real time
      clearTimeout(sliderDebounce);
      sliderDebounce = setTimeout(() => {
        solveCascade();
      }, 350);
    };

    if (rangeMag) rangeMag.addEventListener('input', handleSliderInput);
    if (rangeDur) rangeDur.addEventListener('input', handleSliderInput);
    if (rangeWea) rangeWea.addEventListener('input', handleSliderInput);

    // Dark / Light theme toggle (persisted; also re-lights the 3D diorama)
    const themeBtn = document.getElementById('btnThemeToggle');
    const themeIcon = document.getElementById('themeToggleIcon');
    const applyTheme = (mode) => {
      const isDark = mode === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('light', !isDark);
      if (themeIcon) themeIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
      if (themeBtn) themeBtn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      const pb = window.polybridgeInstance;
      if (pb && typeof pb.setTheme === 'function') pb.setTheme(isDark ? 'dark' : 'light');
      try { localStorage.setItem('cf-theme', isDark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    };
    applyTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
      });
    }

    // Reset Buttons
    const resetBtn = document.getElementById('resetBtn');
    const resetTopBtn = document.getElementById('btnResetTop');
    const handleReset = () => {
      clearTimeout(sliderDebounce);
      simulationResult = null;
      hideInspector();
      window.selectNode('T-01', { reveal: false });
      applyNominalBaseline();
      // Back to the opening view: 3D diorama, city centred at the startup orbit framing.
      setViewMode('3d');
      highlightCamPreset('orbit');
      if (polybridge) polybridge.resetCamera();
    };
    if (resetBtn) resetBtn.addEventListener('click', handleReset);
    if (resetTopBtn) resetTopBtn.addEventListener('click', handleReset);

    // Inspector popup close button — user can dismiss it at will
    const closeInspectorBtn = document.getElementById('btnCloseInspector');
    if (closeInspectorBtn) closeInspectorBtn.addEventListener('click', hideInspector);

    // Hypothesis bar — free-text "what if" questions, parsed server-side by the NLP engine
    // and turned straight into a running simulation instead of sitting there doing nothing.
    const queryInput = document.getElementById('simQueryInput');
    const btnRunHypothesis = document.getElementById('btnRunHypothesis');
    const btnClearPrompt = document.getElementById('btnClearPrompt');

    async function runHypothesis() {
      const q = queryInput ? queryInput.value.trim() : '';
      if (!q) return;

      const statusText = document.getElementById('headerStatusText');
      if (btnRunHypothesis) {
        btnRunHypothesis.disabled = true;
        btnRunHypothesis.innerHTML = '<span class="material-symbols-outlined text-[15px] animate-spin">refresh</span><span>Parsing...</span>';
      }

      try {
        const res = await fetch('/api/nl-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q })
        });
        if (!res.ok) throw new Error('nl-query request failed');
        const parsed = await res.json();

        // Resolve against the live city graph so an asset the user names for the first time
        // (anything beyond the 4 primary presets) still gets a full inspector profile.
        const cityNode = cityData && cityData.nodes && cityData.nodes.find(n => n.id === parsed.node_id);
        const targetKey = cityNode
          ? ensureNodeDetails(cityNode)
          : (Object.keys(nodeDetails).find(k => nodeDetails[k].backendId === parsed.node_id) || 'T-01');

        window.selectNode(targetKey);

        // A question naming several assets at once ("what if X and Y both fail?") arms
        // compound mode: solveCascade() below simulates every named asset simultaneously
        // instead of just the one focused in the inspector card.
        if (parsed.is_compound && Array.isArray(parsed.node_ids) && parsed.node_ids.length > 1) {
          compoundNodeIds = parsed.node_ids;
          // The inspector card can only show one asset's flavor details — relabel just the
          // displayed title (not the underlying nodeDetails record, which other UI like the
          // asset dropdown and Scenario vs. Scenario picker rely on staying accurate) so the
          // KPI numbers below it (which do cover every named asset) aren't mistaken for a
          // single-asset reading.
          if (Array.isArray(parsed.node_names)) {
            const titleEl = document.getElementById('inspectTitle');
            if (titleEl) titleEl.textContent = `Compound Event: ${parsed.node_names.join(' + ')}`;
          }
        }

        // Dial the actuators to what the question implied, then let the normal slider-input
        // path (debounced solveCascade + Before/After HUD refresh) take it from there.
        const rangeMag = document.getElementById('rangeMagnitude');
        const rangeDur = document.getElementById('rangeDuration');
        if (rangeMag) rangeMag.value = Math.min(100, Math.max(10, Math.round((parsed.magnitude || 1.0) * 100)));
        if (rangeDur) rangeDur.value = Math.min(24, Math.max(1, parsed.duration_hours || 8.0));
        if (rangeMag) rangeMag.dispatchEvent(new Event('input'));

        if (statusText) statusText.textContent = parsed.interpretation || parsed.scenario_title || `Simulating ${parsed.node_name || targetKey}`;
      } catch (e) {
        // The offline parser on the backend always returns *something* (it never rejects a
        // question outright — see nlp_engine.py), so ending up here means the request itself
        // failed (server unreachable, etc.), not that the question was unparseable. Log the
        // real cause for debugging, then fall back to a small client-side keyword match so the
        // user still gets a running simulation instead of a dead end.
        console.error('Hypothesis request failed, using local fallback match:', e);
        const ql = q.toLowerCase();
        let fallbackKey = activeFocus;
        if (ql.includes('bridge')) fallbackKey = 'T-01';
        else if (ql.includes('hospital') || ql.includes('clinic')) fallbackKey = 'H-01';
        else if (ql.includes('power') || ql.includes('substation') || ql.includes('grid') || ql.includes('electric')) fallbackKey = 'E-01';
        else if (ql.includes('metro') || ql.includes('junction') || ql.includes('traffic') || ql.includes('road')) fallbackKey = 'T-02';

        window.selectNode(fallbackKey);
        const rangeMag = document.getElementById('rangeMagnitude');
        if (rangeMag) rangeMag.dispatchEvent(new Event('input'));
        if (statusText) statusText.textContent = `Couldn't reach the parser — simulating ${nodeDetails[fallbackKey].title} instead.`;
      }

      if (btnRunHypothesis) {
        btnRunHypothesis.disabled = false;
        btnRunHypothesis.innerHTML = '<span class="material-symbols-outlined text-[15px]">auto_awesome</span><span>Simulate</span>';
      }
    }

    if (btnRunHypothesis) btnRunHypothesis.addEventListener('click', runHypothesis);
    if (queryInput) {
      queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runHypothesis();
        }
      });
    }
    if (btnClearPrompt) {
      btnClearPrompt.addEventListener('click', () => {
        if (queryInput) {
          queryInput.value = '';
          queryInput.focus();
        }
      });
    }

    // Export Blueprint button
    const exportBtn = document.getElementById('btnExportBlueprint');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const report = {
          project: 'Cascading Flows',
          theme: '3D Poly Bridge Resilience Simulation',
          focus_node: activeFocus,
          timestamp: new Date().toISOString(),
          active_strain: nodeDetails[activeFocus]?.tension,
          status: nodeDetails[activeFocus]?.status,
          telemetry: nodeDetails[activeFocus],
          simulation_metrics: simulationResult?.final_metrics || null
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Resilience_Blueprint_${activeFocus}_${Date.now()}.json`;
        a.click();
      });
    }

    // Print button
    const printBtn = document.getElementById('btnPrintPlan');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }

    // Layer Toggles
    const toggleLayer = (btnId, groupId) => {
      const btn = document.getElementById(btnId);
      const group = document.getElementById(groupId);
      if (btn && group) {
        btn.addEventListener('click', () => {
          const isDim = group.style.opacity === '0.15';
          group.style.opacity = isDim ? '1' : '0.15';
          btn.classList.toggle('opacity-50', !isDim);
        });
      }
    };
    toggleLayer('toggleRoads', 'layerRoadsGroup');
    toggleLayer('togglePower', 'powerDiorama');
    toggleLayer('toggleMed', 'hospitalDiorama');

    // Inspector Action Buttons
    const btnIsolate = document.getElementById('btnIsolateMember');
    if (btnIsolate) {
      btnIsolate.addEventListener('click', () => {
        const data = nodeDetails[activeFocus] || nodeDetails['T-01'];
        window.applyHardeningToNode(data.backendId, `Isolate & Reinforce ${data.title}`);
      });
    }
    const btnFinite = document.getElementById('btnFiniteAnalysis');
    if (btnFinite) {
      btnFinite.addEventListener('click', solveCascade);
    }
  }

  // -------------------------------------------------------------
  // 8. Offline Local City Graph (Metropolis-7 Baseline Generator)
  // -------------------------------------------------------------
  function createLocalCityModel() {
    const nodes = [
      { id: 'hosp_central', domain: 'health', type: 'hospital', name: 'Central Hospital', district: 'Medical District', x: 500, y: 545, capacity: 450, load: 380, population_served: 180000 },
      { id: 'hosp_east', domain: 'health', type: 'hospital', name: 'East Hospital', district: 'East Residential', x: 826, y: 325, capacity: 350, load: 290, population_served: 110000 },
      { id: 'hosp_west', domain: 'health', type: 'hospital', name: 'West Hospital', district: 'West Riverfront', x: 283, y: 435, capacity: 280, load: 220, population_served: 80000 },
      { id: 'clinic_north', domain: 'health', type: 'clinic', name: 'North Clinic', district: 'North Industrial', x: 490, y: 220, capacity: 120, load: 95, population_served: 35000 },
      { id: 'clinic_south', domain: 'health', type: 'clinic', name: 'South Clinic', district: 'Downtown Core', x: 500, y: 765, capacity: 130, load: 100, population_served: 40000 },
      { id: 'clinic_east', domain: 'health', type: 'clinic', name: 'East Clinic', district: 'East Residential', x: 840, y: 520, capacity: 110, load: 85, population_served: 30000 },
      { id: 'clinic_west', domain: 'health', type: 'clinic', name: 'West Clinic', district: 'West Riverfront', x: 180, y: 310, capacity: 110, load: 80, population_served: 28000 },
      { id: 'sub_downtown', domain: 'power', type: 'substation', name: 'Downtown Power Station', district: 'Downtown Core', x: 522, y: 458, capacity: 600, load: 510, population_served: 220000 },
      { id: 'sub_north', domain: 'power', type: 'substation', name: 'North Power Station', district: 'North Industrial', x: 500, y: 60, capacity: 480, load: 390, population_served: 85000 },
      { id: 'sub_east', domain: 'power', type: 'substation', name: 'East Power Station', district: 'East Residential', x: 820, y: 420, capacity: 520, load: 430, population_served: 140000 },
      { id: 'sub_west', domain: 'power', type: 'substation', name: 'West Power Station', district: 'West Riverfront', x: 174, y: 435, capacity: 400, load: 310, population_served: 95000 },
      { id: 'sub_south', domain: 'power', type: 'substation', name: 'South Power Station', district: 'South Hub', x: 480, y: 760, capacity: 450, load: 340, population_served: 110000 }
    ];

    // Generate 7x8 road intersections
    const rows = 7, cols = 8;
    const xStart = 120, xEnd = 880, yStart = 160, yEnd = 820;
    const dx = (xEnd - xStart) / (cols - 1);
    const dy = (yEnd - yStart) / (rows - 1);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isBridge = (c === 2 && (r >= 2 && r <= 4));
        const nid = `road_${r}_${c}`;
        const district = c <= 2 ? 'West Riverfront' : (c >= 6 ? 'East Residential' : 'Downtown Core');
        const bridgeNames = { 2: 'North Bridge', 3: 'Central Bridge', 4: 'South Bridge' };
        nodes.push({
          id: nid,
          domain: 'road',
          type: isBridge ? 'bridge' : 'intersection',
          name: isBridge ? bridgeNames[r] : `${district} Junction ${r + 1}-${c + 1}`,
          district,
          x: xStart + c * dx,
          y: yStart + r * dy,
          capacity: isBridge ? 3200 : 1800,
          load: isBridge ? 2750 : 1200,
          population_served: isBridge ? 35000 : 8000
        });
      }
    }

    const edges = [];
    let edgeId = 0;
    // Connect road grid
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = `road_${r}_${c}`;
        if (c + 1 < cols) {
          const v = `road_${r}_${c+1}`;
          const isBr = (c === 2 && (r >= 2 && r <= 4));
          edges.push({
            id: `edge_road_${edgeId++}`,
            source: u, target: v,
            domain: 'road',
            type: isBr ? 'bridge' : 'road_segment',
            name: isBr ? 'Bridge Span' : 'Road Segment',
            capacity: isBr ? 3400 : 2200,
            load: isBr ? 2900 : 1450
          });
        }
        if (r + 1 < rows) {
          const v = `road_${r+1}_${c}`;
          edges.push({
            id: `edge_road_${edgeId++}`,
            source: u, target: v,
            domain: 'road',
            type: 'road_segment',
            name: 'Avenue Corridor',
            capacity: 2200,
            load: 1400
          });
        }
      }
    }

    // Ambulance routes
    edges.push(
      { id: `edge_amb_0`, source: 'hosp_central', target: 'road_3_4', domain: 'health', type: 'ambulance_route', capacity: 900, load: 350 },
      { id: `edge_amb_1`, source: 'hosp_central', target: 'road_3_3', domain: 'health', type: 'ambulance_route', capacity: 800, load: 410 },
      { id: `edge_amb_2`, source: 'hosp_east', target: 'road_2_6', domain: 'health', type: 'ambulance_route', capacity: 800, load: 260 },
      { id: `edge_amb_3`, source: 'hosp_west', target: 'road_3_1', domain: 'health', type: 'ambulance_route', capacity: 700, load: 220 }
    );

    return { nodes, edges, dependency_edges: [] };
  }

  function chr(code) {
    return String.fromCharCode(code);
  }

  // -------------------------------------------------------------
  // 10. Cinematic Director Bridge
  // -------------------------------------------------------------
  // src/cinematic.js drives a scripted, camera-choreographed run of the simulator for the
  // demo video. It needs to move the *real* dashboard (not a mock overlay), so the pieces
  // of this module's private state it has to touch are exposed here in one place rather
  // than scattered through window.*. Read-only where possible.
  window.__cinema = {
    get city() { return cityData; },
    get engine() { return polybridge; },
    get result() { return simulationResult; },
    get focusKey() { return activeFocus; },
    nodeDetails: nodeDetails,

    /** Paint one cascade step into the 3D scene without touching the KPI panels. */
    renderStep(result, stepIndex) {
      simulationResult = result;
      currentStepIndex = stepIndex;
      if (polybridge && cityData) polybridge.updateScene(cityData, result, stepIndex);
    },

    /** Push one step's metrics through the real telemetry panel. */
    paintMetrics(metrics, focusKey) {
      const d = nodeDetails[focusKey || activeFocus] || nodeDetails['T-01'];
      d.pop = metrics.people_affected;
      d.strainPct = `+${Math.min(300, Math.max(0, metrics.travel_time_increase_pct))}% delay`;
      d.corridorsSevered = `${metrics.emergency_routes_disrupted} Corridors`;
      d.stabilizationTime = `${metrics.estimated_recovery_hours}h 00m`;
      updateTelemetry(d);
      setText('kpiPopSub', `${metrics.total_nodes_failed} assets failed · ${metrics.total_nodes_degraded} degraded · ${metrics.hospitals_affected} hospital${metrics.hospitals_affected === 1 ? '' : 's'} stressed`);
      setText('kpiGeneratorReserve', `${metrics.hospitals_affected > 0 ? 'Engaged' : 'Standby'} (${metrics.estimated_recovery_hours}h to stabilize)`);
      setInspectorStressBar(metrics.resilience_score);
    },

    setFeaStatus(text) { setText('kpiFeaStatus', text); },
    narrate(result) { renderCascadeNarrativeLog(result); },
    recommend(result) { renderHardeningRecommendations(result); },
    applyComparison(comp, focusKey) {
      const d = nodeDetails[focusKey || activeFocus] || nodeDetails['T-01'];
      applyComparisonToBeforeAfter(d, comp);
      updateBeforeAfterHud(focusKey || activeFocus, d);
    },
    arm(nodeId) { selectFailurePoint(nodeId, { solve: false }); },
    reset(opts) { applyNominalBaseline(opts); },
    setActuators(magPct, durHours, weatherKts) {
      const m = document.getElementById('rangeMagnitude');
      const d = document.getElementById('rangeDuration');
      const w = document.getElementById('rangeWeather');
      if (m) m.value = magPct;
      if (d) d.value = durHours;
      if (w) w.value = weatherKts;
      setText('valMagnitude', `${magPct}% [Elastic]`);
      setText('valDuration', `${Number(durHours).toFixed(1)} Hours`);
      setText('valWeather', `${weatherKts}°C Ambient`);
      syncActuatorsSummary();
    }
  };

  // Boot on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
