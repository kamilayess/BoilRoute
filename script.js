const locations = {
  walc: [40.4275, -86.9137],
  stewart: [40.4250, -86.9139],
  pmu: [40.4248, -86.9117],
  armstrong: [40.4313, -86.9146]
};

const indoorConnections = {
  "stewart-pmu": {
    title: "Stewart Center → Purdue Memorial Union",
    type: "Indoor connection",
    description:
      "An indoor connection exists between Stewart Center " +
      "and Purdue Memorial Union. Follow the building signs " +
      "toward Purdue Memorial Union.",
    accessibilityVerified: false,
    exactRouteMapped: false
  }
};

function getIndoorConnection(start, end) {
  const pair = [start, end].sort().join("-");

  if (pair === "pmu-stewart") {
    return indoorConnections["stewart-pmu"];
  }

  return null;
}

const map = L.map("map", {
  center: [40.427, -86.917],
  zoom: 16,
  scrollWheelZoom: false
});

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const $ = id => document.getElementById(id);
const observations = L.layerGroup().addTo(map);

let preview = null;
let selectedHazardLocation = null;
const storageKey = "boileraccess_unverified_reports_v2";

function getReports() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}


function addObservation(report) {
  const status = report.status || "pending";

  const colors = {
    pending: "#e0a54f",
    verified: "#2e9d69",
    rejected: "#888888",
    resolved: "#5799d8"
  };

  const marker = L.circleMarker(
    [report.lat, report.lng],
    {
      radius: 9,
      color: "#ffffff",
      weight: 2,
      fillColor: colors[status] || colors.pending,
      fillOpacity: 0.95
    }
  ).addTo(observations);

  const popup = document.createElement("div");

  const heading = document.createElement("strong");
  heading.textContent = report.type;

  const statusText = document.createElement("p");
  statusText.textContent =
    "Status: " +
    (status === "verified"
      ? "Verified by prototype moderator"
      : status === "resolved"
      ? "Marked resolved"
      : status === "rejected"
      ? "Rejected"
      : "Pending review");

  const description = document.createElement("p");
  description.textContent =
    report.description || "Community observation";

  popup.append(heading, statusText, description);

  if (
    typeof report.photo === "string" &&
    /^data:image\/(jpeg|png|webp);base64,/.test(report.photo)
  ) {
    const image = document.createElement("img");

    image.src = report.photo;
    image.alt = "Photo submitted with hazard report";
    image.style.maxWidth = "220px";
    image.style.width = "100%";
    image.style.borderRadius = "6px";

    popup.appendChild(image);
  }

  const warning = document.createElement("p");
  warning.textContent =
    "Community report. Not officially verified by Purdue.";

  popup.appendChild(warning);
  marker.bindPopup(popup);
}


getReports().forEach(addObservation);

$("hazards").addEventListener("change", () => {
  if ($("hazards").checked) observations.addTo(map);
  else map.removeLayer(observations);
});

$("themeButton").addEventListener("click", () => {
  const enabled = $("map").classList.toggle("night-map");
  $("themeButton").setAttribute("aria-pressed", String(enabled));
  $("themeButton").textContent = enabled
    ? "☀ Day view"
    : "☾ Night view";
});

const WALKING_ENDPOINT =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving/";

let routeRequest = null;
let routeAlternatives = [];
let activeRouteIndex = 0;

const routeOptions = $("routeOptions");
const routeDetails = $("routeDetails");

function clearRoutes() {
  if (preview) map.removeLayer(preview);
  preview = null;
  routeAlternatives = [];
  routeOptions.hidden = true;
  routeOptions.replaceChildren();
  routeDetails.textContent = "";
}

function showRoute(index) {
  const route = routeAlternatives[index];
  if (!route) return;
  window.BoilerVoice?.setRoute(route);
  window.BoilLive?.setRoute(route);

  activeRouteIndex = index;

  const points = route.geometry.coordinates.map(
    ([lon, lat]) => [lat, lon]
  );

  const group = L.layerGroup();

  const line = L.polyline(points, {
    color: "#d0a34b",
    weight: 6,
    opacity: 0.95
  }).addTo(group);

  L.circleMarker(points[0], {
    radius: 7,
    color: "#fff",
    fillColor: "#16856a",
    fillOpacity: 1
  }).bindPopup("Approximate route start").addTo(group);

  L.circleMarker(points[points.length - 1], {
    radius: 7,
    color: "#fff",
    fillColor: "#b77a16",
    fillOpacity: 1
  }).bindPopup("Approximate route end").addTo(group);

  if (preview) map.removeLayer(preview);
  preview = group.addTo(map);

  map.fitBounds(line.getBounds(), {
    padding: [50, 50]
  });

  [...routeOptions.querySelectorAll("button")].forEach(
    (button, i) => {
      const active = i === index;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("selected", active);
    }
  );

  describeOsmNearRoute();

  routeDetails.textContent =
    `Selected route: ${Math.round(route.distance)} m · ` +
    `about ${Math.max(1, Math.round(route.duration / 60))} min. ` +
    "Foot routing only. Stairs, curb ramps, slopes, lighting " +
    "and entrance access have NOT been verified.";
}


