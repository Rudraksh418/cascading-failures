import React, { useRef, useState, useEffect } from 'react';
import { PolyBridge3D } from '../polybridge3d.js';

/**
 * SimulationCanvas View
 * Full Interactive 3D City Model in the Poly Bridge Style:
 * - Low-poly procedural 3D models for Hospitals (helipad, cross), Truss Bridges (pin joints, snapping stress),
 *   Substations (transformers, insulators), Clinics, Road networks, and River terrain.
 * - 3D Orbit Camera (Rotate, Pan, Zoom, Perspective/Isometric).
 * - Animated 3D Blast Radius Dome.
 * - Integrated Playback Scrubber Deck.
 */
export function SimulationCanvas({
  cityData,
  simulationResult,
  currentStepIndex,
  onStepChange,
  isPlaying,
  onTogglePlay,
  layers,
  onSelectNode
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [isIso, setIsIso] = useState(false);

  // Initialize WebGL 3D Engine
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new PolyBridge3D(canvasRef.current, {
      onSelectNode: (node) => {
        if (node) onSelectNode(node);
      },
      onHoverNode: (node, screenPos) => {
        setHoveredNode(node);
        if (screenPos) {
          setTooltipPos(screenPos);
        }
      }
    });

    engineRef.current = engine;

    return () => {
      engine.destroy();
    };
  }, []);

  // Update 3D Scene when city data, simulation, or step changes
  useEffect(() => {
    if (engineRef.current && cityData) {
      engineRef.current.updateScene(cityData, simulationResult, currentStepIndex);
    }
  }, [cityData, simulationResult, currentStepIndex]);

  const totalSteps = simulationResult?.steps?.length || 1;
  const currentStep = simulationResult?.steps?.[currentStepIndex] || {
    description: 'Nominal 3D City Operations — all structural infrastructure within safety tolerance.'
  };

  const handleResetCam = () => {
    if (engineRef.current) {
      engineRef.current.resetCamera();
    }
  };

  const handleToggleIso = () => {
    if (engineRef.current) {
      engineRef.current.toggleIsometric();
      setIsIso(!isIso);
    }
  };

  return (
    <div className="pb-simulation-stage">
      {/* 3D Viewport Toolbar */}
      <div className="pb-canvas-toolbar">
        <div className="pb-domain-toggles">
          <button className="btn-pb" onClick={handleResetCam} title="Reset 3D Camera">
            ↺ RESET 3D CAM
          </button>
          <button className="btn-pb" onClick={handleToggleIso} title="Toggle Perspective / Isometric">
            {isIso ? '📐 ISOMETRIC' : '🎥 PERSPECTIVE'}
          </button>
          <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            [L-DRAG: ORBIT • R-DRAG: PAN • WHEEL: ZOOM]
          </span>
        </div>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--pb-blueprint-cyan)' }}>
          3D POLY BRIDGE RIG • METROPOLIS-7
        </div>
      </div>

      {/* 3D WebGL Canvas */}
      <div className="pb-canvas-viewport blueprint-grid-bg" style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {/* 3D Hover Tooltip */}
        {hoveredNode && (
          <div
            className="pb-tooltip"
            style={{
              left: `${Math.min(window.innerWidth - 300, tooltipPos.x + 16)}px`,
              top: `${Math.min(window.innerHeight - 200, tooltipPos.y + 16)}px`
            }}
          >
            <div className="pb-tt-title">{hoveredNode.name}</div>
            <div className="pb-tt-sub">{hoveredNode.type.toUpperCase()} • {hoveredNode.district}</div>
            <div className="pb-tt-row">
              <span>Operating Load:</span>
              <span className="val">{Math.round(hoveredNode.load)} / {Math.round(hoveredNode.effective_capacity)}</span>
            </div>
            <div className="pb-tt-row">
              <span>Population Served:</span>
              <span className="val">{hoveredNode.population_served.toLocaleString()}</span>
            </div>
            <div className="pb-tt-row">
              <span>3D Model:</span>
              <span className="val" style={{ color: 'var(--pb-amber-hazard)' }}>
                {hoveredNode.type === 'hospital' ? '🏥 3D Trauma Tower' : (hoveredNode.type === 'bridge' ? '🌉 3D Truss Span' : (hoveredNode.domain === 'power' ? '⚡ 3D Substation' : '🛣️ 3D Arterial'))}
              </span>
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--pb-blueprint-cyan)', marginTop: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
              Click 3D asset to inspect in Control Deck
            </div>
          </div>
        )}
      </div>

      {/* Playback Control Deck */}
      <div className="pb-playback-deck riveted-panel">
        <div className="pb-playback-buttons">
          <button
            className="btn-pb"
            onClick={() => onStepChange(Math.max(0, currentStepIndex - 1))}
            title="Step Back"
          >
            ◀
          </button>
          <button className="pb-btn-play" onClick={onTogglePlay} title="Play/Pause">
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="btn-pb"
            onClick={() => onStepChange(Math.min(totalSteps - 1, currentStepIndex + 1))}
            title="Step Next"
          >
            ▶
          </button>
          <div className="pb-step-readout">
            STAGE {currentStepIndex} / {totalSteps - 1}
          </div>
        </div>

        <div className="pb-scrubber-wrapper">
          <input
            type="range"
            min={0}
            max={totalSteps - 1}
            value={currentStepIndex}
            onChange={(e) => onStepChange(parseInt(e.target.value, 10))}
            className="pb-slider"
          />
        </div>

        <div className="pb-step-ticker" title={currentStep.description}>
          {currentStep.description}
        </div>
      </div>
    </div>
  );
}
