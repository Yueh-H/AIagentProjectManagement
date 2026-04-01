const express = require('express');
const cardService = require('./card-service');
const { CardServiceError } = require('./card-service');

function createApiRouter({
  cardServiceImpl = cardService,
} = {}) {
  const router = express.Router();

  router.use(express.json({ limit: '1mb' }));

  router.get('/workspaces', (req, res, next) => {
    try {
      const limit = Number.parseInt(req.query.limit ?? '20', 10);
      res.json({
        ok: true,
        workspaces: cardServiceImpl.listWorkspaces(Number.isNaN(limit) ? 20 : limit),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/workspaces/:clientId/state', (req, res, next) => {
    try {
      const result = cardServiceImpl.getWorkspaceState(req.params.clientId);
      res.json({
        ok: true,
        clientId: result.clientId,
        state: result.state,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/cards', (req, res, next) => {
    try {
      const result = cardServiceImpl.listCards(req.query.clientId);
      res.json({
        ok: true,
        clientId: result.clientId,
        activePaneId: result.activePaneId,
        panes: result.panes,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/cards', (req, res, next) => {
    try {
      const result = cardServiceImpl.createCard(req.body || {});
      res.status(201).json({
        ok: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/cards/:paneId', (req, res, next) => {
    try {
      const result = cardServiceImpl.updateCard({
        ...(req.body || {}),
        paneId: req.params.paneId,
      });
      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/cards/:paneId', (req, res, next) => {
    try {
      const result = cardServiceImpl.deleteCard({
        clientId: req.query.clientId,
        paneId: req.params.paneId,
      });
      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.use((error, req, res, next) => {
    if (error instanceof CardServiceError) {
      res.status(error.statusCode).json({
        ok: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      res.status(400).json({
        ok: false,
        error: 'Invalid JSON body.',
      });
      return;
    }

    next(error);
  });

  return router;
}

module.exports = {
  createApiRouter,
};
