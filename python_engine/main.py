"""
Intelligent Smart City Traffic Management and Signal Optimization System
Python Optimization Engine - FastAPI Server
MCA Final Year Project
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import time

from algorithms.greedy_max_pressure import calculate_greedy_pressure, GreedyPhase
from algorithms.dynamic_programming import optimize_green_duration_dp
from algorithms.hybrid_controller import HybridTrafficController

app = FastAPI(
    title="Smart City Traffic Optimization Engine",
    description="Greedy Max-Pressure and Finite-Horizon Dynamic Programming traffic controller API.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

controller = HybridTrafficController()

class TrafficLaneInput(BaseModel):
    id: str
    direction: str
    queue_length: int
    occupancy_percent: float
    avg_waiting_time_sec: float
    downstream_capacity_percent: float = 100.0

class TrafficIntersectionInput(BaseModel):
    intersection_id: str
    current_phase_id: int
    lanes: List[TrafficLaneInput]
    phases: List[Dict]
    emergency_vehicle_detected: bool = False
    emergency_direction: Optional[str] = None

class OptimizationResponse(BaseModel):
    timestamp: float
    intersection_id: str
    selected_phase_id: int
    selected_phase_name: str
    assigned_green_duration: int
    is_30_second_rule_enforced: bool
    starvation_prevented: bool
    summary_reason: str
    greedy_scores: List[Dict]
    dp_candidates: List[Dict]

@app.get("/")
def read_root():
    return {
        "system": "Intelligent Smart City Traffic Management System",
        "algorithms": ["Greedy Max-Pressure", "Finite-Horizon Dynamic Programming with Memoization"],
        "status": "OPERATIONAL",
        "timestamp": time.time()
    }

@app.post("/api/optimize", response_model=OptimizationResponse)
def optimize_intersection_signals(data: TrafficIntersectionInput):
    """
    Main algorithmic endpoint:
    1. Evaluates Greedy Max-Pressure across all signal phases.
    2. Applies starvation bonus and downstream capacity constraints.
    3. Solves Finite-Horizon DP with memoization for optimal green duration.
    4. Enforces the mandatory 30-Second Minimum Heavy-Traffic Rule.
    """
    decision = controller.evaluate_intersection(data.dict())
    return decision

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "fastapi_traffic_engine"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
