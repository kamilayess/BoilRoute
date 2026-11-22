
(() => {
  "use strict";

  let route = null;
  let tracking = false;
  let following = true;
  let lastPosition = null;
  let watchId = null;
  let arrow = null;
  let remainingLine = null;
  let completedLine = null;
  let lastProgress = 0;
  let compassHeading = null;
  let compassEnabled = false;

  function handleOrientation(event) {
    if (Number.isFinite(event.webkitCompassHeading)) {
      // iPhone Safari: heading relative to north.
      compassHeading = event.webkitCompassHeading;
    } else if (
      event.absolute === true &&
      Number.isFinite(event.alpha)
    ) {
      compassHeading = (360 - event.alpha) % 360;
    } else {
      return;
    }

    const arrowShape = arrow?.getElement()
      ?.querySelector(".boil-live-arrow");

    if (arrowShape) {
      arrowShape.style.transform =
        `rotate(${compassHeading}deg)`;
      arrowShape.textContent = "▲";
    }
  }

  const rad = Math.PI / 180;
  const earth = 6371000;

  function meters(a, b) {
    const lat = (a[1] + b[1]) / 2 * rad;
    const dx = (b[0] - a[0]) * rad * earth * Math.cos(lat);
    const dy = (b[1] - a[1]) * rad * earth;
    return Math.hypot(dx, dy);
  }

  function nearestPoint(point, coords) {
    let best = null;
    let accumulated = 0;

    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      const lat = point[1] * rad;

      const scaleX = Math.cos(lat) * rad * earth;
      const scaleY = rad * earth;

      const ax = (a[0] - point[0]) * scaleX;
      const ay = (a[1] - point[1]) * scaleY;
      const bx = (b[0] - point[0]) * scaleX;
      const by = (b[1] - point[1]) * scaleY;

      const vx = bx - ax;
      const vy = by - ay;
      const length2 = vx * vx + vy * vy;

      const t = length2
        ? Math.max(0, Math.min(1,
          -(ax * vx + ay * vy) / length2))
        : 0;

      const snapped = [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
      ];

      const distance = meters(point, snapped);
      const segmentLength = meters(a, b);

      if (!best || distance < best.distance) {
        best = {
          distance,
          progress: accumulated + t * segmentLength,
          segment: i,
          snapped
        };
      }

      accumulated += segmentLength;
    }

    return best ? { ...best, total: accumulated } : null;
  }

  const style = document.createElement("style");
  style.textContent = `
    #live-navigation-panel {
      margin-top: 14px;
      padding: 16px;
      border: 1px solid #b99b68;
      border-radius: 12px;
      background: #22272b;
      color: #f4f0e8;
    }

    #live-navigation-panel button {
      margin: 5px 5px 5px 0;
      padding: 11px 14px;
      border-radius: 8px;
      border: 1px solid #b99b68;
      background: #d6bb8b;
      color: #17191e;
      font-weight: 700;
      cursor: pointer;
    }

    #live-navigation-panel button:disabled {
      opacity: .45;
    }

    #live-navigation-panel button:focus-visible {
      outline: 3px solid white;
      outline-offset: 3px;
    }

    .boil-live-arrow {
      width: 32px;
      height: 32px;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #1676eb;
      font-size: 30px;
      font-weight: 900;
      text-shadow: 0 0 3px white;
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.id = "live-navigation-panel";
  panel.setAttribute("aria-label", "Live GPS navigation");

  panel.innerHTML = `
    <h3>📍 Live Navigation</h3>
    <p id="live-distance">Choose a route first.</p>
    <p id="live-status" role="status" aria-live="polite">
      GPS navigation is not active.
    </p>
    <button id="live-start" disabled>▶ Start Navigation</button>
    <button id="live-follow" disabled>◎ Follow Me: ON</button>
    <button id="live-stop" disabled>■ Stop</button>
    <p style="font-size:12px;opacity:.75">
      Experimental GPS guidance. Route accessibility and
      obstacles are not verified. Do not use for
      safety-critical navigation.
    </p>
  `;

  const anchor = document.getElementById("routeDetails");
  if (anchor) anchor.insertAdjacentElement("afterend", panel);
  else document.querySelector(".sidebar")?.append(panel);

  const el = id => document.getElementById(id);

  const startButton = el("live-start");
  const followButton = el("live-follow");
  const stopButton = el("live-stop");
  const compassButton = document.createElement("button");
  compassButton.id = "live-compass";
  compassButton.type = "button";
  compassButton.textContent = "🧭 Enable Compass";

  followButton.insertAdjacentElement("afterend", compassButton);

  compassButton.addEventListener("click", async () => {
    if (!window.isSecureContext) {
      statusText.textContent =
        "Compass requires HTTPS on iPhone.";
      return;
    }

    if (!window.DeviceOrientationEvent) {
      statusText.textContent =
        "Compass sensors are unavailable on this device.";
      return;
    }

    try {
      if (
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const permission =
          await DeviceOrientationEvent.requestPermission();

        if (permission !== "granted") {
          statusText.textContent =
            "Compass permission was not granted.";
          return;
        }
      }

      window.removeEventListener(
        "deviceorientation",
        handleOrientation
      );

      window.addEventListener(
        "deviceorientation",
        handleOrientation
      );

      compassEnabled = true;
      compassButton.textContent = "🧭 Compass ON";
      statusText.textContent =
        "Compass enabled. Rotate your phone to test.";

    } catch (error) {
      statusText.textContent =
        "Could not enable compass: " + error.message;
    }
  });
  const distanceText = el("live-distance");
  const statusText = el("live-status");

  const arrowIcon = L.divIcon({
    className: "",
    html: '<div class="boil-live-arrow">▲</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  function updatePosition(position) {
    if (!tracking || !route) return;

    const { latitude, longitude, accuracy, heading, speed } =
      position.coords;

    const point = [longitude, latitude];
    const latLng = [latitude, longitude];

    if (!arrow) {
      arrow = L.marker(latLng, {
        icon: arrowIcon,
        interactive: false,
        zIndexOffset: 1000
      }).addTo(map);
    } else {
      arrow.setLatLng(latLng);
    }

    const element = arrow.getElement();
    const arrowShape = element?.querySelector(".boil-live-arrow");

    if (arrowShape) {
      const validHeading =
        Number.isFinite(heading) &&
        heading >= 0 &&
        Number.isFinite(speed) &&
        speed > 0.7;

      const direction = compassEnabled &&
        Number.isFinite(compassHeading)
        ? compassHeading
        : validHeading
          ? heading
          : null;

      arrowShape.style.transform =
        direction !== null
          ? `rotate(${direction}deg)`
          : "none";

      arrowShape.textContent =
        direction !== null ? "▲" : "●";
    }

    if (following) {
      map.panTo(latLng, { animate: true, duration: 0.5 });
    }

    const coords = route.geometry.coordinates;
    const near = nearestPoint(point, coords);
    if (!near) return;

    if (accuracy > 35) {
      statusText.textContent =
        `Low GPS accuracy: approximately ${Math.round(accuracy)} m.`;
      return;
    }

    if (near.distance > Math.max(30, accuracy * 2)) {
      statusText.textContent =
        `You appear ${Math.round(near.distance)} m from ` +
        "the mapped route. Stop safely and check the map.";
      return;
    }

    // Avoid sudden backward jumps caused by GPS noise.
    const progress = Math.max(
      lastProgress,
      Math.min(near.progress, near.total)
    );

    lastProgress = progress;

    const remaining = Math.max(0, near.total - progress);
    const percentage = near.total
      ? Math.round(progress / near.total * 100)
      : 0;

    distanceText.textContent =
      `${Math.round(remaining)} m remaining · ` +
      `${percentage}% completed`;

    statusText.textContent =
      `GPS accuracy ±${Math.round(accuracy)} m · ` +
      "Follow the mapped pedestrian route.";

    const completed = coords.slice(0, near.segment);
    completed.push(near.snapped);

    const upcoming = [
      near.snapped,
      ...coords.slice(near.segment)
    ];

    const toLatLng = points =>
      points.map(([lng, lat]) => [lat, lng]);

    if (completedLine) map.removeLayer(completedLine);
    if (remainingLine) map.removeLayer(remainingLine);

    completedLine = L.polyline(toLatLng(completed), {
      color: "#808080",
      weight: 7,
      opacity: 0.9,
      interactive: false
    }).addTo(map);

    remainingLine = L.polyline(toLatLng(upcoming), {
      color: "#2584f5",
      weight: 7,
      opacity: 0.95,
      interactive: false
    }).addTo(map);

    if (remaining <= 15 &&
      meters(point, coords[coords.length - 1]) <= 20) {
      statusText.textContent =
        "You appear to have reached the destination. " +
        "Confirm the entrance visually or with assistance.";
    }
  }

  function stopNavigation() {
    tracking = false;

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    if (arrow) map.removeLayer(arrow);
    if (completedLine) map.removeLayer(completedLine);
    if (remainingLine) map.removeLayer(remainingLine);

    arrow = null;
    completedLine = null;
    remainingLine = null;

    startButton.disabled = !route;
    followButton.disabled = true;
    stopButton.disabled = true;

    statusText.textContent = "Live navigation stopped.";
  }

  startButton.addEventListener("click", () => {
    if (!route || !navigator.geolocation) {
      statusText.textContent = "GPS is unavailable.";
      return;
    }

    stopNavigation();

    tracking = true;
    following = true;
    lastProgress = 0;

    startButton.disabled = true;
    followButton.disabled = false;
    stopButton.disabled = false;
    followButton.textContent = "◎ Follow Me: ON";

    statusText.textContent = "Waiting for GPS location...";

    watchId = navigator.geolocation.watchPosition(
      updatePosition,
      error => {
        statusText.textContent =
          "GPS error: " + error.message;

        if (error.code === 1) stopNavigation();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000
      }
    );
  });

  followButton.addEventListener("click", () => {
    following = !following;

    followButton.textContent = following
      ? "◎ Follow Me: ON"
      : "◎ Follow Me: OFF";
  });

  stopButton.addEventListener("click", stopNavigation);

  window.addEventListener("pagehide", stopNavigation);

  window.BoilLive = {
    setRoute(next) {
      stopNavigation();

      route = next?.geometry?.coordinates?.length >= 2
        ? next
        : null;

      lastProgress = 0;
      startButton.disabled = !route;

      distanceText.textContent = route
        ? `${Math.round(route.distance)} m total · Ready`
        : "Choose a route first.";

      statusText.textContent = route
        ? "Route loaded. Press Start Navigation."
        : "GPS navigation is not active.";
    }
  };
})();
