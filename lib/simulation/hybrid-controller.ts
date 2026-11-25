// Hybrid Controller integrating Greedy Max-Pressure, Dynamic Programming,
// Emergency Vehicle Preemption, Bottleneck Detection, and Green Wave Coordination.

import {
  Intersection,
  SignalPhase,
  HybridDecision,
  BottleneckEvent,
  Direction,
  Vehicle,
} from './types';
import { evaluateGreedyMaxPressure } from './greedy-optimizer';
import { optimizeGreenDurationDP } from './dp-optimizer';

export interface ControllerResult {
  decision: HybridDecision;
  nextPhaseIndex: number;
  greenDuration: number;
  yellowDuration: number;
  allRedDuration: number;
  isEmergencyOverride: boolean;
  bottleneckAlert?: BottleneckEvent;
}

/**
 * Executes a full cycle evaluation of the Hybrid Controller.
 */
export function executeHybridController(
  intersection: Intersection,
  allVehicles: Vehicle[],
  timestamp: number
): ControllerResult {
  // 1. Check for Emergency Vehicles approaching this intersection
  const approachingEmergency = allVehicles.find(
    (v) =>
      v.isEmergency &&
      v.status !== 'COMPLETED' &&
      v.status !== 'EXITING' &&
      v.intersectionId === intersection.id
  );

  if (approachingEmergency) {
    // Determine emergency phase matching vehicle's direction
    let targetPhaseIndex = 0;
    if (approachingEmergency.origin === 'NORTH' || approachingEmergency.origin === 'SOUTH') {
      targetPhaseIndex = 0; // Phase 0: North-South
    } else {
      targetPhaseIndex = 1; // Phase 1: East-West
    }

    const phase = intersection.phases[targetPhaseIndex];
    const decision: HybridDecision = {
      timestamp,
      intersectionId: intersection.id,
      selectedPhaseId: phase.id,
      selectedPhaseName: phase.name,
      assignedGreenDuration: 35,
      is30SecRuleApplied: true,
      starvationPrevented: false,
      greedyScores: [],
      dpCandidates: [],
      summaryReason: `EMERGENCY PREEMPTION ACTIVE: Priority corridor granted for ${approachingEmergency.type} (${approachingEmergency.id}) approaching from ${approachingEmergency.origin}.`,
      expectedQueueDischarge: 10,
      safetyClearance: {
        yellowDuration: 3.0,
        allRedDuration: 2.0,
      },
    };

    return {
      decision,
      nextPhaseIndex: targetPhaseIndex,
      greenDuration: 35,
      yellowDuration: 3.0,
      allRedDuration: 2.0,
      isEmergencyOverride: true,
    };
  }

  // 2. Greedy Max-Pressure Phase Priority Evaluation
  const greedyResult = evaluateGreedyMaxPressure(intersection);
  const bestPhaseIndex = intersection.phases.findIndex(
    (p) => p.id === greedyResult.bestPhaseId
  );
  const selectedPhase =
    bestPhaseIndex >= 0 ? intersection.phases[bestPhaseIndex] : intersection.phases[0];

  // 3. Dynamic Programming Green Duration Optimization
  const dpResult = optimizeGreenDurationDP(intersection, selectedPhase);

  // 4. Bottleneck Detection
  const bottleneckAlert = detectBottleneck(intersection, timestamp);

  // 5. Construct Comprehensive Hybrid Decision
  const summaryReason = `${greedyResult.reasoning} | ${dpResult.explanation}`;

  const decision: HybridDecision = {
    timestamp,
    intersectionId: intersection.id,
    selectedPhaseId: selectedPhase.id,
    selectedPhaseName: selectedPhase.name,
    assignedGreenDuration: dpResult.optimalDuration,
    is30SecRuleApplied: dpResult.is30SecRuleMandated,
    starvationPrevented: greedyResult.evaluations.some((e) => e.starvationBonus > 10),
    greedyScores: greedyResult.evaluations,
    dpCandidates: dpResult.candidates,
    summaryReason,
    expectedQueueDischarge: dpResult.candidates.find((c) => c.isOptimal)?.queueReduction || 8,
    safetyClearance: {
      yellowDuration: 3.5,
      allRedDuration: 1.5,
    },
  };

  return {
    decision,
    nextPhaseIndex: bestPhaseIndex >= 0 ? bestPhaseIndex : 0,
    greenDuration: dpResult.optimalDuration,
    yellowDuration: 3.5,
    allRedDuration: 1.5,
    isEmergencyOverride: false,
    bottleneckAlert,
  };
}

/**
 * Evaluates queue growth, discharge rates, and downstream capacities to detect bottlenecks.
 */
export function detectBottleneck(
  intersection: Intersection,
  timestamp: number
): BottleneckEvent | undefined {
  let worstQueue = 0;
  let worstDirection: Direction = 'NORTH';
  let worstOccupancy = 0;
  let worstDownstreamCapacity = 100;

  for (const [laneId, lane] of Object.entries(intersection.lanes)) {
    if (lane.queueLength > worstQueue) {
      worstQueue = lane.queueLength;
      worstDirection = lane.direction;
      worstOccupancy = lane.occupancy;
      worstDownstreamCapacity = lane.downstreamCapacity;
    }
  }

  if (worstQueue >= 16 || worstOccupancy >= 75) {
    let cause: BottleneckEvent['cause'] = 'INSUFFICIENT_GREEN_TIME';
    let description = '';
    let suggestedAction = '';

    if (worstDownstreamCapacity < 20) {
      cause = 'DOWNSTREAM_SPILLBACK';
      description = `Downstream exit road is blocked (${worstDownstreamCapacity}% capacity remaining). Queue spilling back into intersection.`;
      suggestedAction = `Throttle upstream signal phases and hold incoming flow until downstream corridor clears.`;
    } else if (worstQueue >= 20) {
      cause = 'HIGH_ARRIVAL_SURGE';
      description = `Severe queue accumulation (${worstQueue} vehicles queued on ${worstDirection} approach).`;
      suggestedAction = `Extend DP green phase and enforce 30-second minimum heavy traffic rule.`;
    } else {
      cause = 'INSUFFICIENT_GREEN_TIME';
      description = `Discharge rate is lower than vehicle arrival rate on ${worstDirection} approach.`;
      suggestedAction = `Greedy Max-Pressure re-weighting to allocate higher cycle share to ${worstDirection}.`;
    }

    return {
      id: `BN-${timestamp.toFixed(0)}-${intersection.id}`,
      timestamp,
      intersectionId: intersection.id,
      direction: worstDirection,
      severity: worstQueue >= 22 ? 'CRITICAL' : 'HIGH',
      cause,
      description,
      suggestedAction,
      resolved: false,
    };
  }

  return undefined;
}

/**
 * Calculates Green Wave phase offset between two coordinated intersections.
 * @param distanceBetweenIntersectionsMeters Distance in meters (e.g. 150m)
 * @param averageSpeedMps Average travel speed in m/s (e.g. 12 m/s ~ 43 km/h)
 * @param cycleDurationSec Total cycle duration in seconds
 */
export function calculateGreenWaveOffset(
  distanceBetweenIntersectionsMeters: number,
  averageSpeedMps: number = 12.0,
  cycleDurationSec: number = 60.0
): number {
  const travelTime = distanceBetweenIntersectionsMeters / averageSpeedMps;
  const offset = travelTime % cycleDurationSec;
  return Math.round(offset * 10) / 10;
}
