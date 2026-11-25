"""
Greedy Max-Pressure Traffic Phase Priority Algorithm
Implements network pressure balancing, downstream capacity constraint, and starvation prevention.
"""

from typing import List, Dict

class GreedyPhase:
    def __init__(self, phase_id: int, name: string_or_str, compatible_lanes: List[str]):
        self.phase_id = phase_id
        self.name = name
        self.compatible_lanes = compatible_lanes

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
            "outgoing_queue": round(outgoing_congestion, 1),
            "avg_wait_time": round(avg_wait, 1),
            "starvation_bonus": round(starvation_bonus, 1),
            "downstream_capacity": round(avg_downstream_cap, 1),
            "raw_pressure": round(raw_pressure, 1),
            "final_score": round(final_score, 1),
        })

    evaluations.sort(key=lambda x: x["final_score"], reverse=True)
    best = evaluations[0] if evaluations else {"phase_id": 0, "phase_name": "Default Phase", "final_score": 0.0}

    return {
        "best_phase_id": best["phase_id"],
        "best_phase_name": best["phase_name"],
        "evaluations": evaluations,
    }
