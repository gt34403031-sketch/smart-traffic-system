// Type definitions for the Intelligent Smart City Traffic Management System

export type Direction = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export type TurnMovement = 'STRAIGHT' | 'LEFT' | 'RIGHT';

export type SignalColor = 'RED' | 'YELLOW' | 'GREEN';

export type VehicleType =
  | 'CAR'
  | 'MOTORCYCLE'
  | 'BUS'
  | 'TRUCK'
  | 'AMBULANCE'
  | 'FIRE_ENGINE'
  | 'POLICE';

export type AlgorithmType =
  | 'FIXED_TIME'
  | 'GREEDY_MAX_PRESSURE'
  | 'DYNAMIC_PROGRAMMING'
  | 'HYBRID_GREEDY_DP'
  | 'PREDICTIVE_HYBRID';

export interface Vehicle {
  id: string;
  type: VehicleType;
  color: string;
  origin: Direction;
  destination: Direction;
  movement: TurnMovement;
  currentLaneId: string;
  intersectionId: string;
  
  // Dynamics & Kinematics
  position: number; // distance along lane in meters
  speed: number; // m/s
  maxSpeed: number; // m/s (typically 12 - 16 m/s, ~45-60 km/h)
  acceleration: number; // m/s^2
  length: number; // meters (car: 4.5, bus: 11, truck: 12, moto: 2.2, ambulance: 6)
  width: number;
  
  // Status & Telemetry
  isEmergency: boolean;
  isStopped: boolean;
  waitingTime: number; // seconds spent at speed < 0.5 m/s
  totalTravelTime: number; // total active simulation seconds
  distanceTraveled: number;
  status: 'APPROACHING' | 'WAITING' | 'PASSING' | 'TURNING' | 'EXITING' | 'COMPLETED';
  
  // 3D coordinates for interpolation and chase camera
  worldX: number;
  worldY: number;
  worldZ: number;
  heading: number; // radians
}

export interface Lane {
  id: string;
  direction: Direction;
  laneIndex: number; // 0: Right-turn only, 1: Straight, 2: Left-turn
  permittedMovements: TurnMovement[];
  length: number; // meters (e.g. 100m)
  speedLimit: number; // m/s (13.8 m/s = 50 km/h)
  stopLinePosition: number; // meters from lane start (e.g. 95m)
  
  // Metrics
  vehicleIds: string[];
  queueLength: number; // number of stopped vehicles
  occupancy: number; // percentage 0 - 100%
  averageWaitTime: number;
  arrivalRate: number; // veh/min
  dischargeRate: number; // veh/min
  downstreamCapacity: number; // remaining capacity 0 - 100%
}

export interface SignalPhase {
  id: number;
  name: string;
  description: string;
  activeDirections: Direction[];
  activeMovements: TurnMovement[];
  compatibleLanes: string[];
  
  // Timing parameters
  minGreen: number; // minimum green seconds (e.g. 10s default, or 30s rule)
  maxGreen: number; // maximum green seconds (e.g. 60s)
  yellowDuration: number; // yellow transition (3s)
  allRedDuration: number; // all-red clearance (1.5s)
  
  // State
  color: SignalColor;
  timeRemaining: number;
  currentDuration: number;
  assignedGreenDuration: number;
  
  // Algorithmic evaluation
  pressureScore: number;
  starvationTimer: number; // seconds since last green
}

export interface Intersection {
  id: string;
  name: string;
  x: number; // world x
  z: number; // world z
  lanes: Record<string, Lane>;
  phases: SignalPhase[];
  currentPhaseIndex: number;
  phaseState: 'GREEN' | 'YELLOW' | 'ALL_RED';
  phaseTimer: number; // elapsed time in current state
  cycleCount: number;
  totalVehiclesPassed: number;
  congestionLevel: number; // 0 - 100%
  isEmergencyOverride: boolean;
  emergencyPhaseId?: number;
  bottleneckDetected: boolean;
  bottleneckReason?: string;
}

export interface GreedyPhaseEvaluation {
  phaseId: number;
  phaseName: string;
  incomingQueue: number;
  outgoingQueue: number;
  avgWaitTime: number;
  starvationBonus: number;
  downstreamCapacityRatio: number;
  rawPressure: number;
  finalScore: number;
  selectionReason: string;
}

export interface DPCandidateEvaluation {
  duration: number; // seconds (e.g., 10, 15, 20, 25, 30, 35, 45)
  queueReduction: number;
  expectedCrossDelay: number;
  switchingPenalty: number;
  downstreamSpillbackPenalty: number;
  totalCost: number;
  isOptimal: boolean;
  is30SecRuleMandated: boolean;
  explanation: string;
}

export interface HybridDecision {
  timestamp: number;
  intersectionId: string;
  selectedPhaseId: number;
  selectedPhaseName: string;
  assignedGreenDuration: number;
  is30SecRuleApplied: boolean;
  starvationPrevented: boolean;
  greedyScores: GreedyPhaseEvaluation[];
  dpCandidates: DPCandidateEvaluation[];
  summaryReason: string;
  expectedQueueDischarge: number;
  safetyClearance: {
    yellowDuration: number;
    allRedDuration: number;
  };
}

export interface BottleneckEvent {
  id: string;
  timestamp: number;
  intersectionId: string;
  direction: Direction;
  severity: 'MODERATE' | 'HIGH' | 'CRITICAL';
  cause:
    | 'INSUFFICIENT_GREEN_TIME'
    | 'DOWNSTREAM_SPILLBACK'
    | 'HIGH_ARRIVAL_SURGE'
    | 'LOW_DISCHARGE_RATE'
    | 'ROAD_BLOCKAGE'
    | 'EMERGENCY_HOLD';
  description: string;
  suggestedAction: string;
  resolved: boolean;
}

export interface TrafficMetrics {
  totalActiveVehicles: number;
  vehiclesMoving: number;
  vehiclesWaiting: number;
  totalCompletedVehicles: number;
  
  // Direction counts
  northCount: number;
  southCount: number;
  eastCount: number;
  westCount: number;
  
  // Averages
  averageSpeedKmh: number;
  averageWaitTimeSec: number;
  maxWaitTimeSec: number;
  averageQueueLength: number;
  overallCongestionPercent: number; // Target <= 20%
  networkThroughputPerMin: number;
  totalVehicleDelaySec: number;
  
  // Safety & Efficiency
  unnecessaryStops: number;
  emergencyResponseTimeSec: number;
  rule30SecTriggerCount: number;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  arrivalRatePerMin: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  hasEmergency: boolean;
  emergencyVehicleType?: VehicleType;
  hasRoadBlockage: boolean;
  blockageDirection?: Direction;
  targetCongestionExpectation: string;
}
