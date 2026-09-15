import React, { useState } from 'react';

/**
 * ControlDeck View
 * Mechanical control panel for parameter adjustments, natural language input,
 * and preset scenario triggers.
 */
export function ControlDeck({
  cityData,
  selectedNode,
  onSelectNode,
  onSimulate,
  onReinforce,
  activePreset,
  onSelectPreset
}) {
  const [nlQuery, setNlQuery] = useState('');
  const [magnitude, setMagnitude] = useState(100);
  const [duration, setDuration] = useState(8);

  const presets = cityData?.presets || [
    {
      id: 'preset_blackout',
      title: '⚡ Downtown Grid Blackout',
      description: 'Substation Beta trips -> Traffic signals dark -> Downtown gridlock -> Metropolis General isolated.',
      node_id: 'sub_downtown',
      magnitude: 1.0,
      duration_hours: 8.0
    },
    {
      id: 'preset_bridge',
      title: '🌉 Gateway Bridge Severance',
      description: 'Arterial bridge closed -> Traffic spills over to North Bridge -> City-wide gridlock -> Ambulances blocked.',
      node_id: 'road_3_2',
      magnitude: 1.0,
      duration_hours: 12.0
    },
    {
      id: 'preset_hospital_power',
      title: '🏥 General Hospital Feeder Trip',
      description: 'Primary electrical feed lost -> Hospital capacity drops to 45% -> Emergency intake overflows to suburban clinics.',
      node_id: 'hosp_central',
      magnitude: 0.8,
      duration_hours: 6.0
    },
    {
      id: 'preset_north_industrial',
      title: '🏭 North Grid Substation Surge',
      description: 'Industrial feeder overload cascades into northern transit corridor and clinic.',
      node_id: 'sub_north',
      magnitude: 1.0,
      duration_hours: 10.0
    }
  ];

  const handleNLSubmit = (e) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;

    // Fast local semantic resolution or pass to backend
    const q = nlQuery.toLowerCase();
    let targetId = 'sub_downtown';
    let mag = 1.0;
    let dur = 8.0;

    if (q.includes('bridge') || q.includes('river')) targetId = 'road_3_2';
    else if (q.includes('hospital') || q.includes('health') || q.includes('general')) targetId = 'hosp_central';
    else if (q.includes('north')) targetId = 'sub_north';
    else if (q.includes('east')) targetId = 'sub_east';
    else if (q.includes('west')) targetId = 'sub_west';

    if (q.includes('50%') || q.includes('half')) mag = 0.5;
    else if (q.includes('80%')) mag = 0.8;

    const durMatch = q.match(/(\d+)\s*h/);
    if (durMatch) dur = parseFloat(durMatch[1]);

    const node = cityData?.nodes?.find((n) => n.id === targetId);
    if (node) onSelectNode(node);

    onSimulate(targetId, mag, dur);
  };

  const handleTrigger = () => {
    const targetId = selectedNode ? selectedNode.id : 'sub_downtown';
    onSimulate(targetId, magnitude / 100.0, duration);
  };

  const handleReinforce = () => {
    const targetId = selectedNode ? selectedNode.id : 'sub_downtown';
    onReinforce(targetId);
  };

  return (
    <div className="pb-tab-content">
      {/* 1. Natural Language Input Box */}
      <div className="cd-section">
        <div className="cd-title">
          <span>🦋</span> THE BUTTERFLY EFFECT — SCENARIO PARSER
        </div>
        <form onSubmit={handleNLSubmit} className="cd-nl-box">
          <input
            type="text"
            className="cd-nl-input"
            placeholder="e.g. 'What happens if Central Gateway Bridge closes for 12 hours?'"
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
          />
          <button type="submit" className="btn-pb btn-pb-primary">
            PARSE
          </button>
        </form>
      </div>

      {/* 2. Greatest Hits Preset Scenarios */}
      <div className="cd-section">
        <div className="cd-title">
          <span>⚙️</span> STANDARD STRESS TEST PRESETS
        </div>
        <div className="cd-presets-grid">
          {presets.map((preset) => {
            const isActive = activePreset === preset.id;
            return (
              <div
                key={preset.id}
                className={`cd-preset-card ${isActive ? 'active' : ''}`}
                onClick={() => {
                  onSelectPreset(preset.id);
                  const node = cityData?.nodes?.find((n) => n.id === preset.node_id);
                  if (node) onSelectNode(node);
                  onSimulate(preset.node_id, preset.magnitude, preset.duration_hours);
                }}
              >
                <div className="cd-preset-title">{preset.title}</div>
                <div className="cd-preset-desc">{preset.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Mechanical Parameter Sliders */}
      <div className="cd-section">
        <div className="cd-title">
          <span>🎛️</span> SIMULATION TEST BENCH
        </div>

        {/* Selected Initiating Asset */}
        <div className="cd-slider-box" style={{ marginBottom: '12px' }}>
          <div className="cd-slider-header">
            <span className="cd-slider-label">INITIATING DISRUPTIVE ASSET</span>
            <span className="cd-slider-readout" style={{ color: 'var(--pb-blueprint-cyan)' }}>
              {selectedNode ? selectedNode.name : 'Substation Beta (Downtown Central)'}
            </span>
          </div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            District: {selectedNode ? selectedNode.district : 'Downtown Core'} • Serves: {selectedNode ? selectedNode.population_served.toLocaleString() : '160,000'} residents
          </div>
        </div>

        {/* Magnitude Slider */}
        <div className="cd-slider-box">
          <div className="cd-slider-header">
            <span className="cd-slider-label">DISRUPTION MAGNITUDE</span>
            <span className="cd-slider-readout">{magnitude}% (CAPACITY SEVERED)</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={magnitude}
            onChange={(e) => setMagnitude(parseInt(e.target.value, 10))}
            className="pb-slider"
          />
        </div>

        {/* Duration Slider */}
        <div className="cd-slider-box">
          <div className="cd-slider-header">
            <span className="cd-slider-label">OUTAGE DURATION</span>
            <span className="cd-slider-readout">{duration}.0 HOURS</span>
          </div>
          <input
            type="range"
            min={1}
            max={48}
            step={1}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value, 10))}
            className="pb-slider"
          />
        </div>
      </div>

      {/* 4. Action Push Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
        <button
          className="btn-pb btn-pb-hazard"
          style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
          onClick={handleTrigger}
        >
          💥 TRIGGER CASCADING STRESS TEST
        </button>

        <button
          className="btn-pb"
          style={{ width: '100%', justifyContent: 'center', padding: '9px' }}
          onClick={handleReinforce}
        >
          🛡️ SIMULATE ASSET REINFORCEMENT (+60% CAP)
        </button>
      </div>
    </div>
  );
}
