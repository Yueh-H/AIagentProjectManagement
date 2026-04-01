const stateStore = require('./state-store');
const workspaceSync = require('./workspace-sync');
const {
  API_CARD_TYPES,
  buildCardData,
  getCardFields,
  isApiCardType,
  mergeCardData,
  resolveCardBounds,
  resolveCardTitle,
} = require('./card-types');

class CardServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'CardServiceError';
    this.statusCode = statusCode;
  }
}

function createCardService({
  stateStoreImpl = stateStore,
  workspaceSyncImpl = workspaceSync,
} = {}) {
  function getExtraPaneData(type, data = {}) {
    const cardFields = new Set(getCardFields(type));
    return Object.fromEntries(
      Object.entries(data || {}).filter(([key]) => !cardFields.has(key))
    );
  }

  function listWorkspaces(limit = 20) {
    return stateStoreImpl.listClients(limit);
  }

  function resolveClientId(clientId) {
    if (typeof clientId === 'string' && clientId.trim()) {
      return clientId.trim();
    }

    const [latestWorkspace] = listWorkspaces(1);
    if (!latestWorkspace?.clientId) {
      throw new CardServiceError(404, 'No workspace found. Open the browser workspace first.');
    }

    return latestWorkspace.clientId;
  }

  function getWorkspaceState(clientId) {
    const resolvedClientId = resolveClientId(clientId);
    return {
      clientId: resolvedClientId,
      state: stateStoreImpl.getState(resolvedClientId),
    };
  }

  function listCards(clientId) {
    const { clientId: resolvedClientId, state } = getWorkspaceState(clientId);
    return {
      clientId: resolvedClientId,
      activePaneId: state.activePaneId,
      panes: state.panes.map(({ buffer, programBuffer, ...pane }) => pane),
    };
  }

  function getNextPaneId(state = {}) {
    const panes = Array.isArray(state.panes) ? state.panes : [];
    let maxPaneNumber = 0;

    panes.forEach((pane) => {
      const match = /^pane-(\d+)$/.exec(pane.id || '');
      if (match) {
        maxPaneNumber = Math.max(maxPaneNumber, Number(match[1]));
      }
    });

    return `pane-${maxPaneNumber + 1}`;
  }

  function broadcastMutation(clientId, type, pane, activePaneId) {
    workspaceSyncImpl.broadcast(clientId, {
      type,
      pane,
      paneId: pane?.id || null,
      activePaneId: activePaneId || null,
    });
  }

  function createCard({
    clientId,
    type,
    title,
    bounds,
    data,
    activate = true,
  } = {}) {
    const resolvedClientId = resolveClientId(clientId);

    if (!isApiCardType(type)) {
      throw new CardServiceError(400, `Unsupported card type "${type}". Supported types: ${API_CARD_TYPES.join(', ')}`);
    }

    const state = stateStoreImpl.getState(resolvedClientId);
    const pane = {
      id: getNextPaneId(state),
      type,
      title: resolveCardTitle(type, title),
      bounds: resolveCardBounds(type, state, bounds),
      data: {
        ...getExtraPaneData(type, data),
        ...buildCardData(type, data),
      },
    };

    const nextState = {
      activePaneId: activate ? pane.id : (state.activePaneId || pane.id),
      panes: [...state.panes.map(({ buffer, programBuffer, ...entry }) => entry), pane],
    };

    stateStoreImpl.saveLayout(resolvedClientId, nextState);
    broadcastMutation(resolvedClientId, 'card_created', pane, nextState.activePaneId);

    return {
      clientId: resolvedClientId,
      activePaneId: nextState.activePaneId,
      pane,
    };
  }

  function updateCard({
    clientId,
    paneId,
    title,
    bounds,
    data,
    append,
    activate,
  } = {}) {
    const resolvedClientId = resolveClientId(clientId);
    const state = stateStoreImpl.getState(resolvedClientId);
    const panes = state.panes.map(({ buffer, programBuffer, ...pane }) => pane);
    const paneIndex = panes.findIndex((pane) => pane.id === paneId);

    if (paneIndex === -1) {
      throw new CardServiceError(404, `Card "${paneId}" was not found in workspace "${resolvedClientId}".`);
    }

    const currentPane = panes[paneIndex];
    if (!isApiCardType(currentPane.type)) {
      throw new CardServiceError(400, `Card "${paneId}" is type "${currentPane.type}" and is not writable through the card API.`);
    }

    const nextPane = {
      ...currentPane,
      title: title == null ? currentPane.title : resolveCardTitle(currentPane.type, title),
      bounds: bounds ? resolveCardBounds(currentPane.type, { ...state, panes }, { ...currentPane.bounds, ...bounds }) : currentPane.bounds,
      data: {
        ...getExtraPaneData(currentPane.type, currentPane.data),
        ...getExtraPaneData(currentPane.type, data),
        ...mergeCardData(currentPane.type, currentPane.data, data, append),
      },
    };

    panes[paneIndex] = nextPane;

    const nextState = {
      activePaneId: activate === true ? nextPane.id : state.activePaneId,
      panes,
    };

    stateStoreImpl.saveLayout(resolvedClientId, nextState);
    broadcastMutation(resolvedClientId, 'card_updated', nextPane, nextState.activePaneId);

    return {
      clientId: resolvedClientId,
      activePaneId: nextState.activePaneId,
      pane: nextPane,
    };
  }

  function deleteCard({ clientId, paneId } = {}) {
    const resolvedClientId = resolveClientId(clientId);
    const state = stateStoreImpl.getState(resolvedClientId);
    const panes = state.panes.map(({ buffer, programBuffer, ...pane }) => pane);
    const paneIndex = panes.findIndex((pane) => pane.id === paneId);

    if (paneIndex === -1) {
      throw new CardServiceError(404, `Card "${paneId}" was not found in workspace "${resolvedClientId}".`);
    }

    const [removedPane] = panes.splice(paneIndex, 1);

    if (!isApiCardType(removedPane.type)) {
      throw new CardServiceError(400, `Card "${paneId}" is type "${removedPane.type}" and cannot be deleted through the card API.`);
    }

    const nextActivePaneId = state.activePaneId === paneId
      ? (panes[panes.length - 1]?.id || null)
      : state.activePaneId;

    const nextState = {
      activePaneId: nextActivePaneId,
      panes,
    };

    stateStoreImpl.saveLayout(resolvedClientId, nextState);
    workspaceSyncImpl.broadcast(resolvedClientId, {
      type: 'card_deleted',
      paneId,
      activePaneId: nextActivePaneId,
    });

    return {
      clientId: resolvedClientId,
      activePaneId: nextActivePaneId,
      paneId,
    };
  }

  return {
    createCard,
    deleteCard,
    getWorkspaceState,
    listCards,
    listWorkspaces,
    resolveClientId,
    updateCard,
  };
}

const cardService = createCardService();

module.exports = {
  CardServiceError,
  ...cardService,
  createCardService,
};
