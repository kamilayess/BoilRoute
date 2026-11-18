
(() => {
  "use strict";

  const style = document.createElement("style");

  style.textContent = `
    body.accessible-mode {
      font-size: 18px;
    }

    body.accessible-mode .sidebar {
      width: min(100%, 520px);
    }

    body.accessible-mode button,
    body.accessible-mode select,
    body.accessible-mode textarea {
      min-height: 52px;
      font-size: 18px;
    }

    body.accessible-mode button:focus-visible,
    body.accessible-mode select:focus-visible,
    body.accessible-mode input:focus-visible,
    body.accessible-mode summary:focus-visible {
      outline: 4px solid #ffd36d;
      outline-offset: 4px;
    }

    body.accessible-mode .panel {
      padding: 24px;
    }

    #accessible-toggle {
      padding: 12px 16px;
      border-radius: 9px;
      border: 2px solid #d2ba8f;
      background: #292929;
      color: #fff;
      font-weight: bold;
      cursor: pointer;
    }

    #accessible-panel {
      margin-top: 16px;
      padding: 20px;
      border: 2px solid #d2ba8f;
      border-radius: 12px;
      background: #1e2327;
      color: #fff;
    }

    #accessible-panel button {
      width: 100%;
      min-height: 56px;
      margin-top: 12px;
      padding: 12px;
      border: 2px solid #d2ba8f;
      border-radius: 9px;
      background: #d2ba8f;
      color: #171717;
      font-weight: bold;
      cursor: pointer;
    }

    #accessible-panel button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    #accessible-panel button:focus-visible,
    #accessible-toggle:focus-visible {
      outline: 4px solid #ffd36d;
      outline-offset: 4px;
    }

    #accessible-panel[hidden] {
      display: none;
    }

    #accessible-panel ol {
      line-height: 1.8;
      padding-left: 25px;
    }
  `;

  document.head.appendChild(style);

  const headerActions = document.querySelector(".header-actions");

  const toggle = document.createElement("button");
  toggle.id = "accessible-toggle";
  toggle.type = "button";
  toggle.textContent = "♿ Accessible Mode";
  toggle.setAttribute("aria-pressed", "false");

  headerActions?.appendChild(toggle);

  const panel = document.createElement("section");
  panel.id = "accessible-panel";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "accessible-heading");

  panel.innerHTML = `
    <h2 id="accessible-heading" tabindex="-1">
      Accessible Navigation
    </h2>

    <p>
      Use the route planner above to choose
      your starting point and destination.
    </p>

    <p>
      This experimental system does not detect
      physical obstacles or verify accessible paths.
    </p>

    <button id="accessible-plan" type="button">
      Find walking route
    </button>

    <button id="accessible-start" type="button">
      Start spoken guidance
    </button>

    <button id="accessible-repeat" type="button">
      Repeat instruction
    </button>

    <button id="accessible-stop" type="button">
      Stop guidance
    </button>

    <h3>Route instructions</h3>

    <p
      id="accessible-status"
      role="status"
      aria-live="polite"
    >
      Choose a route to begin.
    </p>

    <ol id="accessible-directions"></ol>
  `;

  const routePanel = document
    .getElementById("planRouteButton")
    ?.closest(".panel");

  routePanel?.appendChild(panel);

  const get = id => document.getElementById(id);

  function syncDirections() {
    const source = get("ba-voice-directions");
    const target = get("accessible-directions");
    const status = get("ba-voice-status");

    if (!source || !target) return;

    target.replaceChildren();

    source.querySelectorAll("li").forEach(item => {
      const li = document.createElement("li");
      li.textContent = item.textContent;
      target.appendChild(li);
    });

    get("accessible-status").textContent =
      status?.textContent || "Choose a route to begin.";
  }

  toggle.addEventListener("click", () => {
    const enabled = !document.body.classList.contains("accessible-mode");

    document.body.classList.toggle("accessible-mode", enabled);
    panel.hidden = !enabled;

    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.textContent = enabled
      ? "♿ Standard Mode"
      : "♿ Accessible Mode";

    if (enabled) {
      syncDirections();
      get("accessible-heading").focus();
    } else {
      toggle.focus();
    }
  });

  get("accessible-plan").addEventListener("click", () => {
    get("planRouteButton")?.click();
    get("accessible-status").textContent =
      "Route requested. Select an available route.";
  });

  get("accessible-start").addEventListener("click", () => {
    get("ba-start")?.click();
    syncDirections();
  });

  get("accessible-repeat").addEventListener("click", () => {
    get("ba-repeat")?.click();
    syncDirections();
  });

  get("accessible-stop").addEventListener("click", () => {
    get("ba-stop")?.click();
    syncDirections();
  });

  const voiceList = get("ba-voice-directions");

  if (voiceList) {
    new MutationObserver(syncDirections).observe(voiceList, {
      childList: true
    });
  }

  const voiceStatus = get("ba-voice-status");

  if (voiceStatus) {
    new MutationObserver(syncDirections).observe(voiceStatus, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }
})();
