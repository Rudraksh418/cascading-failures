# Cascading Failures — The Butterfly Effect

**Manipal Hackathon 2026** · Theme: *The Butterfly Effect*
Mapping to UN SDG 9 (Industry, Innovation & Infrastructure) and SDG 11 (Sustainable Cities & Communities)

A "what happens if this breaks?" simulator for a city. You pick a point of failure — a substation, a bridge, a hospital — and it shows you how that one failure ripples across the rest of the city's infrastructure.

## Why we built this

Most city infrastructure gets planned and modeled one system at a time: roads are their own thing, power is its own thing, hospitals are their own thing. But in a real city they're all tangled together. Take out a substation and you don't just lose lights — you lose traffic signals, which backs up roads, which slows down ambulances, which puts pressure on hospitals that are already running on backup power.

We wanted to build something that actually shows that chain reaction instead of just describing it, and that gives planners something more useful than "here's what failed" — more like "here's what to fix first so this doesn't happen."

## What it does

- **Models a city as one connected graph** across three domains: electricity, roads and transport, and healthcare plus emergency response, with dependency links between them (e.g. a substation powers a hospital's backup systems and the traffic signals on the roads leading to it).
- **Simulates cascading failures**: when something fails, it's load gets redistributed to neighboring nodes, and anything that gets overloaded fails too. This keeps propagating until things settle down.
- **Ranks critical infrastructure** by how central it is to the network (using betweenness centrality), so you can see which single points of failure matter most — this is the closest thing we have to a "where should the city invest" answer.
- **Lets you type a plain-English scenario** ("what happens if the bridge near the hospital closes for 8 hours?") and turns it into a simulation.
- **Visualizes the failure spreading** on the city map, plus an impact summary (people affected, roads overloaded, hospitals impacted, estimated recovery time, etc.) — these numbers are model outputs from our simulation, not real-world predictions.

## Tech

Pure Python 3 standard library on the backend, no external dependencies, and a plain HTML/CSS/JS frontend. No installs beyond Python itself.

```
python3 start.py
```

Opens the simulator at `http://localhost:8000`.

Run the tests for the cascade engine:

```
python3 tests/test_cascade.py
```

## How it's laid out

```
backend/
  graph_engine.py   — city model, cascade simulation, centrality ranking
  nlp_engine.py      — turns typed scenarios into simulation inputs, generates summaries
  server.py          — serves the API and the frontend
frontend/
  index.html, style.css, app.js — the dashboard and map
  data/city_data.json — our sample city
tests/
  test_cascade.py    — tests for the cascade engine
docs/
  PITCH_AND_DEMO_GUIDE.md
  ARCHITECTURE.md
start.py
```

## What we cut for time

We scoped this down from a much bigger idea (originally 7+ infrastructure domains, real city GIS data, full scenario comparison). For the hackathon we kept 3 domains and one procedurally generated sample city, since that was enough to tell a convincing story without spending the whole 36 hours on data ingestion.
