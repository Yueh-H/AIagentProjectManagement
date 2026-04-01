const WebSocket = require('ws');

function createWorkspaceSync({
  webSocketImpl = WebSocket,
} = {}) {
  const clientSockets = new Map();
  const socketClients = new WeakMap();

  function unregisterSocket(ws) {
    const currentClientId = socketClients.get(ws);
    if (!currentClientId) return;

    const sockets = clientSockets.get(currentClientId);
    if (sockets) {
      sockets.delete(ws);
      if (!sockets.size) {
        clientSockets.delete(currentClientId);
      }
    }

    socketClients.delete(ws);
  }

  function registerSocket(clientId, ws) {
    if (!clientId || !ws) return;

    unregisterSocket(ws);

    let sockets = clientSockets.get(clientId);
    if (!sockets) {
      sockets = new Set();
      clientSockets.set(clientId, sockets);
    }

    sockets.add(ws);
    socketClients.set(ws, clientId);
  }

  function broadcast(clientId, message) {
    if (!clientId || !message) return;

    const sockets = clientSockets.get(clientId);
    if (!sockets?.size) return;

    const payload = JSON.stringify(message);
    for (const ws of Array.from(sockets)) {
      if (ws.readyState !== webSocketImpl.OPEN) {
        unregisterSocket(ws);
        continue;
      }

      ws.send(payload);
    }
  }

  return {
    broadcast,
    registerSocket,
    unregisterSocket,
  };
}

const workspaceSync = createWorkspaceSync();

module.exports = {
  ...workspaceSync,
  createWorkspaceSync,
};
