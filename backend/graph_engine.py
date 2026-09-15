"""
Cascading Failures — City Resilience Simulator Engine
=====================================================
Pure Python graph engine implementing:
1. Multi-domain data models (Roads, Electricity, Healthcare).
2. Procedural fixed-seed city generator ('Metropolis-7') with hand-tuned cascade points.
3. Motter-Lai style threshold load redistribution cascade engine.
4. Cross-domain dependency propagation.
5. Exact Brandes Betweenness Centrality for critical asset ranking.
6. Urban resilience impact metrics (population affected, travel delay, ambulance disruption, etc.).
"""

import math
import random
from collections import deque
from typing import Dict, List, Any, Optional, Set, Tuple


class Node:
    def __init__(
        self,
        id: str,
        domain: str,       # "road" | "power" | "health"
        type: str,         # "intersection" | "bridge" | "substation" | "power_hub" | "hospital" | "clinic"
        name: str,
        district: str,
        x: float,
        y: float,
        capacity: float,
        load: float,
        population_served: int,
        status: str = "ok",
        notes: str = ""
    ):
        self.id = id
        self.domain = domain
        self.type = type
        self.name = name
        self.district = district
        self.x = x
        self.y = y
        self.capacity = capacity
        self.base_capacity = capacity
        self.effective_capacity = capacity
        self.load = load
        self.base_load = load
        self.population_served = population_served
        self.status = status  # "ok" | "degraded" | "failed"
        self.notes = notes

    def to_dict(self) -> Dict[str, Any]:
        # BUGFIX: previously divided by max(1.0, effective_capacity), which meant a
        # failed node (effective_capacity == 0) reported its raw load number as the
        # "ratio" (e.g. 2465.95), which is meaningless and looks broken in the UI.
        # Now: fall back to the original design capacity so the number stays a real
        # ratio ("how many times over design capacity"), and cap it for clean display.
        ratio_denom = self.effective_capacity if self.effective_capacity > 0 else max(1.0, self.base_capacity)
        load_ratio = round(min(self.load / ratio_denom, 9.99), 2)

        return {
            "id": self.id,
            "domain": self.domain,
            "type": self.type,
            "name": self.name,
            "district": self.district,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "capacity": round(self.capacity, 1),
            "base_capacity": round(self.base_capacity, 1),
            "effective_capacity": round(self.effective_capacity, 1),
            "load": round(self.load, 1),
            "base_load": round(self.base_load, 1),
            "population_served": self.population_served,
            "status": self.status,
            "load_ratio": load_ratio,
            "notes": self.notes
        }

    def clone(self) -> "Node":
        node = Node(
            id=self.id,
            domain=self.domain,
            type=self.type,
            name=self.name,
            district=self.district,
            x=self.x,
            y=self.y,
            capacity=self.capacity,
            load=self.load,
            population_served=self.population_served,
            status=self.status,
            notes=self.notes
        )
        node.base_capacity = self.base_capacity
        node.effective_capacity = self.effective_capacity
        node.base_load = self.base_load
        return node


class Edge:
    def __init__(
        self,
        id: str,
        source: str,
        target: str,
        domain: str,       # "road" | "power" | "health"
        type: str,         # "road_segment" | "bridge" | "power_line" | "ambulance_route"
        capacity: float,
        load: float,
        weight: float = 1.0,
        status: str = "ok",
        name: str = ""
    ):
        self.id = id
        self.source = source
        self.target = target
        self.domain = domain
        self.type = type
        self.capacity = capacity
        self.base_capacity = capacity
        self.load = load
        self.base_load = load
        self.weight = weight
        self.status = status  # "ok" | "overloaded" | "failed"
        self.name = name or f"{source}->{target}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "domain": self.domain,
            "type": self.type,
            "capacity": round(self.capacity, 1),
            "load": round(self.load, 1),
            "weight": round(self.weight, 1),
            "status": self.status,
            "load_ratio": round(self.load / max(1.0, self.capacity), 2),
            "name": self.name
        }

    def clone(self) -> "Edge":
        edge = Edge(
            id=self.id,
            source=self.source,
            target=self.target,
            domain=self.domain,
            type=self.type,
            capacity=self.capacity,
            load=self.load,
            weight=self.weight,
            status=self.status,
            name=self.name
        )
        edge.base_capacity = self.base_capacity
        edge.base_load = self.base_load
        return edge


class DependencyEdge:
    def __init__(
        self,
        from_node: str,
        to_node: str,
        relation: str,     # "depends_on" | "access_via" | "powered_by"
        degrade_factor: float,  # e.g. 0.40 = to_node retains only 40% capacity if from_node fails
        description: str = ""
    ):
        self.from_node = from_node
        self.to_node = to_node
        self.relation = relation
        self.degrade_factor = degrade_factor
        self.description = description

    def to_dict(self) -> Dict[str, Any]:
        return {
            "from_node": self.from_node,
            "to_node": self.to_node,
            "relation": self.relation,
            "degrade_factor": self.degrade_factor,
            "description": self.description
        }


