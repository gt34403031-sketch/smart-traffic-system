'use client';

import React, { useRef, useEffect, useState } from 'react';
import { SmartCity3DScene, CameraPreset } from '@/lib/simulation/3d-scene';
import { TrafficSimulationEngine } from '@/lib/simulation/traffic-engine';
import { Vehicle } from '@/lib/simulation/types';
import { Eye, Layers, Compass, Video, AlertTriangle } from 'lucide-react';

interface CityViewport3DProps {
  engine: TrafficSimulationEngine;
  onVehicleSelected?: (vehicle: Vehicle | null) => void;
  selectedVehicle: Vehicle | null;
}

export const CityViewport3D: React.FC<CityViewport3DProps> = ({
  engine,
  onVehicleSelected,
  selectedVehicle,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SmartCity3DScene | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraPreset>('ISOMETRIC');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [isGridMode, setIsGridMode] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    // Initialize 3D Scene
    const scene = new SmartCity3DScene(mountRef.current, engine);
    sceneRef.current = scene;

    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const dt = (currentTime - lastTime) / 1000.0;
      lastTime = currentTime;

      // Step simulation engine
      engine.step(dt);

      // Render 3D Scene
      scene.render(dt);

      // Check emergency presence
      const hasEmergency = Array.from(engine.vehicles.values()).some((v) => v.isEmergency);
      setIsEmergencyActive(hasEmergency);

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    // Resize observer
    const handleResize = () => {
      if (mountRef.current && sceneRef.current) {
        sceneRef.current.handleResize(
          mountRef.current.clientWidth,
          mountRef.current.clientHeight
        );
      }
    };
    window.addEventListener('resize', handleResize);

    const mountNode = mountRef.current;

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      scene.dispose();
      if (mountNode && scene.renderer.domElement && mountNode.contains(scene.renderer.domElement)) {
        mountNode.removeChild(scene.renderer.domElement);
      }
    };
  }, [engine]);

  // Handle camera switch
  const handleCameraChange = (preset: CameraPreset) => {
    setCameraMode(preset);
    if (sceneRef.current) {
      sceneRef.current.setCameraPreset(preset);
    }
  };

  // Toggle grid mode
  const handleToggleGrid = () => {
    const nextState = !isGridMode;
    setIsGridMode(nextState);
    engine.setGridMode(nextState);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 flex flex-col">
      {/* 3D WebGL Canvas Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Floating HUD: Minimal Spec Badge & Viewport Tools */}
      <div className="relative z-10 flex items-center justify-between p-3 pointer-events-none">
        {/* Left: Intersection Identification */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/85 border border-slate-800/80 rounded-lg px-3 py-1.5 shadow-lg">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-200">
              {isGridMode ? '4-Way Connected Network (2x2 Grid)' : 'Central Smart Intersection (INT-01)'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              GPS: 40.7128° N, 74.0060° W · 12 Lanes · 4 Approaches
            </span>
          </div>
        </div>

        {/* Center: Cardinal Orientation Guide & Emergency Corridor Banner if triggered */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Cardinal Directions Legend */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 rounded-lg px-3 py-1.5 shadow-lg text-[11px] font-mono">
            <span className="flex items-center gap-1 text-cyan-300 font-bold">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              NORTH (Tech)
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 font-medium">SOUTH (Highway)</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 font-medium">EAST (Mall)</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300 font-medium">WEST (Hospital)</span>
          </div>

          {isEmergencyActive && (
            <div className="flex items-center gap-2 bg-red-950/90 border border-red-500/80 rounded-lg px-3 py-1.5 shadow-lg animate-pulse">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs font-bold text-red-200">
                EMERGENCY PREEMPTION ACTIVE
              </span>
            </div>
          )}
        </div>

        {/* Right: Camera Mode Switcher & Tools */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/85 border border-slate-800/80 rounded-lg p-1 shadow-lg">
          <button
            onClick={() => handleCameraChange('ISOMETRIC')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              cameraMode === 'ISOMETRIC'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Isometric 45° Smart City View"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Isometric</span>
          </button>

          <button
            onClick={() => handleCameraChange('TOP_DOWN')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              cameraMode === 'TOP_DOWN'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Top-Down Aerial Orthographic View"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Birds-Eye</span>
          </button>

          <button
            onClick={() => handleCameraChange('STREET_LEVEL')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              cameraMode === 'STREET_LEVEL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Street-Level Driver Perspective"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Street</span>
          </button>

          <button
            onClick={() => handleCameraChange('CHASE_CAM')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              cameraMode === 'CHASE_CAM'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Follow Live Vehicle (Chase Cam)"
          >
            <span>Chase Cam</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-800 mx-1" />

          <button
            onClick={handleToggleGrid}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              isGridMode
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle between Single 4-way and 2x2 Multi-Intersection Grid"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isGridMode ? 'Grid: 4 Intersections' : '1 Intersection'}</span>
          </button>
        </div>
      </div>

      {/* Selected Vehicle Telemetry Card if selected */}
      {selectedVehicle && (
        <div className="absolute top-16 left-3 z-10 bg-slate-900/90 border border-cyan-500/50 rounded-lg p-3 w-64 shadow-xl">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="text-xs font-bold text-cyan-300">{selectedVehicle.id}</span>
            <span className="text-[10px] uppercase font-mono text-slate-400">
              {selectedVehicle.type} · {selectedVehicle.movement}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px]">Current Speed</span>
              <span className="font-mono text-slate-200">
                {(selectedVehicle.speed * 3.6).toFixed(1)} km/h
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Waiting Time</span>
              <span className="font-mono text-amber-400">
                {selectedVehicle.waitingTime.toFixed(1)}s
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Route Origin</span>
              <span className="text-slate-300">{selectedVehicle.origin}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Destination</span>
              <span className="text-slate-300">{selectedVehicle.destination}</span>
            </div>
          </div>
          <button
            onClick={() => onVehicleSelected && onVehicleSelected(null)}
            className="mt-2.5 w-full py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
          >
            Close Inspector
          </button>
        </div>
      )}
    </div>
  );
};
