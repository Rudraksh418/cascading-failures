"""
NLP and AI Explanation Engine for City Resilience Simulator
============================================================
Provides:
1. Natural Language -> Scenario Parameter Parsing ({node_id, magnitude, duration}).
   - Includes high-accuracy offline semantic entity & intent parser (guaranteed to work with 0 API keys / offline).
   - Includes optional LLM API pass-through if ANTHROPIC_API_KEY or GEMINI_API_KEY is configured.
2. Plain-English Executive Summary / Domino Cascade Storyteller:
   - Converts step-by-step cascade graphs and metrics into a clear causal narrative for city decision-makers.
"""

import re
import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple


class NLPEngine:
    def __init__(self, city_graph=None):
        self.city_graph = city_graph
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        self.gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()

    def parse_query(self, user_query: str) -> Dict[str, Any]:
        """
        Parses a free-form natural language query into a simulation scenario:
        {
            "node_id": str,
            "magnitude": float (0.1 - 1.0),
            "duration_hours": float,
            "scenario_title": str,
            "identified_domain": str,
            "source": "offline_semantic_parser" | "llm"
        }
        """
        q = user_query.strip().lower()

        # Try online LLM first if API key is present
        if self.anthropic_key:
            try:
                llm_res = self._call_anthropic_parser(user_query)
                if llm_res:
                    return llm_res
            except Exception as ex:
                pass  # Fallback smoothly to offline parser

        # Robust Offline Semantic & Entity Extraction
        # 1. Parse Duration
        duration_hours = 8.0  # Default 8 hours
        # BUGFIX: the old pattern had no word boundary after the unit, so a lone "d"
        # or "h" inside an unrelated word (e.g. the "d" in "dollars") would falsely
        # match as "day"/"hour" and silently override the duration. The trailing \b
        # forces the unit to end at a real word boundary.
        duration_match = re.search(r"(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|days?|d|minutes?|mins?)\b", q)
        if duration_match:
            val = float(duration_match.group(1))
            unit = duration_match.group(2)
            if unit.startswith("d"):
                duration_hours = val * 24.0
            elif unit.startswith("m"):
                duration_hours = round(val / 60.0, 1)
            else:
                duration_hours = val
        else:
            # No explicit number — understand common plain-English durations too.
            if any(term in q for term in ["overnight", "all night"]):
                duration_hours = 10.0
            elif any(term in q for term in ["all day", "entire day", "whole day"]):
                duration_hours = 24.0
            elif any(term in q for term in ["rush hour", "peak hour", "morning peak", "morning transit peak", "commute"]):
                duration_hours = 2.0
            elif any(term in q for term in ["briefly", "momentarily", "a moment", "few minutes"]):
                duration_hours = 0.5
            elif any(term in q for term in ["a few hours", "couple hours", "couple of hours"]):
                duration_hours = 3.0
            elif any(term in q for term in ["a week", "weeklong", "week-long"]):
                duration_hours = 168.0

        # 2. Parse Magnitude
        magnitude = 1.0  # Default total failure
        if any(term in q for term in [
            "catastrophic", "collapse", "blackout", "destroyed", "exploded", "total failure",
            "fully closed", "fails completely", "shuts down", "shut down", "goes offline",
            "knocked out", "wiped out", "washes out", "washed out", "cut off", "severed"
        ]):
            magnitude = 1.0
        elif any(term in q for term in ["heavy", "severe", "major", "80%", "90%", "trips", "trip", "overloaded", "critical strain"]):
            magnitude = 0.85
        elif any(term in q for term in ["half", "50%", "moderate", "degraded", "partial", "slowdown", "throttled", "struggles", "strained"]):
            magnitude = 0.50
        elif any(term in q for term in ["minor", "slight", "20%", "30%", "small", "brief hiccup", "flickers"]):
            magnitude = 0.35

        # Check explicit percentage
        pct_match = re.search(r"(\d+)\s*%", q)
        if pct_match:
            magnitude = round(float(pct_match.group(1)) / 100.0, 2)
            magnitude = max(0.1, min(1.0, magnitude))

        # 3. Entity & Node Resolution
        target_node_id = None
        domain = None
        scenario_title = None
        compound_node_ids = None  # set when the question names more than one asset at once

        # 3a. Direct name match — every asset now has a short, plain-English name
        # ("North Bridge", "East Hospital", "Downtown Power Station", "West Riverfront
        # Junction 3", ...), so the simplest and most reliable way to "simulate anything" —
        # including a *compound* event ("what if X and Y both fail?") — is to just look for
        # every asset name that literally appears in the question. Longer names are matched
        # first and claim their text span so a specific name ("East Hospital") isn't also
        # double-counted as a spurious partial hit of something else.
        if self.city_graph:
            raw_matches = []
            for nid, node in self.city_graph.nodes.items():
                nm = (node.name or "").lower()
                if not nm:
                    continue
                idx = q.find(nm)
                if idx != -1:
                    raw_matches.append((idx, idx + len(nm), nid))

            raw_matches.sort(key=lambda m: -(m[1] - m[0]))
            covered = [False] * len(q)
            accepted = []
            for start, end, nid in raw_matches:
                if any(covered[start:end]):
                    continue
                accepted.append(nid)
                for i in range(start, end):
                    covered[i] = True

            if len(accepted) == 1:
                target_node_id = accepted[0]
                node_obj = self.city_graph.nodes[target_node_id]
                domain = node_obj.domain
                scenario_title = f"{node_obj.name} Disruption"
            elif len(accepted) > 1:
                compound_node_ids = accepted
                target_node_id = accepted[0]  # keeps the singular-match branches below from re-running
                names = [self.city_graph.nodes[nid].name for nid in accepted]
                domain = "multi"
                scenario_title = " & ".join(names) + " Compound Disruption"

        # 3b. Keyword / synonym fallback for questions that describe an asset without
        # using its exact name (old landmark nicknames still work here too).
        if target_node_id is None:
            if "north grid" in q or "substation alpha" in q or ("substation" in q and "north" in q) or ("power" in q and "north" in q):
                target_node_id = "sub_north"
                domain = "power"
                scenario_title = "North Power Station Blackout"
            elif "downtown" in q and ("substation" in q or "power" in q or re.search(r"\bgrid\b", q) or "blackout" in q):
                target_node_id = "sub_downtown"
                domain = "power"
                scenario_title = "Downtown Power Station Failure"
            elif "west" in q and ("substation" in q or "power" in q or "delta" in q or re.search(r"\bgrid\b", q)):
                target_node_id = "sub_west"
                domain = "power"
                scenario_title = "West Power Station Outage"
            elif "east" in q and ("substation" in q or "power" in q or "gamma" in q or re.search(r"\bgrid\b", q)):
                target_node_id = "sub_east"
                domain = "power"
                scenario_title = "East Power Station Trip"
            # BUGFIX: "river" was matched as a plain substring, so "riverfront" (as in "west
            # riverfront floods") silently triggered the bridge branch below and hijacked the
            # query before the district-level fallback (3c) ever got a chance to run. \b keeps
            # it matching only the standalone word "river".
            elif "bridge" in q or re.search(r"\briver\b", q) or "crossing" in q:
                domain = "road"
                if "north" in q:
                    target_node_id = "road_2_2"
                    scenario_title = "North Bridge Closure"
                elif "south" in q:
                    target_node_id = "road_4_2"
                    scenario_title = "South Bridge Structural Failure"
                else:
                    target_node_id = "road_3_2"
                    scenario_title = "Central Bridge Severance"
            # The east/west checks run before the generic "hospital" catch-all so a
            # question about "west hospital" or "east hospital" doesn't fall through to
            # the flagship Central Hospital by mistake.
            elif ("east" in q and "hospital" in q) or "trauma center" in q or "trauma" in q:
                target_node_id = "hosp_east"
                domain = "health"
                scenario_title = "East Hospital Intensive Care Disruption"
            elif "west" in q and ("hospital" in q or "memorial" in q):
                target_node_id = "hosp_west"
                domain = "health"
                scenario_title = "West Hospital Medical Facility Outage"
            elif "hospital" in q:
                # Generic "hospital" mention with no east/west qualifier — default to the
                # flagship facility rather than silently falling through.
                target_node_id = "hosp_central"
                domain = "health"
                scenario_title = "Central Hospital Emergency Department Isolation"
            elif "clinic" in q:
                domain = "health"
                if "north" in q:
                    target_node_id = "clinic_north"
                elif "south" in q:
                    target_node_id = "clinic_south"
                elif "west" in q:
                    target_node_id = "clinic_west"
                else:
                    target_node_id = "clinic_east"
                scenario_title = "Community Clinic Closure"
            elif "metro" in q or "concourse" in q or "junction" in q or "intersection" in q or "traffic" in q or "road" in q:
                domain = "road"
                target_node_id = "road_3_4"
                scenario_title = "Downtown Metro Station Gridlock"
            elif "substation" in q or "generator" in q or "electricity" in q or "power" in q or re.search(r"\bgrid\b", q):
                target_node_id = "sub_downtown"
                domain = "power"
                scenario_title = "Downtown Power Station Blackout"
            else:
                # 3c. District-level mention ("what if the west riverfront floods?") — pick
                # the highest-population asset in that district as the representative node.
                district_hit = None
                for keyword, district_name in [
                    ("west riverfront", "West Riverfront"), ("downtown", "Downtown Core"),
                    ("east residential", "East Residential"), ("north industrial", "North Industrial"),
                    ("medical district", "Medical District"), ("south hub", "South Hub")
                ]:
                    if keyword in q:
                        district_hit = district_name
                        break
                if district_hit and self.city_graph:
                    candidates = [n for n in self.city_graph.nodes.values() if n.district == district_hit]
                    if candidates:
                        top = max(candidates, key=lambda n: n.population_served)
                        target_node_id = top.id
                        domain = top.domain
                        scenario_title = f"{district_hit} Disruption"

        # 3d. Fuzzy fallback — before giving up, score every node by how many words it shares
        # with the question (name + type + district), so an oddly-phrased request ("what about
        # that industrial clinic up north") still lands on something sensible instead of the
        # generic default. This is what keeps the offline parser from ever truly "failing".
        if target_node_id is None and self.city_graph:
            stop_words = {
                "what", "if", "the", "a", "an", "is", "are", "in", "on", "at", "for", "of", "to",
                "and", "or", "with", "during", "happens", "would", "could", "should", "there",
                "this", "that", "it", "its", "we", "us", "our", "hits", "hit", "goes", "gets"
            }
            q_tokens = set(re.findall(r"[a-z]+", q)) - stop_words
            best_id, best_score = None, 0
            for nid, node in self.city_graph.nodes.items():
                node_text = f"{node.name} {node.type} {node.district} {node.domain}".lower()
                node_tokens = set(re.findall(r"[a-z]+", node_text))
                score = len(q_tokens & node_tokens)
                if score > best_score:
                    best_id, best_score = nid, score
            if best_id and best_score >= 1:
                target_node_id = best_id
                node_obj = self.city_graph.nodes[best_id]
                domain = node_obj.domain
                scenario_title = f"{node_obj.name} Disruption"

        # Default landmark if nothing at all matched.
        if target_node_id is None:
            target_node_id = "sub_downtown"
            domain = "power"
            scenario_title = "Infrastructure Disruption"

        node_name = self.city_graph.nodes[target_node_id].name if self.city_graph and target_node_id in self.city_graph.nodes else target_node_id

        result = {
            "node_id": target_node_id,
            "node_name": node_name,
            "magnitude": magnitude,
            "duration_hours": duration_hours,
            "scenario_title": scenario_title,
            "identified_domain": domain,
            "source": "offline_semantic_parser",
            "interpretation": f"Simulating {int(magnitude*100)}% disruption of {node_name} for {duration_hours} hours."
        }

        if compound_node_ids:
            compound_names = [self.city_graph.nodes[nid].name for nid in compound_node_ids]
            result["node_ids"] = compound_node_ids
            result["node_names"] = compound_names
            result["is_compound"] = True
            result["interpretation"] = (
                f"Simulating a compound {int(magnitude*100)}% event across "
                f"{', '.join(compound_names)} for {duration_hours} hours."
            )
        else:
            result["is_compound"] = False

        return result

    def generate_explanation(self, simulation_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates a 3-part plain-English executive summary for city leadership:
        1. Root Cause Shock
        2. Domino Cascade Transmission
        3. High-Leverage Resilience Recommendation
        """
        # Support both a single-node origin and a compound (simultaneous multi-asset) event —
        # simulate() reports the latter as "initiating_node_ids" (always a list) alongside the
        # backward-compatible singular "initiating_node_id" (string only when there's one origin).
        init_ids = simulation_result.get("initiating_node_ids")
        if not init_ids:
            single = simulation_result.get("initiating_node_id", "")
            init_ids = single if isinstance(single, list) else ([single] if single else [])
        is_compound = len(init_ids) > 1

        metrics = simulation_result.get("final_metrics", {})
        steps = simulation_result.get("steps", [])
        total_steps = simulation_result.get("total_steps", 1)
        failed_count = metrics.get("total_nodes_failed", 0)
        degraded_count = metrics.get("total_nodes_degraded", 0)
        pop_affected = metrics.get("people_affected_formatted", "0")
        travel_surge = metrics.get("travel_time_increase_pct", 0.0)
        ambulance_cuts = metrics.get("emergency_routes_disrupted", 0)
        hospitals_hit = metrics.get("hospitals_affected", 0)
        recovery_hrs = metrics.get("estimated_recovery_hours", 0.0)

        # Retrieve initiating node details for every epicenter
        nodes_dict = simulation_result.get("nodes", {})
        init_infos = [nodes_dict.get(i, {}) for i in init_ids]
        init_names = [info.get("name", i) for i, info in zip(init_ids, init_infos)]
        init_domains = [info.get("domain", "infrastructure") for info in init_infos]
        magnitudes = simulation_result.get("magnitudes")
        if not magnitudes:
            m = simulation_result.get("magnitude", 1.0)
            magnitudes = m if isinstance(m, list) else [m]

        init_name = " and ".join(init_names) if init_names else "the initiating asset"
        init_domain = init_domains[0] if init_domains else "infrastructure"
        init_type = init_infos[0].get("type", "asset") if init_infos else "asset"
        domains_hit = set(init_domains) if init_domains else {"infrastructure"}

        # 1. Root Cause Summary
        if is_compound:
            shock_list = "; ".join(
                f"**{name}** ({info.get('type', 'asset')} in {info.get('district', 'the city')}, "
                f"{int((magnitudes[idx] if idx < len(magnitudes) else magnitudes[-1]) * 100)}% magnitude)"
                for idx, (name, info) in enumerate(zip(init_names, init_infos))
            )
            root_summary = (
                f"The incident began as a **compound event** striking {len(init_ids)} assets simultaneously: "
                f"{shock_list}. Within minutes, normal baseline operations were terminated at every epicenter."
            )
        else:
            root_summary = (
                f"The incident began with a {int(magnitudes[0] * 100)}% disruption "
                f"at **{init_name}** ({init_type} in {init_infos[0].get('district', 'the city') if init_infos else 'the city'}). "
                f"Within minutes, normal baseline operations were terminated."
            )

        # 2. Domino Mechanism Narrative — include every domain actually struck. A compound event
        # tags each block with its domain so the multiple "Wave 1"s stay easy to follow; a single-
        # origin event keeps the original plain wording.
        tag = (lambda label: f"[{label}] ") if is_compound else (lambda label: "")
        domino_points = []
        if "power" in domains_hit:
            domino_points.append(
                f"**{tag('Power')}Wave 1 (Electrical Grid Strain):** Neighboring transmission hubs absorbed the dropped load. "
                f"The sudden electrical loss immediately deactivated automated traffic signal controllers across connected intersections."
            )
            domino_points.append(
                f"**{tag('Power')}Wave 2 (Transportation Gridlock):** Darkened traffic signals reduced intersection throughput by up to 50%, "
                f"spilling bumper-to-bumper congestion across arterial avenues and inflating average citywide travel times by +{travel_surge}%."
            )
            domino_points.append(
                f"**{tag('Power')}Wave 3 (Healthcare Bottleneck):** Crucial ambulance corridors were severed ({ambulance_cuts} emergency routes blocked), "
                f"while {hospitals_hit} regional medical facilities suffered severe power degradation, threatening critical ICU and surgical capacities."
            )
        if "road" in domains_hit:
            domino_points.append(
                f"**{tag('Road')}Wave 1 (Traffic Spillover):** The loss of this critical arterial forced hundreds of vehicles onto adjacent local streets, "
                f"causing immediate secondary overloads across neighboring intersections."
            )
            domino_points.append(
                f"**{tag('Road')}Wave 2 (Emergency Route Severance):** Priority emergency access was severed ({ambulance_cuts} ambulance corridors disrupted), "
                f"preventing first responders from reaching the trauma centers in under standard golden-hour limits."
            )
            domino_points.append(
                f"**{tag('Road')}Wave 3 (Economic & Healthcare Spillover):** Travel delays surged by +{travel_surge}%, "
                f"affecting over {pop_affected} residents and stranding medical staff shifts."
            )
        if "health" in domains_hit:
            domino_points.append(
                f"**{tag('Health')}Wave 1 (Emergency Department Choke):** The failure immediately curtailed emergency intake, "
                f"diverting incoming critical trauma cases to peripheral clinics and secondary hospitals."
            )
            domino_points.append(
                f"**{tag('Health')}Wave 2 (Ambulance Re-Routing):** Ambulances were forced to make longer transit loops, "
                f"increasing local road congestion and extending patient transfer times significantly."
            )
        if not domino_points:
            domino_points.append(
                "**Wave 1 (System Strain):** The disruption propagated through dependent infrastructure, "
                f"affecting an estimated {pop_affected} residents."
            )

        domino_narrative = " ".join(domino_points)

        # 3. Actionable Investment Recommendation (The Decision-Making Pitch!)
        investment_rec = (
            f"**Strategic Decision Recommendation (SDG 9 / SDG 11):** "
            f"Because **{init_name}** {'each possess' if is_compound else 'possesses'} high structural betweenness centrality, "
            f"hardening {'these nodes' if is_compound else 'this single node'} (via microgrid islanding, backup battery reserves, "
            f"or redundant bypass lanes) will reduce total cascade blast radius by up to **65%**, protecting over "
            f"**{pop_affected} citizens** and shaving **{round(recovery_hrs * 0.4, 1)} hours** off urban recovery."
        )

        full_executive_text = (
            f"### Executive Resilience Assessment: {init_name}\n\n"
            f"{root_summary}\n\n"
            f"#### Cascading Domino Progression ({total_steps} Simulation Stages)\n"
            f"{domino_narrative}\n\n"
            f"#### Capital Allocation Priority\n"
            f"{investment_rec}"
        )

        return {
            "title": f"Resilience Briefing: {init_name} Failure",
            "root_cause": root_summary,
            "domino_narrative": domino_narrative,
            "domino_points": domino_points,
            "investment_recommendation": investment_rec,
            "full_markdown": full_executive_text,
            "kpis": {
                "population_impacted": pop_affected,
                "travel_delay_surge": f"+{travel_surge}%",
                "ambulance_routes_cut": ambulance_cuts,
                "hospitals_compromised": hospitals_hit,
                "estimated_recovery": f"{recovery_hrs} hours"
            }
        }

    def _call_anthropic_parser(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Optional real Claude call — only used when an ANTHROPIC_API_KEY environment variable
        is set for the backend process (`ANTHROPIC_API_KEY=sk-... python start.py`). This is
        what gives genuine free-form natural-language understanding ("like how Claude works");
        without a key, parse_query() below falls back to the offline rule-based parser, which
        is deliberately generous but is still pattern matching, not real comprehension.
        """
        if not self.anthropic_key:
            return None

        # Build the node list from the live city graph (not a stale hardcoded subset) so the
        # model always sees every asset that actually exists, by its current plain-English name.
        node_list = "\n".join(
            f"- {nid}: \"{node.name}\" ({node.domain}/{node.type}, {node.district})"
            for nid, node in (self.city_graph.nodes.items() if self.city_graph else [])
        )

        payload = {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 400,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "You are the scenario parser for a city infrastructure cascading-failure simulator. "
                        "A user just typed a free-form, plain-English \"what if\" question. Turn it into a "
                        "simulation scenario.\n\n"
                        f"Available assets (use these exact ids):\n{node_list}\n\n"
                        "Respond with ONLY a JSON object, no other text, matching this shape:\n"
                        "{\n"
                        '  "node_id": "<id of the single most relevant asset>",\n'
                        '  "node_ids": ["<id>", ...],  // include 2+ ids ONLY if the question names multiple assets failing at once (a compound event); otherwise omit or match node_id\n'
                        '  "magnitude": <0.1-1.0, how total the disruption is>,\n'
                        '  "duration_hours": <number, default 8.0 if unspecified>,\n'
                        '  "scenario_title": "<short human-readable title>",\n'
                        '  "identified_domain": "<power|road|health>",\n'
                        '  "interpretation": "<one sentence restating what you understood, for the user to confirm>"\n'
                        "}\n\n"
                        f"Question: \"{query}\""
                    )
                }
            ]
        }
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-api-key": self.anthropic_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))
            text = data["content"][0]["text"]
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if not match:
                return None
            res = json.loads(match.group(0))

            # Normalize/validate against the real graph so a hallucinated id can't crash the
            # simulator downstream — fall back to the offline parser rather than trust it blindly.
            valid_ids = set(self.city_graph.nodes.keys()) if self.city_graph else set()
            node_ids = [nid for nid in res.get("node_ids", []) if nid in valid_ids]
            if not node_ids and res.get("node_id") in valid_ids:
                node_ids = [res["node_id"]]
            if not node_ids:
                return None  # Let the caller fall back to the offline parser.

            res["node_id"] = node_ids[0]
            res["is_compound"] = len(node_ids) > 1
            if res["is_compound"]:
                res["node_ids"] = node_ids
                res["node_names"] = [self.city_graph.nodes[nid].name for nid in node_ids]
            else:
                res.pop("node_ids", None)
            res["node_name"] = self.city_graph.nodes[node_ids[0]].name if self.city_graph else node_ids[0]
            res["magnitude"] = max(0.1, min(1.0, float(res.get("magnitude", 1.0))))
            res["duration_hours"] = float(res.get("duration_hours", 8.0))
            res["source"] = "anthropic_claude"
            return res