class CityGraph:
    def __init__(self, name: str = "Metropolis-7"):
        self.name = name
        self.nodes: Dict[str, Node] = {}
        self.edges: Dict[str, Edge] = {}
        self.dependency_edges: List[DependencyEdge] = []
        self.node_dependencies_from: Dict[str, List[DependencyEdge]] = {}  # from_node -> deps
        self.node_dependencies_to: Dict[str, List[DependencyEdge]] = {}    # to_node -> deps
        self.adjacency: Dict[str, List[str]] = {}
        self.centrality_scores: Dict[str, float] = {}

    def add_node(self, node: Node):
        self.nodes[node.id] = node
        if node.id not in self.adjacency:
            self.adjacency[node.id] = []
        if node.id not in self.node_dependencies_from:
            self.node_dependencies_from[node.id] = []
        if node.id not in self.node_dependencies_to:
            self.node_dependencies_to[node.id] = []

    def add_edge(self, edge: Edge):
        self.edges[edge.id] = edge
        if edge.source not in self.adjacency:
            self.adjacency[edge.source] = []
        if edge.target not in self.adjacency:
            self.adjacency[edge.target] = []
        self.adjacency[edge.source].append(edge.target)
        self.adjacency[edge.target].append(edge.source)

    def add_dependency(self, dep: DependencyEdge):
        self.dependency_edges.append(dep)
        if dep.from_node not in self.node_dependencies_from:
            self.node_dependencies_from[dep.from_node] = []
        self.node_dependencies_from[dep.from_node].append(dep)
        if dep.to_node not in self.node_dependencies_to:
            self.node_dependencies_to[dep.to_node] = []
        self.node_dependencies_to[dep.to_node].append(dep)

    def compute_betweenness_centrality(self) -> Dict[str, float]:
        """
        Exact Brandes algorithm for betweenness centrality across the graph.
        Precomputed once for critical asset ranking ('Where to invest').
        """
        nodes = list(self.nodes.keys())
        cb = {n: 0.0 for n in nodes}

        for s in nodes:
            S = []
            P = {w: [] for w in nodes}
            sigma = {w: 0 for w in nodes}
            sigma[s] = 1
            d = {w: -1 for w in nodes}
            d[s] = 0
            Q = deque([s])

            while Q:
                v = Q.popleft()
                S.append(v)
                for w in self.adjacency.get(v, []):
                    if d[w] < 0:
                        Q.append(w)
                        d[w] = d[v] + 1
                    if d[w] == d[v] + 1:
                        sigma[w] += sigma[v]
                        P[w].append(v)

            delta = {w: 0.0 for w in nodes}
            while S:
                w = S.pop()
                for v in P[w]:
                    delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w])
                if w != s:
                    cb[w] += delta[w]

        # Normalize scores to 0.0 - 1.0
        max_c = max(cb.values()) if cb and max(cb.values()) > 0 else 1.0
        normalized = {k: round(v / max_c, 4) for k, v in cb.items()}
        self.centrality_scores = normalized
        return normalized

    def get_critical_assets(self, top_n: int = 8) -> List[Dict[str, Any]]:
        """Returns top N infrastructure assets ranked by betweenness centrality."""
        if not self.centrality_scores:
            self.compute_betweenness_centrality()

        ranked = sorted(
            self.centrality_scores.items(),
            key=lambda item: item[1],
            reverse=True
        )

        results = []
        for rank, (node_id, score) in enumerate(ranked[:top_n], start=1):
            node = self.nodes.get(node_id)
            if not node:
                continue
            
            # Recommendation logic based on domain and role
            rec = ""
            if node.domain == "power":
                rec = "Install automated redundant N+1 feeder line and emergency islanding microgrid."
            elif node.domain == "health":
                rec = "Deploy dual independent backup generators and dedicated priority access bypass."
            elif node.type == "bridge":
                rec = "Harden structural seismic bearings and implement dynamic lane reversal flow."
            else:
                rec = "Implement smart adaptive traffic signal backup and localized bypass routing."

            results.append({
                "rank": rank,
                "node_id": node_id,
                "name": node.name,
                "domain": node.domain,
                "type": node.type,
                "district": node.district,
                "centrality_score": score,
                "population_served": node.population_served,
                "capacity": node.capacity,
                "recommendation": rec
            })
        return results

    def compute_bfs_distances(self, start_node: str) -> Dict[str, int]:
        """Calculates topological hop distance from start_node for blast radius animation."""
        return self.compute_bfs_distances_multi([start_node])

    def compute_bfs_distances_multi(self, start_nodes: List[str]) -> Dict[str, int]:
        """
        Multi-source hop distance for blast radius animation of a compound failure —
        each node's distance is its hop count to the *nearest* of the given epicenters,
        not the sum/average of several single-source BFS passes.
        """
        distances = {n: -1 for n in self.nodes}
        queue = deque()
        for start_node in start_nodes:
            if start_node in self.nodes and distances[start_node] < 0:
                distances[start_node] = 0
                queue.append(start_node)

        while queue:
            curr = queue.popleft()
            curr_dist = distances[curr]
            for neighbor in self.adjacency.get(curr, []):
                if distances[neighbor] < 0:
                    distances[neighbor] = curr_dist + 1
                    queue.append(neighbor)
        return distances

    def clone(self) -> "CityGraph":
        """Deep clone of city graph for non-destructive simulation."""
        cg = CityGraph(name=self.name)
        for n in self.nodes.values():
            cg.add_node(n.clone())
        for e in self.edges.values():
            cg.add_edge(e.clone())
        for d in self.dependency_edges:
            cg.add_dependency(DependencyEdge(
                from_node=d.from_node,
                to_node=d.to_node,
                relation=d.relation,
                degrade_factor=d.degrade_factor,
                description=d.description
            ))
        cg.centrality_scores = dict(self.centrality_scores)
        return cg


