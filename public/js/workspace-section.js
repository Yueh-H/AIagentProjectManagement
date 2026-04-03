/**
 * WorkspaceSection — a visual grouping container for cards on the canvas.
 * Sections render as a labelled bounding box behind the cards they contain.
 */
class WorkspaceSection {
  static _counter = 0;

  constructor(id, {
    title = '',
    paneIds = [],
    bounds = { x: 0, y: 0, width: 400, height: 300 },
    color = 'default',
  } = {}) {
    this.id = id;
    this._title = title || `Section ${WorkspaceSection._counter}`;
    this._paneIds = new Set(paneIds);
    this._bounds = { ...bounds };
    this._color = color;

    this._el = this._buildDom();
    this._applyBounds();
    this._applyTitle();
  }

  // ── DOM ──

  _buildDom() {
    const wrapper = document.createElement('div');
    wrapper.className = 'workspace-section';
    wrapper.dataset.sectionId = this.id;

    // Header row: title + menu button
    const header = document.createElement('div');
    header.className = 'workspace-section-header';

    this._titleEl = document.createElement('span');
    this._titleEl.className = 'workspace-section-title';
    this._titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this._enterTitleEdit();
    });

    this._titleInput = document.createElement('input');
    this._titleInput.className = 'workspace-section-title-input';
    this._titleInput.type = 'text';
    this._titleInput.hidden = true;
    this._titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._commitTitleEdit();
      } else if (e.key === 'Escape') {
        this._cancelTitleEdit();
      }
      e.stopPropagation();
    });
    this._titleInput.addEventListener('blur', () => this._commitTitleEdit());

    const menuBtn = document.createElement('button');
    menuBtn.className = 'workspace-section-menu-btn';
    menuBtn.textContent = '\u2026'; // "…"
    menuBtn.title = 'Section options';
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._onMenuClick?.(this.id, e.clientX, e.clientY);
    });

    header.append(this._titleEl, this._titleInput, menuBtn);

    // Body area (visual border)
    const body = document.createElement('div');
    body.className = 'workspace-section-body';

    wrapper.append(header, body);
    this._initDrag(wrapper);
    return wrapper;
  }

  // ── Drag / Select on entire section area ──

  _initDrag(wrapper) {
    const DRAG_THRESHOLD = 4;
    let dragging = false;
    let didMove = false;
    let startX = 0;
    let startY = 0;

    const onDown = (e) => {
      if (e.button !== 0) return;
      // Let menu button, title input, and cards handle their own events
      if (e.target.closest('.workspace-section-menu-btn')) return;
      if (e.target.closest('.workspace-section-title-input')) return;
      if (e.target.closest('.pane-wrapper')) return;

      e.stopPropagation();
      dragging = true;
      didMove = false;
      startX = e.clientX;
      startY = e.clientY;

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!didMove && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        didMove = true;
        this._el.classList.add('is-dragging');
        this._onSectionDragStart?.(this.id);
      }

      if (!didMove) return;

      const zoom = this._onGetZoom?.() || 1;
      this._onSectionDragMove?.(this.id, dx / zoom, dy / zoom);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      if (dragging && didMove) {
        this._el.classList.remove('is-dragging');
        this._onSectionDragEnd?.(this.id);
      } else if (dragging && !didMove) {
        // Click without drag → select
        this._onSectionSelect?.(this.id);
      }

      dragging = false;
      didMove = false;
    };

    wrapper.addEventListener('pointerdown', onDown);
  }

  getElement() { return this._el; }

  // ── Title ──

  _applyTitle() {
    this._titleEl.textContent = this._title;
    this._titleInput.value = this._title;
  }

  getTitle() { return this._title; }

  setTitle(title) {
    this._title = title || this._title;
    this._applyTitle();
  }

  _enterTitleEdit() {
    this._titleEl.hidden = true;
    this._titleInput.hidden = false;
    this._titleInput.value = this._title;
    this._titleInput.focus();
    this._titleInput.select();
  }

  _commitTitleEdit() {
    if (this._titleInput.hidden) return;
    const value = this._titleInput.value.trim();
    if (value) this._title = value;
    this._titleEl.hidden = false;
    this._titleInput.hidden = true;
    this._applyTitle();
    this._onChanged?.();
  }

  _cancelTitleEdit() {
    this._titleEl.hidden = false;
    this._titleInput.hidden = true;
    this._titleInput.value = this._title;
  }

  // ── Bounds ──

  getBounds() { return { ...this._bounds }; }

  setBounds(bounds) {
    this._bounds = { ...bounds };
    this._applyBounds();
  }

  _applyBounds() {
    const s = this._el.style;
    s.left = `${this._bounds.x}px`;
    s.top = `${this._bounds.y}px`;
    s.width = `${this._bounds.width}px`;
    s.height = `${this._bounds.height}px`;
  }

  // ── Pane membership ──

  getPaneIds() { return Array.from(this._paneIds); }

  hasPaneId(paneId) { return this._paneIds.has(paneId); }

  addPaneId(paneId) { this._paneIds.add(paneId); }

  removePaneId(paneId) { this._paneIds.delete(paneId); }

  setPaneIds(ids) { this._paneIds = new Set(ids); }

  get size() { return this._paneIds.size; }

  // ── Recompute bounds from member panes ──

  recomputeBounds(panesMap, padding = 40) {
    const members = this.getPaneIds().filter((id) => panesMap.has(id));
    if (!members.length) return false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of members) {
      const b = panesMap.get(id).getBounds();
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    // Header height offset (title bar sits above the body)
    const headerHeight = 42;
    this._bounds = {
      x: minX - padding,
      y: minY - padding - headerHeight,
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2 + headerHeight,
    };
    this._applyBounds();
    return true;
  }

  // ── Persistence ──

  toJSON() {
    return {
      id: this.id,
      title: this._title,
      paneIds: this.getPaneIds(),
      bounds: this.getBounds(),
      color: this._color,
    };
  }

  // ── Lifecycle ──

  dispose() {
    this._el.remove();
  }

  // ── Selection ──

  setSelected(selected) {
    this._el.classList.toggle('is-selected', !!selected);
  }

  // ── Callbacks (set by PaneManager) ──

  set onChanged(fn) { this._onChanged = fn; }
  set onMenuClick(fn) { this._onMenuClick = fn; }
  set onSectionSelect(fn) { this._onSectionSelect = fn; }
  set onSectionDragStart(fn) { this._onSectionDragStart = fn; }
  set onSectionDragMove(fn) { this._onSectionDragMove = fn; }
  set onSectionDragEnd(fn) { this._onSectionDragEnd = fn; }
  set onGetZoom(fn) { this._onGetZoom = fn; }
}

if (typeof window !== 'undefined') {
  window.WorkspaceSection = WorkspaceSection;
}
