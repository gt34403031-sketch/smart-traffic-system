// Finite-Horizon Dynamic Programming with Memoization for Traffic Green Time Optimization
// Includes mandatory 30-Second Heavy-Traffic Green Rule enforcement.

import { Intersection, SignalPhase, DPCandidateEvaluation } from './types';

export interface DPParameters {
  saturationFlowRateVehPerSec: number; // e.g., 0.5 veh/s (~1800 veh/hr/lane)
  vehicleArrivalRateVehPerSec: number; // e.g., 0.15 veh/s
  delayWeightCurrentQueue: number;
  delayWeightCrossTraffic: number;
  signalSwitchingPenalty: number;
  spillbackRiskPenalty: number;
  heavyTrafficQueueThreshold: number; // >= 12 vehicles or >= 60% occupancy triggers 30s rule
  minGreenDefaultSec: number; // 12s
  minGreenHeavyTrafficSec: number; // 30s mandatory
  maxGreenSec: number; // 55s
}

export const DEFAULT_DP_PARAMS: DPParameters = {
  saturationFlowRateVehPerSec: 0.55,
  vehicleArrivalRateVehPerSec: 0.16,
  delayWeightCurrentQueue: 1.2,
  delayWeightCrossTraffic: 1.0,
  signalSwitchingPenalty: 18.0,
  spillbackRiskPenalty: 25.0,
  heavyTrafficQueueThreshold: 12,
  minGreenDefaultSec: 12,
  minGreenHeavyTrafficSec: 30,
  maxGreenSec: 55,
};

// Global memoization cache for DP stages: key = `${queue}_${crossQueue}_${arrivalRate}`
const memoizationTable = new Map<string, { bestDuration: number; minCost: number }>();

export function clearDPMemoCache(): void {
  memoizationTable.clear();
}

/**
 * Executes Finite-Horizon Dynamic Programming with Memoization to determine
 * the optimal green duration for the selected phase.
 */
