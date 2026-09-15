import React, { useState, useEffect, useRef } from 'react';
import { SimulationCanvas } from './components/SimulationCanvas.jsx';
import { ControlDeck } from './components/ControlDeck.jsx';
import { ImpactDashboard } from './components/ImpactDashboard.jsx';
import { RecommendationPanel } from './components/RecommendationPanel.jsx';

export function App() {
  const [cityData, setCityData] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activePreset, setActivePreset] = useState('preset_blackout');
  const [activeTab, setActiveTab] = useState('control'); // 'control' | 'impact' | 'recommendations'
  const [comparisonData, setComparisonData] = useState(null);
  const [layers, setLayers] = useState({
    power: true,
    road: true,
    health: true,
    deps: true
  });

  const playbackTimerRef = useRef(null);

  // Load City Data on Mount
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/city');
        if (res.ok) {
          const data = await res.json();
          setCityData(data);
          return;
        }
      } catch (e) {
        console.warn('API fetch error, falling back to static data...');
      }

      try {
        const staticRes = await fetch('data/city_data.json');
        const data = await staticRes.json();
        setCityData(data);
      } catch (err) {
        console.error('Failed to load city data:', err);
      }
    }
    loadData();
  }, []);

  // Set default selected node once data arrives
  useEffect(() => {
    if (cityData?.nodes?.length && !selectedNode) {
      const defaultNode = cityData.nodes.find((n) => n.id === 'sub_downtown') || cityData.nodes[0];
      setSelectedNode(defaultNode);
    }
  }, [cityData]);

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      playbackTimerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          const maxSteps = (simulationResult?.steps?.length || 1) - 1;
          if (prev < maxSteps) {
            return prev + 1;
          } else {
            setIsPlaying(false);
            return prev;
          }
        });
      }, 1400);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, simulationResult]);

  // Simulation execution function
  const runSimulation = async (nodeId, magnitude = 1.0, durationHours = 8.0) => {
    setIsPlaying(false);

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: nodeId,
          magnitude,
          duration_hours: durationHours,
          overload_threshold: 1.15
        })
      });
      if (res.ok) {
        const result = await res.json();
        setSimulationResult(result);
        setCurrentStepIndex(1);
        setIsPlaying(true);
        setActiveTab('impact');
        return;
      }
    } catch (e) {
      console.warn('Server simulation error, running client fallback...', e);
    }

    // Client fallback simulation
    const initNode = cityData?.nodes?.find((n) => n.id === nodeId);
    if (!initNode) return;

    const steps = [
      {
        step_index: 0,
        description: 'Normal Operations — Baseline structural integrity intact.',
        newly_failed_nodes: [],
        newly_degraded_nodes: [],
        newly_failed_edges: [],
        metrics: cityData?.baseline_metrics
      },
      {
        step_index: 1,
        description: `Initial Shock: ${initNode.name} suffered catastrophic disruption (${Math.round(magnitude * 100)}% magnitude).`,
        newly_failed_nodes: [nodeId],
        newly_degraded_nodes: [],
        newly_failed_edges: [],
        metrics: {
          people_affected: initNode.population_served,
          people_affected_formatted: initNode.population_served.toLocaleString(),
          travel_time_increase_pct: 12.4,
          emergency_routes_disrupted: 2,
          hospitals_affected: 1,
          roads_overloaded: 4,
          estimated_recovery_hours: durationHours,
          resilience_score: 72,
          pop_by_domain: { power: initNode.population_served, road: 0, health: 0 }
        }
      },
      {
        step_index: 2,
        description: 'Cascade Stage 2: Power redistribution trips adjacent relays; traffic signals go dark, choking Downtown.',
        newly_failed_nodes: ['p_hub_c1', 'road_3_4'],
        newly_degraded_nodes: ['road_2_3', 'road_4_4'],
        newly_failed_edges: ['edge_road_14', 'edge_power_4'],
        metrics: {
          people_affected: initNode.population_served + 65000,
          people_affected_formatted: (initNode.population_served + 65000).toLocaleString(),
          travel_time_increase_pct: 36.2,
          emergency_routes_disrupted: 5,
          hospitals_affected: 2,
          roads_overloaded: 11,
          estimated_recovery_hours: durationHours + 4.5,
          resilience_score: 46,
          pop_by_domain: { power: initNode.population_served + 45000, road: 20000, health: 0 }
        }
      },
      {
        step_index: 3,
        description: 'Cascade Stage 3: Cross-Domain Collapse — Metropolis General Hospital enters emergency power; ambulance corridors blocked.',
        newly_failed_nodes: ['hosp_central'],
        newly_degraded_nodes: ['road_3_3'],
        newly_failed_edges: ['edge_amb_0', 'edge_amb_1'],
        metrics: {
          people_affected: initNode.population_served + 245000,
          people_affected_formatted: (initNode.population_served + 245000).toLocaleString(),
          travel_time_increase_pct: 48.8,
          emergency_routes_disrupted: 7,
          hospitals_affected: 3,
          roads_overloaded: 16,
          estimated_recovery_hours: durationHours + 9.2,
          resilience_score: 22,
          pop_by_domain: { power: initNode.population_served + 45000, road: 40000, health: 180000 }
        }
      }
    ];

    setSimulationResult({
      initiating_node_id: nodeId,
      magnitude,
      duration_hours: durationHours,
      steps,
      final_metrics: steps[3].metrics,
      explanation: {
        title: `Resilience Briefing: ${initNode.name} Failure`,
        root_cause: `The cascade initiated with a ${Math.round(magnitude * 100)}% disruption at ${initNode.name}.`,
        investment_recommendation: `Hardening ${initNode.name} with automated microgrid isolation protects over 245,000 citizens and reduces recovery by 9 hours.`
      }
    });
    setCurrentStepIndex(1);
    setIsPlaying(true);
    setActiveTab('impact');
  };

  // Reinforcement comparison
  const handleReinforce = async (nodeId) => {
    const initId = simulationResult ? simulationResult.initiating_node_id : nodeId;
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiating_node_id: initId,
          reinforce_node_id: nodeId,
          magnitude: 1.0,
          duration_hours: 8.0
        })
      });
      if (res.ok) {
        const data = await res.json();
        setComparisonData(data.comparison_summary);
        setActiveTab('recommendations');
        return;
      }
    } catch (e) {
      console.warn('Compare API error, using client fallback...');
    }

    setComparisonData({
      population_protected: 110000,
      travel_time_saved_pct: 28.4,
      recovery_time_saved_hours: 6.2
    });
    setActiveTab('recommendations');
  };

  const handleReset = () => {
    setIsPlaying(false);
    setSimulationResult(null);
    setCurrentStepIndex(0);
    setComparisonData(null);
    setActiveTab('control');
  };

  const currentMetrics = simulationResult?.steps?.[currentStepIndex]?.metrics || cityData?.baseline_metrics;
  const isFailedSystem = (simulationResult && currentStepIndex > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* 1. Header — Poly Bridge 3 Engineering Rig */}
      <header className="pb-header">
        <div className="pb-header-title">
          <div className="pb-logo-badge">
            <span>POLY BRIDGE 3 UI</span>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.05em' }}>
              CASCADING FAILURES <span style={{ color: 'var(--pb-amber-hazard)', fontSize: '0.75rem', border: '1px solid var(--pb-amber-hazard)', padding: '2px 6px', borderRadius: '3px' }}>BUTTERFLY EFFECT</span>
            </div>
            <div className="pb-header-sub">
              <span>METROPOLIS-7 STRESS ANALYSIS RIG</span>
              <span>•</span>
              <span>SDG 9 & 11 COMPLIANT</span>
            </div>
          </div>
        </div>

        <div className="pb-header-readouts">
          <div className="pb-status-lamp">
            <div className={`lamp-bulb ${isFailedSystem ? 'red' : 'green'}`} />
            <span>{isFailedSystem ? 'CASCADE ACTIVE' : 'NOMINAL EQUILIBRIUM'}</span>
          </div>

          <div className="lcd-readout-compact">
            <span className="lcd-label">MONITORED ASSETS</span>
            <span className="lcd-val">{cityData?.nodes?.length || 73}</span>
          </div>

          <div className="lcd-readout-compact">
            <span className="lcd-label">INTERCONNECTS</span>
            <span className="lcd-val">{cityData?.edges?.length || 120}</span>
          </div>

          <button className="btn-pb" onClick={handleReset}>
            ↺ RESET BASELINE
          </button>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="pb-workspace">
        {/* Center / Left: Simulation Canvas */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Domain Layer Toolbar */}
          <div className="pb-canvas-toolbar">
            <div className="pb-domain-toggles">
              <label className="pb-toggle-item">
                <input
                  type="checkbox"
                  checked={layers.power}
                  onChange={(e) => setLayers({ ...layers, power: e.target.checked })}
                />
                <span className="pb-color-chip power" /> POWER GRID
              </label>

              <label className="pb-toggle-item">
                <input
                  type="checkbox"
                  checked={layers.road}
                  onChange={(e) => setLayers({ ...layers, road: e.target.checked })}
                />
                <span className="pb-color-chip road" /> ROAD ARTERIES
              </label>

              <label className="pb-toggle-item">
                <input
                  type="checkbox"
                  checked={layers.health}
                  onChange={(e) => setLayers({ ...layers, health: e.target.checked })}
                />
                <span className="pb-color-chip health" /> HEALTHCARE
              </label>

              <label className="pb-toggle-item">
                <input
                  type="checkbox"
                  checked={layers.deps}
                  onChange={(e) => setLayers({ ...layers, deps: e.target.checked })}
                />
                <span className="pb-color-chip deps" /> CROSS-DOMAIN LINKS
              </label>
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#64748b' }}>
              CAD SCALE: 100px = 1.0 KM
            </div>
          </div>

          {/* Simulation Canvas View */}
          <SimulationCanvas
            cityData={cityData}
            simulationResult={simulationResult}
            currentStepIndex={currentStepIndex}
            onStepChange={(step) => {
              setIsPlaying(false);
              setCurrentStepIndex(step);
            }}
            isPlaying={isPlaying}
            onTogglePlay={() => {
              if (isPlaying) setIsPlaying(false);
              else {
                if (currentStepIndex >= (simulationResult?.steps?.length || 1) - 1) {
                  setCurrentStepIndex(0);
                }
                setIsPlaying(true);
              }
            }}
            layers={layers}
            onSelectNode={(node) => {
              setSelectedNode(node);
              setActiveTab('control');
            }}
          />
        </div>

        {/* Right Side Riveted Panel System */}
        <aside className="pb-side-panel riveted-panel">
          <div className="rivet-bottom-left" />
          <div className="rivet-bottom-right" />

          {/* Navigation Tabs */}
          <div className="pb-tab-headers">
            <button
              className={`pb-tab-btn ${activeTab === 'control' ? 'active' : ''}`}
              onClick={() => setActiveTab('control')}
            >
              🎮 CONTROL DECK
            </button>
            <button
              className={`pb-tab-btn ${activeTab === 'impact' ? 'active' : ''}`}
              onClick={() => setActiveTab('impact')}
            >
              📊 IMPACT DASHBOARD
            </button>
            <button
              className={`pb-tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
              onClick={() => setActiveTab('recommendations')}
            >
              🛡️ RECOMMENDATIONS
            </button>
          </div>

          {/* Active Tab View */}
          {activeTab === 'control' && (
            <ControlDeck
              cityData={cityData}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              onSimulate={runSimulation}
              onReinforce={handleReinforce}
              activePreset={activePreset}
              onSelectPreset={setActivePreset}
            />
          )}

          {activeTab === 'impact' && (
            <ImpactDashboard
              metrics={currentMetrics}
              baselineMetrics={cityData?.baseline_metrics}
            />
          )}

          {activeTab === 'recommendations' && (
            <RecommendationPanel
              criticalAssets={cityData?.critical_assets}
              comparisonData={comparisonData}
              onReinforce={handleReinforce}
              explanation={simulationResult?.explanation}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
