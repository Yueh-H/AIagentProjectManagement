const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createStateStore } = require('../server/state-store');
const { createCardService } = require('../server/card-service');
const { createApiRouter } = require('../server/api-router');

function createTempStore() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-terminal-api-router-'));
  const dbPath = path.join(tempDir, 'state.sqlite');
  return createStateStore({ dbPath, bufferLimit: 64 });
}

test('api router exposes card create and update flows', async () => {
  const store = createTempStore();
  const broadcasts = [];
  const service = createCardService({
    stateStoreImpl: store,
    workspaceSyncImpl: {
      broadcast: (clientId, payload) => broadcasts.push([clientId, payload]),
    },
  });

  store.saveLayout('client-api', {
    activePaneId: 'pane-1',
    panes: [
      {
        id: 'pane-1',
        type: 'project',
        title: 'Workspace',
        bounds: { x: 12, y: 18, width: 520, height: 360 },
        data: {
          objective: 'Track work',
          successCriteria: '',
          nextAction: '',
          notes: '',
        },
      },
    ],
  });

  const app = express();
  app.use('/api', createApiRouter({ cardServiceImpl: service }));
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const createResponse = await fetch(`${baseUrl}/api/cards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: 'client-api',
      type: 'markdown',
      title: 'handoff.md',
      data: {
        markdown: '# Handoff\n',
      },
    }),
  });
  assert.equal(createResponse.status, 201);
  const createPayload = await createResponse.json();
  assert.equal(createPayload.ok, true);
  assert.equal(createPayload.pane.id, 'pane-2');

  const updateResponse = await fetch(`${baseUrl}/api/cards/pane-2`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: 'client-api',
      append: {
        markdown: '\n- synced from API\n',
      },
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updatePayload = await updateResponse.json();
  assert.equal(updatePayload.pane.data.markdown, '# Handoff\n\n- synced from API\n');

  const listResponse = await fetch(`${baseUrl}/api/cards?clientId=client-api`);
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json();
  assert.deepEqual(listPayload.panes, [
    {
      id: 'pane-1',
      type: 'project',
      title: 'Workspace',
      bounds: { x: 12, y: 18, width: 520, height: 360 },
      data: {
        objective: 'Track work',
        successCriteria: '',
        nextAction: '',
        notes: '',
      },
    },
    {
      id: 'pane-2',
      type: 'markdown',
      title: 'handoff.md',
      bounds: { x: 48, y: 54, width: 520, height: 360 },
      data: {
        markdown: '# Handoff\n\n- synced from API\n',
      },
    },
  ]);

  assert.deepEqual(broadcasts, [
    ['client-api', {
      type: 'card_created',
      pane: {
        id: 'pane-2',
        type: 'markdown',
        title: 'handoff.md',
        bounds: { x: 48, y: 54, width: 520, height: 360 },
        data: {
          markdown: '# Handoff\n',
        },
      },
      paneId: 'pane-2',
      activePaneId: 'pane-2',
    }],
    ['client-api', {
      type: 'card_updated',
      pane: {
        id: 'pane-2',
        type: 'markdown',
        title: 'handoff.md',
        bounds: { x: 48, y: 54, width: 520, height: 360 },
        data: {
          markdown: '# Handoff\n\n- synced from API\n',
        },
      },
      paneId: 'pane-2',
      activePaneId: 'pane-2',
    }],
  ]);

  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  store.close();
});
