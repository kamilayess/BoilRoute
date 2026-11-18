
(() => {
  "use strict";

  const css = document.createElement("style");
  css.textContent = `
    @media (max-width: 850px) {
      header {
        height: 62px;
        padding: 0 12px;
        gap: 8px;
      }

      .brand { gap: 8px; }
      .brand-icon {
        width: 35px;
        height: 35px;
        font-size: 21px;
      }
      .brand strong { font-size: 16px; }
      .brand small { font-size: 9px; }
      .header-actions { gap: 6px; }
      #themeButton { display: none; }

      main {
        display: flex;
        flex-direction: column;
      }

      .sidebar {
        display: contents;
      }

      .sidebar > .eyebrow,
      .sidebar > h1,
      .sidebar > p.muted {
        display: none;
      }

      .sidebar > .panel:first-of-type {
        order: 1;
        margin: 0;
        border: 0;
        border-radius: 0;
        padding: 14px 16px;
        background: #1a1d20;
      }

      .sidebar > .panel:first-of-type h2 {
        margin-bottom: 10px;
      }

      .sidebar > .panel:first-of-type > label:not(.check) {
        margin: 10px 0 5px;
      }

      #startPoint, #endPoint {
        min-height: 46px;
        font-size: 16px;
      }

      #mobile-extra {
        margin-top: 12px;
        border: 1px solid #444a4f;
        border-radius: 10px;
        padding: 10px;
      }

      #mobile-extra summary {
        cursor: pointer;
        font-weight: 700;
        color: #cfb991;
        padding: 5px;
      }

      #mobile-extra h3 { margin-top: 12px; }

      #planRouteButton {
        min-height: 50px;
        font-size: 15px;
      }

      .map-area {
        order: 2;
        padding: 8px 12px 12px;
      }

      .map-heading {
        padding: 4px 2px 10px;
      }

      #map {
        height: 49dvh;
        min-height: 280px;
        border-radius: 12px;
      }

      .map-foot { font-size: 10px; }

      #mobile-actions {
        order: 3;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        padding: 12px;
        background: #1a1d20;
      }

      #mobile-actions button {
        min-height: 50px;
        padding: 8px 4px;
        font-size: 13px;
        background: #292d31;
        border: 1px solid #b99b68;
        color: #f5f2ea;
        font-weight: 700;
      }

      .sidebar > .panel:not(:first-of-type),
      .sidebar > .emergency-panel {
        order: 4;
        margin: 10px 12px;
      }

      .mobile-collapsed {
        display: none !important;
      }

      #routeOptions {
        max-height: 130px;
        overflow-y: auto;
      }

      #live-navigation-panel,
      #ba-voice-panel {
        max-width: 100%;
      }

      button, select, input, textarea {
        touch-action: manipulation;
      }
    }

    @media (min-width: 851px) {
      #mobile-actions { display: none !important; }
      #mobile-extra { border: 0; padding: 0; }
      #mobile-extra summary { display: none; }
    }
  `;
  document.head.appendChild(css);

  function setup() {
    const sidebar = document.querySelector(".sidebar");
    const planner = sidebar?.querySelector(".panel");
    const mapArea = document.querySelector(".map-area");

    if (!sidebar || !planner || !mapArea) return;

    // Keep the existing preference checkboxes and IDs.
    const preferencesTitle = [...planner.querySelectorAll("h3")]
      .find(el => el.textContent.includes("Route preferences"));

    if (preferencesTitle) {
      const details = document.createElement("details");
      details.id = "mobile-extra";
      details.open = window.innerWidth > 850;

      const summary = document.createElement("summary");
      summary.textContent = "⚙ Route preferences";
      details.appendChild(summary);

      const nodes = [preferencesTitle];
      let next = preferencesTitle.nextElementSibling;

      while (next && next.classList.contains("check")) {
        nodes.push(next);
        next = next.nextElementSibling;
      }

      preferencesTitle.before(details);
      nodes.forEach(node => details.appendChild(node));

      const media = window.matchMedia("(max-width: 850px)");

      const sync = () => {
        if (!media.matches) details.open = true;
      };

      media.addEventListener("change", sync);
      sync();
    }

    const actions = document.createElement("nav");
    actions.id = "mobile-actions";
    actions.setAttribute("aria-label", "Quick actions");

    const buttons = [
      ["🗺 Map", mapArea],
      ["⚠ Report", sidebar.querySelector("#reportButton")],
      ["🚨 Safety", sidebar.querySelector(".emergency-panel")]
    ];

    buttons.forEach(([label, target]) => {
      if (!target) return;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;

      button.addEventListener("click", () => {
        if (label.includes("Report")) {
          const section = target.closest(".panel");
          section?.classList.remove("mobile-collapsed");

          const form = document.getElementById("hazardForm");
          if (form?.hidden) target.click();

          section?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

        } else if (label.includes("Safety")) {
          target.classList.remove("mobile-collapsed");
          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

        } else {
          mapArea.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

          setTimeout(() => {
            if (typeof map !== "undefined") {
              map.invalidateSize();
            }
          }, 300);
        }
      });

      actions.appendChild(button);
    });

    mapArea.insertAdjacentElement("afterend", actions);

    const media = window.matchMedia("(max-width: 850px)");

    function updateMobile() {
      const mobile = media.matches;

      sidebar.querySelectorAll(".panel").forEach((section, index) => {
        if (index === 0) return;

        section.classList.toggle("mobile-collapsed", mobile);
      });

      const emergency = sidebar.querySelector(".emergency-panel");
      emergency?.classList.toggle("mobile-collapsed", mobile);

      if (typeof map !== "undefined") {
        setTimeout(() => map.invalidateSize(), 150);
      }
    }

    media.addEventListener("change", updateMobile);
    updateMobile();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