$("planRouteButton").addEventListener("click", async () => {
  const a = $("startPoint").value;
  const b = $("endPoint").value;

  clearRoutes();

  document.getElementById("indoor-route-notice")?.remove();

if (!a || !b || a === b) {
  $("routeMessage").textContent =
    "Choose a starting point and a different destination.";
  return;
}

  if (
    $("wheelchair").checked ||
    $("slopes").checked ||
    $("lighting").checked
  ) {
    $("routeMessage").textContent =
      "Wheelchair accessibility, slopes and lighting " +
      "are not yet verified. Disable these preferences " +
      "to preview an experimental walking route.";
    return;
  }

  const button = $("planRouteButton");
  button.disabled = true;

  $("routeMessage").textContent =
    "Calculating route using BoilRoute network...";

 
  const oldNotice = document.getElementById("indoor-route-notice");

  if (oldNotice) {
    oldNotice.remove();
  }

  const indoorConnection = getIndoorConnection(a, b);

  if (indoorConnection) {
    const notice = document.createElement("div");

    notice.id = "indoor-route-notice";

    notice.style.cssText = `
      margin: 16px 0;
      padding: 16px;
      border: 1px solid #c9b58b;
      border-radius: 12px;
      background: #292820;
      color: #f5ead1;
      line-height: 1.6;
    `;

    notice.textContent =
      "🏛️ Indoor connection available: Stewart Center ↔ PMU. " +
      "Follow building signs. Exact indoor directions " +
      "and accessibility are not verified.";

    $("routeMessage").insertAdjacentElement("afterend", notice);
  }


 try {
    if (
      !window.BoilerRouting ||
      typeof BoilerRouting.buildGraph !== "function" ||
      typeof BoilerRouting.findRoute !== "function"
    ) {
      throw new Error("BoilerRouting is not loaded");
    }

    if (!BoilerRouting.graph?.size) {
      await BoilerRouting.buildGraph();
    }

   let startCoordinates;

if (a === "current") {
  $("routeMessage").textContent =
    "Getting your current GPS location...";

  startCoordinates = await window.BoilGPS.getPosition();

  window.BoilGPS.startTracking();

  const gps = window.BoilGPS.getLastPosition();

  if (gps.accuracy > 50) {
    throw new Error(
      `GPS accuracy is approximately ${Math.round(gps.accuracy)} m. ` +
      "Try again outdoors for a more accurate route."
    );
  }
} else {
  startCoordinates = [
    locations[a][1],
    locations[a][0]
  ];
}

$("routeMessage").textContent =
  "Calculating pedestrian route...";

const results = await BoilerRouting.findAlternatives(
  startCoordinates,
  [locations[b][1], locations[b][0]],
  {
    avoidStairs: $("stairs").checked
  }
);

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error("No routes found");
    }

    routeAlternatives = results.map((result) => ({
      ...result,
      duration: result.duration ?? result.distance / 1.35,
      nearbyStairs: countNearbyStairs(result)
    }));

    routeOptions.replaceChildren();

    routeAlternatives.forEach((route, index) => {
      const option = document.createElement("button");

      option.type = "button";
      option.className = "route-option";

      const name = route.label ||
        (index === 0 ? "Shortest route" : `Alternative ${index + 1}`);

      option.textContent =
        `${name} · ${Math.round(route.distance)} m · ` +
        `~${Math.max(1, Math.round(route.duration / 60))} min`;

      option.addEventListener("click", () => {
        showRoute(index);
      });

      routeOptions.appendChild(option);
    });

    routeOptions.hidden = false;
    showRoute(0);

    $("routeMessage").textContent =
      "Route calculated using BoilRoute's own " +
      "pedestrian network. Accessibility is not verified.";

  } catch (error) {
    console.error("BoilRoute routing error:", error);

    $("routeMessage").textContent =
      "Routing failed: " + error.message;
  } finally {
    button.disabled = false;
  }
});


$("reportButton").addEventListener("click", () => {
  const opening = $("hazardForm").hidden;
  $("hazardForm").hidden = !opening;
  $("reportButton").setAttribute(
    "aria-expanded", String(opening)
  );
});