def generate_metropolis_7(seed: int = 42) -> CityGraph:
    """
    Procedurally generates Metropolis-7:
    - 4 Power Substations & 6 Power Hubs
    - 3 Major Hospitals & 4 Clinics
    - ~60 Road Intersections & Bridges across a central river
    - 18 Dedicated Ambulance Corridors
    - Realistic cross-domain dependencies tuned for dramatic, plausible cascades.
    """
    random.seed(seed)
    cg = CityGraph("Metropolis-7")

    # -------------------------------------------------------------
    # 1. POWER DOMAIN (Substations and Transmission Hubs)
    # -------------------------------------------------------------
    power_nodes_data = [
        # Placement notes: sub_north sits on a dedicated suburb plot north of the grid (clear of
        # the ring lane at y=120); sub_downtown and p_hub_c1 share the block east of the North
        # Bridge abutment and are offset to opposite corners so neither overlaps the other or
        # the surrounding roads. Every other power asset sits at the centre of its own city
        # block (the 3D grid is 108.6 x 110 per block from (120, 160)); a 22-unit model
        # footprint placed within ~20 of a grid line renders on top of the road.
        ("sub_north", "North Power Station", "North Industrial", 500, 60, 850.0, 680.0, 75000, "Primary power generation feeder for north industrial corridor and water pumping."),
        ("sub_downtown", "Downtown Power Station", "Downtown Core", 522, 458, 1100.0, 950.0, 160000, "Critical substation feeding downtown financial core, commercial signals, and Central Hospital."),
        ("sub_west", "West Power Station", "West Riverfront", 174, 435, 700.0, 520.0, 65000, "Powers west riverfront docks, transit hub, and West Hospital."),
        ("sub_east", "East Power Station", "East Residential", 810, 430, 750.0, 610.0, 85000, "Powers dense east residential zone, academic medical campus, and East Hospital."),
        # Transmission Line Hubs
        ("p_hub_n1", "Northwest Power Hub", "North Industrial", 283, 215, 400.0, 310.0, 25000, "Distribution relay"),
        ("p_hub_n2", "Northeast Power Hub", "North Industrial", 620, 190, 400.0, 320.0, 28000, "Distribution relay"),
        ("p_hub_c1", "Central Power Hub", "Downtown Core", 478, 412, 500.0, 410.0, 45000, "Downtown switching substation"),
        ("p_hub_c2", "South Power Hub", "Downtown Core", 609, 655, 450.0, 370.0, 40000, "South core distribution"),
        ("p_hub_w1", "West Power Hub", "West Riverfront", 150, 530, 350.0, 270.0, 20000, "West feeder"),
        ("p_hub_e1", "East Power Hub", "East Residential", 826, 655, 350.0, 290.0, 22000, "East feeder")
    ]

    for nid, name, dist, x, y, cap, load, pop, notes in power_nodes_data:
        cg.add_node(Node(nid, "power", "substation" if "sub_" in nid else "power_hub", name, dist, x, y, cap, load, pop, notes=notes))

    # Power Transmission Edges (High voltage interconnects)
    power_edges = [
        ("sub_north", "p_hub_n1", 450.0, 310.0),
        ("sub_north", "p_hub_n2", 450.0, 320.0),
        ("p_hub_n1", "p_hub_c1", 350.0, 250.0),
        ("p_hub_n2", "p_hub_c1", 350.0, 260.0),
        ("p_hub_c1", "sub_downtown", 600.0, 500.0),
        ("sub_downtown", "p_hub_c2", 500.0, 420.0),
        ("sub_north", "sub_west", 300.0, 210.0),
        ("sub_west", "p_hub_w1", 400.0, 290.0),
        ("p_hub_w1", "p_hub_c1", 300.0, 210.0),
        ("sub_downtown", "sub_east", 450.0, 380.0),
        ("sub_east", "p_hub_e1", 400.0, 310.0),
        ("p_hub_e1", "p_hub_c2", 300.0, 230.0),
    ]
    for idx, (u, v, cap, load) in enumerate(power_edges):
        cg.add_edge(Edge(f"edge_power_{idx}", u, v, "power", "power_line", cap, load, weight=1.0, name=f"High-Voltage Line {idx+1}"))

    # -------------------------------------------------------------
    # 2. HEALTHCARE & EMERGENCY DOMAIN
    # -------------------------------------------------------------
    health_nodes_data = [
        ("hosp_central", "Central Hospital", "Medical District", 500, 545, 450.0, 380.0, 180000, "Flagship 900-bed hospital with regional emergency trauma center."),
        ("hosp_east", "East Hospital", "East Residential", 826, 325, 350.0, 290.0, 110000, "Specialized cardiology, stroke, and regional disaster intake facility."),
        ("hosp_west", "West Hospital", "West Riverfront", 283, 435, 280.0, 220.0, 80000, "Riverfront emergency treatment and pediatric center."),
        # Urgent Care & Emergency Clinics
        ("clinic_north", "North Clinic", "North Industrial", 490, 220, 120.0, 95.0, 35000, "Industrial acute care & triage clinic."),
        ("clinic_south", "South Clinic", "Downtown Core", 500, 765, 130.0, 100.0, 40000, "Southern suburban clinic."),
        ("clinic_east", "East Clinic", "East Residential", 840, 520, 110.0, 85.0, 30000, "Rapid triage clinic."),
        ("clinic_west", "West Clinic", "West Riverfront", 180, 310, 110.0, 80.0, 28000, "West triage station.")
    ]

    for nid, name, dist, x, y, cap, load, pop, notes in health_nodes_data:
        cg.add_node(Node(nid, "health", "hospital" if "hosp_" in nid else "clinic", name, dist, x, y, cap, load, pop, notes=notes))

    # -------------------------------------------------------------
    # 3. ROAD & TRANSPORT DOMAIN (Intersections & Bridges)
    # -------------------------------------------------------------
    rows = 7
    cols = 8
    x_start = 120
    x_end = 880
    y_start = 160
    y_end = 820

    dx = (x_end - x_start) / (cols - 1)
    dy = (y_end - y_start) / (rows - 1)

    node_idx = 1
    district_counters = {}
    for r in range(rows):
        for c in range(cols):
            nid = f"road_{r}_{c}"
            if r <= 1:
                district = "North Industrial"
            elif c <= 2:
                district = "West Riverfront"
            elif c >= 6:
                district = "East Residential"
            elif r >= 5:
                district = "South Hub"
            else:
                district = "Downtown Core"

            x = x_start + c * dx + ((r % 2) * 8 - 4)
            y = y_start + r * dy + ((c % 2) * 6 - 3)

            is_bridge = (c == 2 and r in [2, 3, 4])
            ntype = "bridge" if is_bridge else "intersection"
            
            if is_bridge:
                bridge_names = {
                    2: "North Bridge",
                    3: "Central Bridge",
                    4: "South Bridge"
                }
                name = bridge_names[r]
                cap = 3200.0
                load = 2750.0
                pop = 35000
                notes = "Major critical river crossing connector carrying primary commuter and ambulance traffic."
            elif (r, c) == (3, 4):
                name = "Downtown Metro Station"
                cap = 3000.0
                load = 2500.0
                pop = 42000
                notes = "Core downtown junction connecting financial district to Central Hospital."
            else:
                district_counters[district] = district_counters.get(district, 0) + 1
                name = f"{district} Junction {district_counters[district]}"
                cap = 1800.0 + (500.0 if district == "Downtown Core" else 0.0)
                load = 1200.0 + (350.0 if district == "Downtown Core" else 0.0)
                pop = 8000 + (6000 if district == "Downtown Core" else 2000)
                notes = f"Primary surface intersection in {district}."

            node = Node(nid, "road", ntype, name, district, x, y, cap, load, pop, notes=notes)
            cg.add_node(node)
            node_idx += 1

    edge_count = 0
    for r in range(rows):
        for c in range(cols):
            u_id = f"road_{r}_{c}"
            if c + 1 < cols:
                v_id = f"road_{r}_{c+1}"
                is_br = (c == 2 and r in [2, 3, 4])
                cap = 3400.0 if is_br else 2200.0
                load = 2900.0 if is_br else 1450.0
                etype = "bridge" if is_br else "road_segment"
                bridge_span_names = {2: "North Bridge Span", 3: "Central Bridge Span", 4: "South Bridge Span"}
                ename = bridge_span_names.get(r, f"Bridge Span R{r+1}") if is_br else "Street Segment"
                cg.add_edge(Edge(f"edge_road_{edge_count}", u_id, v_id, "road", etype, cap, load, weight=1.2, name=ename))
                edge_count += 1
            if r + 1 < rows:
                v_id = f"road_{r+1}_{c}"
                cap = 2300.0 if (c in [3, 4]) else 1800.0
                load = 1600.0 if (c in [3, 4]) else 1150.0
                ename = "Avenue Segment"
                cg.add_edge(Edge(f"edge_road_{edge_count}", u_id, v_id, "road", "road_segment", cap, load, weight=1.0, name=ename))
                edge_count += 1

    # -------------------------------------------------------------
    # 4. AMBULANCE PRIORITY CORRIDORS
    # -------------------------------------------------------------
    ambulance_connects = [
        ("hosp_central", "road_3_4", 900.0, 350.0, "Central Hospital Ambulance Bay"),
        ("hosp_central", "road_4_4", 900.0, 320.0, "Central Hospital South Access Ramp"),
        ("hosp_central", "road_3_3", 800.0, 410.0, "Central Hospital West Corridor"),
        ("hosp_east", "road_2_6", 800.0, 260.0, "East Hospital Rapid Ingress"),
        ("hosp_east", "road_3_6", 800.0, 280.0, "East Hospital Campus Boulevard"),
        ("hosp_west", "road_3_1", 700.0, 220.0, "West Hospital Riverfront Access"),
        ("hosp_west", "road_4_1", 700.0, 210.0, "West Hospital Port Ambulance Slip"),
        ("clinic_north", "road_1_4", 400.0, 110.0, "North Clinic Access"),
        ("clinic_south", "road_5_4", 400.0, 120.0, "South Clinic Access Ramp"),
        ("clinic_east", "road_4_7", 400.0, 100.0, "East Clinic Access"),
        ("clinic_west", "road_2_1", 400.0, 95.0, "West Clinic Bypass")
    ]
    for idx, (h_id, r_id, cap, load, name) in enumerate(ambulance_connects):
        cg.add_edge(Edge(f"edge_amb_{idx}", h_id, r_id, "health", "ambulance_route", cap, load, weight=0.6, name=name))

    # -------------------------------------------------------------
    # 5. CROSS-DOMAIN DEPENDENCY EDGES
    # -------------------------------------------------------------
    # A. Power -> Healthcare
    cg.add_dependency(DependencyEdge(
        from_node="sub_downtown",
        to_node="hosp_central",
        relation="powered_by",
        degrade_factor=0.45,
        description="Powers ICU ventilators, surgical suites, and emergency diagnostics at Central Hospital."
    ))
    cg.add_dependency(DependencyEdge(
        from_node="sub_east",
        to_node="hosp_east",
        relation="powered_by",
        degrade_factor=0.50,
        description="Supplies primary three-phase grid power to East Hospital."
    ))
    cg.add_dependency(DependencyEdge(
        from_node="sub_west",
        to_node="hosp_west",
        relation="powered_by",
        degrade_factor=0.55,
        description="Feeds West Hospital emergency medical systems."
    ))
    cg.add_dependency(DependencyEdge(
        from_node="sub_north",
        to_node="clinic_north",
        relation="powered_by",
        degrade_factor=0.40,
        description="Powers triage equipment at North Industrial Clinic."
    ))

    # B. Power -> Roads
    downtown_traffic_signals = ["road_2_3", "road_2_4", "road_3_3", "road_3_4", "road_3_5", "road_4_3", "road_4_4"]
    for r_nid in downtown_traffic_signals:
        cg.add_dependency(DependencyEdge(
            from_node="sub_downtown",
            to_node=r_nid,
            relation="powers_signals",
            degrade_factor=0.50,
            description=f"Automated traffic signals and telemetry at {r_nid}."
        ))

    north_signals = ["road_0_3", "road_0_4", "road_1_3", "road_1_4"]
    for r_nid in north_signals:
        cg.add_dependency(DependencyEdge(
            from_node="sub_north",
            to_node=r_nid,
            relation="powers_signals",
            degrade_factor=0.55,
            description=f"Industrial corridor traffic signal grid at {r_nid}."
        ))

    east_signals = ["road_2_6", "road_3_6", "road_4_6"]
    for r_nid in east_signals:
        cg.add_dependency(DependencyEdge(
            from_node="sub_east",
            to_node=r_nid,
            relation="powers_signals",
            degrade_factor=0.60,
            description=f"Suburban arterials signal control at {r_nid}."
        ))

    # C. Roads -> Healthcare
    cg.add_dependency(DependencyEdge(
        from_node="road_3_4",
        to_node="hosp_central",
        relation="access_via",
        degrade_factor=0.60,
        description="Primary ambulance ingress corridor into Central Hospital."
    ))
    cg.add_dependency(DependencyEdge(
        from_node="road_2_2",
        to_node="hosp_central",
        relation="access_via",
        degrade_factor=0.75,
        description="Cross-river emergency patient transfer artery to Central Hospital."
    ))
    cg.add_dependency(DependencyEdge(
        from_node="road_3_2",
        to_node="hosp_west",
        relation="access_via",
        degrade_factor=0.70,
        description="Emergency patient transfer corridor connecting downtown to West Hospital."
    ))

    # Precalculate baseline betweenness centrality
    cg.compute_betweenness_centrality()
    return cg


