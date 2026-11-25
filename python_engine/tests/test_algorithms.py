"""
Pytest Test Suite for Traffic Optimization Algorithms
Verifies Greedy Max-Pressure, Dynamic Programming, 30-Second Rule, and Emergency Preemption.
"""

import pytest
from algorithms.greedy_max_pressure import calculate_greedy_pressure
from algorithms.dynamic_programming import optimize_green_duration_dp
from algorithms.hybrid_controller import HybridTrafficController

def test_greedy_selects_highest_queue_phase():
    lanes = {
        "NORTH_L1": {"queue_length": 20, "avg_waiting_time_sec": 15.0, "downstream_capacity_percent": 90.0},
        "SOUTH_L1": {"queue_length": 18, "avg_waiting_time_sec": 14.0, "downstream_capacity_percent": 95.0},
        "EAST_L1": {"queue_length": 3, "avg_waiting_time_sec": 5.0, "downstream_capacity_percent": 100.0},
        "WEST_L1": {"queue_length": 2, "avg_waiting_time_sec": 4.0, "downstream_capacity_percent": 100.0},
    }
    phases = [
        {"id": 0, "name": "North-South Through", "compatible_lanes": ["NORTH_L1", "SOUTH_L1"], "starvation_timer": 10.0},
        {"id": 1, "name": "East-West Through", "compatible_lanes": ["EAST_L1", "WEST_L1"], "starvation_timer": 10.0},
    ]

    res = calculate_greedy_pressure(lanes, phases)
    assert res["best_phase_id"] == 0, "Greedy must select heavily queued North-South phase"

def test_starvation_prevention_overrides_minority_queue():
    lanes = {
        "NORTH_L1": {"queue_length": 15, "avg_waiting_time_sec": 10.0, "downstream_capacity_percent": 90.0},
        "EAST_L1": {"queue_length": 2, "avg_waiting_time_sec": 70.0, "downstream_capacity_percent": 95.0},
    }
    phases = [
        {"id": 0, "name": "North-South Through", "compatible_lanes": ["NORTH_L1"], "starvation_timer": 5.0},
        {"id": 1, "name": "East-West Minor", "compatible_lanes": ["EAST_L1"], "starvation_timer": 80.0}, # Starved for 80s
    ]

    res = calculate_greedy_pressure(lanes, phases, starvation_threshold_sec=45.0)
    assert res["best_phase_id"] == 1, "East-West must be prioritized due to starvation prevention bonus"

def test_30_second_minimum_rule_for_heavy_traffic():
    # Test that DP enforces >= 30 seconds when queue is heavily congested (e.g. 24 vehicles)
    dp_res = optimize_green_duration_dp(
        active_queue=24,
        cross_queue=10,
        avg_occupancy=75.0,
        heavy_queue_threshold=12,
        heavy_min_green=30
    )
    assert dp_res["is_30_second_rule_enforced"] is True, "30-second rule must be triggered"
    assert dp_res["optimal_duration"] >= 30, f"Green duration must be >= 30s, got {dp_res['optimal_duration']}s"

def test_dp_low_traffic_does_not_waste_green():
    # Test that DP allows short green (e.g. 10-15s) when traffic is minimal
    dp_res = optimize_green_duration_dp(
        active_queue=2,
        cross_queue=15,
        avg_occupancy=15.0,
        heavy_queue_threshold=12,
        default_min_green=12
    )
    assert dp_res["is_30_second_rule_enforced"] is False
    assert dp_res["optimal_duration"] <= 20, "Should assign brief green to clear small queue without starving cross traffic"

def test_hybrid_emergency_preemption():
    controller = HybridTrafficController()
    payload = {
        "intersection_id": "INT-01",
        "emergency_vehicle_detected": True,
        "emergency_direction": "NORTH",
        "lanes": [],
        "phases": []
    }
    res = controller.evaluate_intersection(payload)
    assert res["assigned_green_duration"] >= 30
    assert "EMERGENCY" in res["summary_reason"]
