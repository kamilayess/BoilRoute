
document.addEventListener("DOMContentLoaded", () => {
  const mapArea = document.querySelector(".map-area");
  const mapElement = document.getElementById("map");
  const mapHeading = document.querySelector(".map-heading");

  if (!mapArea || !mapElement || !mapHeading) return;

  const style = document.createElement("style");

  style.textContent = `
    #expandMapButton {
      background: #d6bb8b;
      color: #17191e;
      border: none;
      border-radius: 8px;
      padding: 10px 15px;
      font-weight: 700;
      cursor: pointer;
      min-height: 44px;
    }

    #expandMapButton:focus-visible {
      outline: 3px solid #ffffff;
      outline-offset: 3px;
    }

    body.map-expanded {
      overflow: hidden;
    }

    body.map-expanded .map-area {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2000 !important;
      width: 100vw !important;
      height: 100dvh !important;
      max-width: none !important;
      display: flex !important;
      flex-direction: column !important;
      background: #17191e;
      padding: 16px !important;
      box-sizing: border-box;
    }

    body.map-expanded .map-heading {
      flex-shrink: 0;
    }

    body.map-expanded #map {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      height: auto !important;
      width: 100% !important;
    }

    body.map-expanded .map-foot {
      flex-shrink: 0;
    }

    @media (max-width: 600px) {
      body.map-expanded .map-area {
        padding: 8px !important;
      }

      #expandMapButton {
        padding: 9px;
        font-size: 13px;
      }
    }
  `;

  document.head.appendChild(style);

  const button = document.createElement("button");
  button.id = "expandMapButton";
  button.type = "button";
  button.textContent = "⛶ Expand Map";
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-controls", "map");

  mapHeading.appendChild(button);

  function refreshMap() {
    // Leaflet needs to recalculate its dimensions.
    if (typeof map !== "undefined" && map?.invalidateSize) {
      map.invalidateSize({ pan: false });
    }
  }

  function setExpanded(expanded) {
    document.body.classList.toggle("map-expanded", expanded);

    button.textContent = expanded
      ? "⛶ Exit Full Screen"
      : "⛶ Expand Map";

    button.setAttribute("aria-pressed", String(expanded));

    requestAnimationFrame(() => {
      refreshMap();
      requestAnimationFrame(refreshMap);
    });
  }

  button.addEventListener("click", () => {
    setExpanded(
      !document.body.classList.contains("map-expanded")
    );
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      document.body.classList.contains("map-expanded")
    ) {
      setExpanded(false);
      button.focus();
    }
  });

  window.addEventListener("resize", refreshMap);
});