class CascadeStep:
    def __init__(
        self,
        step_index: int,
        description: str,
        newly_failed_nodes: List[str],
        newly_degraded_nodes: List[str],
        newly_failed_edges: List[str],
        metrics: Dict[str, Any]
    ):
        self.step_index = step_index
        self.description = description
        self.newly_failed_nodes = newly_failed_nodes
        self.newly_degraded_nodes = newly_degraded_nodes
        self.newly_failed_edges = newly_failed_edges
        self.metrics = metrics

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_index": self.step_index,
            "description": self.description,
            "newly_failed_nodes": self.newly_failed_nodes,
            "newly_degraded_nodes": self.newly_degraded_nodes,
            "newly_failed_edges": self.newly_failed_edges,
            "metrics": self.metrics
        }


def compute_impact_metrics(cg: CityGraph, duration_hours: float = 8.0, weather: float = 0.0) -> Dict[str, Any]:
    """
    Derives urban resilience metrics directly from graph state.
    weather (0.0-1.0): storm conditions slow down repair crews, so it lengthens the
    recovery estimate on top of whatever damage the cascade itself already did.
    """
    total_pop_affected = 0
    pop_by_domain = {"power": 0, "road": 0, "health": 0}
    nodes_failed = []
    nodes_degraded = []
    
    for n in cg.nodes.values():
        if n.status == "failed":
            total_pop_affected += n.population_served
            pop_by_domain[n.domain] += n.population_served
            nodes_failed.append(n.id)
        elif n.status == "degraded":
            affected = int(n.population_served * 0.6)
            total_pop_affected += affected
            pop_by_domain[n.domain] += affected
            nodes_degraded.append(n.id)

    total_road_load = 0.0
    total_road_cap = 0.0
    overloaded_roads_count = 0
    
    for e in cg.edges.values():
        if e.domain == "road":
            total_road_load += e.load
            # BUGFIX: a flat 0.1 floor for failed edges made total_road_cap collapse
            # to near-zero whenever most/all roads failed at once (e.g. the Downtown
            # Grid Blackout preset), causing the load/cap ratio -- and therefore the
            # surge percentage below -- to blow up into the millions of percent.
            # A capacity-proportional floor (10% of the edge's own rated capacity)
            # keeps the denominator sane regardless of how many edges have failed.
            effective_cap = max(e.capacity * 0.10, 1.0) if e.status == "failed" else e.capacity
            total_road_cap += effective_cap
            if e.load > e.capacity * 1.05 or e.status in ["overloaded", "failed"]:
                overloaded_roads_count += 1

    base_ratio = (total_road_load / max(1.0, total_road_cap))
    # BUGFIX: cap the surge percentage at a realistic ceiling. Past ~300% delay the
    # city is effectively in total gridlock -- reporting a literal ratio (which could
    # read in the millions of percent for a full-network collapse) is not meaningful
    # and broke the dashboard's strain readout during a full cascade.
    travel_time_surge_pct = round(min(300.0, max(0.0, (base_ratio - 0.65) * 140.0)), 1)

    disrupted_ambulance_routes = 0
    for e in cg.edges.values():
        if e.type == "ambulance_route":
            u = cg.nodes.get(e.source)
            v = cg.nodes.get(e.target)
            if e.status == "failed" or (u and u.status == "failed") or (v and v.status == "failed"):
                disrupted_ambulance_routes += 1
            elif (u and u.status == "degraded") or (v and v.status == "degraded"):
                disrupted_ambulance_routes += 0.5

    hospitals_affected = 0
    for n in cg.nodes.values():
        if n.domain == "health":
            if n.status in ["failed", "degraded"] or n.effective_capacity < n.base_capacity * 0.8:
                hospitals_affected += 1

    power_penalty = len([nid for nid in nodes_failed if cg.nodes[nid].domain == "power"]) * 2.5
    road_penalty = len([nid for nid in nodes_failed if cg.nodes[nid].domain == "road"]) * 0.4
    health_penalty = len([nid for nid in nodes_failed if cg.nodes[nid].domain == "health"]) * 3.0
    
    weather = max(0.0, min(1.0, weather))
    est_recovery_hours = round((duration_hours * 0.8 + power_penalty + road_penalty + health_penalty) * (1.0 + weather * 0.4), 1)

    return {
        "people_affected": total_pop_affected,
        "people_affected_formatted": f"{total_pop_affected:,}",
        "travel_time_increase_pct": travel_time_surge_pct,
        # BUGFIX: was int(disrupted_ambulance_routes), which truncates instead of
        # rounds -- a value like 2.5 (two failed routes + one half-degraded route)
        # silently reported as 2, dropping the degraded route's contribution entirely.
        "emergency_routes_disrupted": round(disrupted_ambulance_routes),
        "hospitals_affected": hospitals_affected,
        "roads_overloaded": overloaded_roads_count,
        "estimated_recovery_hours": est_recovery_hours,
        "pop_by_domain": pop_by_domain,
        "total_nodes_failed": len(nodes_failed),
        "total_nodes_degraded": len(nodes_degraded),
        # BUGFIX: the old formula (100 - people/6000 - surge*0.3) subtracted ~137 points for
        # a moderate cascade and ~353 for a severe one, so max(5, ...) clamped it to the 5
        # floor on effectively every scenario -- the footer read "0.5 / 10" identically
        # before and after a reinforcement, making the KPI useless as a comparison signal.
        # Rebased on the share of the network actually lost (degraded counted at half weight)
        # plus normalized congestion, so the index spans a real 0-100 range: ~99 at baseline,
        # ~64 for the downtown 40% cascade, ~84 once the top SPOF is hardened, ~4 at collapse.
        "resilience_score": round(max(0.0, min(100.0,
            100.0
            - ((len(nodes_failed) + 0.5 * len(nodes_degraded)) / max(1, len(cg.nodes))) * 70.0
            - (min(300.0, travel_time_surge_pct) / 300.0) * 30.0
        )), 1)
    }


