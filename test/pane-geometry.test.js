const test = require('node:test');
const assert = require('node:assert/strict');

const PaneGeometry = require('../public/js/pane-geometry.js');

test('getDefaultPaneBounds stays within the container and cascades', () => {
  const first = PaneGeometry.getDefaultPaneBounds({ width: 1200, height: 800 }, 0);
  const second = PaneGeometry.getDefaultPaneBounds({ width: 1200, height: 800 }, 1);

  assert.equal(first.x, 24);
  assert.equal(first.y, 24);
  assert.ok(first.width <= 1200);
  assert.ok(first.height <= 800);
  assert.ok(second.x > first.x);
  assert.ok(second.y > first.y);
});

test('splitPaneBounds divides a pane vertically when space allows', () => {
  const start = { x: 40, y: 40, width: 900, height: 500 };
  const split = PaneGeometry.splitPaneBounds(start, 'vertical', { width: 1400, height: 900 });

  assert.equal(split.current.x, 40);
  assert.equal(split.current.height, 500);
  assert.equal(split.next.height, 500);
  assert.equal(split.current.width + split.next.width + PaneGeometry.SPLIT_GAP, 900);
  assert.equal(split.next.x, split.current.x + split.current.width + PaneGeometry.SPLIT_GAP);
});

test('resizePaneBounds respects minimum size and top-left edges', () => {
  const start = { x: 60, y: 50, width: 520, height: 420 };
  const resized = PaneGeometry.resizePaneBounds(start, 'nw', 400, 300, { width: 1200, height: 900 });

  assert.equal(resized.x, 260);
  assert.equal(resized.y, 250);
  assert.equal(resized.width, PaneGeometry.MIN_PANE_WIDTH);
  assert.equal(resized.height, PaneGeometry.MIN_PANE_HEIGHT);
});

test('translatePaneBounds moves freely on infinite canvas', () => {
  const moved = PaneGeometry.translatePaneBounds(
    { x: 100, y: 120, width: 500, height: 300 },
    900,
    700,
    { width: 1200, height: 800 }
  );

  // No clamping — infinite canvas allows any position
  assert.equal(moved.x, 1000);
  assert.equal(moved.y, 820);
  assert.equal(moved.width, 500);
  assert.equal(moved.height, 300);
});