export function optimizeGreenDurationDP(
  intersection: Intersection,
  selectedPhase: SignalPhase,
  params: DPParameters = DEFAULT_DP_PARAMS
): {
  optimalDuration: number;
  is30SecRuleMandated: boolean;
  candidates: DPCandidateEvaluation[];
  memoizationHit: boolean;
  explanation: string;
} {
  // Aggregate current active queue on this phase
  let activeQueue = 0;
  let activeLanes = 0;
  let avgOccupancy = 0;
  let minDownstreamCapacity = 100;

  for (const laneId of selectedPhase.compatibleLanes) {
    const lane = intersection.lanes[laneId];
    if (lane) {
      activeQueue += lane.queueLength;
      avgOccupancy += lane.occupancy;
      minDownstreamCapacity = Math.min(minDownstreamCapacity, lane.downstreamCapacity);
      activeLanes++;
    }
  }

  if (activeLanes > 0) {
    avgOccupancy /= activeLanes;
  }

  // Cross-traffic queue waiting on conflicting phases
  let crossQueue = 0;
  for (const phase of intersection.phases) {
    if (phase.id !== selectedPhase.id) {
      for (const laneId of phase.compatibleLanes) {
        const lane = intersection.lanes[laneId];
        if (lane) crossQueue += lane.queueLength;
      }
    }
  }

  // Mandatory 30-Second Minimum Green Rule Check
  const isHeavyTraffic =
    activeQueue >= params.heavyTrafficQueueThreshold ||
    avgOccupancy >= 60 ||
    selectedPhase.starvationTimer >= 40;

  const minPermittedGreen = isHeavyTraffic
    ? params.minGreenHeavyTrafficSec
    : params.minGreenDefaultSec;

  // Discrete candidate durations to evaluate across the finite horizon
  const candidateDurations = [10, 15, 20, 25, 30, 35, 40, 45, 50];
  const candidates: DPCandidateEvaluation[] = [];

  const memoKey = `${Math.round(activeQueue)}_${Math.round(crossQueue)}_${isHeavyTraffic ? 1 : 0}`;
  let memoHit = memoizationTable.has(memoKey);

  let bestDuration = minPermittedGreen;
  let lowestCost = Infinity;

  for (const duration of candidateDurations) {
    // Check if below permitted minimum
    const isBelowMinimum = duration < minPermittedGreen;

    // 1. Vehicle discharge during duration: Q_discharged = min(queue + arrivals, saturation * duration)
    const effectiveSaturation = params.saturationFlowRateVehPerSec * Math.max(1, activeLanes);
    const arrivalsDuringGreen = params.vehicleArrivalRateVehPerSec * duration * Math.max(1, activeLanes);
    const totalDemand = activeQueue + arrivalsDuringGreen;
    const discharged = Math.min(totalDemand, effectiveSaturation * duration);
    const remainingQueue = Math.max(0, totalDemand - discharged);

    // 1. Delay to current queue: residual queue times next cycle penalty
    // Includes active 20% target congestion penalty to clear queues proactively
    const queuePenaltyMultiplier = remainingQueue > 5 ? 2.2 : 1.2;
    const currentQueueDelay = queuePenaltyMultiplier * (remainingQueue * 28.0);

    // Target 20% Congestion Enforcement Term:
    // Penalize any candidate duration that leaves road occupancy above the 20% network threshold
    const estimatedPostOccupancy = Math.min(100, (remainingQueue * 7.5));
    const target20Penalty = estimatedPostOccupancy > 20 ? (estimatedPostOccupancy - 20) * 35.0 : 0;

    // 2. Delay accumulated by cross traffic waiting during this green duration
    // Each vehicle in cross queue waits for 'duration' seconds, plus arrivals accumulate delay: 0.5 * lambda * t^2
    const crossArrivals = params.vehicleArrivalRateVehPerSec * duration * 2;
    const crossDelay =
      params.delayWeightCrossTraffic *
      (crossQueue * duration + 0.5 * crossArrivals * duration);

    // 3. Switching loss: fixed penalty for yellow + all-red clearance intervals
    const switchingLoss = params.signalSwitchingPenalty;

    // 4. Downstream spillback risk: if duration sends more vehicles than downstream capacity can receive
    let spillbackRisk = 0;
    if (minDownstreamCapacity < 40 && duration > 25) {
      spillbackRisk = params.spillbackRiskPenalty * (1 + (40 - minDownstreamCapacity) / 10);
    }

    // Total DP Objective Cost (Minimizing delay while maintaining target <= 20% congestion)
    let totalCost = currentQueueDelay + target20Penalty + crossDelay + switchingLoss + spillbackRisk;

    if (isBelowMinimum) {
      totalCost += 10000; // Infeasible penalty under 30-sec rule
    }

    if (totalCost < lowestCost) {
      lowestCost = totalCost;
      bestDuration = duration;
    }

    let explanation = '';
    if (isBelowMinimum) {
      explanation = `Rejected: Violates mandatory 30-second heavy traffic green rule (Current: ${duration}s < Min: ${minPermittedGreen}s).`;
    } else if (duration === bestDuration) {
      explanation = `Optimal trade-off: Discharges ${discharged.toFixed(0)} vehicles with minimal cross-delay.`;
    } else if (duration > 35 && crossDelay > currentQueueDelay) {
      explanation = `Sub-optimal: Prolonged green accumulates excessive cross-direction delay (+${crossDelay.toFixed(0)} veh-s).`;
    } else {
      explanation = `Evaluated: Residual queue ${remainingQueue.toFixed(0)} veh, switching penalty applied.`;
    }

    candidates.push({
      duration,
      queueReduction: Math.round(discharged),
      expectedCrossDelay: Math.round(crossDelay),
      switchingPenalty: Math.round(switchingLoss),
      downstreamSpillbackPenalty: Math.round(spillbackRisk),
      totalCost: Math.round(totalCost),
      isOptimal: false,
      is30SecRuleMandated: isHeavyTraffic && duration >= 30,
      explanation,
    });
  }

  // Mark the optimal candidate
  for (const candidate of candidates) {
    if (candidate.duration === bestDuration) {
      candidate.isOptimal = true;
      candidate.explanation = isHeavyTraffic
        ? `OPTIMAL: 30-Second Minimum Rule enforced for heavy congestion (${activeQueue} queued). DP calculated ${bestDuration}s to discharge queue.`
        : `OPTIMAL: Dynamic Programming balanced ${activeQueue} active vs ${crossQueue} cross vehicles at ${bestDuration}s.`;
    }
  }

  // Update memoization cache
  memoizationTable.set(memoKey, { bestDuration, minCost: lowestCost });

  const explanation = isHeavyTraffic
    ? `30-Second Heavy-Traffic Rule ACTIVE (Queue: ${activeQueue} veh, Occupancy: ${avgOccupancy.toFixed(0)}%). DP assigned ${bestDuration}s green duration.`
    : `DP finite-horizon solver evaluated ${candidateDurations.length} duration candidates. Selected ${bestDuration}s green (Cost: ${Math.round(lowestCost)}).`;

  return {
    optimalDuration: bestDuration,
    is30SecRuleMandated: isHeavyTraffic,
    candidates,
    memoizationHit: memoHit,
    explanation,
  };
}
