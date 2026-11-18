
"use strict";

(() => {
  const R = 6371000;
  const rad = Math.PI / 180;

  const distance = (a, b) => {
    const p = a[1] * rad;
    const q = b[1] * rad;
    const dp = (b[1] - a[1]) * rad;
    const dl = (b[0] - a[0]) * rad;
    const h = Math.sin(dp / 2) ** 2 +
      Math.cos(p) * Math.cos(q) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const bearing = (a, b) => Math.atan2(
    Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad),
    Math.cos(a[1] * rad) * Math.sin(b[1] * rad) -
    Math.sin(a[1] * rad) * Math.cos(b[1] * rad) *
    Math.cos((b[0] - a[0]) * rad)
  ) / rad;

  function turn(a, b, c) {
    const d = ((bearing(b, c) - bearing(a, b) + 540) % 360) - 180;
    if (Math.abs(d) < 35) return null;
    if (Math.abs(d) > 150) return "Make a U-turn";
    return d > 0 ? "Turn right" : "Turn left";
  }

  const css = document.createElement("style");
  css.textContent = `
    #ba-voice {
      margin-top: 14px;
      padding: 16px;
      border: 1px solid #9f8d6c;
      border-radius: 12px;
      background: #22272b;
      color: #f6f0e5;
    }
    #ba-voice button {
      margin: 4px;
      padding: 10px 12px;
      border-radius: 7px;
      border: 1px solid #b8a078;
      background: #d2ba8f;
      color: #151515;
      font-weight: 600;
      cursor: pointer;
    }
    #ba-voice button:disabled {
      opacity: .45;
      cursor: not-allowed;
    }
    #ba-voice button:focus-visible {
      outline: 3px solid white;
      outline-offset: 3px;
    }
    #ba-voice p { line-height: 1.5; }
    #ba-voice-directions {
      max-height: 180px;
      overflow: auto;
      padding-left: 22px;
    }
  `;
  document.head.append(css);

  const panel = document.createElement("section");
  panel.id = "ba-voice";
  panel.setAttribute("aria-label", "Experimental voice guidance");

  panel.innerHTML = `
    <h3>🔊 Voice Guidance</h3>
    <p>
      Experimental navigation. GPS and mapped paths may
      be inaccurate. Does not detect obstacles, curbs,
      crossings or accessible entrances.
    </p>
    <div>
      <button id="ba-start" type="button">Start guidance</button>
      <button id="ba-repeat" type="button" disabled>Repeat</button>
      <button id="ba-pause" type="button" disabled>Pause</button>
      <button id="ba-stop" type="button" disabled>Stop</button>
    </div>
    <p id="ba-voice-status" role="status" aria-live="polite">
      Choose a route first.
    </p>
    <details>
      <summary>Written directions</summary>
      <ol id="ba-voice-directions"></ol>
    </details>
  `;

  const anchor = document.getElementById("routeDetails")?.parentElement ||
    document.querySelector("#planRouteButton")?.parentElement ||
    document.body;

  anchor.append(panel);

  const el = id => document.getElementById(id);
  const start = el("ba-start");
  const repeat = el("ba-repeat");
  const pause = el("ba-pause");
  const stop = el("ba-stop");
  const status = el("ba-voice-status");
  const list = el("ba-voice-directions");

  let route = null;
  let steps = [];
  let watch = null;
  let active = false;
  let paused = false;
  let spokenIndex = -1;
  let lastText = "";
  let offRoute = false;

  function speak(text) {
    lastText = text;
    status.textContent = text;

    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    speechSynthesis.speak(utterance);
  }

  function controls() {
    start.disabled = !route || active;
    repeat.disabled = !active;
    pause.disabled = !active;
    stop.disabled = !active;
    pause.textContent = paused ? "Resume" : "Pause";
  }

  function makeSteps(coords) {
    const result = [{
      at: 0,
      text: "Route started. Follow the mapped pedestrian route."
    }];

    let traveled = 0;
    let lastTurn = 0;

    for (let i = 1; i < coords.length - 1; i++) {
      traveled += distance(coords[i - 1], coords[i]);
      const direction = turn(coords[i - 1], coords[i], coords[i + 1]);

      if (direction && traveled - lastTurn >= 12) {
        result.push({
          at: traveled,
          text: `Approaching a mapped turn. ${direction}.`
        });
        lastTurn = traveled;
      }
    }

    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      total += distance(coords[i - 1], coords[i]);
    }

    result.push({
      at: total,
      text: "You are near the mapped destination. Confirm the entrance independently."
    });

    return result;
  }

  function nearestProgress(point, coords) {
    let best = { meters: Infinity, progress: 0 };
    let progress = 0;

    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      const mid = (a[1] + b[1]) / 2 * rad;
      const dx = (b[0] - a[0]) * 111320 * Math.cos(mid);
      const dy = (b[1] - a[1]) * 111320;
      const px = (point[0] - a[0]) * 111320 * Math.cos(mid);
      const py = (point[1] - a[1]) * 111320;

      const t = Math.max(0, Math.min(1,
        (px * dx + py * dy) / (dx * dx + dy * dy || 1)
      ));

      const closest = [
        a[0] + t * (b[0] - a[0]),
        a[1] + t * (b[1] - a[1])
      ];

      const meters = distance(point, closest);

      if (meters < best.meters) {
        best = {
          meters,
          progress: progress + t * distance(a, b)
        };
      }

      progress += distance(a, b);
    }

    return best;
  }

  function onPosition(pos) {
    if (!active || paused || !route) return;

    const coords = route.geometry.coordinates;
    const point = [pos.coords.longitude, pos.coords.latitude];
    const near = nearestProgress(point, coords);
    const accuracy = pos.coords.accuracy || 0;

    if (accuracy > 35) {
      status.textContent =
        `GPS accuracy is approximately ${Math.round(accuracy)} meters.`;
      return;
    }

    if (near.meters > Math.max(30, accuracy * 2)) {
      if (!offRoute) {
        offRoute = true;
        speak(
          "You may be away from the mapped route. " +
          "Stop somewhere safe and check your position."
        );
      }
      return;
    }

    offRoute = false;

    const next = spokenIndex + 1;

    if (next < steps.length &&
        near.progress >= steps[next].at - 20) {
      spokenIndex = next;
      speak(steps[next].text);

      if (next === steps.length - 1) {
        end(false);
        status.textContent = steps[next].text;
      }
    }
  }

  function end(announce = true) {
    active = false;
    paused = false;

    if (watch !== null) {
      navigator.geolocation.clearWatch(watch);
      watch = null;
    }

    window.speechSynthesis?.cancel();

    if (announce) {
      status.textContent = "Voice guidance stopped.";
    }

    controls();
  }

  start.addEventListener("click", () => {
    if (!route) return;

    if (!("geolocation" in navigator)) {
      status.textContent = "GPS is unavailable.";
      return;
    }

    active = true;
    paused = false;
    spokenIndex = 0;
    offRoute = false;
    controls();

    speak(
      "Experimental voice guidance started. " +
      "GPS may be inaccurate. Do not rely on this " +
      "for obstacle avoidance. " + steps[0].text
    );

    watch = navigator.geolocation.watchPosition(
      onPosition,
      error => {
        status.textContent =
          "Location unavailable: " + error.message;
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000
      }
    );
  });

  repeat.addEventListener("click", () => {
    if (active) {
      speak(lastText || steps[Math.max(0, spokenIndex)]?.text);
    }
  });

  pause.addEventListener("click", () => {
    paused = !paused;

    if (paused) {
      window.speechSynthesis?.cancel();
      status.textContent = "Guidance paused.";
    } else {
      speak(
        "Guidance resumed. " +
        (steps[Math.max(0, spokenIndex)]?.text || "")
      );
    }

    controls();
  });

  stop.addEventListener("click", () => end());
  window.addEventListener("pagehide", () => end(false));

  window.BoilerVoice = {
    setRoute(next) {
      end(false);

      if (!next?.geometry?.coordinates ||
          next.geometry.coordinates.length < 2) {
        route = null;
        steps = [];
        list.replaceChildren();
        status.textContent = "Choose a route first.";
        controls();
        return;
      }

      route = next;
      steps = makeSteps(route.geometry.coordinates);
      list.replaceChildren();

      steps.forEach(step => {
        const item = document.createElement("li");
        item.textContent = step.text;
        list.append(item);
      });

      status.textContent =
        "Route loaded. Press Start guidance to enable GPS and voice.";

      controls();
    },
    stop: () => end()
  };

  controls();
})();
