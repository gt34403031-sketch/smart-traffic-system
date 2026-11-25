'use client';

import React, { useState, useEffect } from 'react';
import { TrafficSimulationEngine } from '@/lib/simulation/traffic-engine';
import { Vehicle, AlgorithmType } from '@/lib/simulation/types';
import { LeftMonitoringPanel } from '@/components/simulation/LeftMonitoringPanel';
import { RightDecisionPanel } from '@/components/simulation/RightDecisionPanel';
import { SimulationControlsBar } from '@/components/simulation/SimulationControlsBar';
import { AnalyticsModal } from '@/components/simulation/AnalyticsModal';
import { ReportExportModal } from '@/components/simulation/ReportExportModal';
import { PythonEngineViewerModal } from '@/components/simulation/PythonEngineViewerModal';
import { Activity, ShieldCheck, Cpu } from 'lucide-react';

import dynamic from 'next/dynamic';

const CityViewport3D = dynamic(
  () => import('@/components/simulation/CityViewport3D').then((mod) => mod.CityViewport3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-cyan-400">Loading 3D Smart City Digital Twin...</span>
      </div>
    ),
  }
);

export default function TrafficManagementDashboard() {
  // Simulation engine instance stored in state
  const [engine] = useState(() => new TrafficSimulationEngine());

  // Reactive UI state
  const [isRunning, setIsRunning] = useState(true);
  const [timeScale, setTimeScale] = useState(1.0);
  const [selectedScenarioId, setSelectedScenarioId] = useState(engine.currentScenario.id);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AlgorithmType>(engine.algorithm);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Modals
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isPythonCodeOpen, setIsPythonCodeOpen] = useState(false);

  // Periodic React state synchronization from engine (4 times per second to prevent React re-render lag)
  const [metrics, setMetrics] = useState(engine.metrics);
  const [intersection, setIntersection] = useState(engine.intersections.get('INT-01'));
  const [latestDecision, setLatestDecision] = useState(engine.decisionHistory[0]);
  const [bottlenecks, setBottlenecks] = useState(engine.bottleneckHistory);
  const [throughputHistory, setThroughputHistory] = useState(engine.throughputHistory);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({ ...engine.metrics });
      const int01 = engine.intersections.get('INT-01');
      if (int01) setIntersection({ ...int01 });
      if (engine.decisionHistory.length > 0) {
        setLatestDecision({ ...engine.decisionHistory[0] });
      }
      setBottlenecks([...engine.bottleneckHistory]);
      setThroughputHistory([...engine.throughputHistory]);
    }, 250);

    return () => clearInterval(interval);
  }, [engine]);

  // Handler functions
  const handleTogglePlay = () => {
    const nextState = !engine.isRunning;
    engine.setRunning(nextState);
    setIsRunning(nextState);
  };

  const handleReset = () => {
    engine.initializeIntersections();
    setMetrics({ ...engine.metrics });
    setIntersection(engine.intersections.get('INT-01'));
    setSelectedVehicle(null);
  };

  const handleTimeScaleChange = (scale: number) => {
    engine.setTimeScale(scale);
    setTimeScale(scale);
  };

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    engine.setScenario(scenarioId);
    setSelectedVehicle(null);
  };

  const handleAlgorithmChange = (algo: AlgorithmType) => {
    setSelectedAlgorithm(algo);
    engine.setAlgorithm(algo);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* Top Bar Navigation (Strict 3-zone contract) */}
      <header className="h-12 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between gap-8 shrink-0 z-30">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-6 h-6 rounded bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-bold text-xs">
            3D
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-100">
            Intelligent Smart City Traffic Management System
          </span>
          <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
            MCA Project · Greedy Max-Pressure &amp; Dynamic Programming
          </span>
        </div>

        {/* Zone 2: System Status Badges */}
        <div className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Hybrid Controller: <strong className="text-slate-200">Active</strong></span>
          </div>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>30s Minimum Green Rule: <strong className="text-blue-300">Enforced</strong></span>
          </div>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Congestion Target: <strong className="text-emerald-300">≤ 20%</strong></span>
          </div>
        </div>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAnalyticsOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-700/60 rounded-lg hover:bg-cyan-900/60 transition-colors whitespace-nowrap shrink-0"
          >
            Algorithm Analytics
          </button>
        </div>
      </header>

      {/* Main 3-Section Dashboard Layout */}
      <main className="flex-1 relative flex overflow-hidden">
        {/* Left Section: Live Traffic Monitoring (80 width ~ 320px) */}
        <LeftMonitoringPanel
          metrics={metrics}
          intersection={intersection}
          throughputHistory={throughputHistory}
        />

        {/* Center Section: Live 3D City (Largest area) */}
        <div className="flex-1 relative h-full">
          <CityViewport3D
            engine={engine}
            selectedVehicle={selectedVehicle}
            onVehicleSelected={setSelectedVehicle}
          />

          {/* Unified Collapsible Bottom Control Dock */}
          <SimulationControlsBar
            engine={engine}
            isRunning={isRunning}
            onTogglePlay={handleTogglePlay}
            onReset={handleReset}
            timeScale={timeScale}
            onTimeScaleChange={handleTimeScaleChange}
            selectedScenarioId={selectedScenarioId}
            onScenarioChange={handleScenarioChange}
            selectedAlgorithm={selectedAlgorithm}
            onAlgorithmChange={handleAlgorithmChange}
            onOpenAnalytics={() => setIsAnalyticsOpen(true)}
            onOpenReport={() => setIsReportOpen(true)}
            onOpenPythonCode={() => setIsPythonCodeOpen(true)}
          />
        </div>

        {/* Right Section: Algorithm Decision Centre (88 width ~ 352px) */}
        <RightDecisionPanel
          intersection={intersection}
          latestDecision={latestDecision}
          bottlenecks={bottlenecks}
          algorithm={selectedAlgorithm}
        />
      </main>

      {/* Modals */}
      <AnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
      />

      <ReportExportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        metrics={metrics}
        scenario={engine.currentScenario}
        algorithm={selectedAlgorithm}
        decisions={engine.decisionHistory}
        simulationDurationSec={engine.simulationTime}
      />

      <PythonEngineViewerModal
        isOpen={isPythonCodeOpen}
        onClose={() => setIsPythonCodeOpen(false)}
      />
    </div>
  );
}
