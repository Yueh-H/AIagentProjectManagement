const CARD_FIELDS = Object.freeze({
  markdown: ['markdown'],
  project: ['objective', 'successCriteria', 'nextAction', 'notes'],
  'agent-output': ['sourcePaneId', 'agentName'],
  mission: ['goal', 'completionCriteria', 'statusSummary', 'blockers', 'nextStep', 'sourcePaneId', 'status', 'statusUpdatedAt', 'instruction', 'doneCriteria', 'resultSummary'],
});

const CARD_DEFAULT_TITLES = Object.freeze({
  markdown: 'Document.md',
  project: 'Project Overview',
  'agent-output': 'Agent Output',
  mission: 'Mission',
});

const CARD_DEFAULT_BOUNDS = Object.freeze({
  markdown: { width: 520, height: 360 },
  project: { width: 460, height: 360 },
  'agent-output': { width: 480, height: 320 },
  mission: { width: 460, height: 480 },
});

const API_CARD_TYPES = Object.freeze(Object.keys(CARD_FIELDS));

function isApiCardType(type) {
  return API_CARD_TYPES.includes(type);
}

function getCardFields(type) {
  return CARD_FIELDS[type] || [];
}

function getDefaultCardTitle(type) {
  return CARD_DEFAULT_TITLES[type] || 'Card';
}

function buildCardData(type, data = {}) {
  const nextData = {};
  for (const field of getCardFields(type)) {
    nextData[field] = typeof data[field] === 'string' ? data[field] : '';
  }
  return nextData;
}

function sanitizeCardDataPatch(type, data = {}) {
  const nextData = {};
  for (const field of getCardFields(type)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      nextData[field] = typeof data[field] === 'string' ? data[field] : String(data[field] ?? '');
    }
  }
  return nextData;
}

function sanitizeCardAppendPatch(type, data = {}) {
  const nextData = {};
  for (const field of getCardFields(type)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      nextData[field] = typeof data[field] === 'string' ? data[field] : String(data[field] ?? '');
    }
  }
  return nextData;
}

function mergeCardData(type, currentData = {}, patchData = {}, appendData = {}) {
  const nextData = {
    ...buildCardData(type, currentData),
    ...sanitizeCardDataPatch(type, patchData),
  };

  for (const [field, value] of Object.entries(sanitizeCardAppendPatch(type, appendData))) {
    nextData[field] = `${nextData[field] || ''}${value}`;
  }

  return nextData;
}

function resolveCardTitle(type, title) {
  if (typeof title !== 'string') {
    return getDefaultCardTitle(type);
  }

  const nextTitle = title.trim();
  return nextTitle || getDefaultCardTitle(type);
}

function resolveCardBounds(type, state = {}, bounds = {}) {
  const defaultBounds = CARD_DEFAULT_BOUNDS[type] || { width: 420, height: 300 };
  const panes = Array.isArray(state.panes) ? state.panes : [];
  const anchorPane = panes.find((pane) => pane.id === state.activePaneId) || panes[panes.length - 1] || null;

  const resolvedBounds = {
    x: Number.isFinite(bounds?.x) ? bounds.x : (anchorPane?.bounds?.x ?? 40) + (anchorPane ? 36 : 0),
    y: Number.isFinite(bounds?.y) ? bounds.y : (anchorPane?.bounds?.y ?? 40) + (anchorPane ? 36 : 0),
    width: Number.isFinite(bounds?.width) ? bounds.width : defaultBounds.width,
    height: Number.isFinite(bounds?.height) ? bounds.height : defaultBounds.height,
  };

  return resolvedBounds;
}

module.exports = {
  API_CARD_TYPES,
  buildCardData,
  getCardFields,
  getDefaultCardTitle,
  isApiCardType,
  mergeCardData,
  resolveCardBounds,
  resolveCardTitle,
};
