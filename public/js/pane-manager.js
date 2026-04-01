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
    this._selectedPaneIds = new Set();

    // Create the infinite canvas element inside the container
    this.canvas = document.createElement('div');
    this.canvas.className = 'workspace-canvas';
    this.container.appendChild(this.canvas);

    this._selectionMarquee = document.createElement('div');
    this._selectionMarquee.className = 'selection-marquee';
    this._selectionMarquee.hidden = true;
    this.container.appendChild(this._selectionMarquee);

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

      if (msg.type === 'card_created') {
        this._applyRemoteCardCreate(msg);
        return;
      }

      if (msg.type === 'card_updated') {
        this._applyRemoteCardUpdate(msg);
        return;
      }

      if (msg.type === 'card_deleted') {
        this._applyRemoteCardDelete(msg);
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

  _getCanvasHomeRect() {
    const canvasCfg = window.WorkspaceConfig?.canvas || {};
    const width = Math.max(canvasCfg.baseWidth || 6000, canvasCfg.minWidth || 3000);
    const height = Math.max(canvasCfg.baseHeight || 4000, canvasCfg.minHeight || 2000);
    return { width, height };
  }

  _getHomeCenterPoint() {
    const homeRect = this._getCanvasHomeRect();
    return {
      x: homeRect.width / 2,
      y: homeRect.height / 2,
    };
  }

  _getDensestCardFocusPoint({ zoom = this._zoom } = {}) {
    const panes = Array.from(this.panes.values());
    if (!panes.length) return null;

    const viewport = this._getViewportRect();
    const visibleWidth = Math.max(1, viewport.width / zoom);
    const visibleHeight = Math.max(1, viewport.height / zoom);
    const halfWidth = visibleWidth / 2;
    const halfHeight = visibleHeight / 2;
    const paneCenters = panes.map((pane) => {
      const bounds = pane.getBounds();
      return {
        id: pane.paneId,
        x: bounds.x + (bounds.width / 2),
        y: bounds.y + (bounds.height / 2),
      };
    });

    let bestCluster = null;

    paneCenters.forEach((candidate) => {
      const included = paneCenters.filter((center) => {
        return Math.abs(center.x - candidate.x) <= halfWidth
          && Math.abs(center.y - candidate.y) <= halfHeight;
      });

      const averageDistance = included.length
        ? included.reduce((sum, center) => {
          return sum + Math.hypot(center.x - candidate.x, center.y - candidate.y);
        }, 0) / included.length
        : Number.POSITIVE_INFINITY;

      if (!bestCluster
        || included.length > bestCluster.count
        || (included.length === bestCluster.count && averageDistance < bestCluster.averageDistance)) {
        bestCluster = {
          count: included.length,
          averageDistance,
          included,
        };
      }
    });

    if (!bestCluster?.included?.length) return null;

    const center = bestCluster.included.reduce((acc, point) => {
      acc.x += point.x;
      acc.y += point.y;
      return acc;
    }, { x: 0, y: 0 });

    return {
      x: center.x / bestCluster.included.length,
      y: center.y / bestCluster.included.length,
    };
  }

  _applyTransform() {
    this.canvas.style.transform = `translate(${this._panX}px, ${this._panY}px) scale(${this._zoom})`;
    this._zoomIndicator.textContent = `${Math.round(this._zoom * 100)}%`;
  }

  _focusPane(paneId, options = {}) {
    const preserveSelection = options.preserveSelection
      ?? (this._selectedPaneIds.size > 1 && this._selectedPaneIds.has(paneId));
    this.setActive(paneId, { ...options, preserveSelection });
  }

  _setSelectedPaneIds(ids = []) {
    const nextIds = Array.from(new Set(ids.filter((id) => this.panes.has(id))));
    const next = new Set(nextIds);
    const prev = this._selectedPaneIds;
    let changed = next.size !== prev.size;

    if (!changed) {
      for (const id of next) {
        if (!prev.has(id)) {
          changed = true;
          break;
        }
      }
    }

    if (!changed) return;

    this._selectedPaneIds = next;
    for (const [paneId, pane] of this.panes.entries()) {
      pane.setSelected?.(next.has(paneId));
    }
  }

  _removeSelectedPaneId(paneId) {
    if (!this._selectedPaneIds.has(paneId)) return;
    this._setSelectedPaneIds(Array.from(this._selectedPaneIds).filter((id) => id !== paneId));
  }

  _rectsIntersect(a, b) {
    return a.x < (b.x + b.width)
      && (a.x + a.width) > b.x
      && a.y < (b.y + b.height)
      && (a.y + a.height) > b.y;
  }

  _getPaneIdsIntersectingRect(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return [];

    return Array.from(this.panes.values())
      .filter((pane) => this._rectsIntersect(rect, pane.getBounds()))
      .map((pane) => pane.paneId);
  }

  _setSelectionMarqueeFromScreenPoints(startClientX, startClientY, endClientX, endClientY) {
    const rect = this.container.getBoundingClientRect();
    const left = Math.min(startClientX, endClientX) - rect.left;
    const top = Math.min(startClientY, endClientY) - rect.top;
    const width = Math.abs(endClientX - startClientX);
    const height = Math.abs(endClientY - startClientY);

    this._selectionMarquee.hidden = false;
    this._selectionMarquee.style.left = `${Math.round(left)}px`;
    this._selectionMarquee.style.top = `${Math.round(top)}px`;
    this._selectionMarquee.style.width = `${Math.round(width)}px`;
    this._selectionMarquee.style.height = `${Math.round(height)}px`;
  }

  _hideSelectionMarquee() {
    this._selectionMarquee.hidden = true;
    this._selectionMarquee.style.width = '0px';
    this._selectionMarquee.style.height = '0px';
  }

  _getCanvasRectFromScreenPoints(startClientX, startClientY, endClientX, endClientY) {
    const start = this._screenToCanvas(startClientX, startClientY);
    const end = this._screenToCanvas(endClientX, endClientY);
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  _beginSelectedGroupDrag(originPaneId) {
    if (!this._selectedPaneIds.has(originPaneId) || this._selectedPaneIds.size < 2) {
      return null;
    }

    const paneIds = Array.from(this._selectedPaneIds).filter((paneId) => this.panes.has(paneId));
    if (paneIds.length < 2) return null;

    return {
      paneIds,
      startBounds: new Map(paneIds.map((paneId) => [paneId, this.panes.get(paneId).getBounds()])),
    };
  }

  _updateSelectedGroupDrag(_originPaneId, session, deltaX, deltaY) {
    if (!session?.paneIds?.length) return;

    session.paneIds.forEach((paneId) => {
      const pane = this.panes.get(paneId);
      const startBounds = session.startBounds.get(paneId);
      if (!pane || !startBounds) return;

      const nextBounds = window.PaneGeometry.translatePaneBounds(
        startBounds,
        deltaX,
        deltaY,
        this._getContainerRect()
      );
      pane.setBounds(nextBounds, { notify: false, fit: false });
    });
  }

  _endSelectedGroupDrag(_originPaneId, session) {
    if (!session?.paneIds?.length) return;

    session.paneIds.forEach((paneId) => {
      const pane = this.panes.get(paneId);
      pane?.scheduleFit();
    });
    this._persistLayout();
    this._refreshWorkspaceCards();
  }

  // ── Context menu (right-click to add cards) ──

  _screenToCanvas(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this._panX) / this._zoom,
      y: (clientY - rect.top  - this._panY) / this._zoom,
    };
  }

  _createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.addEventListener('contextmenu', (event) => event.preventDefault());
    return menu;
  }

  _createContextMenuItem({ icon = '', label, shortcut = '', onSelect }) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ctx-menu-item';

    const iconEl = document.createElement('span');
    iconEl.className = 'ctx-menu-icon';
    iconEl.textContent = icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'ctx-menu-label';
    labelEl.textContent = label;

    const shortcutEl = document.createElement('span');
    shortcutEl.className = 'ctx-menu-shortcut';
    shortcutEl.textContent = shortcut;

    item.append(iconEl, labelEl, shortcutEl);
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (onSelect) onSelect();
    });

    return item;
  }

  _createContextMenuDivider() {
    const divider = document.createElement('div');
    divider.className = 'ctx-menu-divider';
    return divider;
  }

  _mountContextMenu(menu, clientX, clientY) {
    this._hideContextMenu();

    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.style.visibility = 'hidden';

    document.body.appendChild(menu);

    const margin = 12;
    const menuWidth = menu.offsetWidth || 220;
    const menuHeight = menu.offsetHeight || 160;
    const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);

    menu.style.left = `${Math.min(Math.max(clientX, margin), maxLeft)}px`;
    menu.style.top = `${Math.min(Math.max(clientY, margin), maxTop)}px`;
    menu.style.visibility = 'visible';

    this._ctxMenu = menu;
  }

  _showCanvasContextMenu(clientX, clientY) {
    const menu = this._createContextMenu();
    const cards = CardRegistry.getAll();

    cards.forEach((desc) => {
      menu.appendChild(this._createContextMenuItem({
        icon: desc.icon || '',
        label: desc.buttonLabel,
        shortcut: desc.shortcutKey ? `\u2318\u21E7${desc.shortcutKey}` : '',
        onSelect: () => {
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
        },
      }));
    });

    this._mountContextMenu(menu, clientX, clientY);
  }

  _showPaneContextMenu(paneId, clientX, clientY) {
    const pane = this.panes.get(paneId);
    if (!pane) return;

    const menu = this._createContextMenu();
    menu.classList.add('ctx-menu-pane');

    menu.appendChild(this._createContextMenuItem({
      icon: '\u2715',
      label: 'Close',
      onSelect: () => {
        this.closePane(paneId);
        this._hideContextMenu();
      },
    }));

    menu.appendChild(this._createContextMenuDivider());

    const colorSection = document.createElement('div');
    colorSection.className = 'ctx-menu-section';

    const colorLabel = document.createElement('div');
    colorLabel.className = 'ctx-menu-section-label';
    colorLabel.textContent = 'Color';

    const colorRow = document.createElement('div');
    colorRow.className = 'ctx-menu-color-row';

    window.BaseCard.getColorThemeEntries().forEach((theme) => {
      const colorButton = document.createElement('button');
      colorButton.type = 'button';
      colorButton.className = 'ctx-menu-color-button';
      colorButton.title = theme.label;
      colorButton.setAttribute('aria-label', theme.label);
      colorButton.style.setProperty('--ctx-color', theme.swatch);

      if (theme.id === 'default') {
        colorButton.classList.add('is-default');
      }

      if (pane.getColorTheme?.() === theme.id) {
        colorButton.classList.add('is-active');
      }

      colorButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        pane.setColorTheme?.(theme.id);
        this._hideContextMenu();
      });

      colorRow.appendChild(colorButton);
    });

    colorSection.append(colorLabel, colorRow);
    menu.appendChild(colorSection);

    this._mountContextMenu(menu, clientX, clientY);
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
    let selecting = false;
    let didSelectMove = false;
    let contextMenuMode = null;
    let contextPaneId = null;
    let wheelPanTimer = null;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;

    const DRAG_THRESHOLD = 4;

    const showWheelPanFeedback = () => {
      this.container.classList.add('is-panning');
      if (wheelPanTimer) {
        clearTimeout(wheelPanTimer);
      }
      wheelPanTimer = setTimeout(() => {
        if (!panning) {
          this.container.classList.remove('is-panning');
        }
        wheelPanTimer = null;
      }, 120);
    };

    const onDown = (e) => {
      if (e.button !== 2) return;
      if (this._ctxMenu?.contains(e.target)) return;
      e.preventDefault();
      this._hideContextMenu();
      panning = true;
      didMove = false;
      const paneEl = e.target.closest('.pane-wrapper');
      contextMenuMode = paneEl ? 'pane' : 'canvas';
      contextPaneId = paneEl?.dataset.paneId === this.activePaneId
        ? paneEl.dataset.paneId
        : null;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = this._panX;
      startPanY = this._panY;

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    const onSelectionMove = (e) => {
      if (!selecting) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!didSelectMove && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        didSelectMove = true;
        document.body.classList.add('is-marquee-selecting');
        this.setActive(null, { preserveDomFocus: true, preserveSelection: true });
      }

      if (!didSelectMove) return;

      this._setSelectionMarqueeFromScreenPoints(startX, startY, e.clientX, e.clientY);
      const selectionRect = this._getCanvasRectFromScreenPoints(startX, startY, e.clientX, e.clientY);
      this._setSelectedPaneIds(this._getPaneIdsIntersectingRect(selectionRect));
    };

    const onSelectionUp = () => {
      window.removeEventListener('pointermove', onSelectionMove);
      window.removeEventListener('pointerup', onSelectionUp);
      window.removeEventListener('pointercancel', onSelectionUp);
      this._hideSelectionMarquee();
      document.body.classList.remove('is-marquee-selecting');

      if (!selecting) return;

      if (didSelectMove) {
        const selectedIds = Array.from(this._selectedPaneIds);
        if (selectedIds.length === 1) {
          this.setActive(selectedIds[0], { preserveDomFocus: true, preserveSelection: true });
        } else {
          this.setActive(null, { preserveDomFocus: true, preserveSelection: true });
        }
      } else {
        this.setActive(null, { preserveDomFocus: true });
      }

      selecting = false;
      didSelectMove = false;
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
        if (contextMenuMode === 'pane' && contextPaneId) {
          this._showPaneContextMenu(contextPaneId, e.clientX, e.clientY);
        } else if (contextMenuMode === 'canvas') {
          this._showCanvasContextMenu(e.clientX, e.clientY);
        }
      }
      panning = false;
      didMove = false;
      contextMenuMode = null;
      contextPaneId = null;
    };

    // Suppress native context menu. Pane menus are opened manually from onUp.
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    this.container.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.pane-wrapper')) return;
      if (this._ctxMenu?.contains(e.target)) return;

      this._hideContextMenu();
      selecting = true;
      didSelectMove = false;
      startX = e.clientX;
      startY = e.clientY;

      window.addEventListener('pointermove', onSelectionMove);
      window.addEventListener('pointerup', onSelectionUp);
      window.addEventListener('pointercancel', onSelectionUp);
    });
    this.container.addEventListener('pointerdown', onDown);

    // Dismiss menu on outside interaction
    window.addEventListener('pointerdown', (e) => {
      if (this._ctxMenu && !this._ctxMenu.contains(e.target)) {
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
      if (e.metaKey || e.ctrlKey) {
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
        return;
      }

      if (!Number.isFinite(e.deltaX) && !Number.isFinite(e.deltaY)) return;

      e.preventDefault();
      this._hideContextMenu();
      this._panX -= e.deltaX;
      this._panY -= e.deltaY;
      this._applyTransform();
      showWheelPanFeedback();
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

  centerViewport({ resetZoom = true } = {}) {
    if (resetZoom) {
      this._zoom = 1;
    }

    const viewport = this._getViewportRect();
    const focusPoint = this._getDensestCardFocusPoint({ zoom: this._zoom }) || this._getHomeCenterPoint();

    this._panX = Math.round((viewport.width / 2) - (focusPoint.x * this._zoom));
    this._panY = Math.round((viewport.height / 2) - (focusPoint.y * this._zoom));
    this._hideContextMenu();
    this._applyTransform();
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
      onFocus: (paneId, options) => this._focusPane(paneId, options),
      onRequestClose: (paneId) => this.closePane(paneId),
      onRuntimeChange: (paneId, runtime) => {
        this._runtimeByPaneId.set(paneId, runtime);
        this._refreshWorkspaceCards();
      },
      onRequestFocusCard: (paneId) => this.setActive(paneId),
    });
    pane.hydrateUiState?.(data);
    pane.onGroupDragStart = (paneId) => this._beginSelectedGroupDrag(paneId);
    pane.onGroupDragMove = (paneId, session, deltaX, deltaY) => this._updateSelectedGroupDrag(paneId, session, deltaX, deltaY);
    pane.onGroupDragEnd = (paneId, session) => this._endSelectedGroupDrag(paneId, session);
    pane.setSelected?.(this._selectedPaneIds.has(id));

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

  setActive(id, { preserveDomFocus = false, preserveSelection = false } = {}) {
    const nextId = id && this.panes.has(id) ? id : null;
    const isSamePane = this.activePaneId === nextId;

    if (!preserveSelection) {
      this._setSelectedPaneIds(nextId ? [nextId] : []);
    }

    if (this.activePaneId && !isSamePane) {
      const prev = this.panes.get(this.activePaneId);
      if (prev) prev.setActive(false);
    }
    this.activePaneId = nextId;
    const curr = nextId ? this.panes.get(nextId) : null;
    if (curr) {
      if (!isSamePane) {
        curr.setActive(true);
      }
      curr.setZIndex(this._nextZIndex());
      if (!preserveDomFocus) {
        curr.focus();
      }
      this._persistLayout();
      this._refreshWorkspaceCards();
      return;
    }

    this._persistLayout();
    this._refreshWorkspaceCards();
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
    this._hideContextMenu();
    this._removeSelectedPaneId(id);

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
        data: {
          ...(pane.getPersistData?.() || {}),
          ...(pane.getUiPersistData?.() || {}),
        },
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
    this._setSelectedPaneIds([]);

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

  _applyRemoteCardCreate(message) {
    const paneEntry = message?.pane;
    if (!paneEntry?.id || this.panes.has(paneEntry.id)) return;

    this._createPane({
      id: paneEntry.id,
      type: paneEntry.type,
      bounds: paneEntry.bounds,
      title: paneEntry.title,
      data: paneEntry.data || {},
      persist: false,
      shouldInit: true,
    });

    if (message.activePaneId && this.panes.has(message.activePaneId)) {
      this.setActive(message.activePaneId, { preserveDomFocus: true });
    } else {
      this._refreshWorkspaceCards();
    }
  }

  _applyRemoteCardUpdate(message) {
    const paneEntry = message?.pane;
    const pane = paneEntry?.id ? this.panes.get(paneEntry.id) : null;
    if (!pane) return;

    pane.setTitle(paneEntry.title, { notify: false });
    pane.setBounds(paneEntry.bounds, { notify: false, fit: true });
    pane.hydratePersistedData?.(paneEntry.data || {});
    pane.hydrateUiState?.(paneEntry.data || {});

    if (message.activePaneId && this.panes.has(message.activePaneId)) {
      this.setActive(message.activePaneId, { preserveDomFocus: true });
    } else {
      this._refreshWorkspaceCards();
    }
  }

  _applyRemoteCardDelete(message) {
    const paneId = message?.paneId;
    if (!paneId || !this.panes.has(paneId)) return;

    const pane = this.panes.get(paneId);
    if (pane?.cardType === 'terminal') return;
    this._removeSelectedPaneId(paneId);

    const wasActive = this.activePaneId === paneId;
    pane.dispose();
    this.panes.delete(paneId);

    if (wasActive) {
      this.activePaneId = null;
    }

    if (message.activePaneId && this.panes.has(message.activePaneId)) {
      this.setActive(message.activePaneId, { preserveDomFocus: true });
    } else {
      this._refreshWorkspaceCards();
    }
  }

  refitAll() {
    for (const pane of this.panes.values()) {
      pane.scheduleFit();
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaneManager;
}

if (typeof window !== 'undefined') {
  window.PaneManager = PaneManager;
}
