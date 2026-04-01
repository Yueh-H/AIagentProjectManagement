const WebSocket = require('ws');
const ptyManager = require('./pty-manager');
const stateStore = require('./state-store');

function getPtyKey(clientId, paneId) {
  return clientId ? `${clientId}:${paneId}` : paneId;
}

function createConnectionHandler({
  ptyManagerImpl = ptyManager,
  webSocketImpl = WebSocket,
  stateStoreImpl = stateStore,
} = {}) {
  const ECHO_WINDOW_MS = 300;

  return function handleConnection(ws) {
    const paneKeys = new Set();
    const echoTrackers = new Map();   // ptyKey → { lastInputAt }
    let currentClientId = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'init': {
          currentClientId = msg.clientId || null;
          if (currentClientId && ws.readyState === webSocketImpl.OPEN) {
            ws.send(JSON.stringify({
              type: 'hydrate',
              state: stateStoreImpl.getState(currentClientId),
            }));
          }
          break;
        }
        case 'persist_state': {
          currentClientId = msg.clientId || currentClientId;
          if (currentClientId) {
            stateStoreImpl.saveLayout(currentClientId, msg.state);
          }
          break;
        }
        case 'create': {
          const { paneId, cols, rows } = msg;
          currentClientId = msg.clientId || currentClientId;
          const ptyKey = getPtyKey(currentClientId, paneId);
          try {
            paneKeys.add(ptyKey);
            // Per-PTY input timing tracker for echo detection
            const echoTracker = { lastInputAt: 0 };
            echoTrackers.set(ptyKey, echoTracker);

            const p = ptyManagerImpl.createPty(ptyKey, cols, rows);
            p.onData((data) => {
              // Tag output origin: if PTY output arrives within ECHO_WINDOW_MS
              // of the last user keystroke, it's likely echo of user input.
              const now = Date.now();
              const origin = (now - echoTracker.lastInputAt < ECHO_WINDOW_MS)
                ? 'echo' : 'program';

              if (currentClientId) {
                stateStoreImpl.appendOutput(currentClientId, paneId, data);
                if (origin === 'program') {
                  stateStoreImpl.appendProgramOutput(currentClientId, paneId, data);
                }
              }
              if (ws.readyState === webSocketImpl.OPEN) {
                ws.send(JSON.stringify({ type: 'output', paneId, data, origin }));
              }
            });
            p.onExit(({ exitCode }) => {
              paneKeys.delete(ptyKey);
              echoTrackers.delete(ptyKey);
              if (ws.readyState === webSocketImpl.OPEN) {
                ws.send(JSON.stringify({ type: 'exit', paneId, code: exitCode }));
              }
            });
          } catch (error) {
            paneKeys.delete(ptyKey);
            echoTrackers.delete(ptyKey);
            if (ws.readyState === webSocketImpl.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                paneId,
                message: `Failed to create terminal: ${error.message}`,
              }));
            }
          }
          break;
        }
        case 'input': {
          const clientId = msg.clientId || currentClientId;
          const ptyKey = getPtyKey(clientId, msg.paneId);
          // Record input timestamp for echo detection
          const tracker = echoTrackers.get(ptyKey);
          if (tracker) tracker.lastInputAt = Date.now();
          ptyManagerImpl.writeToPty(ptyKey, msg.data);
          break;
        }
        case 'resize': {
          const clientId = msg.clientId || currentClientId;
          ptyManagerImpl.resizePty(getPtyKey(clientId, msg.paneId), msg.cols, msg.rows);
          break;
        }
        case 'close': {
          const clientId = msg.clientId || currentClientId;
          const ptyKey = getPtyKey(clientId, msg.paneId);
          ptyManagerImpl.destroyPty(ptyKey);
          paneKeys.delete(ptyKey);
          if (clientId) {
            stateStoreImpl.clearPaneBuffer(clientId, msg.paneId);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      for (const key of paneKeys) {
        ptyManagerImpl.destroyPty(key);
      }
      paneKeys.clear();
      echoTrackers.clear();
    });
  };
}

const handleConnection = createConnectionHandler();

module.exports = { handleConnection, createConnectionHandler };
