const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createStateStore } = require('../server/state-store');
const { createCardService } = require('../server/card-service');

function createTempStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-terminal-card-service-'));
  const dbPath = path.join(tempDir, 'state.sqlite');
  return createStateStore({ dbPath, bufferLimit: 64 });
}

test('card service creates, updates and deletes writable cards while preserving extra pane data', () => {
  const store = createTempStore();
  const broadcasts = [];
  const service = createCardService({
    stateStoreImpl: store,
    workspaceSyncImpl: {
      broadcast: (clientId, payload) => broadcasts.push([clientId, payload]),
    },
  });

  store.saveLayout('client-service', {
    activePaneId: 'pane-1',
    panes: [
      {
        id: 'pane-1',
        type: 'project',
        title: 'Existing Project',
        bounds: { x: 20, y: 30, width: 500, height: 380 },
        data: {
          objective: 'Ship card automation',
          successCriteria: 'Claude can create cards from cmd',
          nextAction: 'Add HTTP API',
          notes: '',
          colorTheme: 'rose',
        },
      },
    ],
  });

  const created = service.createCard({
    type: 'markdown',
    title: 'Plan.md',
    data: {
      markdown: '# Plan\n\n- add API\n',
    },
  });

  assert.equal(created.clientId, 'client-service');
  assert.equal(created.pane.id, 'pane-2');
  assert.deepEqual(created.pane.data, {
    markdown: '# Plan\n\n- add API\n',
  });
  assert.deepEqual(created.pane.bounds, {
    x: 56,
    y: 66,
    width: 520,
    height: 360,
  });

  const updated = service.updateCard({
    clientId: 'client-service',
    paneId: 'pane-1',
    data: {
      notes: 'HTTP route is in progress.',
    },
    append: {
      notes: '\nCLI wrapper next.',
    },
  });

  assert.deepEqual(updated.pane.data, {
    objective: 'Ship card automation',
    successCriteria: 'Claude can create cards from cmd',
    nextAction: 'Add HTTP API',
    notes: 'HTTP route is in progress.\nCLI wrapper next.',
    colorTheme: 'rose',
  });

  const deleted = service.deleteCard({
    clientId: 'client-service',
    paneId: 'pane-2',
  });

  assert.equal(deleted.paneId, 'pane-2');
  assert.deepEqual(store.getState('client-service'), {
    activePaneId: 'pane-1',
    panes: [
      {
        id: 'pane-1',
        type: 'project',
        title: 'Existing Project',
        bounds: { x: 20, y: 30, width: 500, height: 380 },
        data: {
          objective: 'Ship card automation',
          successCriteria: 'Claude can create cards from cmd',
          nextAction: 'Add HTTP API',
          notes: 'HTTP route is in progress.\nCLI wrapper next.',
          colorTheme: 'rose',
        },
        buffer: '',
        programBuffer: '',
      },
    ],
    sections: [],
  });

  assert.deepEqual(broadcasts, [
    ['client-service', {
      type: 'card_created',
      pane: {
        id: 'pane-2',
        type: 'markdown',
        title: 'Plan.md',
        bounds: { x: 56, y: 66, width: 520, height: 360 },
        data: { markdown: '# Plan\n\n- add API\n' },
      },
      paneId: 'pane-2',
      activePaneId: 'pane-2',
    }],
    ['client-service', {
      type: 'card_updated',
      pane: {
        id: 'pane-1',
        type: 'project',
        title: 'Existing Project',
        bounds: { x: 20, y: 30, width: 500, height: 380 },
        data: {
          objective: 'Ship card automation',
          successCriteria: 'Claude can create cards from cmd',
          nextAction: 'Add HTTP API',
          notes: 'HTTP route is in progress.\nCLI wrapper next.',
          colorTheme: 'rose',
        },
      },
      paneId: 'pane-1',
      activePaneId: 'pane-2',
    }],
    ['client-service', {
      type: 'card_deleted',
      paneId: 'pane-2',
      activePaneId: 'pane-1',
    }],
  ]);

  store.close();
});
