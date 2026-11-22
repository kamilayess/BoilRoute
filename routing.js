
"use strict";

window.BoilerRouting = {
  graph: null,
  nodes: null,

  async inspectNetwork() {
    const response = await fetch("./walking-network.geojson");
    if (!response.ok) {
      throw new Error(`Network HTTP ${response.status}`);
    }

    const data = await response.json();

    const result = {
      totalFeatures: data.features.length,
      networkLoaded: true
    };

    console.table(result);
    return result;
  },

  distance(a, b) {
    const rad = Math.PI / 180;
    const lat1 = a[1] * rad;
    const lat2 = b[1] * rad;
    const dLat = (b[1] - a[1]) * rad;
    const dLon = (b[0] - a[0]) * rad;

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

    return 6371000 * 2 *
      Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  },

  async buildGraph() {
    const response = await fetch("./walking-network.geojson");

    if (!response.ok) {
      throw new Error(`Network HTTP ${response.status}`);
    }

    const data = await response.json();

    if (
      data.type !== "FeatureCollection" ||
      !Array.isArray(data.features)
    ) {
      throw new Error("Invalid walking network");
    }

    const graph = new Map();
    const nodes = new Map();

    const allowed = new Set([
      "footway", "path", "pedestrian",
      "living_street", "residential",
      "service", "steps"
    ]);

    const key = p => `${p[0]},${p[1]}`;

    function addEdge(a, b, properties, length) {
      const from = key(a);
      const to = key(b);

      if (from === to || length <= 0) return;

      nodes.set(from, a);
      nodes.set(to, b);

      if (!graph.has(from)) graph.set(from, []);
      if (!graph.has(to)) graph.set(to, []);

      const edge = {
        length,
        stairs: properties.highway === "steps",
        highway: properties.highway
      };

      const oneway = String(
        properties.oneway ?? ""
      ).toLowerCase();

      const forwardOnly = ["yes", "true", "1"]
        .includes(oneway);

      const reverseOnly = oneway === "-1";

      if (!reverseOnly) {
        graph.get(from).push({ ...edge, to });
      }

      if (!forwardOnly) {
        graph.get(to).push({ ...edge, to: from });
      }
    }

    for (const feature of data.features) {
      const p = feature.properties || {};
      const g = feature.geometry;

      if (!allowed.has(p.highway) || !g) continue;

      if (["no", "private"].includes(p.access) ||
          p.foot === "no" ||
          p.foot === "private") {
        continue;
      }

      const lines = g.type === "LineString"
        ? [g.coordinates]
        : g.type === "MultiLineString"
          ? g.coordinates
          : [];

      for (const line of lines) {
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1];
          const b = line[i];

          addEdge(a, b, p, this.distance(a, b));
        }
      }
    }

    this.graph = graph;
    this.nodes = nodes;

    const result = {
      graphNodes: graph.size,
      directedConnections: [...graph.values()]
        .reduce((sum, edges) => sum + edges.length, 0),
      readyForExperimentalRouting: true
    };

    console.table(result);
    return result;
  },

  nearestNode(point, maxDistance = 100) {
    let best = null;
    let bestDistance = Infinity;

    for (const [id, coords] of this.nodes) {
      const d = this.distance(point, coords);

      if (d < bestDistance) {
        bestDistance = d;
        best = id;
      }
    }

    if (bestDistance > maxDistance) {
      throw new Error(
        `Point is ${Math.round(bestDistance)} m ` +
        "from the network. Check its coordinates."
      );
    }

    return best;
  },

  async findRoute(start, end, options = {}) {
    if (!this.graph) {
      await this.buildGraph();
    }

    const source = this.nearestNode(start);
    const target = this.nearestNode(end);

    const avoidStairs = options.avoidStairs === true;

    const penalties = options.penalties || new Map();
    const penaltyFactor = options.penaltyFactor ?? 3;

    const distances = new Map([[source, 0]]);
    const previous = new Map();
    const visited = new Set();

    const heap = [];

    function push(id, cost) {
      heap.push({ id, cost });
      let i = heap.length - 1;

      while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (heap[parent].cost <= heap[i].cost) break;

        [heap[parent], heap[i]] =
          [heap[i], heap[parent]];

        i = parent;
      }
    }

    function pop() {
      const first = heap[0];
      const last = heap.pop();

      if (heap.length && last) {
        heap[0] = last;
        let i = 0;

        while (true) {
          const left = i * 2 + 1;
          const right = left + 1;
          let smallest = i;

          if (
            left < heap.length &&
            heap[left].cost < heap[smallest].cost
          ) smallest = left;

          if (
            right < heap.length &&
            heap[right].cost < heap[smallest].cost
          ) smallest = right;

          if (smallest === i) break;

          [heap[i], heap[smallest]] =
            [heap[smallest], heap[i]];

          i = smallest;
        }
      }

      return first;
    }

    push(source, 0);

    while (heap.length) {
      const current = pop();
      if (visited.has(current.id)) continue;

      visited.add(current.id);

      if (current.id === target) break;

      for (const edge of this.graph.get(current.id) || []) {
        if (avoidStairs && edge.stairs) continue;
        if (visited.has(edge.to)) continue;

        
        const segmentKey = [current.id, edge.to].sort().join("|");

        const penalty = penalties.has(segmentKey)
            ? penaltyFactor
            : 1;

        const cost = current.cost + edge.length * penalty;


        if (cost < (distances.get(edge.to) ?? Infinity)) {
          distances.set(edge.to, cost);
          previous.set(edge.to, {
            from: current.id,
            edge
          });
          push(edge.to, cost);
        }
      }
    }

    if (!distances.has(target)) {
      throw new Error(
        "No connected route found in the mapped network"
      );
    }

    const path = [];
    let cursor = target;
    let stairSegments = 0;
    let actualDistance = 0;
    const usedSegments = [];

    while (cursor !== source) {
      path.push(this.nodes.get(cursor));

      const step = previous.get(cursor);
      if (!step) throw new Error("Broken route");

      if (step.edge.stairs) stairSegments++;

        actualDistance += step.edge.length;

        usedSegments.push(
            [step.from, cursor].sort().join("|")
        );

      cursor = step.from;
    }

    path.push(this.nodes.get(source));
    path.reverse();

    const distance = actualDistance;

    return {
      geometry: {
        type: "LineString",
        coordinates: path
      },
      distance,
      duration: distance / 1.3,
      stairSegments,
      usedSegments,
      avoidStairs,
      verifiedAccessible: false,
      experimental: true
    };

  },

  
