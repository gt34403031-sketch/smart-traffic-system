"""
Finite-Horizon Dynamic Programming with Memoization for Traffic Signal Timing.
Enforces the mandatory 30-Second Minimum Heavy-Traffic Green Rule.
"""

from typing import Dict, List, Tuple

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
    """
    Finite-horizon Dynamic Programming green time solver.
    Evaluates discrete duration candidates minimizing cumulative network delay.
    """
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
            "candidates": []
        }

    candidate_durations = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
    evaluated_candidates = []
    best_duration = effective_min_green
    lowest_cost = float("inf")

    for duration in candidate_durations:
        is_below_min = duration < effective_min_green

        # Queue discharge calculation
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
            total_cost += 10000.0 # Prohibit violation of mandatory minimum rule

        if total_cost < lowest_cost:
            lowest_cost = total_cost
            best_duration = duration

        evaluated_candidates.append({
            "duration": duration,
            "queue_reduction": round(discharged),
            "cross_delay": round(cross_delay),
            "switching_penalty": round(switching_penalty),
            "spillback_penalty": round(spillback_penalty),
            "total_cost": round(total_cost),
            "is_valid": not is_below_min,
        })

    _memo_cache[memo_key] = (best_duration, lowest_cost)

    return {
        "optimal_duration": best_duration,
        "min_cost": round(lowest_cost, 1),
        "is_30_second_rule_enforced": is_heavy_traffic,
        "from_cache": False,
        "candidates": evaluated_candidates,
    }
