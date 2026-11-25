'use client';

import React, { useState } from 'react';
import {
  Intersection,
  HybridDecision,
  BottleneckEvent,
  AlgorithmType,
} from '@/lib/simulation/types';
import { Cpu, Zap, Timer, AlertOctagon, CheckCircle2, ChevronRight } from 'lucide-react';

interface RightDecisionPanelProps {
  intersection?: Intersection;
  latestDecision?: HybridDecision;
  bottlenecks: BottleneckEvent[];
  algorithm: AlgorithmType;
}

export const RightDecisionPanel: React.FC<RightDecisionPanelProps> = ({
  intersection,
  latestDecision,
  bottlenecks,
  algorithm,
}) => {
  const [activeTab, setActiveTab] = useState<'DECISION' | 'DP_MATRIX' | 'BOTTLENECK'>('DECISION');

  if (!intersection) {
    return (
      <div className="w-88 h-full bg-slate-900/95 border-l border-slate-800 p-4 text-slate-400">
        Loading Intersection Decision Data...
      </div>
    );
  }

  const currentPhase = intersection.phases[intersection.currentPhaseIndex];
  const timeRemaining = Math.ceil(currentPhase?.timeRemaining || 0);

  return (
    <div className="w-88 h-full bg-slate-900/95 border-l border-slate-800 flex flex-col overflow-y-auto p-3.5 space-y-3.5 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
            Algorithm Decision Centre
          </h2>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 rounded px-1.5 py-0.5">
          {algorithm.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Tab Selector */}
      <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800/80 text-xs">
        <button
          onClick={() => setActiveTab('DECISION')}
          className={`flex-1 py-1 px-2 font-medium rounded transition-colors text-center ${
            activeTab === 'DECISION'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Decision Logic
        </button>
        <button
          onClick={() => setActiveTab('DP_MATRIX')}
          className={`flex-1 py-1 px-2 font-medium rounded transition-colors text-center ${
            activeTab === 'DP_MATRIX'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          DP Optimization
        </button>
        <button
          onClick={() => setActiveTab('BOTTLENECK')}
          className={`flex-1 py-1 px-2 font-medium rounded transition-colors text-center relative ${
            activeTab === 'BOTTLENECK'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Bottlenecks
          {bottlenecks.length > 0 && (
            <span className="ml-1 text-[9px] bg-red-500 text-white px-1 rounded-full">
              {bottlenecks.length}
            </span>
          )}
        </button>
      </div>

      {/* Real-Time Active Signal State */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Active Phase:</span>
          <span className="font-bold text-slate-100 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                intersection.phaseState === 'GREEN'
                  ? 'bg-emerald-400'
                  : intersection.phaseState === 'YELLOW'
                  ? 'bg-amber-400'
                  : 'bg-red-500'
              }`}
            />
            {currentPhase.name}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Signal Interval:</span>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                intersection.phaseState === 'GREEN'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                  : intersection.phaseState === 'YELLOW'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                  : 'bg-red-950 text-red-300 border border-red-800/60'
              }`}
            >
              {intersection.phaseState}
            </span>
            <span className="font-mono text-xl font-bold text-cyan-300 tabular-nums">
              {timeRemaining}s
            </span>
          </div>
        </div>

        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${
              intersection.phaseState === 'GREEN'
                ? 'bg-emerald-400'
                : intersection.phaseState === 'YELLOW'
                ? 'bg-amber-400'
                : 'bg-red-500'
            }`}
            style={{
              width: `${Math.min(
                100,
                (timeRemaining / (currentPhase.assignedGreenDuration || 25)) * 100
              )}%`,
            }}
          />
        </div>
      </div>

      {activeTab === 'DECISION' && (
        <div className="space-y-3">
          {/* Greedy Max-Pressure Scores */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800/60">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Greedy Max-Pressure Scores
              </span>
              <span className="text-[10px] text-slate-500 font-mono">P_max</span>
            </div>

            <div className="space-y-2 text-xs">
              {latestDecision?.greedyScores && latestDecision.greedyScores.length > 0 ? (
                latestDecision.greedyScores.map((score) => {
                  const isWinner = score.phaseId === latestDecision.selectedPhaseId;
                  return (
                    <div
                      key={score.phaseId}
                      className={`p-2 rounded border transition-colors ${
                        isWinner
                          ? 'bg-cyan-950/40 border-cyan-500/50'
                          : 'bg-slate-900/60 border-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${isWinner ? 'text-cyan-300' : 'text-slate-300'}`}>
                          {score.phaseName}
                        </span>
                        <span className="font-mono font-bold text-amber-300 tabular-nums">
                          Score: {score.finalScore}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 mt-1 text-[10px] text-slate-400">
                        <span>Queue: <strong className="text-slate-200">{score.incomingQueue}</strong></span>
                        <span>Wait: <strong className="text-slate-200">{score.avgWaitTime}s</strong></span>
                        <span>Starve: <strong className="text-amber-400">+{score.starvationBonus}</strong></span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 italic">
                        {score.selectionReason}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-slate-500 py-2">
                  Awaiting next cycle evaluation...
                </div>
              )}
            </div>
          </div>

          {/* Decision Summary Callout */}
          {latestDecision && (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5 text-xs">
              <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Latest Controller Execution
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {latestDecision.summaryReason}
              </p>
              <div className="pt-1 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                <span>Discharge Est: <strong className="text-cyan-300">{latestDecision.expectedQueueDischarge} veh</strong></span>
                <span>Yellow: {latestDecision.safetyClearance.yellowDuration}s · All-Red: {latestDecision.safetyClearance.allRedDuration}s</span>
              </div>
            </div>
          )}

          {/* 30-Second Rule Status Callout */}
          <div
            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
              latestDecision?.is30SecRuleApplied
                ? 'bg-blue-950/50 border-blue-500/70 text-blue-200'
                : 'bg-slate-950/70 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="font-semibold text-slate-200">30-Second Minimum Green Rule</div>
                <div className="text-[10px] text-slate-400">
                  {latestDecision?.is30SecRuleApplied
                    ? 'Active: Congestion exceeded threshold (≥12 queued). Green extended to ≥30s.'
                    : 'Standby: Traffic within normal density range.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'DP_MATRIX' && (
        <div className="space-y-3">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800/60">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-cyan-400" />
                Finite-Horizon DP Candidates
              </span>
              <span className="text-[10px] text-cyan-400 font-mono">Memoization Active</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="py-1">Dur</th>
                    <th className="py-1">Q-Red</th>
                    <th className="py-1">Cross-Del</th>
                    <th className="py-1">Cost</th>
                    <th className="py-1 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {latestDecision?.dpCandidates?.map((cand) => (
                    <tr
                      key={cand.duration}
                      className={
                        cand.isOptimal
                          ? 'bg-cyan-950/60 text-cyan-300 font-bold'
                          : 'text-slate-300'
                      }
                    >
                      <td className="py-1 tabular-nums">{cand.duration}s</td>
                      <td className="py-1 tabular-nums text-emerald-400">-{cand.queueReduction}</td>
                      <td className="py-1 tabular-nums text-slate-400">+{cand.expectedCrossDelay}</td>
                      <td className="py-1 tabular-nums">{cand.totalCost}</td>
                      <td className="py-1 text-right font-sans text-[10px]">
                        {cand.isOptimal ? (
                          <span className="bg-cyan-500/20 text-cyan-300 px-1 rounded border border-cyan-500/40">
                            OPTIMAL
                          </span>
                        ) : cand.totalCost > 5000 ? (
                          <span className="text-red-400">&lt;30s Block</span>
                        ) : (
                          <span className="text-slate-500">Evaluated</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-800/60">
              Cost Function: J(G) = Delay_cur(Q_rem) + Delay_cross(G) + Loss_switch + Spillback(G)
            </p>
          </div>
        </div>
      )}

      {activeTab === 'BOTTLENECK' && (
        <div className="space-y-3">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800/60">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                Bottleneck Diagnostic Engine
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {bottlenecks.length} Detected
              </span>
            </div>

            {bottlenecks.length === 0 ? (
              <div className="text-xs text-slate-400 py-3 text-center">
                No active bottlenecks detected. Flow is stable within capacity thresholds.
              </div>
            ) : (
              <div className="space-y-2">
                {bottlenecks.map((bn) => (
                  <div
                    key={bn.id}
                    className="p-2 rounded bg-red-950/30 border border-red-500/40 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-red-300">
                        {bn.direction} Approach · {bn.severity}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {bn.cause.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">{bn.description}</p>
                    <div className="text-[10px] text-emerald-400 pt-0.5">
                      Suggested Action: {bn.suggestedAction}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