BRIDGE_SPAN_MAGNITUDE_RATINGS = [0.30, 0.65, 1.00]  # north -> south


def _bridge_span_ratings(cg: CityGraph) -> List[Tuple[Edge, float]]:
    """
    Pairs each bridge span with its seismic rating, ordered north to south by the
    span's position on the map. The first span collapses at 30% shock magnitude, the
    second at 65% and the last only at 100%. Extra spans (if a map ever has more than
    three) inherit the last rating.
    """
    spans = [e for e in cg.edges.values() if e.type == "bridge"]

    def north_to_south_key(e: Edge) -> float:
        u = cg.nodes.get(e.source)
        v = cg.nodes.get(e.target)
        ys = [n.y for n in (u, v) if n is not None]
        return sum(ys) / len(ys) if ys else 0.0

    spans.sort(key=north_to_south_key)
    rated = []
    for i, span in enumerate(spans):
        rating = BRIDGE_SPAN_MAGNITUDE_RATINGS[min(i, len(BRIDGE_SPAN_MAGNITUDE_RATINGS) - 1)]
        rated.append((span, rating))
    return rated


def simulate(
    base_graph: CityGraph,
    initiating_node_id,
    magnitude=1.0,
    duration_hours: float = 8.0,
    overload_threshold: float = 1.15,
    max_iterations: int = 20,
    weather: float = 0.0
) -> Dict[str, Any]:
    """
    Threshold/overload Motter-Lai cascade engine with cross-domain propagation.
    Guaranteed convergence within max_iterations.

    initiating_node_id: a single node id, OR a list of node ids for a *compound*
    failure — several assets struck simultaneously by one event (earthquake, storm,
    coordinated attack), rather than one isolated trip.
    magnitude: a single 0-1 value applied to every initiating node, OR a list of
    per-node magnitudes (same length/order as initiating_node_id) when a compound
    event hits its epicenters with different severity.
    weather: 0.0 (calm) - 1.0 (typhoon) ambient storm severity. Unlike magnitude
    (how hard the epicenter itself was hit) and duration (how long it stays down),
    weather changes how *readily the rest of the city cascades* — neighbors take on
    load faster and trip at lower thresholds when conditions are already hostile.

    BUGFIX: previously only `magnitude` had any real effect on cascade severity —
    `duration_hours` fed nothing but the after-the-fact recovery-time estimate, and
    `weather` wasn't accepted by this function at all, so moving those two actuators
    never changed a single failed node, degraded node, or KPI. Both now scale a real
    stress multiplier applied to load redistribution and the overload/degrade
    thresholds throughout the cascade, so every actuator visibly changes the outcome.
    """
    cg = base_graph.clone()
    weather = max(0.0, min(1.0, float(weather)))

    # Sustained outages compound secondary stress (crews can't respond, temporary fixes
    # fail again); brief ones barely do. 1h ≈ 0.90x, 8h ≈ 1.0x (baseline), 24h ≈ 1.4x.
    duration_factor = max(0.85, min(1.4, 0.85 + duration_hours / 40.0))
    # Storm conditions push the whole network closer to tripping. 0 kts ≈ 1.0x, 75 kts ≈ 1.5x.
    weather_factor = 1.0 + weather * 0.5
    stress_multiplier = min(2.2, duration_factor * weather_factor)
    # As stress climbs, infrastructure trips at a lower load/capacity ratio than its
    # nominal overload_threshold — storm- and fatigue-stressed assets have less margin.
    effective_overload_threshold = max(1.0, overload_threshold - (stress_multiplier - 1.0) * 0.25)
    effective_degrade_threshold = max(0.75, 0.95 - (stress_multiplier - 1.0) * 0.15)
    dep_fail_frac = max(0.30, 0.45 - (stress_multiplier - 1.0) * 0.10)
    dep_degrade_frac = max(0.70, 0.90 - (stress_multiplier - 1.0) * 0.10)

    init_ids = [initiating_node_id] if isinstance(initiating_node_id, str) else list(initiating_node_id)
    if not init_ids:
        raise ValueError("At least one initiating_node_id is required.")
    for nid in init_ids:
        if nid not in cg.nodes:
            raise ValueError(f"Node '{nid}' does not exist in graph.")

    if isinstance(magnitude, (int, float)):
        magnitudes = [float(magnitude)] * len(init_ids)
    else:
        magnitudes = [float(m) for m in magnitude]
        if len(magnitudes) != len(init_ids):
            raise ValueError("magnitude list must be the same length as initiating_node_id.")

    # Load redistribution intensity through the rest of the cascade tracks the most severe
    # of the simultaneous shocks — a compound disaster propagates at least as violently as
    # its worst-hit epicenter.
    cascade_magnitude = max(magnitudes)

    steps: List[CascadeStep] = []

    # Step 0: Baseline state
    step0_metrics = compute_impact_metrics(cg, duration_hours, weather)
    steps.append(CascadeStep(
        step_index=0,
        description="Normal City Operations — Baseline state across all infrastructure sectors.",
        newly_failed_nodes=[],
        newly_degraded_nodes=[],
        newly_failed_edges=[],
        metrics=step0_metrics
    ))

    # Step 1: Initial failure shock(s) — applied simultaneously for a compound event
    failed_nodes: Set[str] = set()
    degraded_nodes: Set[str] = set()
    failed_edges: Set[str] = set()

    queue: deque = deque()
    shock_events: List[str] = []

    for nid, node_mag in zip(init_ids, magnitudes):
        node = cg.nodes[nid]
        if node_mag >= 0.7:
            node.status = "failed"
            node.effective_capacity = 0.0
            failed_nodes.add(nid)
            queue.append(nid)
            shock_events.append(f"{node.name} suffered complete failure ({int(node_mag*100)}% magnitude)")
        else:
            node.status = "degraded"
            node.effective_capacity = node.capacity * (1.0 - node_mag)
            degraded_nodes.add(nid)
            queue.append(nid)
            shock_events.append(f"{node.name} suffered operational degradation ({int(node_mag*100)}% impairment)")

    if len(init_ids) > 1:
        shock_desc = "Compound Initial Shock (simultaneous multi-asset event): " + "; ".join(shock_events) + "."
    else:
        shock_desc = f"Initial Shock: {shock_events[0]}."

    # Structural shock on the river crossings. The three bridge spans have fixed seismic
    # ratings and collapse purely as a function of shock magnitude, north to south:
    # the first span gives way at 30%, the second at 65%, the last only at a full 100%.
    # Spans are excluded from the incidental "node failed -> incident edges fail" rule
    # below so a cascade can never take one out ahead of its rating. A span whose
    # abutment node has been hardened (capacity raised above its design capacity by the
    # reinforcement comparison) gains +25 points of rating.
    step1_failed_edges: List[str] = []
    for span, rating in _bridge_span_ratings(cg):
        u = cg.nodes.get(span.source)
        v = cg.nodes.get(span.target)
        hardened = any(n is not None and n.capacity > n.base_capacity * 1.01 for n in (u, v))
        effective_rating = rating + (0.25 if hardened else 0.0)
        if cascade_magnitude + 1e-9 >= effective_rating:
            span.status = "failed"
            failed_edges.add(span.id)
            step1_failed_edges.append(span.id)
            shock_desc += f" {span.name} collapsed — structural rating {int(round(effective_rating * 100))}% exceeded."

    step1_metrics = compute_impact_metrics(cg, duration_hours, weather)
    steps.append(CascadeStep(
        step_index=1,
        description=shock_desc,
        newly_failed_nodes=[nid for nid in init_ids if cg.nodes[nid].status == "failed"],
        newly_degraded_nodes=[nid for nid in init_ids if cg.nodes[nid].status == "degraded"],
        newly_failed_edges=step1_failed_edges,
        metrics=step1_metrics
    ))

    iteration = 1
    while queue and iteration < max_iterations:
        iteration += 1
        current_batch_size = len(queue)
        step_new_failed = []
        step_new_degraded = []
        step_new_edges = []
        step_events = []

        for _ in range(current_batch_size):
            curr_id = queue.popleft()
            curr_node = cg.nodes[curr_id]

            # 1. Motter-Lai Load Redistribution to neighbors in same domain
            same_domain_neighbors = [
                nid for nid in cg.adjacency.get(curr_id, [])
                if cg.nodes[nid].domain == curr_node.domain and nid not in failed_nodes
            ]

            if same_domain_neighbors and curr_node.load > 0:
                total_avail_cap = sum(cg.nodes[n].effective_capacity for n in same_domain_neighbors)
                if total_avail_cap > 0:
                    redistribute_amount = curr_node.load * cascade_magnitude * stress_multiplier
                    for n_id in same_domain_neighbors:
                        neighbor = cg.nodes[n_id]
                        share = neighbor.effective_capacity / total_avail_cap
                        added_load = redistribute_amount * share
                        neighbor.load += added_load

                        if neighbor.load > neighbor.effective_capacity * effective_overload_threshold:
                            if neighbor.status != "failed":
                                neighbor.status = "failed"
                                neighbor.effective_capacity = 0.0
                                failed_nodes.add(n_id)
                                step_new_failed.append(n_id)
                                queue.append(n_id)
                                step_events.append(f"{neighbor.name} overloaded ({round(neighbor.load)} / {round(neighbor.capacity)} cap)")
                        elif neighbor.load > neighbor.effective_capacity * effective_degrade_threshold:
                            if neighbor.status == "ok":
                                neighbor.status = "degraded"
                                degraded_nodes.add(n_id)
                                step_new_degraded.append(n_id)
                                step_events.append(f"{neighbor.name} critically stressed ({round(neighbor.load)} load)")

            # Incident edges connected to current node (bridge spans are rated separately above)
            for edge in cg.edges.values():
                if edge.type == "bridge":
                    continue
                if (edge.source == curr_id or edge.target == curr_id) and edge.id not in failed_edges:
                    if curr_node.status == "failed":
                        edge.status = "failed"
                        failed_edges.add(edge.id)
                        step_new_edges.append(edge.id)
                    elif curr_node.status == "degraded" and edge.status == "ok":
                        edge.status = "overloaded"

            # 2. Cross-Domain Cascade via DependencyEdges
            deps = cg.node_dependencies_from.get(curr_id, [])
            for dep in deps:
                target_node = cg.nodes.get(dep.to_node)
                if not target_node or target_node.id in failed_nodes:
                    continue

                target_node.effective_capacity *= dep.degrade_factor

                if target_node.effective_capacity < target_node.load * dep_fail_frac:
                    if target_node.status != "failed":
                        target_node.status = "failed"
                        failed_nodes.add(target_node.id)
                        step_new_failed.append(target_node.id)
                        queue.append(target_node.id)
                        step_events.append(f"Cross-Domain Collapse: {target_node.name} failed due to {dep.relation} from {curr_node.name}")
                elif target_node.effective_capacity < target_node.load * dep_degrade_frac:
                    if target_node.status == "ok":
                        target_node.status = "degraded"
                        degraded_nodes.add(target_node.id)
                        step_new_degraded.append(target_node.id)
                        queue.append(target_node.id)
                        step_events.append(f"Cross-Domain Degradation: {target_node.name} capacity dropped to {int(dep.degrade_factor*100)}% ({dep.description})")

        if step_new_failed or step_new_degraded or step_new_edges:
            desc = f"Cascade Step {iteration}: " + ("; ".join(step_events[:3]) if step_events else "Secondary disruptions propagated.")
            if len(step_events) > 3:
                desc += f" (+{len(step_events)-3} more disruptions)"
            
            step_metrics = compute_impact_metrics(cg, duration_hours, weather)
            steps.append(CascadeStep(
                step_index=iteration,
                description=desc,
                newly_failed_nodes=step_new_failed,
                newly_degraded_nodes=step_new_degraded,
                newly_failed_edges=step_new_edges,
                metrics=step_metrics
            ))
        else:
            break

    final_metrics = compute_impact_metrics(cg, duration_hours, weather)
    bfs_hops = cg.compute_bfs_distances_multi(init_ids)

    return {
        # Kept as a single value when there's only one epicenter, for backward compatibility
        # with existing single-node consumers (e.g. the explanation generator).
        "initiating_node_id": init_ids[0] if len(init_ids) == 1 else init_ids,
        "magnitude": magnitudes[0] if len(magnitudes) == 1 else magnitudes,
        # Always-present list form for anything that wants to handle compound events uniformly.
        "initiating_node_ids": init_ids,
        "magnitudes": magnitudes,
        "is_compound": len(init_ids) > 1,
        "duration_hours": duration_hours,
        "weather": weather,
        "stress_multiplier": round(stress_multiplier, 3),
        "total_steps": len(steps),
        "steps": [s.to_dict() for s in steps],
        "final_metrics": final_metrics,
        "failed_node_ids": list(failed_nodes),
        "degraded_node_ids": list(degraded_nodes),
        "failed_edge_ids": list(failed_edges),
        "bfs_distances": bfs_hops,
        "nodes": {nid: n.to_dict() for nid, n in cg.nodes.items()},
        "edges": [e.to_dict() for e in cg.edges.values()]
    }


