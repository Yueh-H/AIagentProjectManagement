const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createStateStore } = require('../server/state-store');

test('state store saves layout and restores pane buffers from sqlite', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-terminal-db-'));
  const dbPath = path.join(tempDir, 'state.sqlite');
  const store = createStateStore({ dbPath, bufferLimit: 64 });

  store.saveLayout('client-a', {
    activePaneId: 'pane-2',
    panes: [
      {
        id: 'pane-1',
        title: 'Main',
        bounds: { x: 10, y: 20, width: 700, height: 500 },
      },
      {
        id: 'pane-2',
        type: 'project',
        title: 'Apollo Launch',
        bounds: { x: 30, y: 40, width: 600, height: 420 },
        data: {
          objective: 'Ship the new terminal workspace',
          successCriteria: 'Project card survives reload and tracks live terminals',
          nextAction: 'Watch the build logs',
          notes: 'Coordinate handoff after smoke test passes',
        },
      },
    ],
  });
  store.appendOutput('client-a', 'pane-1', 'hello');
  store.appendOutput('client-a', 'pane-1', ' world');

  assert.deepEqual(store.getState('client-a'), {
    activePaneId: 'pane-2',
    panes: [
      {
        id: 'pane-1',
        type: 'terminal',
        title: 'Main',
        bounds: { x: 10, y: 20, width: 700, height: 500 },
        data: {},
        buffer: 'hello world',
        programBuffer: '',
      },
      {
        id: 'pane-2',
        type: 'project',
        title: 'Apollo Launch',
        bounds: { x: 30, y: 40, width: 600, height: 420 },
        data: {
          objective: 'Ship the new terminal workspace',
          successCriteria: 'Project card survives reload and tracks live terminals',
          nextAction: 'Watch the build logs',
          notes: 'Coordinate handoff after smoke test passes',
        },
        buffer: '',
        programBuffer: '',
      },
    ],
  });

  store.saveLayout('client-a', {
    activePaneId: 'pane-1',
    panes: [
      {
        id: 'pane-1',
        title: 'Main',
        bounds: { x: 10, y: 20, width: 700, height: 500 },
      },
    ],
  });

  assert.deepEqual(store.getState('client-a'), {
    activePaneId: 'pane-1',
    panes: [
      {
        id: 'pane-1',
        type: 'terminal',
        title: 'Main',
        bounds: { x: 10, y: 20, width: 700, height: 500 },
        data: {},
        buffer: 'hello world',
        programBuffer: '',
      },
    ],
  });

  store.close();
});

test('state store preserves agent-output and markdown card data without terminal buffers', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-terminal-db-'));
  const dbPath = path.join(tempDir, 'state.sqlite');
  const store = createStateStore({ dbPath, bufferLimit: 64 });

  store.saveLayout('client-b', {
    activePaneId: 'pane-8',
    panes: [
      {
        id: 'pane-7',
        type: 'agent-output',
        title: 'Claude Stream',
        bounds: { x: 40, y: 50, width: 640, height: 420 },
        data: {
          sourcePaneId: 'pane-1',
          agentName: 'claude-code',
        },
      },
      {
        id: 'pane-8',
        type: 'markdown',
        title: 'handoff.md',
        bounds: { x: 80, y: 90, width: 700, height: 500 },
        data: {
          markdown: '# Handoff\n\n- Agent output is linked\n- Markdown stays exact\n',
        },
      },
    ],
  });

  assert.deepEqual(store.getState('client-b'), {
    activePaneId: 'pane-8',
    panes: [
      {
        id: 'pane-7',
        type: 'agent-output',
        title: 'Claude Stream',
        bounds: { x: 40, y: 50, width: 640, height: 420 },
        data: {
          sourcePaneId: 'pane-1',
          agentName: 'claude-code',
        },
        buffer: '',
        programBuffer: '',
      },
      {
        id: 'pane-8',
        type: 'markdown',
        title: 'handoff.md',
        bounds: { x: 80, y: 90, width: 700, height: 500 },
        data: {
          markdown: '# Handoff\n\n- Agent output is linked\n- Markdown stays exact\n',
        },
        buffer: '',
        programBuffer: '',
      },
    ],
  });

  store.close();
});

test('state store keeps program output scoped to the correct terminal pane', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-terminal-db-'));
  const dbPath = path.join(tempDir, 'state.sqlite');
  const store = createStateStore({ dbPath, bufferLimit: 64 });

  store.saveLayout('client-c', {
    activePaneId: 'pane-1',
    panes: [
      {
        id: 'pane-1',
        title: 'Main',
        bounds: { x: 10, y: 20, width: 700, height: 500 },
      },
    ],
  });

  store.appendOutput('client-c', 'pane-1', '$ echo hi\n');
  store.appendProgramOutput('client-c', 'pane-1', 'hi\n');

  assert.deepEqual(store.getState('client-c'), {
    activePaneId: 'pane-1',
    panes: [
      {
        id: 'pane-1',
        type: 'terminal',
        title: 'Main',
        bounds: { x: 10, y: 20, width: 700, height: 500 },
        data: {},
        buffer: '$ echo hi\n',
        programBuffer: 'hi\n',
      },
    ],
  });

  store.close();
});
