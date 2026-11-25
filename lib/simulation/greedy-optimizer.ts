// Greedy Max-Pressure Phase Priority Algorithm
// Implements adaptive phase selection based on queue differential, waiting time, downstream capacity, and starvation prevention.

import { Intersection, SignalPhase, GreedyPhaseEvaluation } from './types';

export interface GreedyWeights {
  wQueue: number; // Weight for incoming queue length
  wWait: number; // Weight for average waiting time
  wDownstream: number; // Weight penalty for downstream congestion/spillback
  wStarvation: number; // Weight bonus for starvation prevention
  starvationThresholdSec: number; // Time after which starvation bonus grows exponentially
}

export const DEFAULT_GREEDY_WEIGHTS: GreedyWeights = {
  wQueue: 1.0,
  wWait: 0.15,
  wDownstream: 0.8,
  wStarvation: 1.5,
  starvationThresholdSec: 45.0,
};

/**
 * Evaluates all compatible traffic signal phases using Greedy Max-Pressure theory
 * and selects the phase with highest net positive pressure.
 */
export function evaluateGreedyMaxPressure(
  intersection: Intersection,
  weights: GreedyWeights = DEFAULT_GREEDY_WEIGHTS
): {
  evaluations: GreedyPhaseEvaluation[];
  bestPhaseId: number;
  reasoning: string;
} {
  const evaluations: GreedyPhaseEvaluation[] = [];

  for (const phase of intersection.phases) {
    let incomingQueueTotal = 0;
    let avgWaitTimeSum = 0;
    let countedLanes = 0;
    let downstreamCapacitySum = 0;

    for (const laneId of phase.compatibleLanes) {
      const lane = intersection.lanes[laneId];
      if (!lane) continue;

      incomingQueueTotal += lane.queueLength;
      avgWaitTimeSum += lane.averageWaitTime;
      downstreamCapacitySum += lane.downstreamCapacity;
      countedLanes++;
    }

    const avgWaitTime = countedLanes > 0 ? avgWaitTimeSum / countedLanes : 0;
    const avgDownstreamCapacity = countedLanes > 0 ? downstreamCapacitySum / countedLanes : 100;
    
    // Outgoing congestion estimation: 100 - downstream capacity
    const outgoingCongestion = Math.max(0, 100 - avgDownstreamCapacity);

    // Starvation bonus: Quadratic ramp up once starvation timer exceeds threshold
    let starvationBonus = 0;
    if (phase.starvationTimer > weights.starvationThresholdSec) {
      const excessTime = phase.starvationTimer - weights.starvationThresholdSec;
      starvationBonus = weights.wStarvation * Math.pow(excessTime / 15.0, 1.8);
    }

    // Spillback penalty: If downstream road capacity is below 20%, heavily penalize
    let spillbackPenalty = 0;
    if (avgDownstreamCapacity < 25) {
      spillbackPenalty = (25 - avgDownstreamCapacity) * 1.5;
    }

    // Raw pressure: Incoming Demand - Outgoing Blockage
    const rawPressure =
      weights.wQueue * incomingQueueTotal +
      weights.wWait * avgWaitTime -
      weights.wDownstream * (outgoingCongestion / 10);

    const finalScore = Math.max(0, rawPressure + starvationBonus - spillbackPenalty);

    let reason = '';
    if (starvationBonus > 15) {
      reason = `Starvation threshold exceeded (${phase.starvationTimer.toFixed(0)}s without green). Prioritized for network equity.`;
    } else if (spillbackPenalty > 10) {
      reason = `Penalized due to downstream spillback risk (${avgDownstreamCapacity.toFixed(0)}% exit capacity remaining).`;
    } else if (incomingQueueTotal >= 15) {
      reason = `High queue pressure (${incomingQueueTotal} queued vehicles, avg wait ${avgWaitTime.toFixed(1)}s).`;
    } else if (incomingQueueTotal > 0) {
      reason = `Moderate demand with ${incomingQueueTotal} waiting vehicles.`;
    } else {
      reason = `Zero queue detected; minimum priority.`;
    }

    evaluations.push({
      phaseId: phase.id,
      phaseName: phase.name,
      incomingQueue: incomingQueueTotal,
      outgoingQueue: Math.round(outgoingCongestion),
      avgWaitTime: Math.round(avgWaitTime * 10) / 10,
      starvationBonus: Math.round(starvationBonus * 10) / 10,
      downstreamCapacityRatio: Math.round(avgDownstreamCapacity),
      rawPressure: Math.round(rawPressure * 10) / 10,
      finalScore: Math.round(finalScore * 10) / 10,
      selectionReason: reason,
    });
  }

  // Sort by highest score descending
  evaluations.sort((a, b) => b.finalScore - a.finalScore);
  const best = evaluations[0] || {
    phaseId: 0,
    phaseName: 'North-South Through',
    finalScore: 0,
    selectionReason: 'Default baseline phase',
  };

  let globalReason = '';
  if (best.finalScore === 0) {
    globalReason = 'All approaches clear. Maintaining balanced cycle schedule.';
  } else if (best.starvationBonus > 15) {
    globalReason = `Phase "${best.phaseName}" selected due to starvation prevention (${best.selectionReason})`;
  } else {
    globalReason = `Phase "${best.phaseName}" selected by Greedy Max-Pressure (Score: ${best.finalScore}, Queue: ${best.incomingQueue} veh).`;
  }

  return {
    evaluations,
    bestPhaseId: best.phaseId,
    reasoning: globalReason,
  };
}
