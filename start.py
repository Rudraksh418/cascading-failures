#!/usr/bin/env python3
"""
CASCADING FAILURES — Quickstart Launcher
========================================
Single-command launcher for the City Resilience Simulator.
Starts the zero-dependency backend server and opens the dashboard in your default browser.
"""

import os
import sys
import webbrowser
import time

# Ensure paths
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from server import run_server


def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    print("=" * 72)
    print("🦋 CASCADING FAILURES — THE BUTTERFLY EFFECT")
    print("   City Infrastructure Resilience Simulator & Capital Allocation Engine")
    print("   Manipal Hackathon 2026 • SDG 9 & 11")
    print("=" * 72)
    print(f"\n📡 Starting Multi-Domain Resilience Server on port {port}...")
    print(f"🔗 Dashboard URL: http://localhost:{port}")
    print(f"⚡ Monitored Domains: Power Grid, Road Network, Healthcare")
    print(f"🏙️  Procedural City: Metropolis-7 (73 assets, 120 interconnects)")
    print("\n👉 Press Ctrl+C to stop the server anytime.\n")

    # Try opening browser after 1 second
    try:
        webbrowser.open(f"http://localhost:{port}")
    except Exception:
        pass

    try:
        run_server(port)
    except KeyboardInterrupt:
        print("\n🛑 Shutting down simulator gracefully. Goodbye!")


if __name__ == "__main__":
    main()