map.on("click", e => {
  if ($("hazardForm").hidden) return;

  selectedHazardLocation = e.latlng;

  $("hazardLocation").textContent =
    `Selected: ${e.latlng.lat.toFixed(5)}, ` +
    e.latlng.lng.toFixed(5);
});


async function compressHazardPhoto(file) {
  const image = await createImageBitmap(file);

  try {
    const maxDimension = 1000;
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.width, image.height)
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext("2d");
    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL("image/jpeg", 0.65);
  } finally {
    image.close();
  }
}

$("submitHazard").addEventListener("click", async () => {
  const locationMessage = $("hazardLocation");
  const photoInput = $("hazardPhoto");
  const photoStatus = $("hazardPhotoStatus");
  const submitButton = $("submitHazard");

  if (!selectedHazardLocation) {
    locationMessage.textContent =
      "Select a point on the map first.";
    return;
  }

  const description = $("hazardDescription").value.trim();

  if (!description) {
    locationMessage.textContent =
      "Please describe the hazard.";
    return;
  }

  const file = photoInput.files[0];
  let photo = null;

  if (file) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(file.type)) {
      photoStatus.textContent =
        "Please select a JPG, PNG or WebP image.";
      return;
    }

    

    try {
      photo = await compressHazardPhoto(file);
    } catch (error) {
      photoStatus.textContent = error.message;
      return;
    }
  }

  const report = {
    id: crypto.randomUUID(),
    type: $("hazardType").value,
    description,
    lat: selectedHazardLocation.lat,
    lng: selectedHazardLocation.lng,
    photo,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  submitButton.disabled = true;

  try {
    const reports = getReports();
    reports.push(report);

    localStorage.setItem(
      storageKey,
      JSON.stringify(reports)
    );

    addObservation(report);

    $("hazards").checked = true;
    observations.addTo(map);

    $("hazardDescription").value = "";
    photoInput.value = "";
    photoStatus.textContent = "";

    selectedHazardLocation = null;
    locationMessage.textContent =
      "Click a location on the map";

    $("hazardForm").hidden = true;
    $("reportButton").setAttribute(
      "aria-expanded", "false"
    );

    $("routeMessage").textContent =
      "Report saved locally. Status: Pending review.";

  } catch (error) {
    photoStatus.textContent =
      "Could not save report. Browser storage may be full.";
    console.error(error);
  } finally {
    submitButton.disabled = false;
  }
});


const osmLayers = {
  steps: L.layerGroup(),
  kerbs: L.layerGroup(),
  lighting: L.layerGroup()
};

const osmElements = {
  steps: [],
  kerbs: [],
  lighting: []
};

let osmLoaded = false;

function osmPoint(el) {
  if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
    return [el.lat, el.lon];
  }

  if (Array.isArray(el.geometry) && el.geometry.length) {
    const mid = el.geometry[Math.floor(el.geometry.length / 2)];
    if (Number.isFinite(mid.lat) && Number.isFinite(mid.lon)) {
      return [mid.lat, mid.lon];
    }
  }

  return null;
}

function popupFor(el, kind) {
  const box = document.createElement("div");
  const title = document.createElement("strong");

  title.textContent = kind + " · OpenStreetMap";
  box.append(title);

  const keys = [
    "highway", "kerb", "wheelchair", "ramp",
    "ramp:wheelchair", "lit", "surface",
    "incline", "step_count"
  ];

  for (const key of keys) {
    if (el.tags?.[key] !== undefined) {
      const p = document.createElement("p");
      p.textContent = key + ": " + String(el.tags[key]);
      p.style.margin = "4px 0";
      box.append(p);
    }
  }

  const foot = document.createElement("small");
  foot.textContent =
    "Community-mapped; not independently verified";
  box.append(foot);

  return box;
}

function refreshOsmLayers() {
  for (const [kind, id] of [
    ["steps", "showSteps"],
    ["kerbs", "showKerbs"],
    ["lighting", "showLighting"]
  ]) {
    if ($(id).checked && osmLoaded) {
      osmLayers[kind].addTo(map);
    } else {
      map.removeLayer(osmLayers[kind]);
    }
  }
}

for (const id of ["showSteps", "showKerbs", "showLighting"]) {
  $(id).addEventListener("change", refreshOsmLayers);
}



