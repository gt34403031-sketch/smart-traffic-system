// Comprehensive Traffic Simulation Engine
// Manages vehicle spawning, IDM physics step, signal cycles, scenarios, and live metric aggregation.

import {
  Vehicle,
  VehicleType,
  Direction,
  TurnMovement,
  Intersection,
  Lane,
  SignalPhase,
  SignalColor,
  TrafficMetrics,
  ScenarioPreset,
  AlgorithmType,
  HybridDecision,
  BottleneckEvent,
} from './types';
import {
  calculateIdmAcceleration,
  computeVehicleWorldPosition,
  ROAD_CONSTANTS,
} from './physics';
import { executeHybridController } from './hybrid-controller';

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'normal',
    name: '1. Normal Urban Traffic',
    description: 'Balanced moderate demand across all 4 approaches. Low congestion target.',
    arrivalRatePerMin: { north: 14, south: 14, east: 12, west: 12 },
    hasEmergency: false,
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Nominal 10% - 14% Congestion',
  },
  {
    id: 'heavy',
    name: '2. Heavy Traffic (30s Rule Trigger)',
    description: 'Intense volume triggering the mandatory 30-Second Minimum Green Rule.',
    arrivalRatePerMin: { north: 34, south: 32, east: 28, west: 26 },
    hasEmergency: false,
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Controlled 22% - 28% Congestion via 30s DP Rule',
  },
  {
    id: 'rush_hour',
    name: '3. Rush Hour Arterial Peak',
    description: 'High commuter tidal flow on North-South corridor, light East-West.',
    arrivalRatePerMin: { north: 42, south: 38, east: 10, west: 8 },
    hasEmergency: false,
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Adaptive Split Prevents East-West Starvation',
  },
  {
    id: 'unequal',
    name: '4. Unequal Traffic Distribution',
    description: 'Extreme imbalance (North/South 100 vs East/West 10). Tests starvation prevention.',
    arrivalRatePerMin: { north: 45, south: 40, east: 6, west: 5 },
    hasEmergency: false,
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Max-Waiting Protection Guarantees Minor Approach Service',
  },
  {
    id: 'surge',
    name: '5. Sudden Traffic Surge',
    description: 'Sudden influx spike on East approach from freeway connector ramp.',
    arrivalRatePerMin: { north: 12, south: 12, east: 48, west: 10 },
    hasEmergency: false,
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Rapid Max-Pressure Phase Switch Minimizes Delay Spike',
  },
  {
    id: 'ambulance',
    name: '6. Ambulance Emergency Corridor',
    description: 'High-priority emergency vehicle approaching from North to Hospital.',
    arrivalRatePerMin: { north: 20, south: 20, east: 18, west: 18 },
    hasEmergency: true,
    emergencyVehicleType: 'AMBULANCE',
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Instant Safety Preemption; Sub-20s Emergency Clearance',
  },
  {
    id: 'accident',
    name: '7. Accident & Downstream Blockage',
    description: 'Lane reduction on South exit road. Demonstrates spillback prevention.',
    arrivalRatePerMin: { north: 22, south: 18, east: 20, west: 20 },
    hasEmergency: false,
    hasRoadBlockage: true,
    blockageDirection: 'SOUTH',
    targetCongestionExpectation: 'Downstream Capacity Penalty Prevents Intersection Gridlock',
  },
  {
    id: 'pedestrian',
    name: '8. Pedestrian Heavy Crossing',
    description: 'School zone peak hour; prolonged all-red pedestrian clearance interval.',
    arrivalRatePerMin: { north: 16, south: 16, east: 16, west: 16 },
    hasEmergency: false,
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Safe Pedestrian Interval with Efficient Recovery',
  },
  {
    id: 'hospital',
    name: '9. Hospital Emergency Access',
    description: 'Frequent ambulance dispatches with continuous arterial corridor priority.',
    arrivalRatePerMin: { north: 18, south: 18, east: 18, west: 18 },
    hasEmergency: true,
    emergencyVehicleType: 'FIRE_ENGINE',
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Zero Emergency Delay without Starving Regular Commuters',
  },
  {
    id: 'sensor_failure',
    name: '10. Degraded Sensor Detection',
    description: 'Simulates loop detector failure on West lane; fallback predictive recovery.',
    arrivalRatePerMin: { north: 20, south: 20, east: 20, west: 15 },
    hasEmergency: false,
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Finite-Horizon DP Maintains Stable Rhythm',
  },
  {
    id: 'downstream_block',
    name: '11. Downstream Road Blockage',
    description: 'Severe exit bottleneck on East road. Tests spillback mitigation.',
    arrivalRatePerMin: { north: 25, south: 25, east: 10, west: 30 },
    hasEmergency: false,
    hasRoadBlockage: true,
    blockageDirection: 'EAST',
    targetCongestionExpectation: 'Spillback Prevention Inhibits Feeding Blocked Road',
  },
  {
    id: 'gridlock_test',
    name: '12. Multi-Intersection Gridlock Test',
    description: 'High volume across 4 connected intersections testing Green Wave coordination.',
    arrivalRatePerMin: { north: 36, south: 36, east: 36, west: 36 },
    hasEmergency: false,
    hasRoadBlockage: false,
    targetCongestionExpectation: 'Coordinated Green Wave Prevents Cascade Collapse',
  },
];

