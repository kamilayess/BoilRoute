
document.addEventListener("DOMContentLoaded", () => {
  const mapElement = document.getElementById("map");
  const sidebar = document.querySelector(".sidebar");

  if (!mapElement || !sidebar || typeof map === "undefined") {
    console.error("Emergency Safety: map not found.");
    return;
  }

  const style = document.createElement("style");
  style.textContent = `
    .emergency-panel {
      margin-top: 18px;
      padding: 20px;
      border: 1px solid #b99b68;
      border-radius: 12px;
      background: #22272b;
      color: #f4f0e8;
    }
    .emergency-panel h2 { margin: 0 0 12px; }
    .emergency-panel p { line-height: 1.5; }
    .emergency-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 14px 0;
    }
    .emergency-actions a {
      display: inline-block;
      padding: 11px 13px;
      border-radius: 8px;
      background: #d6bb8b;
      color: #17191e;
      font-weight: 700;
      text-decoration: none;
    }
    .emergency-actions .emergency-call {
      background: #c94d4d;
      color: white;
    }
    .emergency-panel label {
      display: flex;
      gap: 9px;
      align-items: center;
      margin: 12px 0;
    }
    .emergency-panel a:focus-visible,
    .emergency-panel input:focus-visible {
      outline: 3px solid white;
      outline-offset: 3px;
    }
    .emergency-pin {
      background: #f0c75e;
      border: 2px solid #272727;
      border-radius: 50%;
      width: 25px;
      height: 25px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
    }
  `;
  document.head.appendChild(style);

  const section = document.createElement("section");
  section.className = "emergency-panel";
  section.setAttribute("aria-label", "Emergency and safety");

  section.innerHTML = `
    <h2>🚨 Emergency & Safety</h2>
    <p>
      In immediate danger, call or text 911.
      Do not rely on this prototype for emergency navigation.
    </p>

    <div class="emergency-actions">
      <a class="emergency-call" href="tel:911"
         id="boilEmergencyCall">Call 911</a>
      <a href="tel:7654948221">Purdue Police</a>
      <a href="tel:7654947233">Safe Walk</a>
    </div>

    <label>
      <input type="checkbox" id="showEmergencyPhones">
      Show Emergency Phones
    </label>

    <p id="emergencyStatus" role="status" aria-live="polite">
      Emergency phone locations have not been loaded.
    </p>

    <p class="muted tiny">
      Map data must be compared with Purdue's official map.
      Locations and operational status are not field-verified.
    </p>

    <a href="https://www.purdue.edu/campus-map/graphics/campusmap.pdf"
       target="_blank" rel="noopener noreferrer">
       View Purdue's official emergency phone map
    </a>
  `;

  sidebar.appendChild(section);

  const callButton = document.getElementById("boilEmergencyCall");

  callButton.addEventListener("click", event => {
    if (!confirm("Open your phone to call 911?")) {
      event.preventDefault();
    }
  });

  const toggle = document.getElementById("showEmergencyPhones");
  const status = document.getElementById("emergencyStatus");

  const phoneLayer = L.layerGroup();
  let loaded = false;

  const serviceURL =
    "https://services5.arcgis.com/lQlymWSQoJ6CRYhh/" +
    "ArcGIS/rest/services/CampusBaseMap_Features/" +
    "FeatureServer/0/query";

  async function loadPhones() {
    status.textContent = "Loading emergency phone locations...";

    const params = new URLSearchParams({
      where: "1=1",
      outFields: "OBJECTID,Type,Building,Location,Notes",
      outSR: "4326",
      returnGeometry: "true",
      f: "geojson"
    });

    try {
      const response = await fetch(serviceURL + "?" + params);

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = await response.json();

      if (!Array.isArray(data.features)) {
        throw new Error("Invalid geographic data");
      }

      let count = 0;

      for (const feature of data.features) {
        if (feature.geometry?.type !== "Point") continue;

        const [lng, lat] = feature.geometry.coordinates;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          continue;
        }

        // West Lafayette Purdue campus vicinity.
        // This is a geographic filter, NOT verification.
        if (
          lat < 40.40 || lat > 40.46 ||
          lng < -86.95 || lng > -86.88
        ) continue;

        const properties = feature.properties || {};

        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: '<div class="emergency-pin">☎</div>',
            iconSize: [29, 29],
            iconAnchor: [14, 14]
          }),
          title: "Mapped emergency telephone"
        });

        const popup = document.createElement("div");

        const heading = document.createElement("strong");
        heading.textContent = "Mapped Emergency Phone";

        const description = document.createElement("p");
        description.textContent =
          [properties.Building, properties.Location]
            .filter(Boolean)
            .join(" — ") || "Location details unavailable";

        const warning = document.createElement("p");
        warning.textContent =
          "External map data. Location and operation " +
          "not verified by BoilRoute.";

        popup.append(heading, description, warning);
        marker.bindPopup(popup);
        marker.addTo(phoneLayer);
        count++;
      }

      if (count === 0) {
        throw new Error(
          "No phone locations found in the Purdue campus area."
        );
      }

      loaded = true;
      status.textContent =
        count + " candidate emergency phone locations loaded. " +
        "Verification pending.";

    } catch (error) {
      toggle.checked = false;
      map.removeLayer(phoneLayer);
      status.textContent =
        "Could not load emergency phones: " + error.message;
    }
  }

  toggle.addEventListener("change", async () => {
    if (!toggle.checked) {
      map.removeLayer(phoneLayer);
      return;
    }

    if (!loaded) {
      await loadPhones();
    }

    if (toggle.checked && loaded) {
      phoneLayer.addTo(map);
    }
  });
});