function countNearbyStairs(route, threshold = 12) {
  if (!osmLoaded || !route?.geometry?.coordinates) {
    return null;
  }

  const originLat = 40.427 * Math.PI / 180;

  function toMeters(lon, lat) {
    return [
      lon * 111320 * Math.cos(originLat),
      lat * 111320
    ];
  }

  function pointSegmentDistance(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      return Math.hypot(p[0] - a[0], p[1] - a[1]);
    }

    const t = Math.max(0, Math.min(1,
      ((p[0] - a[0]) * dx +
        (p[1] - a[1]) * dy) / len2
    ));

    return Math.hypot(
      p[0] - a[0] - t * dx,
      p[1] - a[1] - t * dy
    );
  }

  const routePoints = route.geometry.coordinates.map(
    ([lon, lat]) => toMeters(lon, lat)
  );

  let count = 0;

  for (const stair of osmElements.steps) {
    const coordinates = stair.geometry?.length
      ? stair.geometry.map(p => [p.lon, p.lat])
      : Number.isFinite(stair.lon) && Number.isFinite(stair.lat)
        ? [[stair.lon, stair.lat]]
        : [];

    if (!coordinates.length) continue;

    const stairPoints = coordinates.map(
      ([lon, lat]) => toMeters(lon, lat)
    );

    let nearby = false;

    // Check stair points against route segments.
    for (const point of stairPoints) {
      for (let i = 0; i < routePoints.length - 1; i++) {
        if (pointSegmentDistance(
          point, routePoints[i], routePoints[i + 1]
        ) <= threshold) {
          nearby = true;
          break;
        }
      }
      if (nearby) break;
    }

    // Also check route points against stair segments.
    if (!nearby && stairPoints.length > 1) {
      for (const point of routePoints) {
        for (let i = 0; i < stairPoints.length - 1; i++) {
          if (pointSegmentDistance(
            point, stairPoints[i], stairPoints[i + 1]
          ) <= threshold) {
            nearby = true;
            break;
          }
        }
        if (nearby) break;
      }
    }

    if (nearby) count++;
  }

  return count;
}

function updateRouteStairLabels() {
  const buttons = routeOptions.querySelectorAll("button");

  routeAlternatives.forEach((route, index) => {
    const button = buttons[index];
    if (!button) return;

    const name = index === 0
      ? "Shortest available"
      : `Alternative ${index + 1}`;

    const distance = Math.round(route.distance);
    const minutes = Math.max(1, Math.round(route.duration / 60));
    const count = countNearbyStairs(route);

    button.textContent =
      `${name} · ${distance} m · ~${minutes} min` +
      (count === null
        ? " · Stairs: unknown"
        : ` · ${count} stair objects nearby`);
  });
}

function describeOsmNearRoute() {
  const output = $("osmRouteReport");

  updateRouteStairLabels();

  if (!routeAlternatives.length) {
    output.textContent = "";
    return;
  }

  const count = countNearbyStairs(
    routeAlternatives[activeRouteIndex]
  );

  output.textContent = count === null
    ? "Stair data unavailable for route screening."
    : `${count} mapped stair objects within approximately ` +
    `12 m of the selected route. This is a proximity ` +
    `screening, NOT proof that the route uses stairs ` +
    `or is wheelchair accessible.`;
}

// Small campus study area
const osmStudyBounds = [
  40.4235, -86.9205, 40.4305, -86.9100
];

const osmStudyQuery =
  `[out:json][timeout:35];(` +
  `way["highway"="steps"](${osmStudyBounds.join(",")});` +
  `node["barrier"="kerb"](${osmStudyBounds.join(",")});` +
  `node["kerb"](${osmStudyBounds.join(",")});` +
  `way["highway"~"^(footway|path|pedestrian)$"]["lit"]` +
  `(${osmStudyBounds.join(",")});` +
  `);out geom;`;

const osmCacheKey = "boileraccess_osm_study_v3";
const osmCacheMaxAge = 7 * 24 * 60 * 60 * 1000;

const osmServers = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

function applyOsmData(data, source) {
  if (!Array.isArray(data.elements)) {
    throw new Error("Unexpected OSM response");
  }

  for (const kind of Object.keys(osmLayers)) {
    osmLayers[kind].clearLayers();
    osmElements[kind] = [];
  }

  for (const el of data.elements) {
    const tags = el.tags || {};
    let kind;

    if (tags.highway === "steps") {
      kind = "steps";
    } else if (tags.barrier === "kerb" || tags.kerb) {
      kind = "kerbs";
    } else if (tags.lit !== undefined) {
      kind = "lighting";
    } else {
      continue;
    }

    const point = osmPoint(el);
    if (!point) continue;

    osmElements[kind].push(el);

    const color = kind === "steps"
      ? "#c73333"
      : kind === "kerbs"
        ? "#f59e0b"
        : tags.lit === "yes"
          ? "#2574db"
          : "#64748b";

    const layer =
      kind === "lighting" && el.geometry?.length > 1
        ? L.polyline(
          el.geometry.map(p => [p.lat, p.lon]),
          { color, weight: 4, opacity: 0.85 }
        )
        : L.circleMarker(point, {
          radius: kind === "kerbs" ? 5 : 7,
          color: "#fff",
          weight: 1,
          fillColor: color,
          fillOpacity: 0.9
        });

    layer.bindPopup(popupFor(el, kind));
    layer.addTo(osmLayers[kind]);
  }

  osmLoaded = true;
  refreshOsmLayers();
  describeOsmNearRoute();

  $("osmStatus").textContent =
    `Loaded ${osmElements.steps.length} mapped stairways, ` +
    `${osmElements.kerbs.length} curb features, ` +
    `${osmElements.lighting.length} paths with lighting tags. ` +
    `${source}. Missing tags mean UNKNOWN, not safe or accessible.`;
}