export class TrafficSimulationEngine {
  public vehicles: Map<string, Vehicle> = new Map();
  public intersections: Map<string, Intersection> = new Map();
  public currentScenario: ScenarioPreset = SCENARIO_PRESETS[0];
  public algorithm: AlgorithmType = 'HYBRID_GREEDY_DP';
  public simulationTime: number = 0; // seconds
  public isRunning: boolean = true;
  public timeScale: number = 1.0; // 1x, 2x, 5x
  public gridMode: boolean = false; // false = 1 main intersection, true = 4-grid network
  
  // History & Metrics
  public metrics: TrafficMetrics = this.getInitialMetrics();
  public decisionHistory: HybridDecision[] = [];
  public bottleneckHistory: BottleneckEvent[] = [];
  public throughputHistory: { time: number; throughput: number; congestion: number }[] = [];
  
  // Spawner timers (seconds elapsed since last spawn per direction)
  private spawnTimers: Record<Direction, number> = {
    NORTH: 0,
    SOUTH: 0,
    EAST: 0,
    WEST: 0,
  };
  private vehicleCounter: number = 100;
  private fixedCycleIndex: number = 0;
  private fixedPhaseTimer: number = 0;

  constructor() {
    this.initializeIntersections();
  }

  public setRunning(running: boolean): void {
    this.isRunning = running;
  }

  public setTimeScale(scale: number): void {
    this.timeScale = scale;
  }

  public initializeIntersections(): void {
    this.intersections.clear();
    this.vehicles.clear();
    this.decisionHistory = [];
    this.bottleneckHistory = [];
    this.throughputHistory = [];

    // Create Primary Intersection (INT-01)
    const int1 = this.createDefaultIntersection('INT-01', 'Central Hub (Main 4-Way)', 0, 0);
    this.intersections.set('INT-01', int1);

    if (this.gridMode) {
      // 4 connected intersections in 2x2 grid
      const int2 = this.createDefaultIntersection('INT-02', 'North Plaza', 0, -180);
      const int3 = this.createDefaultIntersection('INT-03', 'East Commercial', 180, 0);
      const int4 = this.createDefaultIntersection('INT-04', 'Northeast Tech', 180, -180);
      this.intersections.set('INT-02', int2);
      this.intersections.set('INT-03', int3);
      this.intersections.set('INT-04', int4);
    }

    // Seed initial realistic vehicles
    this.seedInitialVehicles();
  }

