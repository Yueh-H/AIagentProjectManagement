const test = require('node:test');
const assert = require('node:assert/strict');

const PaneGeometry = require('../public/js/pane-geometry.js');

class FakeClassList {
  constructor() {
    this._tokens = new Set();
  }

  add(...tokens) {
    tokens.forEach((token) => this._tokens.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this._tokens.delete(token));
  }

  toggle(token, force) {
    if (force === undefined) {
      if (this._tokens.has(token)) {
        this._tokens.delete(token);
        return false;
      }
      this._tokens.add(token);
      return true;
    }

    if (force) {
      this._tokens.add(token);
    } else {
      this._tokens.delete(token);
    }
    return force;
  }

  contains(token) {
    return this._tokens.has(token);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.hidden = false;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  addEventListener() {}

  removeEventListener() {}

  setAttribute() {}

  focus() {}

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains?.(node));
  }

  closest() {
    return null;
  }

  getBoundingClientRect() {
    return {
      ...this._rect,
      right: this._rect.left + this._rect.width,
      bottom: this._rect.top + this._rect.height,
    };
  }
}

function installPaneManagerDom() {
  const storage = new Map();
  const body = new FakeElement('body');
  const fakeDocument = {
    body,
    fonts: null,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  const fakeWindow = {
    WorkspaceConfig: {
      canvas: {},
      pane: {},
    },
    PaneGeometry,
    BaseCard: {
      getColorThemeEntries() {
        return [];
      },
    },
    innerWidth: 1440,
    innerHeight: 900,
    addEventListener() {},
    removeEventListener() {},
  };

  global.window = fakeWindow;
  global.document = fakeDocument;
  global.CardRegistry = {
    getAll() {
      return [];
    },
    getSpawnBounds() {
      return null;
    },
  };
  global.localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
  };
  global.crypto = {
    randomUUID() {
      return 'test-client-id';
    },
  };
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };

  return {
    cleanup() {
      delete global.window;
      delete global.document;
      delete global.CardRegistry;
      delete global.localStorage;
      delete global.crypto;
      delete global.ResizeObserver;
    },
  };
}

function createPane(id, initialBounds) {
  const element = new FakeElement('section');
  const state = {
    bounds: { ...initialBounds },
    selected: false,
    active: false,
    fitCalls: 0,
  };

  return {
    paneId: id,
    cardType: 'test',
    getElement() {
      return element;
    },
    getBounds() {
      return { ...state.bounds };
    },
    setBounds(bounds) {
      state.bounds = { ...bounds };
    },
    setSelected(isSelected) {
      state.selected = Boolean(isSelected);
    },
    setActive(isActive) {
      state.active = Boolean(isActive);
    },
    scheduleFit() {
      state.fitCalls += 1;
    },
    setZIndex() {},
    focus() {},
    getTitle() {
      return id;
    },
    getPersistData() {
      return {};
    },
    getUiPersistData() {
      return {};
    },
    inspect() {
      return { ...state };
    },
  };
}

test('marquee helpers select intersecting panes and drag them together', () => {
  const env = installPaneManagerDom();
  const PaneManager = require('../public/js/pane-manager.js');

  const container = new FakeElement('div');
  container.clientWidth = 1200;
  container.clientHeight = 800;
  container._rect = { left: 20, top: 30, width: 1200, height: 800 };

  const manager = new PaneManager(container);
  const paneOne = createPane('pane-1', { x: 100, y: 120, width: 360, height: 240 });
  const paneTwo = createPane('pane-2', { x: 520, y: 200, width: 340, height: 240 });
  const paneThree = createPane('pane-3', { x: 980, y: 560, width: 340, height: 240 });

  manager.panes.set('pane-1', paneOne);
  manager.panes.set('pane-2', paneTwo);
  manager.panes.set('pane-3', paneThree);

  const selectionRect = manager._getCanvasRectFromScreenPoints(120, 150, 880, 480);
  assert.deepEqual(selectionRect, { x: 100, y: 120, width: 760, height: 330 });
  assert.deepEqual(manager._getPaneIdsIntersectingRect(selectionRect), ['pane-1', 'pane-2']);

  manager._setSelectedPaneIds(['pane-1', 'pane-2']);
  assert.equal(paneOne.inspect().selected, true);
  assert.equal(paneTwo.inspect().selected, true);
  assert.equal(paneThree.inspect().selected, false);

  const dragSession = manager._beginSelectedGroupDrag('pane-1');
  assert.ok(dragSession);

  manager._updateSelectedGroupDrag('pane-1', dragSession, 45, 30);
  assert.deepEqual(paneOne.getBounds(), { x: 145, y: 150, width: 360, height: 240 });
  assert.deepEqual(paneTwo.getBounds(), { x: 565, y: 230, width: 340, height: 240 });
  assert.deepEqual(paneThree.getBounds(), { x: 980, y: 560, width: 340, height: 240 });

  let persistCalls = 0;
  let refreshCalls = 0;
  manager._persistLayout = () => {
    persistCalls += 1;
  };
  manager._refreshWorkspaceCards = () => {
    refreshCalls += 1;
  };

  manager._endSelectedGroupDrag('pane-1', dragSession);
  assert.equal(paneOne.inspect().fitCalls, 1);
  assert.equal(paneTwo.inspect().fitCalls, 1);
  assert.equal(persistCalls, 1);
  assert.equal(refreshCalls, 1);

  env.cleanup();
});

test('focusing another pane inside a multi-selection keeps the group selected', () => {
  const env = installPaneManagerDom();
  const PaneManager = require('../public/js/pane-manager.js');

  const container = new FakeElement('div');
  container.clientWidth = 1200;
  container.clientHeight = 800;

  const manager = new PaneManager(container);
  const paneOne = createPane('pane-1', { x: 80, y: 80, width: 160, height: 120 });
  const paneTwo = createPane('pane-2', { x: 280, y: 140, width: 160, height: 120 });

  manager.panes.set('pane-1', paneOne);
  manager.panes.set('pane-2', paneTwo);
  manager._setSelectedPaneIds(['pane-1', 'pane-2']);
  manager.setActive('pane-1', { preserveSelection: true });

  manager._focusPane('pane-2');

  assert.equal(manager.activePaneId, 'pane-2');
  assert.equal(paneOne.inspect().selected, true);
  assert.equal(paneTwo.inspect().selected, true);
  assert.equal(paneOne.inspect().active, false);
  assert.equal(paneTwo.inspect().active, true);

  env.cleanup();
});
