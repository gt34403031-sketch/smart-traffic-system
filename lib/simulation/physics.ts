// Realistic Intelligent Driver Model (IDM) & Kinematics Engine
// Implements Right-Hand Traffic (RHT) with smooth Cubic Bezier turning arcs and seamless exit roadways.

import { Lane, TurnMovement, Direction } from './types';

export const IDM_PARAMS = {
  s0: 2.2, // Minimum standstill distance in meters
  T: 1.1, // Desired safe time headway in seconds
  a: 2.4, // Maximum comfortable acceleration (m/s^2)
  b: 2.8, // Comfortable deceleration (m/s^2)
  delta: 4.0, // Acceleration exponent
  emergencyDecel: 7.0, // Maximum emergency braking deceleration (m/s^2)
};

export const ROAD_CONSTANTS = {
  laneWidth: 3.5,
  lanesPerDirection: 3,
  stopLineOffset: 12.0, // distance from center of intersection to stop line (box is -12m to +12m)
  roadLength: 90.0,
};

/**
 * Calculates acceleration using Intelligent Driver Model (IDM).
 */
export function calculateIdmAcceleration(
  v: number,
  v0: number,
  s: number,
  deltaV: number = 0
): number {
  const { s0, T, a, b, delta } = IDM_PARAMS;
  
  const freeRoadRatio = Math.max(0, v / Math.max(0.1, v0));
  const freeTerm = 1 - Math.pow(freeRoadRatio, delta);
  
  let interactionTerm = 0;
  if (s < 1000) {
    const sStar = s0 + Math.max(0, v * T + (v * deltaV) / (2 * Math.sqrt(a * b)));
    interactionTerm = Math.pow(sStar / Math.max(0.1, s), 2);
  }
  
  const targetAcc = a * (freeTerm - interactionTerm);
  return Math.max(-IDM_PARAMS.emergencyDecel, Math.min(a, targetAcc));
}

/**
 * Evaluates a 2D Cubic Bezier curve at parameter t in [0, 1].
 */
function cubicBezier2D(
  p0x: number, p0z: number,
  p1x: number, p1z: number,
  p2x: number, p2z: number,
  p3x: number, p3z: number,
  t: number
): { x: number; z: number; heading: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  // Position
  const x = mt2 * mt * p0x + 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t2 * t * p3x;
  const z = mt2 * mt * p0z + 3 * mt2 * t * p1z + 3 * mt * t2 * p2z + t2 * t * p3z;

  // First Derivative (Tangent vector)
  const dx = 3 * mt2 * (p1x - p0x) + 6 * mt * t * (p2x - p1x) + 3 * t2 * (p3x - p2x);
  const dz = 3 * mt2 * (p1z - p0z) + 6 * mt * t * (p2z - p1z) + 3 * t2 * (p3z - p2z);

  const heading = Math.atan2(dx, dz); // 0 facing +Z, Math.PI facing -Z, Math.PI/2 facing +X, -Math.PI/2 facing -X
  return { x, z, heading };
}

/**
 * Computes the 3D position and orientation for a vehicle along its trajectory.
 * Right-Hand Traffic (RHT) convention:
 * - NORTH approach (Z < 0): travels South (+Z), incoming lanes on WEST side (x < 0).
 * - SOUTH approach (Z > 0): travels North (-Z), incoming lanes on EAST side (x > 0).
 * - EAST approach (X > 0): travels West (-X), incoming lanes on NORTH side (z < 0).
 * - WEST approach (X < 0): travels East (+X), incoming lanes on SOUTH side (z > 0).
 */
