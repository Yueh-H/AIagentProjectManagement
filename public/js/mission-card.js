function normalizeMissionData(data = {}) {
  return {
    instruction: typeof data.instruction === 'string' ? data.instruction : '',
    doneCriteria: typeof data.doneCriteria === 'string' ? data.doneCriteria : '',
    resultSummary: typeof data.resultSummary === 'string' ? data.resultSummary : '',
    sourcePaneId: typeof data.sourcePaneId === 'string' ? data.sourcePaneId : '',
    status: ['pending', 'running', 'done', 'failed'].includes(data.status) ? data.status : 'pending',
    statusUpdatedAt: typeof data.statusUpdatedAt === 'number' ? data.statusUpdatedAt : Date.now(),
  };
}

const MISSION_STATUS_META = {
  pending:  { label: 'Pending',  tone: 'muted',   next: 'running' },
  running:  { label: 'Running',  tone: 'running',  next: 'done'    },
  done:     { label: 'Done',     tone: 'done',     next: 'failed'  },
  failed:   { label: 'Failed',   tone: 'danger',   next: 'pending' },
};

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

class MissionCard extends BaseCard {
  constructor(cardId, ws, {
    title,
    bounds,
    data,
    getContainerRect,
    onBoundsCommit,
    onFocus,
    onRequestClose,
    onRequestFocusCard,
  } = {}) {
    super(cardId, {
      cardType: 'mission',
      title,
      bounds,
      defaultTitle: 'Mission',
      headerHint: 'AI task unit',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.onRequestFocusCard = onRequestFocusCard;
    this.data = normalizeMissionData(data);
    this.terminals = [];
    this._relativeTimeTimer = null;

    this.el.classList.add('mission-card');
    this.bodyEl.classList.add('mission-card-body');

    // ── 1. Status Header ──
    this.statusHeaderEl = document.createElement('section');
    this.statusHeaderEl.className = 'mission-status-header';
    this.statusHeaderEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this._cycleStatus();
    });

    this.statusBadgeEl = document.createElement('div');
    this.statusBadgeEl.className = 'mission-status-badge';

    this.statusTimeEl = document.createElement('div');
    this.statusTimeEl.className = 'mission-status-time';

    this.statusHeaderEl.append(this.statusBadgeEl, this.statusTimeEl);

    // ── 2. Instruction ──
    this.instructionSection = this._createTextSection({
      key: 'instruction',
      title: 'Mission',
      placeholder: 'Describe what the AI should accomplish',
      rows: 3,
    });

    // ── 3. Done Criteria ──
    this.doneCriteriaSection = this._createTextSection({
      key: 'doneCriteria',
      title: 'Done When',
      placeholder: 'How do we know this mission is complete?',
      rows: 2,
    });

    // ── 4. Live Output ──
    this.outputSectionEl = document.createElement('section');
    this.outputSectionEl.className = 'mission-output-section';

    const outputHeader = document.createElement('div');
    outputHeader.className = 'mission-section-header';

    const outputTitle = document.createElement('div');
    outputTitle.className = 'mission-section-title';
    outputTitle.textContent = 'Live Output';

    this.sourceSelectEl = document.createElement('select');
    this.sourceSelectEl.className = 'mission-source-select';
    this.sourceSelectEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.onFocus) this.onFocus(this.paneId);
    });
    this.sourceSelectEl.addEventListener('change', () => {
      this.data.sourcePaneId = this.sourceSelectEl.value;
      this.requestPersist();
      this._renderOutput();
    });

    outputHeader.append(outputTitle, this.sourceSelectEl);

    this.phaseEl = document.createElement('div');
    this.phaseEl.className = 'mission-phase-badge';

    this.outputPreviewEl = document.createElement('div');
    this.outputPreviewEl.className = 'mission-output-preview';

    this.focusButtonEl = document.createElement('button');
    this.focusButtonEl.type = 'button';
    this.focusButtonEl.className = 'mission-focus-button';
    this.focusButtonEl.textContent = 'Focus Terminal';
    this.focusButtonEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const source = this._getSelectedTerminal();
      if (source && this.onRequestFocusCard) {
        this.onRequestFocusCard(source.id);
      }
    });

    this.outputSectionEl.append(outputHeader, this.phaseEl, this.outputPreviewEl, this.focusButtonEl);

    // ── 5. Result Summary ──
    this.resultSection = this._createTextSection({
      key: 'resultSummary',
      title: 'Result',
      placeholder: 'Summary of what was accomplished',
      rows: 3,
    });
    this.resultSection.root.classList.add('mission-result-section');

    // ── Assemble ──
    this.bodyEl.append(
      this.statusHeaderEl,
      this.instructionSection.root,
      this.doneCriteriaSection.root,
      this.outputSectionEl,
      this.resultSection.root,
    );

    this._applyStatus();
    this._syncSourceOptions();
    this._renderOutput();
    this._startRelativeTimeUpdater();
  }

  // ──────────────────────────────────────────────
  //  Section helpers
  // ──────────────────────────────────────────────

  _createTextSection({ key, title, placeholder, rows }) {
    const root = document.createElement('section');
    root.className = 'mission-text-section';

    const header = document.createElement('div');
    header.className = 'mission-section-title';
    header.textContent = title;

    const input = document.createElement('textarea');
    input.className = 'mission-text-input';
    input.placeholder = placeholder;
    input.rows = rows;
    input.spellcheck = false;
    input.value = this.data[key] || '';

    input.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.onFocus) this.onFocus(this.paneId);
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('input', () => {
      this.data[key] = input.value;
      this.requestPersist();
    });

    root.append(header, input);
    return { root, input };
  }

  // ──────────────────────────────────────────────
  //  Status management
  // ──────────────────────────────────────────────

  _cycleStatus() {
    const meta = MISSION_STATUS_META[this.data.status];
    this.data.status = meta.next;
    this.data.statusUpdatedAt = Date.now();
    this._applyStatus();
    this.requestPersist();
  }

  _applyStatus() {
    const meta = MISSION_STATUS_META[this.data.status];
    this.statusHeaderEl.dataset.tone = meta.tone;
    this.statusBadgeEl.textContent = meta.label;
    this.statusTimeEl.textContent = formatRelativeTime(this.data.statusUpdatedAt);

    // Dim result section when not done/failed
    const showResult = this.data.status === 'done' || this.data.status === 'failed';
    this.resultSection.root.classList.toggle('mission-result-dimmed', !showResult);
  }

  // ──────────────────────────────────────────────
  //  Terminal source & live output
  // ──────────────────────────────────────────────

  _syncSourceOptions() {
    const previousValue = this.sourceSelectEl.value || this.data.sourcePaneId || '';

    this.sourceSelectEl.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.terminals.length
      ? 'Select terminal to follow'
      : 'No terminals available';
    this.sourceSelectEl.appendChild(placeholder);

    this.terminals
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .forEach((terminal) => {
        const option = document.createElement('option');
        option.value = terminal.id;
        option.textContent = terminal.title;
        this.sourceSelectEl.appendChild(option);
      });

    // Auto-select first terminal if none selected
    if (!this.data.sourcePaneId && this.terminals[0]) {
      this.data.sourcePaneId = this.terminals[0].id;
      this.requestPersist();
    }

    const nextValue = this.terminals.some((t) => t.id === previousValue)
      ? previousValue
      : this.data.sourcePaneId;

    this.sourceSelectEl.value = nextValue || '';
  }

  _getSelectedTerminal() {
    return this.terminals.find((t) => t.id === this.data.sourcePaneId) || null;
  }

  _renderOutput() {
    const source = this._getSelectedTerminal();

    if (!source) {
      this.phaseEl.textContent = '';
      this.phaseEl.dataset.phase = '';
      this.outputPreviewEl.textContent = 'Link a terminal to see live output.';
      this.focusButtonEl.disabled = true;
      return;
    }

    this.focusButtonEl.disabled = false;

    const rawOutput = source.recentOutput || '';
    const phase = window.OutputUtils.detectAgentPhase(rawOutput);

    // Phase badge
    const phaseLabels = {
      idle: 'Idle',
      input: 'Awaiting Input',
      thinking: 'Thinking...',
      responding: 'Responding...',
      done: 'Done',
    };
    this.phaseEl.textContent = phaseLabels[phase] || phase;
    this.phaseEl.dataset.phase = phase;

    // Output preview — show last few meaningful lines
    const clean = window.OutputUtils.extractAgentContent(rawOutput);
    if (clean) {
      const lines = clean.split('\n').filter(Boolean);
      this.outputPreviewEl.textContent = lines.slice(-6).join('\n');
    } else if (source.status === 'exited') {
      this.outputPreviewEl.textContent = `Process exited${source.exitCode != null ? ` (code ${source.exitCode})` : ''}.`;
    } else {
      this.outputPreviewEl.textContent = 'Waiting for output...';
    }
  }

  // ──────────────────────────────────────────────
  //  Relative time updater
  // ──────────────────────────────────────────────

  _startRelativeTimeUpdater() {
    this._relativeTimeTimer = setInterval(() => {
      this.statusTimeEl.textContent = formatRelativeTime(this.data.statusUpdatedAt);
    }, 10_000);
  }

  // ──────────────────────────────────────────────
  //  Workspace state hook
  // ──────────────────────────────────────────────

  receiveWorkspaceState({ terminals }) {
    this.terminals = Array.isArray(terminals) ? terminals : [];
    this._syncSourceOptions();
    this._renderOutput();
  }

  getPersistData() {
    return {
      instruction: this.data.instruction,
      doneCriteria: this.data.doneCriteria,
      resultSummary: this.data.resultSummary,
      sourcePaneId: this.data.sourcePaneId,
      status: this.data.status,
      statusUpdatedAt: this.data.statusUpdatedAt,
    };
  }

  dispose() {
    if (this._relativeTimeTimer) {
      clearInterval(this._relativeTimeTimer);
      this._relativeTimeTimer = null;
    }
    super.dispose();
  }
}

window.MissionCard = MissionCard;

CardRegistry.register({
  type: 'mission',
  cardClass: MissionCard,
  buttonLabel: 'Mission',
  icon: '\u{1F3AF}',
  shortcutKey: 'M',
  shortcutHint: 'Add Mission Card (Ctrl+Shift+M)',
  order: 15,
  spawnBounds: { widthRatio: 0.48, heightRatio: 0.68, minWidth: 400, minHeight: 340 },
});
