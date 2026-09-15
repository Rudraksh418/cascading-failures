"""
Multi-Threaded HTTP REST API Server for City Resilience Simulator
=================================================================
Zero-dependency, high-performance Python 3 HTTP server serving:
- REST API: /api/city, /api/simulate, /api/nl-query, /api/explain, /api/compare, /api/critical-assets
- Static files: frontend/index.html, frontend/app.js, frontend/style.css
"""

import os
import sys
import json
import mimetypes
from typing import Dict, Any, Optional, List
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

# Ensure backend directory is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from graph_engine import (
    generate_metropolis_7,
    simulate,
    simulate_reinforcement_comparison,
    simulate_scenario_comparison,
    compute_impact_metrics
)
from nlp_engine import NLPEngine

# Initialize global city model and NLP engine
CITY_GRAPH = generate_metropolis_7(seed=42)
NLP = NLPEngine(CITY_GRAPH)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class ResilienceAPIHandler(SimpleHTTPRequestHandler):

    def _set_cors_headers(self, status_code=200, content_type="application/json"):
        self.send_response(status_code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_cors_headers(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/city":
            self.handle_get_city()
        elif path == "/api/critical-assets":
            self.handle_get_critical_assets()
        elif path.startswith("/api/"):
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))
        else:
            # Serve frontend static assets
            self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": "Invalid JSON payload"}).encode("utf-8"))
            return

        if path == "/api/simulate":
            self.handle_post_simulate(data)
        elif path == "/api/nl-query":
            self.handle_post_nl_query(data)
        elif path == "/api/explain":
            self.handle_post_explain(data)
        elif path == "/api/compare":
            self.handle_post_compare(data)
        elif path == "/api/compare-scenarios":
            self.handle_post_compare_scenarios(data)
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    # -------------------------------------------------------------
    # REST API Handlers
    # -------------------------------------------------------------
    def handle_get_city(self):
        critical_assets = CITY_GRAPH.get_critical_assets(top_n=8)
        baseline_metrics = compute_impact_metrics(CITY_GRAPH)

        presets = [
            {
                "id": "preset_blackout",
                "title": "The Downtown Blackout",
                "description": "Downtown Power Station trips -> Traffic signals dark -> Downtown gridlock -> Central Hospital isolated.",
                "node_id": "sub_downtown",
                "magnitude": 1.0,
                "duration_hours": 8.0,
                "icon": "⚡",
                "theme_tag": "Cross-Domain Domino"
            },
            {
                "id": "preset_bridge",
                "title": "Central Bridge Severance",
                "description": "Arterial bridge closed -> Traffic spills over to North Bridge -> City-wide gridlock -> Ambulances blocked.",
                "node_id": "road_3_2",
                "magnitude": 1.0,
                "duration_hours": 12.0,
                "icon": "🌉",
                "theme_tag": "Transport Chokepoint"
            },
            {
                "id": "preset_hospital_power",
                "title": "Central Hospital Power Trip",
                "description": "Primary electrical feed lost -> Hospital capacity drops to 45% -> Emergency intake overflows to suburban clinics.",
                "node_id": "hosp_central",
                "magnitude": 0.8,
                "duration_hours": 6.0,
                "icon": "🏥",
                "theme_tag": "Critical Healthcare Surge"
            }
        ]

        payload = {
            "city_name": CITY_GRAPH.name,
            "total_nodes": len(CITY_GRAPH.nodes),
            "total_edges": len(CITY_GRAPH.edges),
            "total_dependencies": len(CITY_GRAPH.dependency_edges),
            "nodes": [n.to_dict() for n in CITY_GRAPH.nodes.values()],
            "edges": [e.to_dict() for e in CITY_GRAPH.edges.values()],
            "dependency_edges": [d.to_dict() for d in CITY_GRAPH.dependency_edges],
            "critical_assets": critical_assets,
            "baseline_metrics": baseline_metrics,
            "presets": presets
        }

        self._set_cors_headers(200)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def handle_get_critical_assets(self):
        critical = CITY_GRAPH.get_critical_assets(top_n=10)
        self._set_cors_headers(200)
        self.wfile.write(json.dumps({"critical_assets": critical}).encode("utf-8"))

    def handle_post_simulate(self, data: Dict[str, Any]):
        # "node_ids" (a list) triggers a compound event — several assets failing at once
        # (earthquake, storm, coordinated attack). "node_id" (a single string) remains the
        # existing single-asset path; both funnel into the same simulate() engine.
        raw_ids = data.get("node_ids") or data.get("node_id")
        node_ids = raw_ids if isinstance(raw_ids, list) else ([raw_ids] if raw_ids else [])

        if not node_ids:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": "Provide 'node_id' (single asset) or 'node_ids' (compound event)."}).encode("utf-8"))
            return

        invalid = [nid for nid in node_ids if nid not in CITY_GRAPH.nodes]
        if invalid:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": f"Invalid node_id(s): {invalid}"}).encode("utf-8"))
            return

        raw_magnitude = data.get("magnitude", 1.0)
        if isinstance(raw_magnitude, list):
            magnitude = [float(m) for m in raw_magnitude]
            if len(magnitude) != len(node_ids):
                self._set_cors_headers(400)
                self.wfile.write(json.dumps({"error": "magnitude list must match node_ids length."}).encode("utf-8"))
                return
        else:
            magnitude = float(raw_magnitude)

        duration_hours = float(data.get("duration_hours", 8.0))
        overload_threshold = float(data.get("overload_threshold", 1.15))
        weather = float(data.get("weather", 0.0))

        try:
            sim_result = simulate(
                base_graph=CITY_GRAPH,
                initiating_node_id=node_ids if len(node_ids) > 1 else node_ids[0],
                magnitude=magnitude,
                duration_hours=duration_hours,
                overload_threshold=overload_threshold,
                weather=weather
            )
        except ValueError as ex:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": str(ex)}).encode("utf-8"))
            return

        # Also auto-attach plain-English explanation
        explanation = NLP.generate_explanation(sim_result)
        sim_result["explanation"] = explanation

        self._set_cors_headers(200)
        self.wfile.write(json.dumps(sim_result).encode("utf-8"))

    def handle_post_nl_query(self, data: Dict[str, Any]):
        query = data.get("query", "").strip()
        if not query:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": "Empty query"}).encode("utf-8"))
            return

        parsed = NLP.parse_query(query)
        self._set_cors_headers(200)
        self.wfile.write(json.dumps(parsed).encode("utf-8"))

    def handle_post_explain(self, data: Dict[str, Any]):
        explanation = NLP.generate_explanation(data)
        self._set_cors_headers(200)
        self.wfile.write(json.dumps(explanation).encode("utf-8"))

    def handle_post_compare(self, data: Dict[str, Any]):
        # "initiating_node_id" also accepts a list here, so a compound multi-asset scenario
        # can get the same before/after-reinforcement treatment as a single-asset one.
        raw_init = data.get("initiating_node_id") or data.get("initiating_node_ids")
        init_ids = raw_init if isinstance(raw_init, list) else ([raw_init] if raw_init else [])
        invalid = [nid for nid in init_ids if nid not in CITY_GRAPH.nodes]
        if not init_ids or invalid:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": f"Invalid initiating_node_id: {raw_init}"}).encode("utf-8"))
            return
        init_id = init_ids if len(init_ids) > 1 else init_ids[0]

        reinforce_id = data.get("reinforce_node_id")
        if not reinforce_id or reinforce_id not in CITY_GRAPH.nodes:
            reinforce_id = init_ids[0]  # Default to reinforcing the (first) initiating node

        raw_magnitude = data.get("magnitude", 1.0)
        if isinstance(raw_magnitude, list):
            magnitude = [float(m) for m in raw_magnitude]
        else:
            magnitude = float(raw_magnitude)
        duration_hours = float(data.get("duration_hours", 8.0))
        weather = float(data.get("weather", 0.0))

        try:
            comparison = simulate_reinforcement_comparison(
                base_graph=CITY_GRAPH,
                initiating_node_id=init_id,
                reinforce_node_id=reinforce_id,
                magnitude=magnitude,
                duration_hours=duration_hours,
                weather=weather
            )
        except ValueError as ex:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": str(ex)}).encode("utf-8"))
            return

        self._set_cors_headers(200)
        self.wfile.write(json.dumps(comparison).encode("utf-8"))

    def handle_post_compare_scenarios(self, data: Dict[str, Any]):
        """
        Scenario A vs. Scenario B — two independent, unrelated failures run head to head
        (e.g. "Substation Alpha trips" vs. "Bridge 2 closes"), distinct from /api/compare's
        before/after-reinforcement comparison. Each of scenario_a / scenario_b accepts:
        { node_id | node_ids, magnitude, duration_hours, label }.
        """
        def parse_scenario(raw: Dict[str, Any], key: str):
            if not isinstance(raw, dict):
                return None, f"'{key}' must be an object."

            raw_ids = raw.get("node_ids") or raw.get("node_id")
            ids = raw_ids if isinstance(raw_ids, list) else ([raw_ids] if raw_ids else [])
            if not ids:
                return None, f"'{key}' needs 'node_id' or 'node_ids'."

            invalid = [nid for nid in ids if nid not in CITY_GRAPH.nodes]
            if invalid:
                return None, f"'{key}' has invalid node_id(s): {invalid}"

            raw_mag = raw.get("magnitude", 1.0)
            if isinstance(raw_mag, list):
                magnitude = [float(m) for m in raw_mag]
                if len(magnitude) != len(ids):
                    return None, f"'{key}'.magnitude list must match its node_ids length."
            else:
                magnitude = float(raw_mag)

            spec = {
                "initiating_node_id": ids if len(ids) > 1 else ids[0],
                "magnitude": magnitude,
                "duration_hours": float(raw.get("duration_hours", 8.0)),
                "overload_threshold": float(raw.get("overload_threshold", 1.15)),
                "label": raw.get("label") or (CITY_GRAPH.nodes[ids[0]].name if len(ids) == 1 else f"{len(ids)}-asset compound event")
            }
            return spec, None

        scenario_a, err_a = parse_scenario(data.get("scenario_a"), "scenario_a")
        if err_a:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": err_a}).encode("utf-8"))
            return

        scenario_b, err_b = parse_scenario(data.get("scenario_b"), "scenario_b")
        if err_b:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": err_b}).encode("utf-8"))
            return

        try:
            comparison = simulate_scenario_comparison(CITY_GRAPH, scenario_a, scenario_b)
        except ValueError as ex:
            self._set_cors_headers(400)
            self.wfile.write(json.dumps({"error": str(ex)}).encode("utf-8"))
            return

        # Attach a plain-English explanation to each side too, same as /api/simulate.
        comparison["scenario_a"]["explanation"] = NLP.generate_explanation(comparison["scenario_a"])
        comparison["scenario_b"]["explanation"] = NLP.generate_explanation(comparison["scenario_b"])

        self._set_cors_headers(200)
        self.wfile.write(json.dumps(comparison).encode("utf-8"))

    # -------------------------------------------------------------
    # Static Asset Serving
    # -------------------------------------------------------------
    def serve_static(self, path: str):
        if path in ["/", "", "/index.html"]:
            filepath = os.path.join(FRONTEND_DIR, "index.html")
        else:
            rel_path = path.lstrip("/")
            filepath = os.path.join(FRONTEND_DIR, rel_path)

        if not os.path.isfile(filepath):
            # Fallback to index.html for SPA routing
            filepath = os.path.join(FRONTEND_DIR, "index.html")

        if not os.path.isfile(filepath):
            self._set_cors_headers(404, "text/plain")
            self.wfile.write(b"File not found")
            return

        mimetypes.add_type("application/javascript", ".js")
        mimetypes.add_type("application/javascript", ".jsx")
        mimetypes.add_type("text/css", ".css")
        mimetypes.add_type("application/json", ".json")
        mimetypes.add_type("image/svg+xml", ".svg")

        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self._set_cors_headers(200, mime_type)
            self.wfile.write(content)
        except Exception as e:
            self._set_cors_headers(500, "text/plain")
            self.wfile.write(str(e).encode("utf-8"))


def run_server(port: int = 8000):
    server_address = ("", port)
    try:
        httpd = ThreadedHTTPServer(server_address, ResilienceAPIHandler)
        print(f"🚀 City Resilience Simulator Server running on http://localhost:{port}", flush=True)
        httpd.serve_forever()
    except OSError as e:
        if port < 8010:
            print(f"⚠️ Port {port} in use, trying {port+1}...")
            run_server(port + 1)
        else:
            raise e


if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)
