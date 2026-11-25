"""
Hybrid Traffic Controller combining Greedy Max-Pressure and Finite-Horizon DP.
"""

import time
from typing import Dict, Any
from algorithms.greedy_max_pressure import calculate_greedy_pressure
from algorithms.dynamic_programming import optimize_green_duration_dp

class HybridTrafficController:
    def __init__(self):
        self.decision_history = []

    def evaluate_intersection(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        lanes = {lane["id"]: lane for lane in payload.get("lanes", [])}
        phases = payload.get("phases", [])
        intersection_id = payload.get("intersection_id", "INT-01")

        # Emergency vehicle preemption check
        if payload.get("emergency_vehicle_detected", False):
            return {
                "timestamp": time.time(),
                "intersection_id": intersection_id,
                "selected_phase_id": 0,
                "selected_phase_name": "Emergency Arterial Priority",
                "assigned_green_duration": 35,
                "is_30_second_rule_enforced": True,
                "starvation_prevented": False,
                "summary_reason": "EMERGENCY PREEMPTION: Immediate priority corridor granted.",
                "greedy_scores": [],
                "dp_candidates": [],
            }

        # Step 1: Greedy Max-Pressure Evaluation
        greedy_res = calculate_greedy_pressure(lanes, phases)
        best_phase_id = greedy_res["best_phase_id"]
        best_phase_name = greedy_res["best_phase_name"]

        # Step 2: Extract active vs cross queues
        active_phase = next((p for p in phases if p.get("id") == best_phase_id), phases[0] if phases else {})
        active_lanes = active_phase.get("compatible_lanes", [])

        active_queue = sum(lanes.get(lid, {}).get("queue_length", 0) for lid in active_lanes)
        cross_queue = sum(
            l.get("queue_length", 0)
            for lid, l in lanes.items()
            if lid not in active_lanes
        )

        avg_occ = (
            sum(lanes.get(lid, {}).get("occupancy_percent", 0.0) for lid in active_lanes) / max(1, len(active_lanes))
        )
        min_downstream = min(
            (lanes.get(lid, {}).get("downstream_capacity_percent", 100.0) for lid in active_lanes),
            default=100.0
        )

        # Step 3: Solve Finite-Horizon DP
        dp_res = optimize_green_duration_dp(
            active_queue=active_queue,
            cross_queue=cross_queue,
            avg_occupancy=avg_occ,
            min_downstream_cap=min_downstream
        )

        reason = (
            f"Phase '{best_phase_name}' selected by Greedy Max-Pressure (Queue: {active_queue} veh). "
            f"DP allocated {dp_res['optimal_duration']}s green duration."
        )
        if dp_res["is_30_second_rule_enforced"]:
            reason += " [30-Second Heavy-Traffic Rule Triggered]"

        return {
            "timestamp": time.time(),
            "intersection_id": intersection_id,
            "selected_phase_id": best_phase_id,
            "selected_phase_name": best_phase_name,
            "assigned_green_duration": dp_res["optimal_duration"],
            "is_30_second_rule_enforced": dp_res["is_30_second_rule_enforced"],
            "starvation_prevented": any(e.get("starvation_bonus", 0) > 10 for e in greedy_res["evaluations"]),
            "summary_reason": reason,
            "greedy_scores": greedy_res["evaluations"],
            "dp_candidates": dp_res["candidates"],
        }
