const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { handleConnection } = require('./ws-handler');

const app = express();
const server = http.createServer(app);

// Serve static files
app.use('/', express.static(path.join(__dirname, '..', 'public')));
app.use('/xterm', express.static(path.join(__dirname, '..', 'node_modules', '@xterm')));

// WebSocket
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    handleConnection(ws);
  });
});

const DEFAULT_PORT = 3000;
const requestedPort = Number.parseInt(process.env.PORT ?? DEFAULT_PORT, 10);
const hasExplicitPort = process.env.PORT != null;
const maxRetries = hasExplicitPort ? 0 : 10;

function startServer(port, retriesLeft) {
  const onListening = () => {
    server.off('error', onError);

    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;

    console.log(`Web Terminal running at http://localhost:${actualPort}`);
  };

  const onError = (error) => {
    server.off('listening', onListening);

    if (error.code === 'EADDRINUSE' && retriesLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use, trying ${nextPort}...`);
      startServer(nextPort, retriesLeft - 1);
      return;
    }

    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the existing process or run with PORT=<port> npm start.`);
      process.exit(1);
      return;
    }

    console.error('Failed to start server:', error);
    process.exit(1);
  };

  server.once('listening', onListening);
  server.once('error', onError);
  server.listen(port);
}

if (Number.isNaN(requestedPort)) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
} else {
  startServer(requestedPort, maxRetries);
}
