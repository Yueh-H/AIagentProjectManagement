class PaneManager {
  constructor(container) {
    this.container = container;
    this.panes = new Map();
    this.activePaneId = null;
    this.ws = null;
    this._idCounter = 0;
    this._zCounter = 1;
    this._resizeObserver = null;
    this.clientId = this._ensureClientId();
    this._hydrated = false;
    this._cardRegistry = new Map();
    this._runtimeByPaneId = new Map();

    // Create the infinite canvas element inside the container
    this.canvas = document.createElement('div');
    this.canvas.className = 'workspace-canvas';
    this.container.appendChild(this.canvas);

    // Canvas pan & zoom (CSS transform based, no scrollbars)
    this._panX = 0;
    this._panY = 0;
    this._zoom = 1;

    // Zoom indicator (must exist before _applyTransform)
    this._zoomIndicator = document.createElement('div');
    this._zoomIndicator.className = 'zoom-indicator';
    this._zoomIndicator.textContent = '100%';
    this.container.appendChild(this._zoomIndicator);

    this._applyTransform();

    // Auto-register all card types from the registry
    for (const desc of CardRegistry.getAll()) {
      this.registerCardType(desc.type, desc.cardClass);
    }
  }

  init() {
    this._resizeObserver = new ResizeObserver(() => {
      this.refitAll();
    });
    this._resizeObserver.observe(this.container);
    this._initCanvasPan();

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ type: 'init', clientId: this.clientId }));

      window.addEventListener('load', () => this.refitAll(), { once: true });
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => this.refitAll());
      }
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'hydrate') {
        this._hydrateFromState(msg.state);
        return;
      }

      const pane = this.panes.get(msg.paneId);
      if (pane?.handleMessage) {
        pane.handleMessage(msg);
      } else if (msg.type === 'output' && pane?.write) {
        pane.write(msg.data);
      }

      if (msg.type === 'output' || msg.type === 'error' || msg.type === 'exit') {
        this._refreshWorkspaceCards();
      }
    };
  }

  _newId() {
    return 'pane-' + (++this._idCounter);
  }

  _ensureClientId() {
    const key = 'web-terminal.client-id';
    const existing = localStorage.getItem(key);
    if (existing) return existing;

    const nextId = crypto.randomUUID();
    localStorage.setItem(key, nextId);
    return nextId;
  }

  _trackId(id) {
    const match = /^pane-(\d+)$/.exec(id);
    if (match) {
      this._idCounter = Math.max(this._idCounter, Number(match[1]));
    }
  }

  _nextZIndex() {
    this._zCounter += 1;
    return this._zCounter;
  }

  _getContainerRect() {
    return {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      zoom: this._zoom,
    };
  }

  _getViewportRect() {
    return this._getContainerRect();
  }

  _applyTransform() {
    this.canvas.style.transform = `translate(${this._panX}px, ${this._panY}px) scale(${this._zoom})`;
    this._zoomIndicator.textContent = `${Math.round(this._zoom * 100)}%`;
  }

  // ── Context menu (right-click to add cards) ──

  _screenToCanvas(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this._panX) / this._zoom,
      y: (clientY - rect.top  - this._panY) / this._zoom,
    };
  }

  _showContextMenu(clientX, clientY) {
    this._hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';

    const cards = CardRegistry.getAll();
    cards.forEach((desc) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ctx-menu-item';

      const icon = document.createElement('span');
      icon.className = 'ctx-menu-icon';
      icon.textContent = desc.icon || '';

      const label = document.createElement('span');
      label.className = 'ctx-menu-label';
      label.textContent = desc.buttonLabel;

      const shortcut = document.createElement('span');
      shortcut.className = 'ctx-menu-shortcut';
      shortcut.textContent = desc.shortcutKey ? `\u2318\u21E7${desc.shortcutKey}` : '';

      item.append(icon, label, shortcut);
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const canvasPos = this._screenToCanvas(clientX, clientY);
        const spawnCfg = CardRegistry.getSpawnBounds(desc.type) || {};
        const viewport = this._getViewportRect();
        this.createCard(desc.type, {
          bounds: {
            x: canvasPos.x,
            y: canvasPos.y,
            width: Math.max(spawnCfg.minWidth || 380, Math.round(viewport.width * (spawnCfg.widthRatio || 0.38))),
            height: Math.max(spawnCfg.minHeight || 260, Math.round(viewport.height * (spawnCfg.heightRatio || 0.48))),
          },
        });
        this._hideContextMenu();
      });

      menu.appendChild(item);
    });

    // Position: place at cursor, but keep within viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    menu.style.left = `${Math.min(clientX, vw - 220)}px`;
    menu.style.top  = `${Math.min(clientY, vh - cards.length * 42 - 16)}px`;

    document.body.appendChild(menu);
    this._ctxMenu = menu;
  }

  _hideContextMenu() {
    if (this._ctxMenu) {
      this._ctxMenu.remove();
      this._ctxMenu = null;
    }
  }

  _initCanvasPan() {
    let panning = false;
    let didMove = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;

    const DRAG_THRESHOLD = 4;

    const onDown = (e) => {
      if (e.button !== 2) return;
      e.preventDefault();
      this._hideContextMenu();
      panning = true;
      didMove = false;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = this._panX;
      startPanY = this._panY;

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    const onMove = (e) => {
      if (!panning) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!didMove && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        didMove = true;
        this.container.classList.add('is-panning');
      }
      if (didMove) {
        this._panX = startPanX + dx;
        this._panY = startPanY + dy;
        this._applyTransform();
      }
    };

    const onUp = (e) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      this.container.classList.remove('is-panning');

      if (panning && !didMove) {
        // Right-click without drag → show context menu
        this._showContextMenu(e.clientX, e.clientY);
      }
      panning = false;
      didMove = false;
    };

    // Suppress native context menu
    this.container.addEventListener('contextmenu', (e) => e.preventDefault());
    this.container.addEventListener('pointerdown', onDown);

    // Dismiss menu on left-click outside the menu
    window.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && this._ctxMenu && !this._ctxMenu.contains(e.target)) {
        this._hideContextMenu();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._hideContextMenu();
    });

    // Cmd/Ctrl + scroll wheel = zoom, anchored at cursor position
    const zoomCfg = window.WorkspaceConfig?.canvas || {};
    const minZoom = zoomCfg.minZoom || 0.15;
    const maxZoom = zoomCfg.maxZoom || 3;
    const zoomStep = zoomCfg.zoomStep || 0.08;

    this.container.addEventListener('wheel', (e) => {
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();

      const rect = this.container.getBoundingClientRect();
      // Cursor position relative to the container
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const oldZoom = this._zoom;
      const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
      this._zoom = Math.min(maxZoom, Math.max(minZoom, this._zoom + delta * this._zoom));

      // Adjust pan so the point under the cursor stays fixed
      const ratio = this._zoom / oldZoom;
      this._panX = cursorX - ratio * (cursorX - this._panX);
      this._panY = cursorY - ratio * (cursorY - this._panY);

      this._applyTransform();
    }, { passive: false });
  }

  registerCardType(type, CardClass) {
    if (!type || typeof CardClass !== 'function') {
      throw new Error('PaneManager.registerCardType requires a type and card class');
    }

    this._cardRegistry.set(type, CardClass);
  }

  _getCardClass(type) {
    return this._cardRegistry.get(type) || this._cardRegistry.get('terminal');
  }

  _getSpawnBounds({
    widthRatio = 0.6,
    heightRatio = 0.72,
    minWidth = 460,
    minHeight = 320,
    offsetX = 36,
    offsetY = 36,
  } = {}) {
    const activePane = this.activePaneId ? this.panes.get(this.activePaneId) : null;
    const viewport = this._getViewportRect();

    if (activePane) {
      return {
        x: activePane.getBounds().x + offsetX,
        y: activePane.getBounds().y + offsetY,
        width: Math.max(minWidth, Math.round(activePane.getBounds().width * widthRatio)),
        height: Math.max(minHeight, Math.round(activePane.getBounds().height * heightRatio)),
      };
    }

    // No active pane — spawn near the current view origin
    return {
      x: -this._panX + 40,
      y: -this._panY + 40,
      width: Math.max(minWidth, Math.round(viewport.width * widthRatio)),
      height: Math.max(minHeight, Math.round(viewport.height * heightRatio)),
    };
  }

  _handlePaneMutation(paneId) {
    this._persistLayout();
    if (this.panes.get(paneId)?.cardType === 'terminal') {
      this._syncRuntimeFromPane(paneId);
    }
    this._refreshWorkspaceCards();
  }

  _syncRuntimeFromPane(paneId) {
    const pane = this.panes.get(paneId);
    if (pane?.cardType === 'terminal' && pane.getRuntimeInfo) {
      this._runtimeByPaneId.set(paneId, pane.getRuntimeInfo());
    }
  }

  _createPane({
    id = this._newId(),
    type = 'terminal',
    bounds,
    title,
    buffer = '',
    data = {},
    persist = false,
    shouldInit = true,
  } = {}) {
    this._trackId(id);
    const CardClass = this._getCardClass(type);
    const initialBounds = bounds || window.PaneGeometry.getDefaultPaneBounds(this._getViewportRect(), this.panes.size);
    const pane = new CardClass(id, this.ws, {
      bounds: initialBounds,
      title,
      clientId: this.clientId,
      buffer,
      data,
      getContainerRect: () => this._getContainerRect(),
      onBoundsCommit: (paneId) => this._handlePaneMutation(paneId),
      onFocus: (paneId) => this.setActive(paneId),
      onRequestClose: (paneId) => this.closePane(paneId),
      onRuntimeChange: (paneId, runtime) => {
        this._runtimeByPaneId.set(paneId, runtime);
        this._refreshWorkspaceCards();
      },
      onRequestFocusCard: (paneId) => this.setActive(paneId),
    });

    this.panes.set(id, pane);
    this.canvas.appendChild(pane.getElement());
    pane.setZIndex(this._nextZIndex());

    if (pane.cardType === 'terminal') {
      this._syncRuntimeFromPane(id);
    }

    if (persist) {
      this._persistLayout();
    }

    if (shouldInit) {
      pane.init();
    }

    this._refreshWorkspaceCards();
    return pane;
  }

  createCard(type = 'terminal', options = {}) {
    // Use spawn bounds from the registry if none specified
    if (!options.bounds) {
      const spawnConfig = CardRegistry.getSpawnBounds(type);
      if (spawnConfig) {
        options.bounds = this._getSpawnBounds(spawnConfig) || undefined;
      }
    }
    const pane = this._createPane({
      ...options,
      type,
      persist: options.persist ?? true,
    });
    this.setActive(pane.paneId);
    return pane;
  }

  setActive(id) {
    if (this.activePaneId) {
      const prev = this.panes.get(this.activePaneId);
      if (prev) prev.setActive(false);
    }
    this.activePaneId = id;
    const curr = this.panes.get(id);
    if (curr) {
      curr.setActive(true);
      curr.setZIndex(this._nextZIndex());
      curr.focus();
      this._persistLayout();
      this._refreshWorkspaceCards();
    }
  }

  splitActive(direction, type = 'terminal') {
    if (!this.activePaneId) return;
    const activePane = this.panes.get(this.activePaneId);
    if (!activePane) return;

    const split = window.PaneGeometry.splitPaneBounds(
      activePane.getBounds(),
      direction,
      this._getContainerRect(),
      this.panes.size
    );

    activePane.setBounds(split.current, { notify: false, fit: true });
    const pane = this._createPane({ type, bounds: split.next });
    this.setActive(pane.paneId);
    this._persistLayout();
  }

  closeActive() {
    if (!this.activePaneId) return;
    this.closePane(this.activePaneId);
  }

  closePane(id) {
    const pane = this.panes.get(id);
    if (!pane) return;

    const wasActive = this.activePaneId === id;
    pane.dispose();
    this.panes.delete(id);
    this._runtimeByPaneId.delete(id);

    if (!this.panes.size) {
      const newPane = this._createPane({ type: 'terminal' });
      this.setActive(newPane.paneId);
    } else if (wasActive || !this.panes.has(this.activePaneId)) {
      const nextPaneId = Array.from(this.panes.keys()).pop();
      this.setActive(nextPaneId);
    }

    this._persistLayout();
    this._refreshWorkspaceCards();
  }

  _persistLayout() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this._hydrated) return;

    const payload = {
      activePaneId: this.activePaneId,
      panes: Array.from(this.panes.values()).map((pane) => ({
        id: pane.paneId,
        type: pane.cardType,
        bounds: pane.getBounds(),
        title: pane.getTitle(),
        data: pane.getPersistData?.() || {},
      })),
    };

    this.ws.send(JSON.stringify({
      type: 'persist_state',
      clientId: this.clientId,
      state: payload,
    }));
  }

  _hydrateFromState(state) {
    if (this._hydrated) return;
    this._hydrated = true;

    for (const pane of this.panes.values()) {
      pane.dispose();
    }
    this.panes.clear();
    this._runtimeByPaneId.clear();
    this.activePaneId = null;

    if (Array.isArray(state?.panes) && state.panes.length) {
      state.panes.forEach((entry) => {
        const data = entry.data || {};
        // Pass server-side programBuffer into terminal pane data for hydration
        if (entry.programBuffer) data.programBuffer = entry.programBuffer;
        this._createPane({
          id: entry.id,
          type: entry.type || 'terminal',
          bounds: entry.bounds,
          title: entry.title,
          buffer: entry.buffer,
          data,
        });
      });

      const restoredActiveId = state.activePaneId && this.panes.has(state.activePaneId)
        ? state.activePaneId
        : state.panes[state.panes.length - 1].id;

      this.setActive(restoredActiveId);
      return;
    }

    const pane = this._createPane({ type: 'terminal' });
    this.setActive(pane.paneId);
    this._persistLayout();
  }

  _getTerminalOverview() {
    return Array.from(this.panes.values())
      .filter((pane) => pane.cardType === 'terminal')
      .map((pane) => this._runtimeByPaneId.get(pane.paneId) || pane.getRuntimeInfo())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  _getWorkspaceState() {
    const terminals = this._getTerminalOverview();
    const cards = Array.from(this.panes.values()).map((pane) => ({
      id: pane.paneId,
      type: pane.cardType,
      title: pane.getTitle(),
    }));

    return {
      activePaneId: this.activePaneId,
      terminals,
      cards,
    };
  }

  _refreshWorkspaceCards() {
    const workspaceState = this._getWorkspaceState();
    for (const pane of this.panes.values()) {
      if (pane.receiveWorkspaceState) {
        pane.receiveWorkspaceState(workspaceState);
      }
    }
  }

  refitAll() {
    for (const pane of this.panes.values()) {
      pane.scheduleFit();
    }
  }
}

window.PaneManager = PaneManager;
