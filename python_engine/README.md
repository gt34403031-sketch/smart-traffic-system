# Intelligent Smart City Traffic Management & Signal Optimization System
## Python Optimization Engine & Database Architecture (MCA Project)

### Architecture Overview
This Python engine provides local background intelligence for the Smart City Traffic Management System:
- **Greedy Max-Pressure Algorithm** (`algorithms/greedy_max_pressure.py`): Prioritizes phases by incoming queue pressure, downstream capacity checking, and starvation prevention.
- **Finite-Horizon Dynamic Programming with Memoization** (`algorithms/dynamic_programming.py`): Calculates optimal green duration $G^*$ balancing queue clearance against cross-street delay accumulation.
- **Mandatory 30-Second Minimum Green Rule**: Automatically mandated for heavily congested traffic ($\ge 12$ vehicles or $\ge 60\%$ occupancy).
- **Hybrid Controller** (`algorithms/hybrid_controller.py`): Orchestrates Greedy phase selection, DP green time optimization, and emergency vehicle preemption.
- **SQLite Database** (`database/schema.sql`): 14 structured relational tables for intersections, lanes, vehicles, states, decisions, bottlenecks, and performance logs.

### Running the Python Engine
```bash
cd python_engine
pip install -r requirements.txt
python main.py
```
FastAPI server starts at `http://localhost:8000` with interactive Swagger docs at `http://localhost:8000/docs`.

### Running Pytest Algorithm Test Suite
```bash
pytest tests/test_algorithms.py -v
```
All tests verify Greedy pressure, starvation bonuses, 30s heavy-traffic minimum rule, and emergency preemption corridors.
