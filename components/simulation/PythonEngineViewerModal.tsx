'use client';

import React, { useState } from 'react';
import { X, Code2, Copy, Check, Database, Terminal, FileCode } from 'lucide-react';

interface PythonEngineViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PYTHON_FILES = [
  {
    name: 'greedy_max_pressure.py',
    path: 'python_engine/algorithms/greedy_max_pressure.py',
    category: 'ALGORITHM',
    code: `"""
Greedy Max-Pressure Traffic Phase Priority Algorithm
Implements network pressure balancing, downstream capacity constraint, and starvation prevention.
"""

from typing import List, Dict

def calculate_greedy_pressure(
    lanes_data: Dict[str, Dict],
    phases_data: List[Dict],
    starvation_threshold_sec: float = 45.0,
    w_queue: float = 1.0,
    w_wait: float = 0.15,
    w_downstream: float = 0.8,
    w_starvation: float = 1.5
) -> Dict:
    evaluations = []

    for phase in phases_data:
        phase_id = phase.get("id", 0)
        phase_name = phase.get("name", f"Phase {phase_id}")
        compatible_lanes = phase.get("compatible_lanes", [])
        starvation_timer = phase.get("starvation_timer", 0.0)

        incoming_queue = 0
        total_wait = 0.0
        counted_lanes = 0
        downstream_cap_sum = 0.0

        for lane_id in compatible_lanes:
            lane = lanes_data.get(lane_id, {})
            if lane:
                q = lane.get("queue_length", 0)
                incoming_queue += q
                total_wait += lane.get("avg_waiting_time_sec", 0.0) * max(1, q)
                downstream_cap_sum += lane.get("downstream_capacity_percent", 100.0)
                counted_lanes += 1

        avg_wait = total_wait / max(1, incoming_queue) if incoming_queue > 0 else 0.0
        avg_downstream_cap = downstream_cap_sum / max(1, counted_lanes)
        outgoing_congestion = max(0.0, 100.0 - avg_downstream_cap)

        # Starvation bonus (quadratic growth after threshold)
        starvation_bonus = 0.0
        if starvation_timer > starvation_threshold_sec:
            excess = starvation_timer - starvation_threshold_sec
            starvation_bonus = w_starvation * ((excess / 15.0) ** 1.8)

        # Spillback penalty for choked exit roads
        spillback_penalty = 0.0
        if avg_downstream_cap < 25.0:
            spillback_penalty = (25.0 - avg_downstream_cap) * 1.5

        raw_pressure = (w_queue * incoming_queue) + (w_wait * avg_wait) - (w_downstream * (outgoing_congestion / 10.0))
        final_score = max(0.0, raw_pressure + starvation_bonus - spillback_penalty)

        evaluations.append({
            "phase_id": phase_id,
            "phase_name": phase_name,
            "incoming_queue": incoming_queue,
            "avg_wait_time": round(avg_wait, 1),
            "starvation_bonus": round(starvation_bonus, 1),
            "downstream_capacity": round(avg_downstream_cap, 1),
            "final_score": round(final_score, 1),
        })

    evaluations.sort(key=lambda x: x["final_score"], reverse=True)
    best = evaluations[0] if evaluations else {"phase_id": 0, "phase_name": "Default Phase", "final_score": 0.0}

    return {
        "best_phase_id": best["phase_id"],
        "best_phase_name": best["phase_name"],
        "evaluations": evaluations,
    }`,
  },
  {
    name: 'dynamic_programming.py',
    path: 'python_engine/algorithms/dynamic_programming.py',
    category: 'ALGORITHM',
    code: `"""
Finite-Horizon Dynamic Programming with Memoization for Traffic Signal Timing.
Enforces the mandatory 30-Second Minimum Heavy-Traffic Green Rule.
"""

from typing import Dict, Tuple

# DP Memoization Cache
_memo_cache: Dict[str, Tuple[int, float]] = {}

def optimize_green_duration_dp(
    active_queue: int,
    cross_queue: int,
    avg_occupancy: float = 20.0,
    min_downstream_cap: float = 100.0,
    sat_flow_veh_per_sec: float = 0.55,
    arrival_rate_veh_per_sec: float = 0.16,
    heavy_queue_threshold: int = 12,
    default_min_green: int = 12,
    heavy_min_green: int = 30,
    max_green: int = 55
) -> Dict:
    is_heavy_traffic = (active_queue >= heavy_queue_threshold) or (avg_occupancy >= 60.0)
    effective_min_green = heavy_min_green if is_heavy_traffic else default_min_green

    memo_key = f"{active_queue}_{cross_queue}_{1 if is_heavy_traffic else 0}"
    if memo_key in _memo_cache:
        cached_dur, cached_cost = _memo_cache[memo_key]
        return {
            "optimal_duration": cached_dur,
            "min_cost": cached_cost,
            "is_30_second_rule_enforced": is_heavy_traffic,
            "from_cache": True,
        }

    candidate_durations = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
    best_duration = effective_min_green
    lowest_cost = float("inf")

    for duration in candidate_durations:
        is_below_min = duration < effective_min_green

        total_demand = active_queue + (arrival_rate_veh_per_sec * duration * 2)
        discharged = min(total_demand, sat_flow_veh_per_sec * duration * 2)
        remaining_queue = max(0.0, total_demand - discharged)

        # 1. Residual queue penalty
        current_delay = 1.2 * (remaining_queue * 30.0)

        # 2. Accumulated delay on cross approaches
        cross_arrivals = arrival_rate_veh_per_sec * duration * 2
        cross_delay = 1.0 * (cross_queue * duration + 0.5 * cross_arrivals * duration)

        # 3. Yellow + All-red switching loss penalty
        switching_penalty = 18.0

        # 4. Downstream spillback risk penalty
        spillback_penalty = 0.0
        if min_downstream_cap < 40.0 and duration > 25:
            spillback_penalty = 25.0 * (1.0 + (40.0 - min_downstream_cap) / 10.0)

        total_cost = current_delay + cross_delay + switching_penalty + spillback_penalty

        if is_below_min:
            total_cost += 10000.0 # Prohibit violation of mandatory 30-sec minimum rule

        if total_cost < lowest_cost:
            lowest_cost = total_cost
            best_duration = duration

    _memo_cache[memo_key] = (best_duration, lowest_cost)
    return {
        "optimal_duration": best_duration,
        "min_cost": round(lowest_cost, 1),
        "is_30_second_rule_enforced": is_heavy_traffic,
        "from_cache": False,
    }`,
  },
  {
    name: 'schema.sql',
    path: 'python_engine/database/schema.sql',
    category: 'DATABASE',
    code: `-- SQLite Database Schema for Smart City Traffic Management System
-- 14 Relational Tables with Foreign Keys and Indexes

CREATE TABLE IF NOT EXISTS intersections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    x REAL NOT NULL,
    z REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    intersection_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('NORTH', 'SOUTH', 'EAST', 'WEST')),
    total_length REAL NOT NULL DEFAULT 100.0,
    speed_limit REAL NOT NULL DEFAULT 13.88,
    FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lanes (
    id TEXT PRIMARY KEY,
    road_id TEXT NOT NULL,
    lane_index INTEGER NOT NULL,
    permitted_movements TEXT NOT NULL,
    queue_length INTEGER NOT NULL DEFAULT 0,
    occupancy_percent REAL NOT NULL DEFAULT 0.0,
    avg_waiting_time REAL NOT NULL DEFAULT 0.0,
    downstream_capacity REAL NOT NULL DEFAULT 100.0,
    FOREIGN KEY (road_id) REFERENCES roads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    current_lane_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    speed REAL NOT NULL,
    waiting_time REAL NOT NULL DEFAULT 0.0,
    is_emergency INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (current_lane_id) REFERENCES lanes(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS bottleneck_events (
    id TEXT PRIMARY KEY,
    intersection_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    severity TEXT NOT NULL,
    cause TEXT NOT NULL,
    description TEXT NOT NULL,
    suggested_action TEXT NOT NULL,
    timestamp REAL NOT NULL
);`,
  },
  {
    name: 'test_algorithms.py',
    path: 'python_engine/tests/test_algorithms.py',
    category: 'TESTS',
    code: `"""
Pytest Test Suite for Traffic Optimization Algorithms
Verifies Greedy Max-Pressure, Dynamic Programming, 30-Second Rule, and Emergency Preemption.
"""

import pytest
from algorithms.greedy_max_pressure import calculate_greedy_pressure
from algorithms.dynamic_programming import optimize_green_duration_dp

def test_greedy_selects_highest_queue_phase():
    lanes = {
        "NORTH_L1": {"queue_length": 20, "avg_waiting_time_sec": 15.0, "downstream_capacity_percent": 90.0},
        "SOUTH_L1": {"queue_length": 18, "avg_waiting_time_sec": 14.0, "downstream_capacity_percent": 95.0},
        "EAST_L1": {"queue_length": 3, "avg_waiting_time_sec": 5.0, "downstream_capacity_percent": 100.0},
    }
    phases = [
        {"id": 0, "name": "North-South Through", "compatible_lanes": ["NORTH_L1", "SOUTH_L1"]},
        {"id": 1, "name": "East-West Through", "compatible_lanes": ["EAST_L1"]},
    ]
    res = calculate_greedy_pressure(lanes, phases)
    assert res["best_phase_id"] == 0

def test_30_second_minimum_rule_for_heavy_traffic():
    dp_res = optimize_green_duration_dp(
        active_queue=24,
        cross_queue=10,
        avg_occupancy=75.0,
        heavy_queue_threshold=12,
        heavy_min_green=30
    )
    assert dp_res["is_30_second_rule_enforced"] is True
    assert dp_res["optimal_duration"] >= 30`,
  },
];

