const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_BUFFER_LIMIT = 200000;

function normalizePane(pane = {}) {
  return {
    id: String(pane.id || ''),
    type: typeof pane.type === 'string' ? pane.type : 'terminal',
    title: typeof pane.title === 'string' ? pane.title : '',
    bounds: {
      x: Number.isFinite(pane.bounds?.x) ? pane.bounds.x : 0,
      y: Number.isFinite(pane.bounds?.y) ? pane.bounds.y : 0,
      width: Number.isFinite(pane.bounds?.width) ? pane.bounds.width : 0,
      height: Number.isFinite(pane.bounds?.height) ? pane.bounds.height : 0,
    },
    data: pane.data && typeof pane.data === 'object' ? pane.data : {},
  };
}

function createStateStore({
  dbPath = path.join(__dirname, '..', 'data', 'web-terminal.sqlite'),
  databaseFactory = (targetPath) => new DatabaseSync(targetPath),
  fsImpl = fs,
  pathImpl = path,
  bufferLimit = DEFAULT_BUFFER_LIMIT,
} = {}) {
  fsImpl.mkdirSync(pathImpl.dirname(dbPath), { recursive: true });
  const db = databaseFactory(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS client_layouts (
      client_id TEXT PRIMARY KEY,
      active_pane_id TEXT,
      panes_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pane_buffers (
      client_id TEXT NOT NULL,
      pane_id TEXT NOT NULL,
      buffer TEXT NOT NULL DEFAULT '',
      program_buffer TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (client_id, pane_id)
    );
  `);

  // Migration: add program_buffer column if it doesn't exist yet
  try {
    db.exec(`ALTER TABLE pane_buffers ADD COLUMN program_buffer TEXT NOT NULL DEFAULT ''`);
  } catch { /* column already exists */ }

  const getLayoutStmt = db.prepare(`
    SELECT active_pane_id, panes_json
    FROM client_layouts
    WHERE client_id = ?
  `);
  const getBuffersStmt = db.prepare(`
    SELECT pane_id, buffer, program_buffer
    FROM pane_buffers
    WHERE client_id = ?
  `);
  const saveLayoutStmt = db.prepare(`
    INSERT INTO client_layouts (client_id, active_pane_id, panes_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(client_id) DO UPDATE SET
      active_pane_id = excluded.active_pane_id,
      panes_json = excluded.panes_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  const deleteAllBuffersStmt = db.prepare(`
    DELETE FROM pane_buffers
    WHERE client_id = ?
  `);
  const deleteBufferStmt = db.prepare(`
    DELETE FROM pane_buffers
    WHERE client_id = ? AND pane_id = ?
  `);
  const getBufferStmt = db.prepare(`
    SELECT buffer, program_buffer
    FROM pane_buffers
    WHERE client_id = ? AND pane_id = ?
  `);
  const saveBufferStmt = db.prepare(`
    INSERT INTO pane_buffers (client_id, pane_id, buffer, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(client_id, pane_id) DO UPDATE SET
      buffer = excluded.buffer,
      updated_at = CURRENT_TIMESTAMP
  `);
  const saveProgramBufferStmt = db.prepare(`
    INSERT INTO pane_buffers (client_id, pane_id, buffer, program_buffer, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(client_id, pane_id) DO UPDATE SET
      program_buffer = excluded.program_buffer,
      updated_at = CURRENT_TIMESTAMP
  `);
  const listClientsStmt = db.prepare(`
    SELECT client_id, active_pane_id, panes_json, updated_at
    FROM client_layouts
    ORDER BY updated_at DESC
    LIMIT ?
  `);

  function getState(clientId) {
    const layoutRow = getLayoutStmt.get(clientId);
    const panes = layoutRow?.panes_json ? JSON.parse(layoutRow.panes_json) : [];
    const bufferRows = getBuffersStmt.all(clientId);
    const buffers = new Map(bufferRows.map((r) => [r.pane_id, r.buffer || '']));
    const programBuffers = new Map(bufferRows.map((r) => [r.pane_id, r.program_buffer || '']));

    return {
      activePaneId: layoutRow?.active_pane_id || null,
      panes: panes.map((pane) => ({
        ...normalizePane(pane),
        buffer: pane.type === 'terminal' ? (buffers.get(pane.id) || '') : '',
        programBuffer: pane.type === 'terminal' ? (programBuffers.get(pane.id) || '') : '',
      })),
    };
  }

  function saveLayout(clientId, state = {}) {
    const panes = Array.isArray(state.panes)
      ? state.panes.map(normalizePane).filter((pane) => pane.id)
      : [];
    const activePaneId = panes.some((pane) => pane.id === state.activePaneId)
      ? state.activePaneId
      : (panes[panes.length - 1]?.id || null);

    saveLayoutStmt.run(clientId, activePaneId, JSON.stringify(panes));

    if (!panes.length) {
      deleteAllBuffersStmt.run(clientId);
      return;
    }

    const paneIds = panes.map((pane) => pane.id);
    const placeholders = paneIds.map(() => '?').join(', ');
    db.prepare(`
      DELETE FROM pane_buffers
      WHERE client_id = ? AND pane_id NOT IN (${placeholders})
    `).run(clientId, ...paneIds);
  }

  function appendOutput(clientId, paneId, data) {
    const currentRow = getBufferStmt.get(clientId, paneId);
    const nextBuffer = `${currentRow?.buffer || ''}${data}`.slice(-bufferLimit);
    saveBufferStmt.run(clientId, paneId, nextBuffer);
  }

  function appendProgramOutput(clientId, paneId, data) {
    const currentRow = getBufferStmt.get(clientId, paneId);
    const nextBuffer = `${currentRow?.program_buffer || ''}${data}`.slice(-bufferLimit);
    saveProgramBufferStmt.run(clientId, paneId, currentRow?.buffer || '', nextBuffer);
  }

  function clearPaneBuffer(clientId, paneId) {
    deleteBufferStmt.run(clientId, paneId);
  }

  function listClients(limit = 20) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 20;
    return listClientsStmt.all(safeLimit).map((row) => {
      const panes = row.panes_json ? JSON.parse(row.panes_json) : [];
      return {
        clientId: row.client_id,
        activePaneId: row.active_pane_id || null,
        paneCount: Array.isArray(panes) ? panes.length : 0,
        updatedAt: row.updated_at,
      };
    });
  }

  function close() {
    db.close();
  }

  return {
    getState,
    saveLayout,
    appendOutput,
    appendProgramOutput,
    clearPaneBuffer,
    listClients,
    close,
  };
}

const stateStore = createStateStore();

module.exports = {
  ...stateStore,
  createStateStore,
};
