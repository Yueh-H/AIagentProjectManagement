class BaseCard {
  constructor(cardId, {
    cardType = 'card',
    bounds,
    title,
    defaultTitle = 'Card',
    headerHint = 'Drag to move',
    closeLabel = 'Close',
    getContainerRect,
    onBoundsCommit,
    onFocus,
    onRequestClose,
  } = {}) {
    this.paneId = cardId;
    this.cardType = cardType;
    this.onBoundsCommit = onBoundsCommit;
    this.onFocus = onFocus;
    this.onRequestClose = onRequestClose;
    this.getContainerRect = getContainerRect || (() => ({ width: window.innerWidth, height: window.innerHeight }));
    this.bounds = bounds || window.PaneGeometry.getDefaultPaneBounds(this.getContainerRect(), 0);
    this.defaultTitle = defaultTitle;
    this._fitFrame = null;
    this._hoverResizeHandle = null;
    this._titleEditing = false;
    this._isLongPressDragging = false;

    // -- Gesture manager for this card --
    this._gestures = new GestureManager();

    // -- DOM structure --
    this.el = document.createElement('section');
    this.el.className = 'pane-wrapper';
    this.el.dataset.paneId = cardId;
    this.el.dataset.cardType = cardType;
    this.el.tabIndex = -1;

    this.headerEl = document.createElement('header');
    this.headerEl.className = 'pane-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'pane-header-group';

    // Title display (read-only by default)
    this.titleDisplayEl = document.createElement('span');
    this.titleDisplayEl.className = 'pane-title-display';
    this.titleDisplayEl.textContent = title || defaultTitle;

    // Title input (hidden until double-click)
    this.titleInputEl = document.createElement('input');
    this.titleInputEl.type = 'text';
    this.titleInputEl.className = 'pane-title-input';
    this.titleInputEl.setAttribute('aria-label', 'Card name');
    this.titleInputEl.placeholder = defaultTitle;
    this.titleInputEl.value = title || defaultTitle;
    this.titleInputEl.hidden = true;
    this.titleInputEl.addEventListener('input', () => this.requestPersist());
    this.titleInputEl.addEventListener('blur', () => this._commitTitleEdit());
    this.titleInputEl.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        this._commitTitleEdit();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this._cancelTitleEdit();
      }
    });
    // Prevent drag from starting when interacting with the input
    this.titleInputEl.addEventListener('pointerdown', (event) => event.stopPropagation());

    titleGroup.append(this.titleDisplayEl, this.titleInputEl);

    const actions = document.createElement('div');
    actions.className = 'pane-actions';

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'pane-hint';
    this.hintEl.textContent = headerHint;

    this.closeButtonEl = document.createElement('button');
    this.closeButtonEl.type = 'button';
    this.closeButtonEl.className = 'pane-close-button';
    this.closeButtonEl.title = 'Delete this card';
    this.closeButtonEl.setAttribute('aria-label', 'Delete this card');
    this.closeButtonEl.textContent = closeLabel;
    this.closeButtonEl.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.closeButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.onRequestClose) this.onRequestClose(this.paneId);
    });

    actions.append(this.hintEl, this.closeButtonEl);
    this.headerEl.append(titleGroup, actions);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'pane-body';

    this.el.append(this.headerEl, this.bodyEl);
    this._createResizeHandles();

    // -- Register gestures --
    this._registerHeaderGestures();
    this._registerBodyEdgeGestures();
    this._registerLongPressDrag();

    this._resizeObserver = new ResizeObserver(() => this.scheduleFit());
    this._resizeObserver.observe(this.bodyEl);

    this.setBounds(this.bounds, { notify: false, fit: false });
  }

  // ──────────────────────────────────────────────
  //  Gesture registration
  // ──────────────────────────────────────────────

  _registerHeaderGestures() {
    let dragStartBounds = null;

    this._gestures.zone(this.headerEl, {
      filter: (e) => {
        // Don't intercept close button or active title input
        if (e.target.closest('.pane-close-button')) return false;
        if (e.target === this.titleInputEl && !this.titleInputEl.hidden) return false;
        return true;
      },

      onTap: () => {
        if (this.onFocus) this.onFocus(this.paneId);
      },

      onDoubleTap: (e) => {
        if (this.onFocus) this.onFocus(this.paneId);
        // Double-tap on title area → edit mode
        const titleRect = this.titleDisplayEl.getBoundingClientRect();
        const inTitleZone = e.clientX >= titleRect.left - 8 && e.clientX <= titleRect.right + 8
                         && e.clientY >= titleRect.top - 4 && e.clientY <= titleRect.bottom + 4;
        if (inTitleZone) {
          this._beginTitleEdit();
        }
      },

      onDragStart: (e) => {
        if (this._isLongPressDragging) return;
        if (this.onFocus) this.onFocus(this.paneId);
        dragStartBounds = this.getBounds();
        document.body.classList.add('is-dragging-pane');
      },

      onDrag: (e, delta) => {
        if (!dragStartBounds || this._isLongPressDragging) return;
        const zoom = this.getContainerRect().zoom || 1;
        const nextBounds = window.PaneGeometry.translatePaneBounds(
          dragStartBounds, delta.x / zoom, delta.y / zoom, this.getContainerRect()
        );
        this.setBounds(nextBounds, { notify: false, fit: false });
      },

      onDragEnd: () => {
        document.body.classList.remove('is-dragging-pane');
        dragStartBounds = null;
        this.scheduleFit();
        this._emitBoundsCommit();
      },
    });
  }

  _registerBodyEdgeGestures() {
    let resizeStartBounds = null;
    let resizeHandle = null;

    // Hover tracking for cursor
    this.el.addEventListener('pointermove', (e) => this._updateResizeHint(e));
    this.el.addEventListener('pointerleave', () => this._setHoverResizeHandle(null));

    this._gestures.zone(this.el, {
      filter: (e) => {
        // Only activate for edge/corner areas, not header or inner content
        if (e.target.closest('.pane-header')) return false;
        const handle = this._resolveResizeHandle(e.clientX, e.clientY);
        if (!handle) return false;
        resizeHandle = handle;
        return true;
      },

      onTap: () => {
        if (this.onFocus) this.onFocus(this.paneId);
      },

      onDragStart: (e) => {
        if (this.onFocus) this.onFocus(this.paneId);
        resizeStartBounds = this.getBounds();
        document.body.classList.add('is-dragging-pane');
      },

      onDrag: (e, delta) => {
        if (!resizeStartBounds || !resizeHandle) return;
        const zoom = this.getContainerRect().zoom || 1;
        const nextBounds = window.PaneGeometry.resizePaneBounds(
          resizeStartBounds, resizeHandle, delta.x / zoom, delta.y / zoom, this.getContainerRect()
        );
        this.setBounds(nextBounds, { notify: false, fit: true });
      },

      onDragEnd: () => {
        document.body.classList.remove('is-dragging-pane');
        resizeStartBounds = null;
        resizeHandle = null;
        this._setHoverResizeHandle(null);
        this.scheduleFit();
        this._emitBoundsCommit();
      },
    });
  }

  /**
   * Checks whether the event target is an interactive element that needs
   * pointer events for its own purpose (typing, selection, scrolling).
   */
  _isInteractiveTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true;
    if (target.isContentEditable) return true;
    // xterm terminal canvas
    if (target.closest('.xterm')) return true;
    return false;
  }

  _registerLongPressDrag() {
    let dragStartBounds = null;
    const delay = window.WorkspaceConfig?.gesture?.longPressDragDelay ?? 150;

    // Drag helpers shared by both instant and long-press paths
    const startDrag = (e) => {
      if (this.onFocus) this.onFocus(this.paneId);
      this._isLongPressDragging = true;
      dragStartBounds = this.getBounds();
      this.el.classList.add('is-long-press-dragging');
      document.body.classList.add('is-dragging-pane');
    };

    const moveDrag = (e, delta) => {
      if (!dragStartBounds) return;
      const zoom = this.getContainerRect().zoom || 1;
      const nextBounds = window.PaneGeometry.translatePaneBounds(
        dragStartBounds, delta.x / zoom, delta.y / zoom, this.getContainerRect()
      );
      this.setBounds(nextBounds, { notify: false, fit: false });
    };

    const endDrag = () => {
      this._isLongPressDragging = false;
      this.el.classList.remove('is-long-press-dragging');
      document.body.classList.remove('is-dragging-pane');
      dragStartBounds = null;
      this.scheduleFit();
      this._emitBoundsCommit();
    };

    this._gestures.zone(this.el, {
      longPressDragDelay: delay,

      filter: (e) => {
        if (e.button !== 0) return false;
        if (e.target.closest('.pane-close-button')) return false;
        if (e.target.closest('.pane-resize-handle')) return false;
        if (e.target.closest('.pane-header')) return false;
        return true;
      },

      // Instant drag for non-interactive areas (background, labels, etc.)
      // Return false to reject → GestureManager won't enter drag mode
      onDragStart: (e) => {
        if (this._isInteractiveTarget(e.target)) return false;
        startDrag(e);
      },
      onDrag: (e, delta) => {
        if (!this._isLongPressDragging) return;
        moveDrag(e, delta);
      },
      onDragEnd: (e) => {
        if (!this._isLongPressDragging) return;
        endDrag();
      },

      // Long-press drag for interactive areas (terminal, inputs, etc.)
      onLongPressDragStart: (e) => startDrag(e),
      onLongPressDrag: (e, delta) => moveDrag(e, delta),
      onLongPressDragEnd: () => endDrag(),
    });
  }

  // ──────────────────────────────────────────────
  //  Title editing
  // ──────────────────────────────────────────────

  _beginTitleEdit() {
    if (this._titleEditing) return;
    this._titleEditing = true;
    this.titleInputEl.value = this.titleDisplayEl.textContent;
    this.titleDisplayEl.hidden = true;
    this.titleInputEl.hidden = false;
    this.titleInputEl.focus();
    this.titleInputEl.select();
  }

  _commitTitleEdit() {
    if (!this._titleEditing) return;
    this._titleEditing = false;
    const value = this.titleInputEl.value.trim() || this.defaultTitle;
    this.titleDisplayEl.textContent = value;
    this.titleInputEl.value = value;
    this.titleDisplayEl.hidden = false;
    this.titleInputEl.hidden = true;
    this.requestPersist();
    this.focus();
  }

  _cancelTitleEdit() {
    if (!this._titleEditing) return;
    this._titleEditing = false;
    this.titleInputEl.value = this.titleDisplayEl.textContent;
    this.titleDisplayEl.hidden = false;
    this.titleInputEl.hidden = true;
    this.focus();
  }

  // ──────────────────────────────────────────────
  //  Resize handles (visual hit zones)
  // ──────────────────────────────────────────────

  _createResizeHandles() {
    const handles = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
    handles.forEach((handle) => {
      const element = document.createElement('div');
      element.className = `pane-resize-handle ${handle}`;
      element.dataset.handle = handle;
      this.el.appendChild(element);
    });
  }

  _updateResizeHint(event) {
    if (event.target.closest('.pane-header')) {
      this._setHoverResizeHandle(null);
      return;
    }
    this._setHoverResizeHandle(this._resolveResizeHandle(event.clientX, event.clientY));
  }

  _setHoverResizeHandle(handle) {
    if (this._hoverResizeHandle === handle) return;
    this._hoverResizeHandle = handle;
    if (handle) {
      this.el.dataset.resizeHandle = handle;
    } else {
      delete this.el.dataset.resizeHandle;
    }
  }

  _resolveResizeHandle(clientX, clientY) {
    const rect = this.el.getBoundingClientRect();
    const rhCfg = window.WorkspaceConfig?.resizeHandle || {};
    const edgeThreshold = rhCfg.edgeThreshold || 18;
    const cornerThreshold = rhCfg.cornerThreshold || 28;

    const nearLeft = clientX <= rect.left + cornerThreshold;
    const nearRight = clientX >= rect.right - cornerThreshold;
    const nearTop = clientY <= rect.top + cornerThreshold;
    const nearBottom = clientY >= rect.bottom - cornerThreshold;

    if (nearTop && nearLeft) return 'nw';
    if (nearTop && nearRight) return 'ne';
    if (nearBottom && nearRight) return 'se';
    if (nearBottom && nearLeft) return 'sw';
    if (clientY <= rect.top + edgeThreshold) return 'n';
    if (clientX >= rect.right - edgeThreshold) return 'e';
    if (clientY >= rect.bottom - edgeThreshold) return 's';
    if (clientX <= rect.left + edgeThreshold) return 'w';

    return null;
  }

  // ──────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────

  _emitBoundsCommit() {
    if (this.onBoundsCommit) this.onBoundsCommit(this.paneId, this.getBounds());
  }

  requestPersist() {
    this._emitBoundsCommit();
  }

  init() {}
  handleMessage() {}

  scheduleFit() {
    if (this._fitFrame) return;
    this._fitFrame = requestAnimationFrame(() => {
      this._fitFrame = null;
      this.fit();
    });
  }

  fit() {}

  setBounds(bounds, { notify = true, fit = true } = {}) {
    this.bounds = window.PaneGeometry.constrainBounds(bounds, this.getContainerRect());
    this.el.style.left = `${this.bounds.x}px`;
    this.el.style.top = `${this.bounds.y}px`;
    this.el.style.width = `${this.bounds.width}px`;
    this.el.style.height = `${this.bounds.height}px`;
    if (fit) this.scheduleFit();
    if (notify) this.requestPersist();
  }

  getBounds() {
    return { ...this.bounds };
  }

  getTitle() {
    if (this._titleEditing) {
      return this.titleInputEl.value.trim() || this.defaultTitle;
    }
    return this.titleDisplayEl.textContent.trim() || this.defaultTitle;
  }

  setTitle(title, { notify = false } = {}) {
    const nextTitle = (title || '').trim() || this.defaultTitle;
    this.titleDisplayEl.textContent = nextTitle;
    this.titleInputEl.value = nextTitle;
    if (notify) this.requestPersist();
  }

  getPersistData() {
    return {};
  }

  setZIndex(zIndex) {
    this.el.style.zIndex = String(zIndex);
  }

  focus() {
    this.el.focus({ preventScroll: true });
  }

  setActive(isActive) {
    this.el.classList.toggle('active', isActive);
  }

  dispose() {
    this._gestures.dispose();
    this._resizeObserver.disconnect();
    if (this._fitFrame) {
      cancelAnimationFrame(this._fitFrame);
      this._fitFrame = null;
    }
    this.el.remove();
  }

  getElement() {
    return this.el;
  }
}

window.BaseCard = BaseCard;
