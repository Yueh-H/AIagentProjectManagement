const test = require('node:test');
const assert = require('node:assert/strict');

const GestureManager = require('../public/js/gesture-manager.js');

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

  contains(token) {
    return this._tokens.has(token);
  }
}

class FakeEventTarget {
  constructor(name = 'target') {
    this.name = name;
    this.parent = null;
    this._listeners = new Map();
  }

  appendChild(child) {
    child.parent = this;
  }

  addEventListener(type, handler, options = false) {
    const handlers = this._listeners.get(type) || [];
    const capture = options === true || options?.capture === true;
    handlers.push({ handler, capture });
    this._listeners.set(type, handlers);
  }

  removeEventListener(type, handler, options = false) {
    const handlers = this._listeners.get(type) || [];
    const capture = options === true || options?.capture === true;
    this._listeners.set(type, handlers.filter((entry) => {
      return entry.handler !== handler || entry.capture !== capture;
    }));
  }

  dispatch(type, event = {}) {
    const path = [];
    for (let node = this; node; node = node.parent) {
      path.unshift(node);
    }

    let propagationStopped = false;
    let immediatePropagationStopped = false;
    let defaultPrevented = false;
    const payload = {
      type,
      target: event.target || this,
      currentTarget: this,
      ...event,
      stopPropagation() {
        propagationStopped = true;
      },
      stopImmediatePropagation() {
        immediatePropagationStopped = true;
        propagationStopped = true;
      },
      preventDefault() {
        defaultPrevented = true;
      },
      get defaultPrevented() {
        return defaultPrevented;
      },
    };

    const invoke = (node, capture) => {
      const handlers = [...(node._listeners.get(type) || [])];
      payload.currentTarget = node;
      immediatePropagationStopped = false;
      for (const entry of handlers) {
        if (entry.capture !== capture) continue;
        entry.handler(payload);
        if (immediatePropagationStopped) break;
      }
    };

    for (const node of path) {
      invoke(node, true);
      if (propagationStopped) return payload;
    }

    for (let i = path.length - 1; i >= 0; i -= 1) {
      invoke(path[i], false);
      if (propagationStopped) return payload;
    }

    return payload;
  }
}

function installGestureDom() {
  const fakeWindow = new FakeEventTarget('window');
  const fakeDocument = {
    body: {
      classList: new FakeClassList(),
    },
  };

  global.window = fakeWindow;
  global.document = fakeDocument;

  return {
    window: fakeWindow,
    document: fakeDocument,
    cleanup() {
      delete global.window;
      delete global.document;
    },
  };
}

test('drag starts on the threshold-crossing move and applies that delta immediately', () => {
  const env = installGestureDom();
  const element = new FakeEventTarget('element');
  const calls = [];
  const gestures = new GestureManager();

  gestures.zone(element, {
    dragThreshold: 4,
    onDragStart: () => {
      calls.push('start');
    },
    onDrag: (_event, delta) => {
      calls.push(['drag', delta.x, delta.y]);
    },
    onDragEnd: () => {
      calls.push('end');
    },
  });

  element.dispatch('pointerdown', { button: 0, clientX: 10, clientY: 20 });
  env.window.dispatch('pointermove', { clientX: 16, clientY: 26, target: element });

  assert.deepEqual(calls, ['start', ['drag', 6, 6]]);
  assert.equal(env.document.body.classList.contains('is-gesture-active'), true);

  env.window.dispatch('pointerup', { clientX: 16, clientY: 26, target: element });
  assert.deepEqual(calls, ['start', ['drag', 6, 6], 'end']);
  assert.equal(env.document.body.classList.contains('is-gesture-active'), false);

  gestures.dispose();
  env.cleanup();
});

test('dragThreshold can be derived from the pointerdown event', () => {
  const env = installGestureDom();
  const element = new FakeEventTarget('element');
  const calls = [];
  const gestures = new GestureManager();

  gestures.zone(element, {
    dragThreshold: (event) => event.customThreshold,
    onDragStart: () => {
      calls.push('start');
    },
    onDrag: (_event, delta) => {
      calls.push(['drag', delta.x, delta.y]);
    },
  });

  element.dispatch('pointerdown', {
    button: 0,
    clientX: 30,
    clientY: 40,
    customThreshold: 0,
  });
  env.window.dispatch('pointermove', { clientX: 31, clientY: 40, target: element });

  assert.deepEqual(calls, ['start', ['drag', 1, 0]]);

  gestures.dispose();
  env.cleanup();
});

test('capture-phase pointerdown tracking still starts drag from interactive children', () => {
  const env = installGestureDom();
  const element = new FakeEventTarget('element');
  const child = new FakeEventTarget('child');
  const calls = [];
  const gestures = new GestureManager();

  element.appendChild(child);
  child.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  gestures.zone(element, {
    dragThreshold: 0,
    onDragStart: () => {
      calls.push('start');
    },
    onDrag: (_event, delta) => {
      calls.push(['drag', delta.x, delta.y]);
    },
  });

  child.dispatch('pointerdown', { button: 0, clientX: 12, clientY: 18 });
  env.window.dispatch('pointermove', { clientX: 15, clientY: 22, target: child });

  assert.deepEqual(calls, ['start', ['drag', 3, 4]]);

  gestures.dispose();
  env.cleanup();
});