export function computeVehicleWorldPosition(
  lane: Lane,
  positionAlongLane: number,
  movement: TurnMovement,
  direction: Direction,
  intersectionCenterX: number = 0,
  intersectionCenterZ: number = 0
): { x: number; y: number; z: number; heading: number } {
  const lw = ROAD_CONSTANTS.laneWidth;
  const stopDist = ROAD_CONSTANTS.roadLength - ROAD_CONSTANTS.stopLineOffset; // 78m

  // Lateral offset from road divider (0 = divider, 10.5m = curb)
  // Lane 2: Left-turn median lane (1.75m from divider)
  // Lane 1: Straight middle lane (5.25m from divider)
  // Lane 0: Right-turn curb lane (8.75m from divider)
  const lateralOffset = lane.laneIndex === 2 ? 1.75 : lane.laneIndex === 1 ? 5.25 : 8.75;

  // STAGE 1: Vehicle on incoming approach road (before stop line)
  if (positionAlongLane <= stopDist) {
    const distBeforeStop = stopDist - positionAlongLane;
    const distFromCenter = ROAD_CONSTANTS.stopLineOffset + distBeforeStop;

    switch (direction) {
      case 'NORTH': // Incoming from North traveling South (+Z)
        return {
          x: intersectionCenterX - lateralOffset,
          y: 0.4,
          z: intersectionCenterZ - distFromCenter,
          heading: 0, // facing +Z
        };
      case 'SOUTH': // Incoming from South traveling North (-Z)
        return {
          x: intersectionCenterX + lateralOffset,
          y: 0.4,
          z: intersectionCenterZ + distFromCenter,
          heading: Math.PI, // facing -Z
        };
      case 'EAST': // Incoming from East traveling West (-X)
        return {
          x: intersectionCenterX + distFromCenter,
          y: 0.4,
          z: intersectionCenterZ - lateralOffset,
          heading: -Math.PI / 2, // facing -X
        };
      case 'WEST': // Incoming from West traveling East (+X)
        return {
          x: intersectionCenterX - distFromCenter,
          y: 0.4,
          z: intersectionCenterZ + lateralOffset,
          heading: Math.PI / 2, // facing +X
        };
    }
  }

  // STAGE 2 & 3: Past stop line (inside intersection box or exit road)
  const distPastStop = positionAlongLane - stopDist;

  // 1. STRAIGHT MOVEMENT (Travels straight through intersection and down opposite road)
  if (movement === 'STRAIGHT') {
    const distFromCenter = -ROAD_CONSTANTS.stopLineOffset + distPastStop;

    switch (direction) {
      case 'NORTH': // Continues South (+Z) into South exit road
        return {
          x: intersectionCenterX - lateralOffset,
          y: 0.4,
          z: intersectionCenterZ + distFromCenter,
          heading: 0,
        };
      case 'SOUTH': // Continues North (-Z) into North exit road
        return {
          x: intersectionCenterX + lateralOffset,
          y: 0.4,
          z: intersectionCenterZ - distFromCenter,
          heading: Math.PI,
        };
      case 'EAST': // Continues West (-X) into West exit road
        return {
          x: intersectionCenterX - distFromCenter,
          y: 0.4,
          z: intersectionCenterZ - lateralOffset,
          heading: -Math.PI / 2,
        };
      case 'WEST': // Continues East (+X) into East exit road
        return {
          x: intersectionCenterX + distFromCenter,
          y: 0.4,
          z: intersectionCenterZ + lateralOffset,
          heading: Math.PI / 2,
        };
    }
  }

  // 2. RIGHT TURN MOVEMENT (Tight 90-degree curb arc into target road, then down target road)
  if (movement === 'RIGHT') {
    // Arc length for right turn is approx 8.0 meters
    const rightArcLength = 8.5;

    if (distPastStop <= rightArcLength) {
      const t = Math.min(1.0, distPastStop / rightArcLength);
      switch (direction) {
        case 'NORTH': { // North to West (from x = -8.75, z = -12 to x = -12, z = -8.75)
          const p = cubicBezier2D(-8.75, -12, -8.75, -9.5, -9.5, -8.75, -12, -8.75, t);
          return { x: intersectionCenterX + p.x, y: 0.4, z: intersectionCenterZ + p.z, heading: p.heading };
        }
        case 'SOUTH': { // South to East (from x = 8.75, z = 12 to x = 12, z = 8.75)
          const p = cubicBezier2D(8.75, 12, 8.75, 9.5, 9.5, 8.75, 12, 8.75, t);
          return { x: intersectionCenterX + p.x, y: 0.4, z: intersectionCenterZ + p.z, heading: p.heading };
        }
        case 'EAST': { // East to North (from x = 12, z = -8.75 to x = 8.75, z = -12)
          const p = cubicBezier2D(12, -8.75, 9.5, -8.75, 8.75, -9.5, 8.75, -12, t);
          return { x: intersectionCenterX + p.x, y: 0.4, z: intersectionCenterZ + p.z, heading: p.heading };
        }
        case 'WEST': { // West to South (from x = -12, z = 8.75 to x = -8.75, z = 12)
          const p = cubicBezier2D(-12, 8.75, -9.5, 8.75, -8.75, 9.5, -8.75, 12, t);
          return { x: intersectionCenterX + p.x, y: 0.4, z: intersectionCenterZ + p.z, heading: p.heading };
        }
      }
    } else {
      // Turn complete: Drive straight down exit road
      const exitDist = distPastStop - rightArcLength;
      switch (direction) {
        case 'NORTH': // Driving West (-X) along West road
          return {
            x: intersectionCenterX - ROAD_CONSTANTS.stopLineOffset - exitDist,
            y: 0.4,
            z: intersectionCenterZ - 8.75,
            heading: -Math.PI / 2,
          };
        case 'SOUTH': // Driving East (+X) along East road
          return {
            x: intersectionCenterX + ROAD_CONSTANTS.stopLineOffset + exitDist,
            y: 0.4,
            z: intersectionCenterZ + 8.75,
            heading: Math.PI / 2,
          };
        case 'EAST': // Driving North (-Z) along North road
          return {
            x: intersectionCenterX + 8.75,
            y: 0.4,
            z: intersectionCenterZ - ROAD_CONSTANTS.stopLineOffset - exitDist,
            heading: Math.PI,
          };
        case 'WEST': // Driving South (+Z) along South road
          return {
            x: intersectionCenterX - 8.75,
            y: 0.4,
            z: intersectionCenterZ + ROAD_CONSTANTS.stopLineOffset + exitDist,
            heading: 0,
          };
      }
    }
  }

  // 3. LEFT TURN MOVEMENT (Wide arc from median lane into destination median lane, then down exit road)
  if (movement === 'LEFT') {
    const leftArcLength = 19.5;

    if (distPastStop <= leftArcLength) {
      const t = Math.min(1.0, distPastStop / leftArcLength);
      switch (direction) {
        case 'NORTH': { // North to East (from x = -1.75, z = -12 to x = 12, z = 1.75)
          const p = cubicBezier2D(-1.75, -12, -1.75, 2.0, 2.0, 1.75, 12, 1.75, t);
          return { x: intersectionCenterX + p.x, y: 0.4, z: intersectionCenterZ + p.z, heading: p.heading };
        }
        case 'SOUTH': { // South to West (from x = 1.75, z = 12 to x = -12, z = -1.75)
          const p = cubicBezier2D(1.75, 12, 1.75, -2.0, -2.0, -1.75, -12, -1.75, t);
          return { x: intersectionCenterX + p.x, y: 0.4, z: intersectionCenterZ + p.z, heading: p.heading };
        }
        case 'EAST': { // East to South (from x = 12, z = -1.75 to x = -1.75, z = 12)
          const p = cubicBezier2D(12, -1.75, -2.0, -1.75, -1.75, 2.0, -1.75, 12, t);
          return { x: intersectionCenterX + p.x, y: 0.4, z: intersectionCenterZ + p.z, heading: p.heading };
        }
        case 'WEST': { // West to North (from x = -12, z = 1.75 to x = 1.75, z = -12)
          const p = cubicBezier2D(-12, 1.75, 2.0, 1.75, 1.75, -2.0, 1.75, -12, t);
          return { x: intersectionCenterX + p.x, y: 0.4, z: intersectionCenterZ + p.z, heading: p.heading };
        }
      }
    } else {
      // Turn complete: Drive straight down exit road
      const exitDist = distPastStop - leftArcLength;
      switch (direction) {
        case 'NORTH': // Driving East (+X) along East road
          return {
            x: intersectionCenterX + ROAD_CONSTANTS.stopLineOffset + exitDist,
            y: 0.4,
            z: intersectionCenterZ + 1.75,
            heading: Math.PI / 2,
          };
        case 'SOUTH': // Driving West (-X) along West road
          return {
            x: intersectionCenterX - ROAD_CONSTANTS.stopLineOffset - exitDist,
            y: 0.4,
            z: intersectionCenterZ - 1.75,
            heading: -Math.PI / 2,
          };
        case 'EAST': // Driving South (+Z) along South road
          return {
            x: intersectionCenterX - 1.75,
            y: 0.4,
            z: intersectionCenterZ + ROAD_CONSTANTS.stopLineOffset + exitDist,
            heading: 0,
          };
        case 'WEST': // Driving North (-Z) along North road
          return {
            x: intersectionCenterX + 1.75,
            y: 0.4,
            z: intersectionCenterZ - ROAD_CONSTANTS.stopLineOffset - exitDist,
            heading: Math.PI,
          };
      }
    }
  }

  return { x: intersectionCenterX, y: 0.4, z: intersectionCenterZ, heading: 0 };
}
