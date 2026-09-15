import React from 'react';

/**
 * RecommendationPanel View
 * Ranked list of critical infrastructure assets derived from precomputed betweenness centrality,
 * with interactive reinforcement impact comparison and AI debrief.
 */
export function RecommendationPanel({
  criticalAssets,
  comparisonData,
  onReinforce,
  explanation
}) {
  return (
    <div className="pb-tab-content">
      {/* 1. Comparison Banner (Before vs After Reinforcement) */}
      {comparisonData && (
        <div className="rp-banner">
          <div className="rp-banner-title">
            <span>🛡️</span> REINFORCEMENT MITIGATION DELTA
          </div>
          <div className="rp-banner-grid">
            <div className="rp-banner-stat">
              <span className="lbl">CITIZENS SAVED</span>
              <span className="val">
                +{comparisonData.population_protected.toLocaleString()}
              </span>
            </div>
            <div className="rp-banner-stat">
              <span className="lbl">CONGESTION CUT</span>
              <span className="val">
                −{comparisonData.travel_time_saved_pct}%
              </span>
            </div>
            <div className="rp-banner-stat">
              <span className="lbl">RECOVERY SAVED</span>
              <span className="val">
                −{comparisonData.recovery_time_saved_hours}h
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Intro Header */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--pb-blueprint-cyan)', marginBottom: '4px' }}>
          STRUCTURAL BOTTLENECK RANKING
        </div>
        <p style={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.35 }}>
          Precomputed Brandes' Betweenness Centrality identifies the single points of failure (SPOF) carrying the highest systemic flow.
        </p>
      </div>

      {/* 3. Ranked Critical Assets List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {(criticalAssets || []).map((asset) => (
          <div key={asset.node_id} className="rp-asset-card">
            <div className="rp-asset-header">
              <span className="rp-rank-tag">RANK #{asset.rank}</span>
              <span className="rp-asset-name">{asset.name}</span>
              <span className="rp-bc-score" title="Betweenness Centrality">
                BC: {(asset.centrality_score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="rp-rec-text">{asset.recommendation}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-pb"
                style={{ fontSize: '0.68rem', padding: '4px 10px' }}
                onClick={() => onReinforce(asset.node_id)}
              >
                🛡️ SIMULATE HARDENING
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 4. AI Executive Briefing */}
      {explanation && (
        <div style={{ background: '#08111e', border: '1px solid var(--pb-steel-border)', borderRadius: '4px', padding: '12px' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.74rem', fontWeight: 800, color: 'var(--pb-purple-accent)', textTransform: 'uppercase', marginBottom: '6px' }}>
            🧠 AI RESILIENCE BRIEFING
          </div>
          <p style={{ fontSize: '0.7rem', color: '#cbd5e1', lineHeight: 1.4, marginBottom: '8px' }}>
            <strong>Trigger:</strong> {explanation.root_cause}
          </p>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.4 }}>
            <strong>Recommendation:</strong> {explanation.investment_recommendation}
          </div>
        </div>
      )}
    </div>
  );
}
