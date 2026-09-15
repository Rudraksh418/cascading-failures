# 🏛️ Architectural & Algorithmic Specification
## Cascading Failures: Multi-Domain Infrastructure Resilience Engine

---

## 1. Mathematical Data Model

The urban ecosystem is modeled as a directed, attributed multi-layer network:

$$\mathcal{G} = (\mathcal{V}, \mathcal{E}_{intra}, \mathcal{E}_{inter})$$

Where:
- $\mathcal{V} = \mathcal{V}_{power} \cup \mathcal{V}_{road} \cup \mathcal{V}_{health}$ is the partition of nodes across domains.
- $\mathcal{E}_{intra} \subseteq \bigcup_{d} (\mathcal{V}_d \times \mathcal{V}_d)$ are domain-specific physical links (power lines, street segments, ambulance corridors).
- $\mathcal{E}_{inter} \subseteq \bigcup_{d_1 \neq d_2} (\mathcal{V}_{d_1} \times \mathcal{V}_{d_2})$ are cross-domain dependency edges.

### Node State Vector
Each node $v \in \mathcal{V}$ is defined by:
$$v = \langle C(v), L_0(v), L(v), C_{eff}(v), P(v), S(v) \rangle$$
- $C(v) \in \mathbb{R}^+$: Maximum designed capacity.
- $L_0(v) \in \mathbb{R}^+$: Baseline operating load.
- $L(v) \in \mathbb{R}^+$: Dynamic redistributed load.
- $C_{eff}(v) \in \mathbb{R}^+$: Dynamic effective capacity under degradation.
- $P(v) \in \mathbb{N}$: Resident population dependent on this asset.
- $S(v) \in \{\text{OK}, \text{DEGRADED}, \text{FAILED}\}$: Operational state.

---

## 2. The Motter–Lai Load Redistribution Algorithm

When an initiating node $u$ fails at step $t$, its active load $L(u)$ cannot vanish; it is redistributed across its active immediate same-domain neighbors $\mathcal{N}_{same}(u)$:

$$\Delta L(v) = L(u) \cdot \frac{C_{eff}(v)}{\sum_{w \in \mathcal{N}_{same}(u)} C_{eff}(w)}$$

The new load at neighbor $v$ becomes:
$$L_{t+1}(v) = L_t(v) + \Delta L(v)$$

### Overload Failure Condition
A node $v$ transitions to the **FAILED** state if its dynamic load exceeds its capacity threshold:
$$L_{t+1}(v) > (1 + \alpha) \cdot C_{eff}(v)$$
Where $\alpha = 0.15$ is the operating reserve tolerance parameter ($115\%$ overload threshold).

---

## 3. Cross-Domain Dependency Degradation

Cross-domain interdependencies describe how failure in one system damages the operational integrity of another:

For any directed dependency edge $(u \rightarrow v) \in \mathcal{E}_{inter}$ with degrade factor $\gamma \in (0, 1)$:

$$C_{eff}(v) \leftarrow C_{eff}(v) \times \gamma$$

### State Transitions under Degradation:
- If $C_{eff}(v) < 0.45 \cdot L(v) \implies S(v) \leftarrow \text{FAILED}$
- Else if $C_{eff}(v) < 0.90 \cdot L(v) \implies S(v) \leftarrow \text{DEGRADED}$

This captures real phenomena:
1. **Loss of Electrical Grid** $\implies$ Automated traffic signal controllers power off $\implies$ Intersection capacity drops by $50\%$.
2. **Loss of Grid** $\implies$ Hospital shifts to emergency backup generators $\implies$ Elective surgeries cancelled, diagnostic imaging disabled, capacity drops to $45\%$.
3. **Loss of Central River Bridges** $\implies$ Ambulance ingress routes blocked $\implies$ Critical patient intake choked.

---

## 4. Brandes' Betweenness Centrality (Decision Optimization)

Betweenness centrality measures the fraction of all shortest paths passing through node $v$:

$$C_B(v) = \sum_{s \neq v \neq t} \frac{\sigma_{st}(v)}{\sigma_{st}}$$

We implement Brandes' $\mathcal{O}(|\mathcal{V}| \cdot |\mathcal{E}|)$ algorithm using pure Python standard library:
1. Breadth-First Search (BFS) computes single-source shortest path counts $\sigma_{sv}$ and distance tree $d(s, v)$ from each source $s$.
2. Accumulation phase traverses nodes in reverse topological order, accumulating pair dependencies $\delta_{s \bullet}(v)$:
   $$\delta_{s \bullet}(v) = \sum_{w: v \in P_s(w)} \frac{\sigma_{sv}}{\sigma_{sw}} (1 + \delta_{s \bullet}(w))$$
3. Centrality scores are normalized to $[0, 1]$ and ranked.

### Capital Investment Optimization
Nodes with the highest $C_B(v)$ represent the most severe **Single Points of Failure (SPOF)**.
Hardening node $v^*$ transforms its parameters:
$$C(v^*) \leftarrow 1.60 \cdot C(v^*)$$
$$\gamma_{(u \rightarrow v^*)} \leftarrow \min(0.90, \gamma + 0.35)$$
Re-running the simulation quantifies the exact delta in citizens protected and hours saved.

---

## 5. Convergence & Bounds Guarantee

Because:
1. The node set $\mathcal{V}$ is finite ($|\mathcal{V}| = 73$).
2. States progress monotonically from $\text{OK} \rightarrow \text{DEGRADED} \rightarrow \text{FAILED}$.
3. An explicit hard cap ($T_{max} = 20$) guards the propagation loop.

The simulation is guaranteed to reach mathematical equilibrium or terminate cleanly within $<25\text{ms}$ on standard hardware.
