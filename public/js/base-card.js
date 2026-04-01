const BASE_CARD_STYLE_VARS = [
  '--panel-bg',
  '--panel-header',
  '--surface-alpha',
  '--surface-deep',
  '--surface-input',
  '--surface-editor',
  '--text-main',
  '--text-muted',
  '--text-sub',
  '--text-output',
  '--border-subtle',
  '--border-muted',
  '--pane-card-tint',
  '--pane-accent-soft',
  '--pane-frame-color',
  '--pane-frame-active-color',
  '--pane-active-ring',
  '--pane-title-color',
  '--pane-title-placeholder-color',
  '--pane-title-input-border',
  '--pane-title-input-border-hover',
  '--pane-title-focus-ring',
];

function createPastelTheme({
  id,
  label,
  swatch,
  panelBg,
  panelHeader,
  frameColor,
  frameActiveColor = frameColor,
  accentSoft,
}) {
  return Object.freeze({
    id,
    label,
    swatch,
    panelBg,
    panelHeader,
    surfaceAlpha: 'rgba(255, 255, 255, 0.28)',
    surfaceDeep: 'rgba(255, 255, 255, 0.38)',
    surfaceInput: 'rgba(255, 255, 255, 0.56)',
    surfaceEditor: 'rgba(255, 255, 255, 0.68)',
    textMain: '#2f2925',
    textMuted: 'rgba(79, 69, 62, 0.72)',
    textSub: 'rgba(63, 54, 49, 0.84)',
    textOutput: '#312b27',
    borderSubtle: 'rgba(96, 76, 70, 0.16)',
    borderMuted: 'rgba(96, 76, 70, 0.24)',
    cardTint: 'rgba(255, 255, 255, 0.12)',
    accentSoft,
    frameColor,
    frameActiveColor,
    activeRing: 'rgba(59, 130, 246, 0.22)',
    titleColor: '#2f2925',
    titlePlaceholderColor: 'rgba(79, 69, 62, 0.56)',
    titleInputBorder: 'rgba(96, 76, 70, 0.2)',
    titleInputBorderHover: 'rgba(96, 76, 70, 0.32)',
    titleFocusRing: 'rgba(96, 76, 70, 0.12)',
  });
}

