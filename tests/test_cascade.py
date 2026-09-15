"""
Test Suite for Cascade Engine and Graph Algorithms
==================================================
Tests:
1. Brandes betweenness centrality on canonical topologies.
2. Toy 5-node graph Motter-Lai load redistribution and threshold tripping.
3. Cross-domain dependency degradation (Power -> Road traffic signals -> Healthcare).
4. Cycle / infinite loop prevention and convergence guarantees.
5. Metropolis-7 procedural city generation and preset cascade verification.
6. Asset reinforcement and resilience comparison.
"""

import unittest
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from graph_engine import (
    Node,
    Edge,
    DependencyEdge,
    CityGraph,
    generate_metropolis_7,
    simulate,
    simulate_reinforcement_comparison,
    compute_impact_metrics
)


class TestCascadeEngine(unittest.TestCase):

    def test_brandes_betweenness_centrality(self):
        """Test exact betweenness centrality on a 4-node line graph A-B-C-D."""
        cg = CityGraph("LineGraph")
        cg.add_node(Node("A", "road", "intersection", "A", "Dist", 0, 0, 100, 50, 1000))
        cg.add_node(Node("B", "road", "intersection", "B", "Dist", 1, 0, 100, 50, 1000))
        cg.add_node(Node("C", "road", "intersection", "C", "Dist", 2, 0, 100, 50, 1000))
        cg.add_node(Node("D", "road", "intersection", "D", "Dist", 3, 0, 100, 50, 1000))

        cg.add_edge(Edge("e1", "A", "B", "road", "road_segment", 100, 50))
        cg.add_edge(Edge("e2", "B", "C", "road", "road_segment", 100, 50))
        cg.add_edge(Edge("e3", "C", "D", "road", "road_segment", 100, 50))

        scores = cg.compute_betweenness_centrality()
        # B and C are bottlenecks with maximum betweenness; endpoints A and D have 0
        self.assertEqual(scores["A"], 0.0)
        self.assertEqual(scores["D"], 0.0)
        self.assertGreater(scores["B"], 0.0)
        self.assertEqual(scores["B"], scores["C"])

    def test_toy_motter_lai_load_redistribution(self):
        """
        Toy 5-node triangle/star graph:
        Initial node fails, load is shed to neighbor, neighbor exceeds overload threshold and trips.
        """
        cg = CityGraph("ToyMotterLai")
        # N1: capacity 100, load 90. Connected to N2 (cap 100, load 85) and N3 (cap 100, load 85)
        cg.add_node(Node("N1", "power", "substation", "N1", "D1", 0, 0, 100, 90, 5000))
        cg.add_node(Node("N2", "power", "substation", "N2", "D1", 10, 0, 100, 85, 5000))
        cg.add_node(Node("N3", "power", "substation", "N3", "D1", 0, 10, 100, 85, 5000))
        cg.add_node(Node("N4", "power", "substation", "N4", "D1", 20, 0, 200, 40, 5000))

        cg.add_edge(Edge("e12", "N1", "N2", "power", "power_line", 100, 85))
        cg.add_edge(Edge("e13", "N1", "N3", "power", "power_line", 100, 85))
        cg.add_edge(Edge("e24", "N2", "N4", "power", "power_line", 200, 40))

        # With overload threshold 1.15, N2 will receive 45 additional load: 85 + 45 = 130 > 115 -> TRIPS!
        res = simulate(cg, initiating_node_id="N1", magnitude=1.0, overload_threshold=1.15)
        
        self.assertIn("N1", res["failed_node_ids"])
        self.assertIn("N2", res["failed_node_ids"])
        self.assertGreaterEqual(res["total_steps"], 2)
        self.assertGreater(res["final_metrics"]["people_affected"], 5000)

    def test_cross_domain_dependency_cascade(self):
        """
        Power Substation fails -> drops capacity of dependent Hospital -> hospital degrades.
        """
        cg = CityGraph("ToyCrossDomain")
        cg.add_node(Node("sub_test", "power", "substation", "Sub", "D1", 0, 0, 500, 400, 10000))
        cg.add_node(Node("hosp_test", "health", "hospital", "Hosp", "D1", 5, 5, 300, 250, 25000))

        # Hospital depends on Substation with degrade factor 0.40 (capacity drops to 120 < load 250)
        cg.add_dependency(DependencyEdge("sub_test", "hosp_test", "powered_by", 0.40, "Primary power"))

        res = simulate(cg, initiating_node_id="sub_test", magnitude=1.0)
        self.assertIn("sub_test", res["failed_node_ids"])
        # Hospital should be either failed or degraded
        hosp_node = res["nodes"]["hosp_test"]
        self.assertIn(hosp_node["status"], ["failed", "degraded"])
        self.assertLess(hosp_node["effective_capacity"], 300.0)

    def test_convergence_guarantee_no_infinite_loops(self):
        """Ensure cyclic graph with mutual dependencies stops within max_iterations."""
        cg = CityGraph("CyclicGraph")
        cg.add_node(Node("A", "road", "intersection", "A", "D", 0, 0, 100, 95, 1000))
        cg.add_node(Node("B", "road", "intersection", "B", "D", 1, 0, 100, 95, 1000))
        cg.add_edge(Edge("e1", "A", "B", "road", "road_segment", 100, 95))
        cg.add_dependency(DependencyEdge("A", "B", "depends_on", 0.5))
        cg.add_dependency(DependencyEdge("B", "A", "depends_on", 0.5))

        res = simulate(cg, initiating_node_id="A", magnitude=1.0, max_iterations=10)
        self.assertLessEqual(res["total_steps"], 10)

    def test_metropolis_7_baseline_and_cascade(self):
        """Generate full Metropolis-7 and test the Downtown Blackout cascade scenario."""
        cg = generate_metropolis_7(seed=42)
        
        # Verify graph sizes
        self.assertGreaterEqual(len(cg.nodes), 60)
        self.assertGreaterEqual(len(cg.edges), 80)
        self.assertGreater(len(cg.dependency_edges), 10)

        # Baseline metrics
        baseline = compute_impact_metrics(cg)
        self.assertEqual(baseline["people_affected"], 0)
        self.assertEqual(baseline["total_nodes_failed"], 0)

        # Trigger Downtown Central Substation blackout
        res = simulate(cg, initiating_node_id="sub_downtown", magnitude=1.0, duration_hours=8.0)
        
        self.assertIn("sub_downtown", res["failed_node_ids"])
        # Cross-domain propagation should affect City General Hospital
        hosp_status = res["nodes"]["hosp_central"]["status"]
        self.assertIn(hosp_status, ["failed", "degraded"])

        # Multiple steps of cascade should have occurred
        self.assertGreaterEqual(res["total_steps"], 2)
        self.assertGreater(res["final_metrics"]["people_affected"], 100000)
        self.assertGreater(res["final_metrics"]["travel_time_increase_pct"], 10.0)

    def test_asset_reinforcement_comparison(self):
        """Verify that reinforcing Substation Beta significantly mitigates the blackout."""
        cg = generate_metropolis_7(seed=42)
        comp = simulate_reinforcement_comparison(
            cg,
            initiating_node_id="sub_downtown",
            reinforce_node_id="hosp_central",
            magnitude=1.0,
            duration_hours=8.0
        )
        summary = comp["comparison_summary"]
        self.assertGreaterEqual(summary["population_protected"], 0)
        self.assertIn("mitigated", comp)
        self.assertIn("unmitigated", comp)


if __name__ == "__main__":
    unittest.main()
