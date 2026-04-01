/**
 * WorkspaceConfig — centralised system configuration.
 *
 * All tunable constants live here so they are easy to find and override.
 * Other modules read from `window.WorkspaceConfig` instead of hard-coding values.
 *
 * To customise at runtime:  Object.assign(WorkspaceConfig.canvas, { ... })
 */
(function () {
  window.WorkspaceConfig = {
    // ── Infinite canvas ────────────────────────────
    canvas: {
      /** Base canvas size (px). Expands automatically when cards exceed it. */
      baseWidth: 6000,
      baseHeight: 4000,
      /** Extra padding added beyond the outermost card edge (px) */
      edgePadding: 600,
      /** Minimum canvas size — never shrinks below this */
      minWidth: 3000,
      minHeight: 2000,
      /** Grid snap size (0 = disabled) */
      gridSnap: 0,
      /** Zoom limits and speed */
      minZoom: 0.15,
      maxZoom: 3,
      zoomStep: 0.08,
    },

    // ── Pane / card geometry ───────────────────────
    pane: {
      minWidth: 320,
      minHeight: 220,
      /** Cascade offset when stacking new cards */
      cascade: 28,
      /** Margin from canvas origin for the first card */
      margin: 24,
      /** Gap between split-spawned cards */
      splitGap: 18,
    },

    // ── Gesture thresholds ─────────────────────────
    gesture: {
      dragThreshold: 4,
      doubleTapWindow: 300,
      longPressDragDelay: 150,
    },

    // ── Resize handle hit zones ────────────────────
    resizeHandle: {
      edgeThreshold: 18,
      cornerThreshold: 28,
    },
  };
})();