const CARD_COLOR_THEMES = Object.freeze({
  default: Object.freeze({
    id: 'default',
    label: 'Default',
    swatch: '#ffffff',
  }),
  rose: createPastelTheme({
    id: 'rose',
    label: 'Rose',
    swatch: '#df5b82',
    panelBg: '#f5cfd5',
    panelHeader: '#f2c3ca',
    frameColor: '#d48c98',
    accentSoft: 'rgba(212, 140, 152, 0.22)',
  }),
  orange: createPastelTheme({
    id: 'orange',
    label: 'Orange',
    swatch: '#f4ac45',
    panelBg: '#f8d0b0',
    panelHeader: '#f5c49b',
    frameColor: '#d6a077',
    accentSoft: 'rgba(214, 160, 119, 0.22)',
  }),
  yellow: createPastelTheme({
    id: 'yellow',
    label: 'Yellow',
    swatch: '#ead94c',
    panelBg: '#f7e18d',
    panelHeader: '#f4d96d',
    frameColor: '#d2bc61',
    accentSoft: 'rgba(210, 188, 97, 0.22)',
  }),
  green: createPastelTheme({
    id: 'green',
    label: 'Green',
    swatch: '#5fc276',
    panelBg: '#d9e5d2',
    panelHeader: '#cfddc8',
    frameColor: '#aebbaf',
    accentSoft: 'rgba(174, 187, 175, 0.22)',
  }),
  blue: createPastelTheme({
    id: 'blue',
    label: 'Blue',
    swatch: '#6d82f7',
    panelBg: '#dbe4f4',
    panelHeader: '#d1dbef',
    frameColor: '#a7b5d6',
    accentSoft: 'rgba(167, 181, 214, 0.22)',
  }),
  violet: createPastelTheme({
    id: 'violet',
    label: 'Violet',
    swatch: '#963fe4',
    panelBg: '#e7d8f3',
    panelHeader: '#dfceed',
    frameColor: '#b59fc7',
    accentSoft: 'rgba(181, 159, 199, 0.22)',
  }),
  charcoal: Object.freeze({
    id: 'charcoal',
    label: 'Charcoal',
    swatch: '#424242',
    panelBg: '#484848',
    panelHeader: '#404040',
    surfaceAlpha: 'rgba(255, 255, 255, 0.08)',
    surfaceDeep: 'rgba(255, 255, 255, 0.12)',
    surfaceInput: 'rgba(255, 255, 255, 0.16)',
    surfaceEditor: 'rgba(255, 255, 255, 0.18)',
    textMain: '#f5f2ef',
    textMuted: 'rgba(245, 242, 239, 0.66)',
    textSub: 'rgba(245, 242, 239, 0.82)',
    textOutput: '#faf7f4',
    borderSubtle: 'rgba(255, 255, 255, 0.12)',
    borderMuted: 'rgba(255, 255, 255, 0.18)',
    cardTint: 'rgba(255, 255, 255, 0.04)',
    accentSoft: 'rgba(255, 255, 255, 0.08)',
    frameColor: 'rgba(255, 255, 255, 0.18)',
    frameActiveColor: '#808080',
    activeRing: 'rgba(59, 130, 246, 0.22)',
    titleColor: '#f5f2ef',
    titlePlaceholderColor: 'rgba(245, 242, 239, 0.54)',
    titleInputBorder: 'rgba(255, 255, 255, 0.18)',
    titleInputBorderHover: 'rgba(255, 255, 255, 0.28)',
    titleFocusRing: 'rgba(255, 255, 255, 0.12)',
  }),
});

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
    this._isActive = false;
    this._isSelected = false;
    this._contentInteractionPrimed = false;
    this.colorTheme = 'default';
    this.onGroupDragStart = null;
    this.onGroupDragMove = null;
    this.onGroupDragEnd = null;

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
    // Keep the input's own bubble-phase handlers isolated from header clicks.
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
    this._registerBodyDrag();

    this._resizeObserver = new ResizeObserver(() => this.scheduleFit());
    this._resizeObserver.observe(this.bodyEl);

    this.setBounds(this.bounds, { notify: false, fit: false });
    this.setColorTheme('default', { notify: false });
  }

  // ──────────────────────────────────────────────
  //  Gesture registration
  // ──────────────────────────────────────────────

  _registerHeaderGestures() {
    let dragStartBounds = null;
    let groupDragSession = null;
    const defaultDragThreshold = window.WorkspaceConfig?.gesture?.dragThreshold ?? 4;

    this._gestures.zone(this.headerEl, {
      dragThreshold: (e) => {
        e._cardInteractionLocked = this._isCardInteractionLocked();
        return this._isInteractiveTarget(e.target) ? defaultDragThreshold : 0;
      },

      filter: (e) => {
        // Don't intercept close button
        if (e.target.closest('.pane-close-button')) return false;
        return true;
      },

      onTap: (e) => {
        if (e.target === this.titleInputEl && !this.titleInputEl.hidden) return;
        this._clearContentInteraction();
        this._requestCardFocus();
      },

      onDoubleTap: (e) => {
        if (e.target === this.titleInputEl && !this.titleInputEl.hidden) return;
        this._clearContentInteraction();
        this._requestCardFocus();
        // Double-tap on title area → edit mode
        const titleRect = this.titleDisplayEl.getBoundingClientRect();
        const inTitleZone = e.clientX >= titleRect.left - 8 && e.clientX <= titleRect.right + 8
                         && e.clientY >= titleRect.top - 4 && e.clientY <= titleRect.bottom + 4;
        if (inTitleZone) {
          this._beginTitleEdit();
        }
      },

      onDragStart: (e) => {
        if (this._shouldPreserveInteractiveSelection(e.target)) return false;
        this._requestCardFocus();
        this._clearContentInteraction();
        this._releaseInteractiveFocus(e.target);
        groupDragSession = typeof this.onGroupDragStart === 'function'
          ? this.onGroupDragStart(this.paneId)
          : null;
        dragStartBounds = groupDragSession ? null : this.getBounds();
        document.body.classList.add('is-dragging-pane');
        document.body.classList.add('is-dragging-card');
      },

      onDrag: (e, delta) => {
        const zoom = this.getContainerRect().zoom || 1;
        const deltaX = delta.x / zoom;
        const deltaY = delta.y / zoom;

        if (groupDragSession) {
          if (typeof this.onGroupDragMove === 'function') {
            this.onGroupDragMove(this.paneId, groupDragSession, deltaX, deltaY);
          }
          return;
        }

        if (!dragStartBounds) return;
        const nextBounds = window.PaneGeometry.translatePaneBounds(
          dragStartBounds, deltaX, deltaY, this.getContainerRect()
        );
        this.setBounds(nextBounds, { notify: false, fit: false });
      },

      onDragEnd: () => {
        document.body.classList.remove('is-dragging-pane');
        document.body.classList.remove('is-dragging-card');
        if (groupDragSession) {
          const session = groupDragSession;
          groupDragSession = null;
          dragStartBounds = null;
          if (typeof this.onGroupDragEnd === 'function') {
            this.onGroupDragEnd(this.paneId, session);
          }
          return;
        }
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
        this._requestCardFocus();
      },

      onDragStart: (e) => {
        this._requestCardFocus();
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

  _releaseInteractiveFocus(target) {
    if (!this._isInteractiveTarget(target)) return;
    const activeEl = document.activeElement;
    if (activeEl && this.el.contains(activeEl) && typeof activeEl.blur === 'function') {
      activeEl.blur();
    }
  }

  _hasFocusedInteractiveContent() {
    const activeEl = document.activeElement;
    if (!activeEl || !this.el.contains(activeEl)) return false;
    if (activeEl === this.el) return false;
    return this._isInteractiveTarget(activeEl) || activeEl === this.titleInputEl;
  }

  _hasTextSelectionInside() {
    const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
    if (!selection || selection.isCollapsed || selection.rangeCount < 1) return false;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const node = container?.nodeType === 1 ? container : container?.parentElement;
    return Boolean(node && this.el.contains(node));
  }

  _isCardInteractionLocked() {
    if (!this._isActive) return false;
    if (this._contentInteractionPrimed) return true;
    if (this._hasFocusedInteractiveContent()) return true;
    if (this._hasTextSelectionInside()) return true;
    return false;
  }

  _primeContentInteraction() {
    this._contentInteractionPrimed = true;
  }

  _clearContentInteraction() {
    this._contentInteractionPrimed = false;
  }

  _shouldPreserveInteractiveSelection(target) {
    if (!target) return false;
    if (target === this.titleInputEl && !this.titleInputEl.hidden && this._hasFocusedInteractiveContent()) {
      return true;
    }
    if (this._isInteractiveTarget(target) && this._hasFocusedInteractiveContent()) {
      return true;
    }
    if (!target.closest('.pane-header') && this._isActive && this._contentInteractionPrimed) {
      return true;
    }
    return false;
  }

  _registerBodyDrag() {
    let dragStartBounds = null;
    let groupDragSession = null;
    const defaultDragThreshold = window.WorkspaceConfig?.gesture?.dragThreshold ?? 4;

    const startDrag = (e) => {
      this._requestCardFocus();
      this._releaseInteractiveFocus(e.target);
      groupDragSession = typeof this.onGroupDragStart === 'function'
        ? this.onGroupDragStart(this.paneId)
        : null;
      dragStartBounds = groupDragSession ? null : this.getBounds();
      document.body.classList.add('is-dragging-pane');
      document.body.classList.add('is-dragging-card');
    };

    const moveDrag = (e, delta) => {
      const zoom = this.getContainerRect().zoom || 1;
      const deltaX = delta.x / zoom;
      const deltaY = delta.y / zoom;

      if (groupDragSession) {
        if (typeof this.onGroupDragMove === 'function') {
          this.onGroupDragMove(this.paneId, groupDragSession, deltaX, deltaY);
        }
        return;
      }

      if (!dragStartBounds) return;
      const nextBounds = window.PaneGeometry.translatePaneBounds(
        dragStartBounds, deltaX, deltaY, this.getContainerRect()
      );
      this.setBounds(nextBounds, { notify: false, fit: false });
    };

    const endDrag = () => {
      document.body.classList.remove('is-dragging-pane');
      document.body.classList.remove('is-dragging-card');
      if (groupDragSession) {
        const session = groupDragSession;
        groupDragSession = null;
        dragStartBounds = null;
        if (typeof this.onGroupDragEnd === 'function') {
          this.onGroupDragEnd(this.paneId, session);
        }
        return;
      }
      dragStartBounds = null;
      this.scheduleFit();
      this._emitBoundsCommit();
    };

    this._gestures.zone(this.el, {
      dragThreshold: (e) => {
        e._cardInteractionLocked = this._isCardInteractionLocked();
        return this._isInteractiveTarget(e.target) ? defaultDragThreshold : 0;
      },

      filter: (e) => {
        if (e.button !== 0) return false;
        if (e.target.closest('.pane-close-button')) return false;
        if (e.target.closest('.pane-resize-handle')) return false;
        if (e.target.closest('.pane-header')) return false;
        return true;
      },

      onTap: (e) => {
        this._primeContentInteraction();
        this._requestCardFocus({
          preserveDomFocus: this._isInteractiveTarget(e.target),
        });
      },

      onDragStart: (e) => {
        if (e._cardInteractionLocked) return false;
        this._clearContentInteraction();
        startDrag(e);
      },
      onDrag: (e, delta) => moveDrag(e, delta),
      onDragEnd: () => endDrag(),
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

  hydratePersistedData() {}

  getUiPersistData() {
    return this.colorTheme && this.colorTheme !== 'default'
      ? { colorTheme: this.colorTheme }
      : {};
  }

  hydrateUiState(data = {}) {
    this.setColorTheme(data?.colorTheme, { notify: false });
  }

  getColorTheme() {
    return this.colorTheme || 'default';
  }

  setColorTheme(colorTheme, { notify = true } = {}) {
    const nextTheme = BaseCard.getColorThemes()[colorTheme] ? colorTheme : 'default';
    const didChange = this.colorTheme !== nextTheme;

    this.colorTheme = nextTheme;
    this.el.dataset.colorTheme = nextTheme;
    this._applyColorTheme(BaseCard.getColorThemes()[nextTheme]);

    if (notify && didChange) {
      this.requestPersist();
    }
  }

  _applyColorTheme(theme) {
    BASE_CARD_STYLE_VARS.forEach((key) => this.el.style.removeProperty(key));

    if (!theme || theme.id === 'default') return;

    this.el.style.setProperty('--panel-bg', theme.panelBg);
    this.el.style.setProperty('--panel-header', theme.panelHeader);
    this.el.style.setProperty('--surface-alpha', theme.surfaceAlpha);
    this.el.style.setProperty('--surface-deep', theme.surfaceDeep);
    this.el.style.setProperty('--surface-input', theme.surfaceInput);
    this.el.style.setProperty('--surface-editor', theme.surfaceEditor);
    this.el.style.setProperty('--text-main', theme.textMain);
    this.el.style.setProperty('--text-muted', theme.textMuted);
    this.el.style.setProperty('--text-sub', theme.textSub);
    this.el.style.setProperty('--text-output', theme.textOutput);
    this.el.style.setProperty('--border-subtle', theme.borderSubtle);
    this.el.style.setProperty('--border-muted', theme.borderMuted);
    this.el.style.setProperty('--pane-card-tint', theme.cardTint);
    this.el.style.setProperty('--pane-accent-soft', theme.accentSoft);
    this.el.style.setProperty('--pane-frame-color', theme.frameColor);
    this.el.style.setProperty('--pane-frame-active-color', theme.frameActiveColor);
    this.el.style.setProperty('--pane-active-ring', theme.activeRing);
    this.el.style.setProperty('--pane-title-color', theme.titleColor);
    this.el.style.setProperty('--pane-title-placeholder-color', theme.titlePlaceholderColor);
    this.el.style.setProperty('--pane-title-input-border', theme.titleInputBorder);
    this.el.style.setProperty('--pane-title-input-border-hover', theme.titleInputBorderHover);
    this.el.style.setProperty('--pane-title-focus-ring', theme.titleFocusRing);
  }

  setZIndex(zIndex) {
    this.el.style.zIndex = String(zIndex);
  }

  focus() {
    this.el.focus({ preventScroll: true });
  }

  _requestCardFocus(options) {
    if (this.onFocus) {
      this.onFocus(this.paneId, options);
    }
  }

  setActive(isActive) {
    this._isActive = Boolean(isActive);
    if (!this._isActive) {
      this._clearContentInteraction();
    }
    this.el.classList.toggle('active', isActive);
  }

  setSelected(isSelected) {
    this._isSelected = Boolean(isSelected);
    this.el.classList.toggle('selected', this._isSelected);
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

  static getColorThemes() {
    return CARD_COLOR_THEMES;
  }

  static getColorThemeEntries() {
    return Object.values(CARD_COLOR_THEMES);
  }
}

window.BaseCard = BaseCard;
