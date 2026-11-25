'use client';

import React from 'react';
import { TrafficMetrics, Intersection } from '@/lib/simulation/types';
import { Activity, Car, Clock, Gauge, TrendingUp, ShieldCheck } from 'lucide-react';

interface LeftMonitoringPanelProps {
  metrics: TrafficMetrics;
  intersection?: Intersection;
  throughputHistory: { time: number; throughput: number; congestion: number }[];
}

export const LeftMonitoringPanel: React.FC<LeftMonitoringPanelProps> = ({
  metrics,
  intersection,
  throughputHistory,
}) => {
  // Congestion Level category (User Target: up to 20%)
  const congestion = metrics.overallCongestionPercent;
  let congestionColor = 'text-emerald-400';
  let congestionStatus = 'Optimal (Target ≤ 20%)';
  let congestionBarColor = 'bg-emerald-500';

  if (congestion > 50) {
    congestionColor = 'text-red-400';
    congestionStatus = 'Critical Congestion (>50%)';
    congestionBarColor = 'bg-red-500';
  } else if (congestion > 35) {
    congestionColor = 'text-orange-400';
    congestionStatus = 'High Density (>35%)';
    congestionBarColor = 'bg-orange-500';
  } else if (congestion > 20) {
    congestionColor = 'text-amber-400';
    congestionStatus = 'Moderate / Warning (>20%)';
    congestionBarColor = 'bg-amber-500';
  }

  // Generate SVG path points for throughput trend chart
  const chartWidth = 260;
  const chartHeight = 52;
  const maxThroughput = Math.max(30, ...throughputHistory.map((d) => d.throughput));
  const points = throughputHistory.map((d, index) => {
    const x = (index / Math.max(1, throughputHistory.length - 1)) * chartWidth;
    const y = chartHeight - (d.throughput / maxThroughput) * (chartHeight - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const svgPath = points.length > 1 ? `M ${points.join(' L ')}` : '';

  return (
    <div className="w-80 h-full bg-slate-900/95 border-r border-slate-800 flex flex-col overflow-y-auto p-3.5 space-y-3.5 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
            Traffic Monitoring Centre
          </h2>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 rounded px-1.5 py-0.5">
          LIVE TELEMETRY
        </span>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span>Total Vehicles</span>
            <Car className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-cyan-300 tabular-nums">
            {metrics.totalActiveVehicles}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between">
            <span>Moving: <strong className="text-slate-300">{metrics.vehiclesMoving}</strong></span>
            <span>Waiting: <strong className="text-amber-400">{metrics.vehiclesWaiting}</strong></span>
          </div>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span>Throughput</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-300 tabular-nums">
            {metrics.networkThroughputPerMin} <span className="text-xs font-normal text-slate-400">v/min</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Completed: <strong className="text-slate-300">{metrics.totalCompletedVehicles}</strong> total
          </div>
        </div>
      </div>

      {/* Congestion Target Gauge (Target <= 20%) */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            Network Congestion
          </span>
          <span className={`font-mono font-bold text-sm tabular-nums ${congestionColor}`}>
            {congestion}%
          </span>
        </div>

        {/* Progress Bar with 20% target tick line */}
        <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${congestionBarColor} transition-all duration-300`}
            style={{ width: `${Math.min(100, congestion)}%` }}
          />
          {/* Target 20% Marker */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-cyan-400 z-10"
            style={{ left: '20%' }}
            title="Target Threshold (20%)"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{congestionStatus}</span>
          <span className="font-mono text-cyan-400">Target: ≤ 20%</span>
        </div>
      </div>

      {/* Directional Distribution (North, South, East, West) */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-2">
        <div className="text-xs font-semibold text-slate-300 pb-1 border-b border-slate-800/60">
          Directional Distribution
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded">
            <span className="text-slate-400">North</span>
            <span className="font-mono font-bold text-cyan-300 tabular-nums">
              {metrics.northCount} veh
            </span>
          </div>
          <div className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded">
            <span className="text-slate-400">South</span>
            <span className="font-mono font-bold text-cyan-300 tabular-nums">
              {metrics.southCount} veh
            </span>
          </div>
          <div className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded">
            <span className="text-slate-400">East</span>
            <span className="font-mono font-bold text-cyan-300 tabular-nums">
              {metrics.eastCount} veh
            </span>
          </div>
          <div className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded">
            <span className="text-slate-400">West</span>
            <span className="font-mono font-bold text-cyan-300 tabular-nums">
              {metrics.westCount} veh
            </span>
          </div>
        </div>
      </div>

      {/* Lane-wise Queue Status */}
      {intersection && (
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-2">
          <div className="text-xs font-semibold text-slate-300 pb-1 border-b border-slate-800/60 flex items-center justify-between">
            <span>Lane-Wise Queue Status</span>
            <span className="text-[10px] text-slate-500 font-mono">12 Total Lanes</span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            {['NORTH', 'SOUTH', 'EAST', 'WEST'].map((dir) => {
              const l0 = intersection.lanes[`${dir}_L0`]?.queueLength || 0;
              const l1 = intersection.lanes[`${dir}_L1`]?.queueLength || 0;
              const l2 = intersection.lanes[`${dir}_L2`]?.queueLength || 0;
              const totalQ = l0 + l1 + l2;
              return (
                <div key={dir} className="flex items-center justify-between text-slate-300 py-0.5">
                  <span className="w-14 text-slate-400 font-mono">{dir}</span>
                  <div className="flex gap-1.5 font-mono text-[10px]">
                    <span className="text-slate-400" title="Right / Straight Lane">
                      R:{l0}
                    </span>
                    <span className="text-slate-400" title="Straight Lane">
                      S:{l1}
                    </span>
                    <span className="text-slate-400" title="Left Turn Lane">
                      L:{l2}
                    </span>
                  </div>
                  <span
                    className={`font-mono font-bold px-1.5 py-0.2 rounded text-[10px] ${
                      totalQ > 8 ? 'bg-red-950/80 text-red-400' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {totalQ} queued
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dynamics & Waiting Time Telemetry */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-2 text-xs">
        <div className="text-xs font-semibold text-slate-300 pb-1 border-b border-slate-800/60 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          Kinematics & Delay
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Average Speed:</span>
            <span className="font-mono font-bold text-slate-200 tabular-nums">
              {metrics.averageSpeedKmh} km/h
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Average Wait Time:</span>
            <span className="font-mono font-bold text-slate-200 tabular-nums">
              {metrics.averageWaitTimeSec}s
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Maximum Wait Time:</span>
            <span className="font-mono font-bold text-amber-400 tabular-nums">
              {metrics.maxWaitTimeSec}s
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Total Vehicle Delay:</span>
            <span className="font-mono font-bold text-slate-200 tabular-nums">
              {metrics.totalVehicleDelaySec} veh-s
            </span>
          </div>
        </div>
      </div>

      {/* Live Throughput Mini Chart */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Throughput Trend</span>
          <span className="font-mono text-[10px] text-emerald-400">
            {metrics.networkThroughputPerMin} veh/min
          </span>
        </div>
        <div className="w-full h-14 bg-slate-900/80 rounded border border-slate-800/60 flex items-center justify-center p-1 overflow-hidden">
          {svgPath ? (
            <svg width={chartWidth} height={chartHeight} className="overflow-visible">
              <path
                d={svgPath}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <span className="text-[10px] text-slate-500">Accumulating telemetry...</span>
          )}
        </div>
      </div>

      {/* 30-Second Rule Audit Counter */}
      <div className="p-2 bg-blue-950/40 border border-blue-800/50 rounded-lg text-xs flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-blue-300">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>30s Rule Enforcements:</span>
        </div>
        <span className="font-mono font-bold text-blue-200 bg-blue-900/60 px-2 py-0.5 rounded tabular-nums">
          {metrics.rule30SecTriggerCount} times
        </span>
      </div>
    </div>
  );
};
