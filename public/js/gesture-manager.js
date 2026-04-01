/**
 * GestureManager — abstracted pointer interaction system.
 *
 * Supported gestures:
 *   - tap / doubleTap
 *   - drag (immediate, after threshold)
 *   - longPressDrag (hold still for N ms, then drag)
 *
 * Usage:
 *   const gm = new GestureManager();
 *   gm.zone(element, {
 *     onTap(e),
 *     onDoubleTap(e),
 *     onDragStart(e),
 *     onDrag(e, delta),
 *     onDragEnd(e),
 *     onLongPressDragStart(e),   // held without moving → drag begins
 *     onLongPressDrag(e, delta),
 *     onLongPressDragEnd(e),
 *     dragThreshold: 4,          // number or fn(pointerDownEvent) => number
 *     doubleTapWindow: 300,
 *     longPressDragDelay: 350,
 *     filter(e) { return true; },
 *   });
 */
class GestureManager {
  constructor() {
    this._zones = [];
  }

  zone(element, options = {}) {
    const cfg = {
      onTap: options.onTap || null,
      onDoubleTap: options.onDoubleTap || null,
      onDragStart: options.onDragStart || null,
      onDrag: options.onDrag || null,
      onDragEnd: options.onDragEnd || null,
      onLongPressDragStart: options.onLongPressDragStart || null,
      onLongPressDrag: options.onLongPressDrag || null,
      onLongPressDragEnd: options.onLongPressDragEnd || null,
      dragThreshold: options.dragThreshold ?? 4,
      doubleTapWindow: options.doubleTapWindow ?? 300,
      longPressDragDelay: options.longPressDragDelay ?? 350,
      filter: options.filter || (() => true),
    };

    let lastTapTime = 0;

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      if (!cfg.filter(e)) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const dragThreshold = Math.max(0, typeof cfg.dragThreshold === 'function'
        ? (cfg.dragThreshold(e) ?? 0)
        : cfg.dragThreshold);
      // State: 'pending' → 'drag' | 'longPressDrag' | (released as tap)
      let mode = 'pending';
      let lpTimer = null;

      // --- Long-press timer ---
      if (cfg.onLongPressDragStart) {
        lpTimer = setTimeout(() => {
          lpTimer = null;
          if (mode !== 'pending') return;
          mode = 'longPressDrag';
          cfg.onLongPressDragStart(e);
        }, cfg.longPressDragDelay);
      }

      const onMove = (me) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;

        if (mode === 'pending') {
          if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) {
            // Moved past threshold → try normal drag
            // If onDragStart returns false, skip drag and keep waiting for long-press
            if (cfg.onDragStart) {
              const accepted = cfg.onDragStart(e);
              if (accepted === false) {
                // Reject instant drag, but cancel long-press too (user is moving)
                if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
                mode = 'rejected';
                return;
              }
            }
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            mode = 'drag';
            document.body.classList.add('is-gesture-active');

            if (cfg.onDrag) {
              cfg.onDrag(me, { x: dx, y: dy, clientX: me.clientX, clientY: me.clientY });
            }
          }
          return;
        }

        if (mode === 'rejected') return;

        if (mode === 'drag' && cfg.onDrag) {
          cfg.onDrag(me, { x: dx, y: dy, clientX: me.clientX, clientY: me.clientY });
        }

        if (mode === 'longPressDrag' && cfg.onLongPressDrag) {
          cfg.onLongPressDrag(me, { x: dx, y: dy, clientX: me.clientX, clientY: me.clientY });
        }
      };

      const onUp = (ue) => {
        doCleanup();
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }

        if (mode === 'drag') {
          if (cfg.onDragEnd) cfg.onDragEnd(ue);
          document.body.classList.remove('is-gesture-active');
          return;
        }

        if (mode === 'longPressDrag') {
          if (cfg.onLongPressDragEnd) cfg.onLongPressDragEnd(ue);
          return;
        }

        // mode === 'pending' → it was a tap
        const now = Date.now();
        if ((now - lastTapTime) < cfg.doubleTapWindow && cfg.onDoubleTap) {
          cfg.onDoubleTap(ue);
          lastTapTime = 0;
        } else {
          if (cfg.onTap) cfg.onTap(ue);
          lastTapTime = now;
        }
      };

      const doCleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    element.addEventListener('pointerdown', onPointerDown, true);

    const entry = {
      element,
      destroy() {
        element.removeEventListener('pointerdown', onPointerDown, true);
      },
    };

    this._zones.push(entry);
    return entry;
  }

  dispose() {
    this._zones.forEach((z) => z.destroy());
    this._zones.length = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureManager;
}

if (typeof window !== 'undefined') {
  window.GestureManager = GestureManager;
}
