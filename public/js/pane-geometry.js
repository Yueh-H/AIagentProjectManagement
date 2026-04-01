(function (global) {
  function _cfg() {
    return (typeof window !== 'undefined' && window.WorkspaceConfig?.pane) || {};
  }

  function _canvasCfg() {
    return (typeof window !== 'undefined' && window.WorkspaceConfig?.canvas) || {};
  }

  const MIN_PANE_WIDTH  = 320;
  const MIN_PANE_HEIGHT = 220;
  const PANE_MARGIN     = 24;
  const PANE_CASCADE    = 28;
  const SPLIT_GAP       = 18;

  function getPaneConst(key, fallback) {
    return _cfg()[key] ?? fallback;
  }

  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(max, Math.max(min, value));
  }

  function normalizeContainer(containerRect = {}) {
    const width  = Number.isFinite(containerRect.width)  ? containerRect.width  : 0;
    const height = Number.isFinite(containerRect.height) ? containerRect.height : 0;
    return { width: Math.max(0, width), height: Math.max(0, height) };
  }

  function resolveSizeLimits() {
    return {
      minWidth:  getPaneConst('minWidth',  MIN_PANE_WIDTH),
      minHeight: getPaneConst('minHeight', MIN_PANE_HEIGHT),
    };
  }

  /**
   * Constrain bounds — only enforces minimum size, does NOT clamp position
   * to container edges (infinite canvas).
   * Cards are free to be placed anywhere on the canvas.
   */
  function constrainBounds(bounds, _containerRect) {
    const { minWidth, minHeight } = resolveSizeLimits();
    const width  = Math.max(Math.round(bounds.width  ?? minWidth),  minWidth);
    const height = Math.max(Math.round(bounds.height ?? minHeight), minHeight);
    const x = Math.round(bounds.x ?? 0);
    const y = Math.round(bounds.y ?? 0);

    return { x, y, width, height };
  }

  function getDefaultPaneBounds(containerRect, index = 0) {
    const { width, height } = normalizeContainer(containerRect);
    const safeWidth  = width  || 1280;
    const safeHeight = height || 720;
    const desiredWidth  = Math.round(safeWidth  * 0.38);
    const desiredHeight = Math.round(safeHeight * 0.48);
    const margin  = getPaneConst('margin',  PANE_MARGIN);
    const cascade = getPaneConst('cascade', PANE_CASCADE);
    const offset  = index * cascade;

    return constrainBounds({
      x: margin + offset,
      y: margin + offset,
      width:  desiredWidth,
      height: desiredHeight,
    });
  }

  function translatePaneBounds(startBounds, deltaX, deltaY, _containerRect) {
    return constrainBounds({
      x: startBounds.x + deltaX,
      y: startBounds.y + deltaY,
      width:  startBounds.width,
      height: startBounds.height,
    });
  }

  function resizePaneBounds(startBounds, handle, deltaX, deltaY, _containerRect) {
    const { minWidth, minHeight } = resolveSizeLimits();
    let left   = startBounds.x;
    let top    = startBounds.y;
    let right  = startBounds.x + startBounds.width;
    let bottom = startBounds.y + startBounds.height;

    if (handle.includes('w')) left   += deltaX;
    if (handle.includes('e')) right  += deltaX;
    if (handle.includes('n')) top    += deltaY;
    if (handle.includes('s')) bottom += deltaY;

    if ((right - left) < minWidth) {
      if (handle.includes('w')) left = right - minWidth;
      else right = left + minWidth;
    }
    if ((bottom - top) < minHeight) {
      if (handle.includes('n')) top = bottom - minHeight;
      else bottom = top + minHeight;
    }

    return constrainBounds({
      x: left,
      y: top,
      width:  right - left,
      height: bottom - top,
    });
  }

  function splitPaneBounds(startBounds, direction, containerRect, index = 0) {
    const constrained = constrainBounds(startBounds);
    const { minWidth, minHeight } = resolveSizeLimits();
    const gap = getPaneConst('splitGap', SPLIT_GAP);

    if (direction === 'vertical' && constrained.width >= (minWidth * 2) + gap) {
      const availableWidth = constrained.width - gap;
      const currentWidth = Math.max(minWidth, Math.floor(availableWidth / 2));
      const nextWidth = availableWidth - currentWidth;

      return {
        current: constrainBounds({
          x: constrained.x, y: constrained.y,
          width: currentWidth, height: constrained.height,
        }),
        next: constrainBounds({
          x: constrained.x + currentWidth + gap, y: constrained.y,
          width: nextWidth, height: constrained.height,
        }),
      };
    }

    if (direction === 'horizontal' && constrained.height >= (minHeight * 2) + gap) {
      const availableHeight = constrained.height - gap;
      const currentHeight = Math.max(minHeight, Math.floor(availableHeight / 2));
      const nextHeight = availableHeight - currentHeight;

      return {
        current: constrainBounds({
          x: constrained.x, y: constrained.y,
          width: constrained.width, height: currentHeight,
        }),
        next: constrainBounds({
          x: constrained.x, y: constrained.y + currentHeight + gap,
          width: constrained.width, height: nextHeight,
        }),
      };
    }

    const cascade = getPaneConst('cascade', PANE_CASCADE);
    return {
      current: constrained,
      next: constrainBounds({
        x: constrained.x + cascade, y: constrained.y + cascade,
        width: constrained.width, height: constrained.height,
      }),
    };
  }

  const api = {
    MIN_PANE_WIDTH,
    MIN_PANE_HEIGHT,
    PANE_MARGIN,
    PANE_CASCADE,
    SPLIT_GAP,
    clamp,
    constrainBounds,
    getDefaultPaneBounds,
    translatePaneBounds,
    resizePaneBounds,
    splitPaneBounds,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.PaneGeometry = api;
}(typeof window !== 'undefined' ? window : globalThis));