def simulate_reinforcement_comparison(
    base_graph: CityGraph,
    initiating_node_id,
    reinforce_node_id: str,
    magnitude=1.0,
    duration_hours: float = 8.0,
    weather: float = 0.0
) -> Dict[str, Any]:
    """
    Evaluates city resilience before vs after reinforcing a key asset.
    initiating_node_id may be a single node id or a list of ids (compound failure).
    """
    unmitigated_res = simulate(base_graph, initiating_node_id, magnitude, duration_hours, weather=weather)

    reinforced_graph = base_graph.clone()
    if reinforce_node_id in reinforced_graph.nodes:
        r_node = reinforced_graph.nodes[reinforce_node_id]
        r_node.capacity *= 1.6
        r_node.effective_capacity = r_node.capacity
        r_node.notes += " [HARDENED: +60% Surge Capacity & Microgrid Redundancy]"

        for dep in reinforced_graph.dependency_edges:
            if dep.to_node == reinforce_node_id:
                dep.degrade_factor = min(0.90, dep.degrade_factor + 0.35)

    mitigated_res = simulate(reinforced_graph, initiating_node_id, magnitude, duration_hours, weather=weather)

    unmit_m = unmitigated_res["final_metrics"]
    mit_m = mitigated_res["final_metrics"]

    pop_saved = max(0, unmit_m["people_affected"] - mit_m["people_affected"])
    travel_time_saved = max(0.0, round(unmit_m["travel_time_increase_pct"] - mit_m["travel_time_increase_pct"], 1))
    recovery_saved = max(0.0, round(unmit_m["estimated_recovery_hours"] - mit_m["estimated_recovery_hours"], 1))

    return {
        "initiating_node_id": initiating_node_id,
        "reinforce_node_id": reinforce_node_id,
        "unmitigated": unmitigated_res,
        "mitigated": mitigated_res,
        "comparison_summary": {
            "population_protected": pop_saved,
            "population_reduction_pct": round((pop_saved / max(1, unmit_m["people_affected"])) * 100.0, 1),
            "travel_time_saved_pct": travel_time_saved,
            "recovery_time_saved_hours": recovery_saved,
            "hospitals_saved": unmit_m["hospitals_affected"] - mit_m["hospitals_affected"],
            "emergency_routes_preserved": unmit_m["emergency_routes_disrupted"] - mit_m["emergency_routes_disrupted"]
        }
    }


