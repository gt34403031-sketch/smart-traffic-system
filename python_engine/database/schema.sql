-- SQLite Database Schema for Smart City Traffic Management System
-- MCA Final Year Project

PRAGMA foreign_keys = ON;

-- 1. Intersections
CREATE TABLE IF NOT EXISTS intersections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    x REAL NOT NULL,
    z REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Roads
CREATE TABLE IF NOT EXISTS roads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    intersection_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('NORTH', 'SOUTH', 'EAST', 'WEST')),
    total_length REAL NOT NULL DEFAULT 100.0,
    speed_limit REAL NOT NULL DEFAULT 13.88,
    FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE CASCADE
);

-- 3. Lanes
CREATE TABLE IF NOT EXISTS lanes (
    id TEXT PRIMARY KEY,
    road_id TEXT NOT NULL,
    lane_index INTEGER NOT NULL,
    permitted_movements TEXT NOT NULL, -- JSON array e.g. ["STRAIGHT", "RIGHT"]
    queue_length INTEGER NOT NULL DEFAULT 0,
    occupancy_percent REAL NOT NULL DEFAULT 0.0,
    avg_waiting_time REAL NOT NULL DEFAULT 0.0,
    downstream_capacity REAL NOT NULL DEFAULT 100.0,
    FOREIGN KEY (road_id) REFERENCES roads(id) ON DELETE CASCADE
);

-- 4. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('CAR', 'MOTORCYCLE', 'BUS', 'TRUCK', 'AMBULANCE', 'FIRE_ENGINE', 'POLICE')),
    current_lane_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    movement TEXT NOT NULL,
    speed REAL NOT NULL,
    max_speed REAL NOT NULL,
    waiting_time REAL NOT NULL DEFAULT 0.0,
    is_emergency INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    FOREIGN KEY (current_lane_id) REFERENCES lanes(id) ON DELETE CASCADE
);

-- 5. Traffic Signals
CREATE TABLE IF NOT EXISTS traffic_signals (
    id TEXT PRIMARY KEY,
    intersection_id TEXT NOT NULL,
    heading_direction TEXT NOT NULL,
    current_color TEXT NOT NULL CHECK(current_color IN ('RED', 'YELLOW', 'GREEN')),
    time_remaining REAL NOT NULL,
    FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE CASCADE
);

-- 6. Signal Phases
CREATE TABLE IF NOT EXISTS signal_phases (
    id INTEGER PRIMARY KEY,
    intersection_id TEXT NOT NULL,
    name TEXT NOT NULL,
    min_green INTEGER NOT NULL DEFAULT 10,
    max_green INTEGER NOT NULL DEFAULT 60,
    yellow_duration REAL NOT NULL DEFAULT 3.5,
    all_red_duration REAL NOT NULL DEFAULT 1.5,
    FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE CASCADE
);

-- 7. Traffic States (Periodic Snapshots)
CREATE TABLE IF NOT EXISTS traffic_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intersection_id TEXT NOT NULL,
    timestamp REAL NOT NULL,
    active_vehicles_count INTEGER NOT NULL,
    average_speed REAL NOT NULL,
    congestion_percent REAL NOT NULL,
    total_waiting_time REAL NOT NULL,
    FOREIGN KEY (intersection_id) REFERENCES intersections(id)
);

-- 8. Algorithm Decisions
CREATE TABLE IF NOT EXISTS algorithm_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intersection_id TEXT NOT NULL,
    timestamp REAL NOT NULL,
    algorithm_name TEXT NOT NULL,
    selected_phase_id INTEGER NOT NULL,
    assigned_green_duration INTEGER NOT NULL,
    is_30s_rule_applied INTEGER NOT NULL DEFAULT 0,
    starvation_prevented INTEGER NOT NULL DEFAULT 0,
    reasoning_summary TEXT NOT NULL,
    FOREIGN KEY (intersection_id) REFERENCES intersections(id)
);

-- 9. Simulation Sessions
CREATE TABLE IF NOT EXISTS simulation_sessions (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    algorithm_used TEXT NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    duration_seconds REAL,
    initial_congestion REAL,
    final_congestion REAL
);

-- 10. Simulation Scenarios
CREATE TABLE IF NOT EXISTS simulation_scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    arrival_rate_north INTEGER,
    arrival_rate_south INTEGER,
    arrival_rate_east INTEGER,
    arrival_rate_west INTEGER,
    has_emergency INTEGER DEFAULT 0,
    has_blockage INTEGER DEFAULT 0
);

-- 11. Emergency Events
CREATE TABLE IF NOT EXISTS emergency_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    intersection_id TEXT NOT NULL,
    approach_direction TEXT NOT NULL,
    entry_timestamp REAL NOT NULL,
    clearance_timestamp REAL,
    response_duration_sec REAL,
    corridor_cleared INTEGER DEFAULT 1
);

-- 12. Performance Metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    average_congestion REAL NOT NULL,
    peak_congestion REAL NOT NULL,
    avg_waiting_time REAL NOT NULL,
    max_waiting_time REAL NOT NULL,
    avg_queue_length REAL NOT NULL,
    total_vehicle_delay REAL NOT NULL,
    total_throughput REAL NOT NULL,
    FOREIGN KEY (session_id) REFERENCES simulation_sessions(id)
);

-- 13. Decision History
CREATE TABLE IF NOT EXISTS decision_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id INTEGER NOT NULL,
    phase_id INTEGER NOT NULL,
    pressure_score REAL NOT NULL,
    queue_count INTEGER NOT NULL,
    FOREIGN KEY (decision_id) REFERENCES algorithm_decisions(id)
);

-- 14. Bottleneck Events
CREATE TABLE IF NOT EXISTS bottleneck_events (
    id TEXT PRIMARY KEY,
    intersection_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('MODERATE', 'HIGH', 'CRITICAL')),
    cause TEXT NOT NULL,
    description TEXT NOT NULL,
    suggested_action TEXT NOT NULL,
    resolved INTEGER DEFAULT 0,
    timestamp REAL NOT NULL
);

-- Indexes for high-performance querying
CREATE INDEX IF NOT EXISTS idx_lanes_road ON lanes(road_id);
CREATE INDEX IF NOT EXISTS idx_decisions_int ON algorithm_decisions(intersection_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_states_int ON traffic_states(intersection_id, timestamp);