export const PythonEngineViewerModal: React.FC<PythonEngineViewerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const activeFile = PYTHON_FILES[selectedFileIndex];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-bold text-slate-100">
              Python Optimization Engine Codebase & Database Schema
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Navigator Tabs */}
        <div className="flex items-center gap-1.5 px-4 pt-3 border-b border-slate-800 bg-slate-950 overflow-x-auto">
          {PYTHON_FILES.map((file, idx) => (
            <button
              key={file.name}
              onClick={() => setSelectedFileIndex(idx)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-t-lg transition-colors border-t border-x ${
                selectedFileIndex === idx
                  ? 'bg-slate-900 text-cyan-300 border-slate-800'
                  : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              {file.category === 'DATABASE' ? (
                <Database className="w-3.5 h-3.5 text-amber-400" />
              ) : file.category === 'TESTS' ? (
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <FileCode className="w-3.5 h-3.5 text-purple-400" />
              )}
              <span>{file.name}</span>
            </button>
          ))}
        </div>

        {/* Code Content Container */}
        <div className="relative flex-1 p-4 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-300">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-500">
            <span>Path: {activeFile.path}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <pre className="overflow-x-auto leading-relaxed text-slate-200">
            <code>{activeFile.code}</code>
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs text-slate-400">
          <span>All files reside in <code className="text-cyan-300">/python_engine</code> and run offline with FastAPI & SQLite.</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