def simulate_scenario_comparison(
    base_graph: CityGraph,
    scenario_a: Dict[str, Any],
    scenario_b: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Runs two independent, unrelated failure scenarios against the same baseline city and
    reports them side by side ("Substation Alpha trips" vs "Bridge 2 closes") — distinct
    from simulate_reinforcement_comparison, which evaluates a *single* scenario before vs.
    after a hardening investment. Neither scenario here reinforces anything; this answers
    "which of these two situations is worse, and by how much?"

    Each scenario dict accepts:
        {
            "initiating_node_id": str | List[str],   # single node, or a compound multi-node event
            "magnitude": float | List[float] = 1.0,
            "duration_hours": float = 8.0,
            "overload_threshold": float = 1.15,
            "label": str (optional, echoed back for display; defaults to "Scenario A"/"Scenario B")
        }
    """
    def run(spec: Dict[str, Any]) -> Dict[str, Any]:
        return simulate(
            base_graph=base_graph,
            initiating_node_id=spec["initiating_node_id"],
            magnitude=spec.get("magnitude", 1.0),
            duration_hours=spec.get("duration_hours", 8.0),
            overload_threshold=spec.get("overload_threshold", 1.15),
            weather=spec.get("weather", 0.0)
        )

    result_a = run(scenario_a)
    result_b = run(scenario_b)

    m_a = result_a["final_metrics"]
    m_b = result_b["final_metrics"]

    def which_worse(a_val: float, b_val: float) -> str:
        if a_val > b_val:
            return "A"
        if b_val > a_val:
            return "B"
        return "tie"

    comparison_summary = {
        "label_a": scenario_a.get("label", "Scenario A"),
        "label_b": scenario_b.get("label", "Scenario B"),
        "people_affected_delta": m_a["people_affected"] - m_b["people_affected"],
        "more_severe_population": which_worse(m_a["people_affected"], m_b["people_affected"]),
        "travel_time_increase_pct_delta": round(m_a["travel_time_increase_pct"] - m_b["travel_time_increase_pct"], 1),
        "more_severe_travel_time": which_worse(m_a["travel_time_increase_pct"], m_b["travel_time_increase_pct"]),
        "hospitals_affected_delta": m_a["hospitals_affected"] - m_b["hospitals_affected"],
        "more_severe_hospitals": which_worse(m_a["hospitals_affected"], m_b["hospitals_affected"]),
        "emergency_routes_disrupted_delta": round(m_a["emergency_routes_disrupted"] - m_b["emergency_routes_disrupted"], 1),
        "more_severe_emergency_routes": which_worse(m_a["emergency_routes_disrupted"], m_b["emergency_routes_disrupted"]),
        "estimated_recovery_hours_delta": round(m_a["estimated_recovery_hours"] - m_b["estimated_recovery_hours"], 1),
        "more_severe_recovery": which_worse(m_a["estimated_recovery_hours"], m_b["estimated_recovery_hours"]),
        # Overall verdict weighted primarily by population impact — the headline resilience metric.
        "overall_more_severe": which_worse(m_a["people_affected"], m_b["people_affected"])
    }

    return {
        "scenario_a": result_a,
        "scenario_b": result_b,
        "comparison_summary": comparison_summary
    }