async function fetchOsmFrom(server) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(server, {
      method: "POST",
      body: new URLSearchParams({ data: osmStudyQuery }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const data = await response.json();

    if (!Array.isArray(data.elements)) {
      throw new Error("Invalid response");
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Optional local GeoJSON dataset
async function loadBundledOsm() {
  const response = await fetch("./campus-data.geojson", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      "Local dataset not installed (HTTP " + response.status + ")"
    );
  }

  const geojson = await response.json();

  if (
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    throw new Error("Invalid GeoJSON FeatureCollection");
  }

  if (!geojson.features.length) {
    throw new Error("Local dataset has no mapped features");
  }

  const elements = [];

  for (const f of geojson.features) {
    const tags = f.properties?.tags || f.properties || {};
    const g = f.geometry;
    if (!g) continue;

    if (
      g.type === "Point" &&
      Array.isArray(g.coordinates)
    ) {
      const [lon, lat] = g.coordinates;

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        elements.push({
          type: "node", lat, lon, tags
        });
      }
    } else if (
      g.type === "LineString" &&
      Array.isArray(g.coordinates)
    ) {
      const geometry = g.coordinates
        .filter(p =>
          Array.isArray(p) &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1])
        )
        .map(([lon, lat]) => ({ lat, lon }));

      if (geometry.length >= 2) {
        elements.push({
          type: "way", geometry, tags
        });
      }
    }
  }

  if (!elements.length) {
    throw new Error("No supported Point/LineString features");
  }

  return { elements };
}

$("loadOsm").addEventListener("click", async () => {
  const btn = $("loadOsm");
  btn.disabled = true;

  try {
    // First: try a local dataset
    try {
      const bundled = await loadBundledOsm();

      applyOsmData(
        bundled,
        "Bundled campus-data.geojson (verify source and export date)"
      );
      return;
    } catch (localError) {
      // Continue with cache or Overpass
    }

    // Second: try previously cached data
    let cached = null;

    try {
      cached = JSON.parse(
        localStorage.getItem(osmCacheKey) || "null"
      );
    } catch { }

    if (
      cached &&
      Date.now() - cached.savedAt < osmCacheMaxAge &&
      Array.isArray(cached.data?.elements)
    ) {
      applyOsmData(
        cached.data,
        "Cached OpenStreetMap data, saved " +
        new Date(cached.savedAt).toLocaleDateString()
      );
      return;
    }

    // Third: try public Overpass servers
    let data = null;
    const errors = [];

    for (let i = 0; i < osmServers.length; i++) {
      $("osmStatus").textContent =
        `Loading OSM accessibility data ` +
        `(server ${i + 1}/${osmServers.length})…`;

      try {
        data = await fetchOsmFrom(osmServers[i]);
        break;
      } catch (error) {
        errors.push(
          `${i + 1}: ` +
          (error.name === "AbortError"
            ? "timed out"
            : error.message)
        );
      }
    }

    if (!data) {
      if (
        cached &&
        Array.isArray(cached.data?.elements)
      ) {
        applyOsmData(
          cached.data,
          "Older cached data; live servers unavailable"
        );
        return;
      }

      throw new Error(
        "All Overpass servers failed (" +
        errors.join("; ") + ")"
      );
    }

    try {
      localStorage.setItem(
        osmCacheKey,
        JSON.stringify({
          savedAt: Date.now(),
          data
        })
      );
    } catch { }

    applyOsmData(data, "Live OpenStreetMap data");

  } catch (error) {
    $("osmStatus").textContent =
      "Could not load OSM attributes: " +
      error.message +
      ". Walking routes still work. Retry later.";
  } finally {
    btn.disabled = false;
  }
});

window.addEventListener("load", () => {
  document.getElementById("loadOsm").click();
});