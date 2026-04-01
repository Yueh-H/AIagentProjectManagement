const test = require('node:test');
const assert = require('node:assert/strict');

const { createConnectionHandler } = require('../server/ws-handler');

function createFakeSocket() {
  const handlers = new Map();
  const sent = [];

  return {
    readyState: 1,
    sent,
    on(event, handler) {
      handlers.set(event, handler);
    },
    send(payload) {
      sent.push(JSON.parse(payload));
    },
    emit(event, payload) {
      const handler = handlers.get(event);
      if (handler) handler(payload);
    },
  };
}

function createFakeTerminal() {
  let onData = () => {};
  let onExit = () => {};

  return {
    onData(handler) {
      onData = handler;
    },
    onExit(handler) {
      onExit = handler;
    },
    emitData(data) {
      onData(data);
    },
    emitExit(payload) {
      onExit(payload);
    },
  };
}

test('handleConnection forwards create, input, resize and exit events', () => {
  const calls = {
    create: null,
    writes: [],
    resizes: [],
    destroyed: [],
    appendOutput: [],
    clearPaneBuffer: [],
  };
  const terminal = createFakeTerminal();
  const handler = createConnectionHandler({
    ptyManagerImpl: {
      createPty: (paneId, cols, rows) => {
        calls.create = [paneId, cols, rows];
        return terminal;
      },
      writeToPty: (paneId, data) => calls.writes.push([paneId, data]),
      resizePty: (paneId, cols, rows) => calls.resizes.push([paneId, cols, rows]),
      destroyPty: (paneId) => calls.destroyed.push(paneId),
    },
    stateStoreImpl: {
      getState: () => ({ activePaneId: null, panes: [] }),
      saveLayout: () => {},
      appendOutput: (clientId, paneId, data) => calls.appendOutput.push([clientId, paneId, data]),
      appendProgramOutput: () => {},
      clearPaneBuffer: (clientId, paneId) => calls.clearPaneBuffer.push([clientId, paneId]),
    },
    webSocketImpl: { OPEN: 1 },
  });
  const ws = createFakeSocket();

  handler(ws);
  ws.emit('message', JSON.stringify({ type: 'init', clientId: 'client-1' }));
  ws.emit('message', JSON.stringify({ type: 'create', clientId: 'client-1', paneId: 'pane-1', cols: 100, rows: 36 }));
  terminal.emitData('hello from pty');
  ws.emit('message', JSON.stringify({ type: 'input', clientId: 'client-1', paneId: 'pane-1', data: 'pwd\r' }));
  ws.emit('message', JSON.stringify({ type: 'resize', clientId: 'client-1', paneId: 'pane-1', cols: 120, rows: 42 }));
  terminal.emitExit({ exitCode: 0 });
  ws.emit('message', JSON.stringify({ type: 'close', clientId: 'client-1', paneId: 'pane-1' }));

  assert.deepEqual(calls.create, ['client-1:pane-1', 100, 36]);
  assert.deepEqual(calls.writes, [['client-1:pane-1', 'pwd\r']]);
  assert.deepEqual(calls.resizes, [['client-1:pane-1', 120, 42]]);
  assert.deepEqual(calls.destroyed, ['client-1:pane-1']);
  assert.deepEqual(calls.appendOutput, [['client-1', 'pane-1', 'hello from pty']]);
  assert.deepEqual(calls.clearPaneBuffer, [['client-1', 'pane-1']]);
  assert.deepEqual(ws.sent, [
    { type: 'hydrate', state: { activePaneId: null, panes: [] } },
    { type: 'output', paneId: 'pane-1', data: 'hello from pty', origin: 'program' },
    { type: 'exit', paneId: 'pane-1', code: 0 },
  ]);
});

test('handleConnection reports terminal creation errors without crashing the socket', () => {
  const handler = createConnectionHandler({
    ptyManagerImpl: {
      createPty: () => {
        throw new Error('spawn failed');
      },
      writeToPty: () => {},
      resizePty: () => {},
      destroyPty: () => {},
    },
    stateStoreImpl: {
      getState: () => ({ activePaneId: null, panes: [] }),
      saveLayout: () => {},
      appendOutput: () => {},
      appendProgramOutput: () => {},
      clearPaneBuffer: () => {},
    },
    webSocketImpl: { OPEN: 1 },
  });
  const ws = createFakeSocket();

  handler(ws);
  ws.emit('message', JSON.stringify({ type: 'init', clientId: 'client-9' }));
  ws.emit('message', JSON.stringify({ type: 'create', clientId: 'client-9', paneId: 'pane-9', cols: 80, rows: 24 }));

  assert.deepEqual(ws.sent, [
    { type: 'hydrate', state: { activePaneId: null, panes: [] } },
    {
      type: 'error',
      paneId: 'pane-9',
      message: 'Failed to create terminal: spawn failed',
    },
  ]);
});

test('handleConnection persists layout updates to the state store', () => {
  const layouts = [];
  const handler = createConnectionHandler({
    ptyManagerImpl: {
      createPty: () => createFakeTerminal(),
      writeToPty: () => {},
      resizePty: () => {},
      destroyPty: () => {},
    },
    stateStoreImpl: {
      getState: () => ({ activePaneId: null, panes: [] }),
      saveLayout: (clientId, state) => layouts.push([clientId, state]),
      appendOutput: () => {},
      appendProgramOutput: () => {},
      clearPaneBuffer: () => {},
    },
    webSocketImpl: { OPEN: 1 },
  });
  const ws = createFakeSocket();

  handler(ws);
  ws.emit('message', JSON.stringify({ type: 'init', clientId: 'client-layout' }));
  ws.emit('message', JSON.stringify({
    type: 'persist_state',
    clientId: 'client-layout',
    state: {
      activePaneId: 'pane-1',
      panes: [
        {
          id: 'pane-1',
          type: 'project',
          title: 'Claude Main',
          bounds: { x: 10, y: 20, width: 700, height: 500 },
          data: {
            objective: 'Keep an eye on the active terminals',
            nextAction: 'Wait for the next command to finish',
          },
        },
        {
          id: 'pane-2',
          type: 'agent-output',
          title: 'Claude Stream',
          bounds: { x: 40, y: 30, width: 480, height: 320 },
          data: {
            sourcePaneId: 'pane-9',
            agentName: 'claude-code',
          },
        },
        {
          id: 'pane-3',
          type: 'markdown',
          title: 'summary.md',
          bounds: { x: 60, y: 50, width: 520, height: 360 },
          data: {
            markdown: '# Summary\n\n- keep exact markdown\n',
          },
        },
      ],
    },
  }));

  assert.deepEqual(layouts, [[
    'client-layout',
    {
      activePaneId: 'pane-1',
      panes: [
        {
          id: 'pane-1',
          type: 'project',
          title: 'Claude Main',
          bounds: { x: 10, y: 20, width: 700, height: 500 },
          data: {
            objective: 'Keep an eye on the active terminals',
            nextAction: 'Wait for the next command to finish',
          },
        },
        {
          id: 'pane-2',
          type: 'agent-output',
          title: 'Claude Stream',
          bounds: { x: 40, y: 30, width: 480, height: 320 },
          data: {
            sourcePaneId: 'pane-9',
            agentName: 'claude-code',
          },
        },
        {
          id: 'pane-3',
          type: 'markdown',
          title: 'summary.md',
          bounds: { x: 60, y: 50, width: 520, height: 360 },
          data: {
            markdown: '# Summary\n\n- keep exact markdown\n',
          },
        },
      ],
    },
  ]]);
});