async findAlternatives(start, end, options = {}) {
  if (!this.graph) {
    await this.buildGraph();
  }

  const routes = [];
  const signatures = new Set();
  const penalties = new Map();

  const addRoute = (route, label) => {
    const signature = JSON.stringify(
      route.geometry.coordinates
    );

    if (signatures.has(signature)) return false;

    signatures.add(signature);
    routes.push({
      ...route,
      label
    });

    return true;
  };

const avoidStairs = options.avoidStairs === true;

const shortest = await this.findRoute(
  start,
  end,
  { ...options, avoidStairs }
);

  addRoute(
  shortest,
  avoidStairs
    ? "Shortest route avoiding mapped stairs"
    : "Shortest walking route"
);

  if (!avoidStairs) {
  try {
    const stairFree = await this.findRoute(
      start,
      end,
      { ...options, avoidStairs: true }
    );

    addRoute(stairFree, "Avoid mapped stairs");
  } catch (error) {
    console.warn(error.message);
  }
}
  for (const segment of shortest.usedSegments) {
    penalties.set(segment, true);
  }

  for (let attempt = 0; attempt < 6 && routes.length < 3; attempt++) {
    try {
      const alternative = await this.findRoute(
        start,
        end,
        {
          ...options,
          avoidStairs: options.avoidStairs === true,
          penalties,
          penaltyFactor: 2 + attempt
        }
      );

      const added = addRoute(
        alternative,
        `Alternative ${routes.length + 1}`
      );

      if (added) {
        for (const segment of alternative.usedSegments) {
          penalties.set(segment, true);
        }
      }
    } catch (error) {
      console.warn(error.message);
      break;
    }
  }

  console.table(routes.map(route => ({
    name: route.label,
    meters: Math.round(route.distance),
    minutes: Math.round(route.duration / 60),
    stairs: route.stairSegments
  })));

  return routes;
}

};

