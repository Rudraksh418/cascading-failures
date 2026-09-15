import React from 'react';

/**
 * ImpactDashboard View
 * Real-time metrics tracking people affected, road overloads, disrupted emergency routes,
 * and estimated recovery times, styled as an industrial telemetry console.
 */
export function ImpactDashboard({ metrics, baselineMetrics }) {
  const m = metrics || baselineMetrics || {
    people_affected: 0,
    people_affected_formatted: '0',
    travel_time_increase_pct: 0,
    emergency_routes_disrupted: 0,
    hospitals_affected: 0,
    roads_overloaded: 0,
    estimated_recovery_hours: 0,
    resilience_score: 98,
    pop_by_domain: { power: 0, road: 0, health: 0 }
  };

  const score = m.resilience_score || 98;
  const circumference = 264; // 2 * pi * 42
  const offset = circumference - (score / 100) * circumference;

  let scoreColor = 'var(--pb-green-safety)';
  let scoreLabel = 'STRUCTURAL EQUILIBRIUM NOMINAL';
  if (score < 50) {
    scoreColor = 'var(--pb-red-failure)';
    scoreLabel = 'CRITICAL CASCADE OVERLOAD DETECTED';
  } else if (score < 80) {
    scoreColor = 'var(--pb-amber-hazard)';
    scoreLabel = 'HEAVY ARTERIAL STRESS DETECTED';
  }

  // Sector breakdown math
  const pPop = m.pop_by_domain?.power || 0;
  const rPop = m.pop_by_domain?.road || 0;
  const hPop = m.pop_by_domain?.health || 0;
  const totalDomainPop = Math.max(1, pPop + rPop + hPop);

  return (
    <div className="pb-tab-content">
      {/* 1. Hydraulic Resilience Dial */}
      <div className="id-resilience-dial">
        <div className="id-dial-gauge">
          <svg viewBox="0 0 100 100" className="id-dial-svg">
            <circle cx="50" cy="50" r="42" className="id-dial-bg" />
            <circle
              cx="50"
              cy="50"
              r="42"
              className="id-dial-fill"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ stroke: scoreColor }}
            />
          </svg>
          <div className="id-dial-center" style={{ color: scoreColor }}>
            {score}
          </div>
        </div>

        <div className="id-dial-info">
          <h4>RESILIENCE INDEX</h4>
          <p style={{ color: scoreColor, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {scoreLabel}
          </p>
          <p>
            Measures structural load absorption tolerance across power grid and traffic arteries.
          </p>
        </div>
      </div>

      {/* 2. High-Contrast KPI Cards Grid */}
      <div className="id-kpi-grid">
        {/* Citizens Affected */}
        <div className="id-kpi-card alert-fail">
          <div className="id-kpi-title">👥 POPULATION AFFECTED</div>
          <div className="id-kpi-value" style={{ color: m.people_affected > 0 ? 'var(--pb-red-failure)' : '#fff' }}>
            {m.people_affected_formatted || m.people_affected.toLocaleString()}
          </div>
          <div className="id-kpi-sub">
            {((m.people_affected / 420000) * 100).toFixed(1)}% of urban population
          </div>
        </div>

        {/* Travel Time Surge */}
        <div className="id-kpi-card alert-warn">
          <div className="id-kpi-title">⏱️ TRAVEL DELAY SURGE</div>
          <div className="id-kpi-value" style={{ color: m.travel_time_increase_pct > 0 ? 'var(--pb-amber-hazard)' : '#fff' }}>
            +{m.travel_time_increase_pct}%
          </div>
          <div className="id-kpi-sub">Arterial congestion factor</div>
        </div>

        {/* Emergency Routes Disrupted */}
        <div className="id-kpi-card alert-fail">
          <div className="id-kpi-title">🚑 AMBULANCE CORRIDORS</div>
          <div className="id-kpi-value">
            {m.emergency_routes_disrupted} / 11
          </div>
          <div className="id-kpi-sub">Priority arteries severed</div>
        </div>

        {/* Hospitals Compromised */}
        <div className="id-kpi-card alert-warn">
          <div className="id-kpi-title">🏥 HOSPITALS STRESSED</div>
          <div className="id-kpi-value">
            {m.hospitals_affected} / 7
          </div>
          <div className="id-kpi-sub">Trauma centers degraded</div>
        </div>

        {/* Road Segments Overloaded */}
        <div className="id-kpi-card alert-warn">
          <div className="id-kpi-title">🚧 BUCKLING ROAD ARTERIES</div>
          <div className="id-kpi-value">
            {m.roads_overloaded} / 120
          </div>
          <div className="id-kpi-sub">Exceeding 115% threshold</div>
        </div>

        {/* Estimated Recovery Time */}
        <div className="id-kpi-card alert-info">
          <div className="id-kpi-title">⏳ MEAN TIME TO RECOVERY</div>
          <div className="id-kpi-value">
            {m.estimated_recovery_hours}h
          </div>
          <div className="id-kpi-sub">Full system restoration</div>
        </div>
      </div>

      {/* 3. Sector Impact Distribution Meter */}
      <div className="id-sector-box">
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8' }}>
          SECTOR DISRUPTION DISTRIBUTION
        </div>
        <div className="id-sector-bar">
          <div
            className="id-bar-seg power"
            style={{ width: `${(pPop / totalDomainPop) * 100}%` }}
            title={`Power: ${pPop.toLocaleString()}`}
          />
          <div
            className="id-bar-seg road"
            style={{ width: `${(rPop / totalDomainPop) * 100}%` }}
            title={`Road: ${rPop.toLocaleString()}`}
          />
          <div
            className="id-bar-seg health"
            style={{ width: `${(hPop / totalDomainPop) * 100}%` }}
            title={`Health: ${hPop.toLocaleString()}`}
          />
        </div>
        <div className="id-sector-legend">
          <span>⚡ Power: {pPop.toLocaleString()}</span>
          <span>🛣️ Road: {rPop.toLocaleString()}</span>
          <span>🏥 Health: {hPop.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