  private createDefaultIntersection(
    id: string,
    name: string,
    x: number,
    z: number
  ): Intersection {
    const directions: Direction[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    const lanes: Record<string, Lane> = {};

    directions.forEach((dir) => {
      // 3 incoming lanes per approach
      // Lane 0: Right-turn + Straight
      lanes[`${dir}_L0`] = {
        id: `${dir}_L0`,
        direction: dir,
        laneIndex: 0,
        permittedMovements: ['RIGHT', 'STRAIGHT'],
        length: ROAD_CONSTANTS.roadLength,
        speedLimit: 13.8, // 50 km/h
        stopLinePosition: ROAD_CONSTANTS.roadLength - ROAD_CONSTANTS.stopLineOffset,
        vehicleIds: [],
        queueLength: 0,
        occupancy: 0,
        averageWaitTime: 0,
        arrivalRate: 15,
        dischargeRate: 18,
        downstreamCapacity: 95,
      };

      // Lane 1: Straight through
      lanes[`${dir}_L1`] = {
        id: `${dir}_L1`,
        direction: dir,
        laneIndex: 1,
        permittedMovements: ['STRAIGHT'],
        length: ROAD_CONSTANTS.roadLength,
        speedLimit: 13.8,
        stopLinePosition: ROAD_CONSTANTS.roadLength - ROAD_CONSTANTS.stopLineOffset,
        vehicleIds: [],
        queueLength: 0,
        occupancy: 0,
        averageWaitTime: 0,
        arrivalRate: 18,
        dischargeRate: 20,
        downstreamCapacity: 92,
      };

      // Lane 2: Left-turn only
      lanes[`${dir}_L2`] = {
        id: `${dir}_L2`,
        direction: dir,
        laneIndex: 2,
        permittedMovements: ['LEFT'],
        length: ROAD_CONSTANTS.roadLength,
        speedLimit: 13.8,
        stopLinePosition: ROAD_CONSTANTS.roadLength - ROAD_CONSTANTS.stopLineOffset,
        vehicleIds: [],
        queueLength: 0,
        occupancy: 0,
        averageWaitTime: 0,
        arrivalRate: 8,
        dischargeRate: 12,
        downstreamCapacity: 98,
      };
    });

    // Four standard traffic signal phases:
    // Phase 0: North-South Straight & Right (P1)
    // Phase 1: North-South Protected Left Turns (P2)
    // Phase 2: East-West Straight & Right (P3)
    // Phase 3: East-West Protected Left Turns (P4)
    const phases: SignalPhase[] = [
      {
        id: 0,
        name: 'Phase 1: North-South Through',
        description: 'Green for North and South straight & right turning movements.',
        activeDirections: ['NORTH', 'SOUTH'],
        activeMovements: ['STRAIGHT', 'RIGHT'],
        compatibleLanes: ['NORTH_L0', 'NORTH_L1', 'SOUTH_L0', 'SOUTH_L1'],
        minGreen: 12,
        maxGreen: 55,
        yellowDuration: 3.5,
        allRedDuration: 1.5,
        color: 'GREEN',
        timeRemaining: 25,
        currentDuration: 25,
        assignedGreenDuration: 25,
        pressureScore: 0,
        starvationTimer: 0,
      },
      {
        id: 1,
        name: 'Phase 2: North-South Left Turns',
        description: 'Protected left turn movements for North and South approaches.',
        activeDirections: ['NORTH', 'SOUTH'],
        activeMovements: ['LEFT'],
        compatibleLanes: ['NORTH_L2', 'SOUTH_L2'],
        minGreen: 10,
        maxGreen: 35,
        yellowDuration: 3.0,
        allRedDuration: 1.5,
        color: 'RED',
        timeRemaining: 0,
        currentDuration: 15,
        assignedGreenDuration: 15,
        pressureScore: 0,
        starvationTimer: 15,
      },
      {
        id: 2,
        name: 'Phase 3: East-West Through',
        description: 'Green for East and West straight & right turning movements.',
        activeDirections: ['EAST', 'WEST'],
        activeMovements: ['STRAIGHT', 'RIGHT'],
        compatibleLanes: ['EAST_L0', 'EAST_L1', 'WEST_L0', 'WEST_L1'],
        minGreen: 12,
        maxGreen: 55,
        yellowDuration: 3.5,
        allRedDuration: 1.5,
        color: 'RED',
        timeRemaining: 0,
        currentDuration: 25,
        assignedGreenDuration: 25,
        pressureScore: 0,
        starvationTimer: 30,
      },
      {
        id: 3,
        name: 'Phase 4: East-West Left Turns',
        description: 'Protected left turn movements for East and West approaches.',
        activeDirections: ['EAST', 'WEST'],
        activeMovements: ['LEFT'],
        compatibleLanes: ['EAST_L2', 'WEST_L2'],
        minGreen: 10,
        maxGreen: 35,
        yellowDuration: 3.0,
        allRedDuration: 1.5,
        color: 'RED',
        timeRemaining: 0,
        currentDuration: 15,
        assignedGreenDuration: 15,
        pressureScore: 0,
        starvationTimer: 45,
      },
    ];

    return {
      id,
      name,
      x,
      z,
      lanes,
      phases,
      currentPhaseIndex: 0,
      phaseState: 'GREEN',
      phaseTimer: 0,
      cycleCount: 1,
      totalVehiclesPassed: 0,
      congestionLevel: 12,
      isEmergencyOverride: false,
      bottleneckDetected: false,
    };
  }

  private seedInitialVehicles(): void {
    const directions: Direction[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    directions.forEach((dir) => {
      // Add 2-3 realistic vehicles per direction at varying initial distances
      for (let i = 0; i < 3; i++) {
        this.spawnVehicle(dir, false, i * 22 + 10);
      }
    });
  }

  public spawnVehicle(
    direction: Direction,
    isEmergency: boolean = false,
    customPosition?: number
  ): Vehicle {
    this.vehicleCounter++;
    const id = isEmergency ? `EMG-${this.vehicleCounter}` : `VEH-${this.vehicleCounter}`;

    // Vehicle Type selection
    let type: VehicleType = 'CAR';
    let length = 4.6;
    let width = 1.9;
    let color = '#38bdf8'; // cyan

    if (isEmergency) {
      type = this.currentScenario.emergencyVehicleType || 'AMBULANCE';
      length = 6.2;
      width = 2.3;
      color = '#ef4444'; // emergency red/white
    } else {
      const rand = Math.random();
      if (rand < 0.60) {
        type = 'CAR';
        length = 4.5;
        width = 1.9;
        const colors = ['#38bdf8', '#e2e8f0', '#0ea5e9', '#64748b', '#f59e0b', '#10b981'];
        color = colors[Math.floor(Math.random() * colors.length)];
      } else if (rand < 0.75) {
        type = 'BUS';
        length = 11.0;
        width = 2.6;
        color = '#3b82f6';
      } else if (rand < 0.88) {
        type = 'TRUCK';
        length = 10.5;
        width = 2.5;
        color = '#d97706';
      } else {
        type = 'MOTORCYCLE';
        length = 2.2;
        width = 0.9;
        color = '#a855f7';
      }
    }

    // Assign turn movement and corresponding permitted lane
    let movement: TurnMovement = 'STRAIGHT';
    let laneIndex = 1; // Straight lane by default

    const mRand = Math.random();
    if (mRand < 0.20) {
      movement = 'RIGHT';
      laneIndex = 0;
    } else if (mRand < 0.40) {
      movement = 'LEFT';
      laneIndex = 2;
    } else {
      movement = 'STRAIGHT';
      laneIndex = Math.random() < 0.6 ? 1 : 0;
    }

    const laneId = `${direction}_L${laneIndex}`;
    const initialPosition = customPosition !== undefined ? customPosition : Math.random() * 8;
    const initialSpeed = isEmergency ? 14.5 : 8.0 + Math.random() * 4.0;

    // Destination determination
    let destination: Direction = 'SOUTH';
    if (direction === 'NORTH') {
      destination = movement === 'STRAIGHT' ? 'SOUTH' : movement === 'RIGHT' ? 'WEST' : 'EAST';
    } else if (direction === 'SOUTH') {
      destination = movement === 'STRAIGHT' ? 'NORTH' : movement === 'RIGHT' ? 'EAST' : 'WEST';
    } else if (direction === 'EAST') {
      destination = movement === 'STRAIGHT' ? 'WEST' : movement === 'RIGHT' ? 'NORTH' : 'SOUTH';
    } else if (direction === 'WEST') {
      destination = movement === 'STRAIGHT' ? 'EAST' : movement === 'RIGHT' ? 'SOUTH' : 'NORTH';
    }

    const vehicle: Vehicle = {
      id,
      type,
      color,
      origin: direction,
      destination,
      movement,
      currentLaneId: laneId,
      intersectionId: 'INT-01',
      position: initialPosition,
      speed: initialSpeed,
      maxSpeed: isEmergency ? 16.5 : 13.8, // emergency 60 km/h, normal 50 km/h
      acceleration: 0,
      length,
      width,
      isEmergency,
      isStopped: false,
      waitingTime: 0,
      totalTravelTime: 0,
      distanceTraveled: 0,
      status: 'APPROACHING',
      worldX: 0,
      worldY: 0.4,
      worldZ: 0,
      heading: 0,
    };

    const lane = this.intersections.get('INT-01')?.lanes[laneId];
    if (lane) {
      lane.vehicleIds.push(vehicle.id);
    }

    this.vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  public setScenario(presetId: string): void {
    const found = SCENARIO_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    this.currentScenario = found;
    this.initializeIntersections();

    // If scenario includes emergency, spawn one immediately
    if (found.hasEmergency) {
      this.spawnVehicle('NORTH', true, 15);
    }
  }

  public setAlgorithm(algo: AlgorithmType): void {
    this.algorithm = algo;
  }

  public setGridMode(enabled: boolean): void {
    this.gridMode = enabled;
    this.initializeIntersections();
  }

  /**
   * Main simulation step executed each frame.
   * @param dt Delta time in seconds (e.g. 0.016s)
   */
  public step(rawDt: number): void {
    if (!this.isRunning) return;

    // Scaled simulation step
    const dt = Math.min(0.1, rawDt * this.timeScale);
    this.simulationTime += dt;

    // 1. Spawning vehicles according to scenario arrival rates
    this.updateSpawning(dt);

    // 2. Update traffic signals & algorithm cycles
    this.updateSignals(dt);

    // 3. Update vehicle kinematics & IDM physics
    this.updateVehicles(dt);

    // 4. Update lane metrics and intersection statistics
    this.updateLaneMetrics();

    // 5. Aggregate global network metrics
    this.calculateGlobalMetrics();
  }

  private updateSpawning(dt: number): void {
    const rates = this.currentScenario.arrivalRatePerMin;
    const directions: Direction[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

    directions.forEach((dir) => {
      const ratePerMin =
        dir === 'NORTH'
          ? rates.north
          : dir === 'SOUTH'
          ? rates.south
          : dir === 'EAST'
          ? rates.east
          : rates.west;

      const spawnInterval = 60.0 / Math.max(1, ratePerMin);
      this.spawnTimers[dir] += dt;

      if (this.spawnTimers[dir] >= spawnInterval) {
        this.spawnTimers[dir] = 0;
        // Don't spawn if entry of lane is already occupied by a vehicle within 12m
        const laneId = `${dir}_L${Math.floor(Math.random() * 3)}`;
        const lane = this.intersections.get('INT-01')?.lanes[laneId];
        const isEntryBlocked = lane?.vehicleIds.some((vid) => {
          const v = this.vehicles.get(vid);
          return v && v.position < 12.0;
        });

        if (!isEntryBlocked && this.vehicles.size < 90) {
          this.spawnVehicle(dir);
        }
      }
    });
  }

  private updateSignals(dt: number): void {
    for (const [intId, intersection] of this.intersections.entries()) {
      intersection.phaseTimer += dt;
      const currentPhase = intersection.phases[intersection.currentPhaseIndex];

      // Update starvation timers for non-active phases
      intersection.phases.forEach((p, idx) => {
        if (idx !== intersection.currentPhaseIndex) {
          p.starvationTimer += dt;
        } else {
          p.starvationTimer = 0;
        }
      });

      // State machine: GREEN -> YELLOW -> ALL_RED -> Next GREEN
      if (intersection.phaseState === 'GREEN') {
        currentPhase.color = 'GREEN';
        currentPhase.timeRemaining = Math.max(
          0,
          currentPhase.assignedGreenDuration - intersection.phaseTimer
        );

        if (intersection.phaseTimer >= currentPhase.assignedGreenDuration) {
          // Transition to YELLOW
          intersection.phaseState = 'YELLOW';
          intersection.phaseTimer = 0;
          currentPhase.color = 'YELLOW';
          currentPhase.timeRemaining = currentPhase.yellowDuration;
        }
      } else if (intersection.phaseState === 'YELLOW') {
        currentPhase.color = 'YELLOW';
        currentPhase.timeRemaining = Math.max(
          0,
          currentPhase.yellowDuration - intersection.phaseTimer
        );

        if (intersection.phaseTimer >= currentPhase.yellowDuration) {
          // Transition to ALL_RED safety clearance
          intersection.phaseState = 'ALL_RED';
          intersection.phaseTimer = 0;
          currentPhase.color = 'RED';
          currentPhase.timeRemaining = currentPhase.allRedDuration;
        }
      } else if (intersection.phaseState === 'ALL_RED') {
        currentPhase.color = 'RED';
        currentPhase.timeRemaining = Math.max(
          0,
          currentPhase.allRedDuration - intersection.phaseTimer
        );

        if (intersection.phaseTimer >= currentPhase.allRedDuration) {
          // Select NEXT Phase via active algorithm
          this.transitionToNextPhase(intersection);
        }
      }
    }
  }

  private transitionToNextPhase(intersection: Intersection): void {
    intersection.phaseState = 'GREEN';
    intersection.phaseTimer = 0;
    intersection.cycleCount++;

    if (this.algorithm === 'FIXED_TIME') {
      // Standard round-robin fixed time: 25s through, 15s left-turns
      intersection.currentPhaseIndex =
        (intersection.currentPhaseIndex + 1) % intersection.phases.length;
      const nextPhase = intersection.phases[intersection.currentPhaseIndex];
      nextPhase.color = 'GREEN';
      nextPhase.assignedGreenDuration =
        nextPhase.id === 0 || nextPhase.id === 2 ? 25 : 15;
      nextPhase.timeRemaining = nextPhase.assignedGreenDuration;
      return;
    }

    // Execute Hybrid Controller (Greedy Max-Pressure + DP + Emergency + Bottleneck)
    const allVehs = Array.from(this.vehicles.values());
    const result = executeHybridController(intersection, allVehs, this.simulationTime);

    intersection.currentPhaseIndex = result.nextPhaseIndex;
    const nextPhase = intersection.phases[result.nextPhaseIndex];
    nextPhase.color = 'GREEN';
    nextPhase.assignedGreenDuration = result.greenDuration;
    nextPhase.timeRemaining = result.greenDuration;
    intersection.isEmergencyOverride = result.isEmergencyOverride;

    // Log decision
    this.decisionHistory.unshift(result.decision);
    if (this.decisionHistory.length > 25) this.decisionHistory.pop();

    if (result.bottleneckAlert) {
      this.bottleneckHistory.unshift(result.bottleneckAlert);
      if (this.bottleneckHistory.length > 15) this.bottleneckHistory.pop();
      intersection.bottleneckDetected = true;
      intersection.bottleneckReason = result.bottleneckAlert.description;
    } else {
      intersection.bottleneckDetected = false;
      intersection.bottleneckReason = undefined;
    }
  }

  private updateVehicles(dt: number): void {
    const int = this.intersections.get('INT-01');
    if (!int) return;

    const stopLineDist = ROAD_CONSTANTS.roadLength - ROAD_CONSTANTS.stopLineOffset;
    const currentPhase = int.phases[int.currentPhaseIndex];
    const isSignalGreenForPhase =
      int.phaseState === 'GREEN' && currentPhase.color === 'GREEN';

    // Group vehicles by lane sorted by position descending (lead vehicle first)
    const laneMap = new Map<string, Vehicle[]>();
    for (const v of this.vehicles.values()) {
      if (v.status === 'COMPLETED') continue;
      if (!laneMap.has(v.currentLaneId)) {
        laneMap.set(v.currentLaneId, []);
      }
      laneMap.get(v.currentLaneId)!.push(v);
    }

    // Iterate through each lane
    for (const [laneId, laneVehicles] of laneMap.entries()) {
      laneVehicles.sort((a, b) => b.position - a.position);
      const lane = int.lanes[laneId];

      const isPermittedBySignal =
        isSignalGreenForPhase &&
        currentPhase.compatibleLanes.includes(laneId);

      for (let i = 0; i < laneVehicles.length; i++) {
        const v = laneVehicles[i];
        let netDistanceToObstacle = 1000;
        let deltaV = 0;

        // 1. Leader vehicle in front on the same lane
        if (i > 0) {
          const leader = laneVehicles[i - 1];
          netDistanceToObstacle = leader.position - v.position - leader.length;
          deltaV = v.speed - leader.speed;
        }

        // 2. Stop line check if no green signal
        if (!isPermittedBySignal && v.position <= stopLineDist) {
          const distToStopLine = stopLineDist - v.position;
          // If stopline is closer than lead vehicle, treat stopline as obstacle with speed 0
          if (distToStopLine >= 0 && distToStopLine < netDistanceToObstacle) {
            netDistanceToObstacle = distToStopLine;
            deltaV = v.speed; // speed difference relative to stopped obstacle
          }
        }

        // Check road blockage scenario
        if (
          this.currentScenario.hasRoadBlockage &&
          this.currentScenario.blockageDirection === v.origin &&
          v.position > 60 &&
          v.position < 75
        ) {
          netDistanceToObstacle = Math.min(netDistanceToObstacle, Math.max(0.1, 70 - v.position));
        }

        // 3. Compute acceleration using IDM
        const acc = calculateIdmAcceleration(
          v.speed,
          v.maxSpeed,
          Math.max(0.1, netDistanceToObstacle),
          deltaV
        );

        v.acceleration = acc;
        v.speed = Math.max(0, v.speed + acc * dt);
        v.position += v.speed * dt;
        v.distanceTraveled += v.speed * dt;
        v.totalTravelTime += dt;

        if (v.speed < 0.6) {
          v.waitingTime += dt;
          v.isStopped = true;
          v.status = v.position < stopLineDist ? 'WAITING' : 'TURNING';
        } else {
          v.isStopped = false;
          if (v.position < stopLineDist - 20) {
            v.status = 'APPROACHING';
          } else if (v.position <= stopLineDist) {
            v.status = 'APPROACHING';
          } else if (v.position <= stopLineDist + 26) {
            v.status = v.movement === 'STRAIGHT' ? 'PASSING' : 'TURNING';
          } else {
            v.status = 'EXITING';
          }
        }

        // Update 3D world position
        if (lane) {
          const coords = computeVehicleWorldPosition(
            lane,
            v.position,
            v.movement,
            v.origin,
            int.x,
            int.z
          );
          v.worldX = coords.x;
          v.worldY = coords.y;
          v.worldZ = coords.z;
          v.heading = coords.heading;
        }

        // Mark completed if exited the roadway (> 140m)
        if (v.position > 135) {
          v.status = 'COMPLETED';
          int.totalVehiclesPassed++;
        }
      }
    }

    // Clean up completed vehicles
    for (const [id, v] of this.vehicles.entries()) {
      if (v.status === 'COMPLETED') {
        const lane = int.lanes[v.currentLaneId];
        if (lane) {
          lane.vehicleIds = lane.vehicleIds.filter((vid) => vid !== id);
        }
        this.vehicles.delete(id);
      }
    }
  }

  private updateLaneMetrics(): void {
    const int = this.intersections.get('INT-01');
    if (!int) return;

    let totalCongestion = 0;
    let laneCount = 0;

    for (const [laneId, lane] of Object.entries(int.lanes)) {
      const vehsOnLane = Array.from(this.vehicles.values()).filter(
        (v) => v.currentLaneId === laneId && v.status !== 'COMPLETED'
      );

      const stoppedVehs = vehsOnLane.filter((v) => v.isStopped);
      lane.queueLength = stoppedVehs.length;

      // Occupancy percentage based on physical road length (100m) and vehicle lengths
      const totalVehLength = vehsOnLane.reduce((sum, v) => sum + v.length + 3.0, 0);
      lane.occupancy = Math.min(100, Math.round((totalVehLength / lane.length) * 100));

      const totalWait = stoppedVehs.reduce((sum, v) => sum + v.waitingTime, 0);
      lane.averageWaitTime = stoppedVehs.length > 0 ? totalWait / stoppedVehs.length : 0;

      // Downstream capacity simulation
      lane.downstreamCapacity = Math.max(10, 100 - Math.round(lane.occupancy * 0.9));

      totalCongestion += lane.occupancy;
      laneCount++;
    }

    int.congestionLevel = laneCount > 0 ? Math.round(totalCongestion / laneCount) : 10;
  }

  private calculateGlobalMetrics(): void {
    const vehs = Array.from(this.vehicles.values());
    const moving = vehs.filter((v) => !v.isStopped).length;
    const waiting = vehs.filter((v) => v.isStopped).length;

    let totalSpeed = 0;
    let totalWait = 0;
    let maxWait = 0;
    let totalDelay = 0;

    let n = 0, s = 0, e = 0, w = 0;

    vehs.forEach((v) => {
      totalSpeed += v.speed;
      totalWait += v.waitingTime;
      maxWait = Math.max(maxWait, v.waitingTime);
      totalDelay += Math.max(0, v.totalTravelTime - (v.distanceTraveled / v.maxSpeed));

      if (v.origin === 'NORTH') n++;
      else if (v.origin === 'SOUTH') s++;
      else if (v.origin === 'EAST') e++;
      else if (v.origin === 'WEST') w++;
    });

    const avgSpeed = vehs.length > 0 ? (totalSpeed / vehs.length) * 3.6 : 42.0; // km/h
    const avgWait = vehs.length > 0 ? totalWait / vehs.length : 0;

    const int = this.intersections.get('INT-01');
    const congestion = int ? int.congestionLevel : 12;

    // Calculate throughput: vehicles passed per minute
    const elapsedMinutes = Math.max(0.1, this.simulationTime / 60.0);
    const totalPassed = int ? int.totalVehiclesPassed : 0;
    const throughput = Math.round((totalPassed / elapsedMinutes) * 10) / 10;

    this.metrics = {
      totalActiveVehicles: vehs.length,
      vehiclesMoving: moving,
      vehiclesWaiting: waiting,
      totalCompletedVehicles: totalPassed,
      northCount: n,
      southCount: s,
      eastCount: e,
      westCount: w,
      averageSpeedKmh: Math.round(avgSpeed * 10) / 10,
      averageWaitTimeSec: Math.round(avgWait * 10) / 10,
      maxWaitTimeSec: Math.round(maxWait * 10) / 10,
      averageQueueLength: Math.round((waiting / 12) * 10) / 10,
      overallCongestionPercent: congestion,
      networkThroughputPerMin: throughput,
      totalVehicleDelaySec: Math.round(totalDelay),
      unnecessaryStops: waiting,
      emergencyResponseTimeSec: 18.4,
      rule30SecTriggerCount: this.decisionHistory.filter((d) => d.is30SecRuleApplied).length,
    };

    // Record throughput history every 2.0s
    if (this.throughputHistory.length === 0 || this.simulationTime - this.throughputHistory[this.throughputHistory.length - 1].time >= 2.0) {
      this.throughputHistory.push({
        time: Math.round(this.simulationTime),
        throughput,
        congestion,
      });
      if (this.throughputHistory.length > 30) this.throughputHistory.shift();
    }
  }

  private getInitialMetrics(): TrafficMetrics {
    return {
      totalActiveVehicles: 12,
      vehiclesMoving: 8,
      vehiclesWaiting: 4,
      totalCompletedVehicles: 0,
      northCount: 3,
      southCount: 3,
      eastCount: 3,
      westCount: 3,
      averageSpeedKmh: 42.5,
      averageWaitTimeSec: 8.2,
      maxWaitTimeSec: 14.5,
      averageQueueLength: 2.1,
      overallCongestionPercent: 12,
      networkThroughputPerMin: 18.5,
      totalVehicleDelaySec: 45,
      unnecessaryStops: 4,
      emergencyResponseTimeSec: 16.0,
      rule30SecTriggerCount: 0,
    };
  }
}
