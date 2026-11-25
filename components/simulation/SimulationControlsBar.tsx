'use client';

import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  PlusCircle,
  Sliders,
  BarChart2,
  FileText,
  Code2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SCENARIO_PRESETS, TrafficSimulationEngine } from '@/lib/simulation/traffic-engine';
import { AlgorithmType, Direction } from '@/lib/simulation/types';

interface SimulationControlsBarProps {
  engine: TrafficSimulationEngine;
  isRunning: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  timeScale: number;
  onTimeScaleChange: (scale: number) => void;
  selectedScenarioId: string;
  onScenarioChange: (scenarioId: string) => void;
  selectedAlgorithm: AlgorithmType;
  onAlgorithmChange: (algo: AlgorithmType) => void;
  onOpenAnalytics: () => void;
  onOpenReport: () => void;
  onOpenPythonCode: () => void;
}

export const SimulationControlsBar: React.FC<SimulationControlsBarProps> = ({
  engine,
  isRunning,
  onTogglePlay,
  onReset,
  timeScale,
  onTimeScaleChange,
  selectedScenarioId,
  onScenarioChange,
  selectedAlgorithm,
  onAlgorithmChange,
  onOpenAnalytics,
  onOpenReport,
  onOpenPythonCode,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [spawnDirection, setSpawnDirection] = useState<Direction>('NORTH');

  const handleSpawn = (isEmergency: boolean = false) => {
    engine.spawnVehicle(spawnDirection, isEmergency);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[94vw] pointer-events-none">
      {/* Collapse / Expand Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="pointer-events-auto mb-1.5 flex items-center gap-1.5 px-3 py-1 bg-slate-900/90 hover:bg-slate-800 text-slate-300 text-[11px] font-medium rounded-full border border-slate-700/80 shadow-lg backdrop-blur transition-colors"
      >
        {isCollapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>Show Simulation Control Dock</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Cinema Mode (Hide Dock)</span>
          </>
        )}
      </button>

      {/* Dock Content */}
      {!isCollapsed && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-2.5 p-2.5 bg-slate-950/95 border border-slate-800/90 rounded-xl shadow-2xl backdrop-blur-md">
          {/* Playback Controls */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800/80">
            <button
              onClick={onTogglePlay}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                isRunning
                  ? 'bg-amber-600/30 text-amber-300 hover:bg-amber-600/40'
                  : 'bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/40'
              }`}
              title={isRunning ? 'Pause Simulation' : 'Run Simulation'}
            >
              {isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run</span>
                </>
              )}
            </button>

            <button
              onClick={onReset}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Reset Simulation & Network State"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Speed Multiplier (1x, 2x, 5x) */}
          <div className="flex items-center bg-slate-900/80 p-1 rounded-lg border border-slate-800/80 text-xs font-mono">
            {[1.0, 2.0, 5.0].map((speed) => (
              <button
                key={speed}
                onClick={() => onTimeScaleChange(speed)}
                className={`px-2 py-1 rounded transition-colors ${
                  timeScale === speed
                    ? 'bg-cyan-500/25 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Scenario Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 text-xs">
            <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <select
              value={selectedScenarioId}
              onChange={(e) => onScenarioChange(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer max-w-[190px] truncate"
            >
              {SCENARIO_PRESETS.map((scenario) => (
                <option key={scenario.id} value={scenario.id} className="bg-slate-900 text-slate-200">
                  {scenario.name}
                </option>
              ))}
            </select>
          </div>

          {/* Algorithm Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 text-xs">
            <select
              value={selectedAlgorithm}
              onChange={(e) => onAlgorithmChange(e.target.value as AlgorithmType)}
              className="bg-transparent text-cyan-300 font-semibold text-xs focus:outline-none cursor-pointer"
            >
              <option value="HYBRID_GREEDY_DP" className="bg-slate-900 text-slate-200">
                Hybrid Greedy + DP (Active)
              </option>
              <option value="GREEDY_MAX_PRESSURE" className="bg-slate-900 text-slate-200">
                Greedy Max-Pressure Only
              </option>
              <option value="DYNAMIC_PROGRAMMING" className="bg-slate-900 text-slate-200">
                Dynamic Programming Only
              </option>
              <option value="PREDICTIVE_HYBRID" className="bg-slate-900 text-slate-200">
                Predictive Hybrid (Future Flow)
              </option>
              <option value="FIXED_TIME" className="bg-slate-900 text-slate-200">
                Fixed-Time (Pre-timed Baseline)
              </option>
            </select>
          </div>

          {/* Vehicle Spawner Dropdown & Buttons */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800/80 text-xs">
            <select
              value={spawnDirection}
              onChange={(e) => setSpawnDirection(e.target.value as Direction)}
              className="bg-slate-800 text-slate-300 text-[11px] px-1.5 py-1 rounded focus:outline-none"
            >
              <option value="NORTH">North</option>
              <option value="SOUTH">South</option>
              <option value="EAST">East</option>
              <option value="WEST">West</option>
            </select>

            <button
              onClick={() => handleSpawn(false)}
              className="flex items-center gap-1 px-2 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 rounded text-xs transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+Vehicle</span>
            </button>

            <button
              onClick={() => handleSpawn(true)}
              className="flex items-center gap-1 px-2 py-1 bg-red-600/30 hover:bg-red-600/50 text-red-200 rounded text-xs transition-colors font-semibold"
              title="Spawn Emergency Ambulance with Signal Preemption"
            >
              <span>+Ambulance</span>
            </button>
          </div>

          {/* Modal Launchers: Analytics, Reports, Python Engine */}
          <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
            <button
              onClick={onOpenAnalytics}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-800 transition-colors"
              title="Comparative Performance Analytics"
            >
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Analytics</span>
            </button>

            <button
              onClick={onOpenReport}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-800 transition-colors"
              title="Generate Comprehensive Simulation Report (CSV/PDF)"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Report</span>
            </button>

            <button
              onClick={onOpenPythonCode}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-800 transition-colors"
              title="View Python FastAPI Engine & SQLite Schema"
            >
              <Code2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Python Engine</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
