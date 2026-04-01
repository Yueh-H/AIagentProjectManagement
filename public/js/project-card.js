function normalizeProjectText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeProjectData(data = {}) {
  return {
    objective: normalizeProjectText(data.objective),
    successCriteria: normalizeProjectText(data.successCriteria),
    nextAction: normalizeProjectText(data.nextAction),
    notes: normalizeProjectText(data.notes),
  };
}

function formatCount(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

class ProjectCard extends BaseCard {
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
      cardType: 'project',
      title,
      bounds,
      defaultTitle: 'Project Overview',
      headerHint: 'Track terminal goals',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.onRequestFocusCard = onRequestFocusCard;
    this.data = normalizeProjectData(data);
    this.terminals = [];

    this.el.classList.add('project-card');
    this.bodyEl.classList.add('project-card-body');

    this.healthEl = document.createElement('section');
    this.healthEl.className = 'project-card-health';

    this.healthBadgeEl = document.createElement('div');
    this.healthBadgeEl.className = 'project-card-health-badge';

    const healthTextWrap = document.createElement('div');
    healthTextWrap.className = 'project-card-health-copy';

    this.healthHeadlineEl = document.createElement('div');
    this.healthHeadlineEl.className = 'project-card-health-headline';

    this.healthDetailEl = document.createElement('div');
    this.healthDetailEl.className = 'project-card-health-detail';

    healthTextWrap.append(this.healthHeadlineEl, this.healthDetailEl);
    this.healthEl.append(this.healthBadgeEl, healthTextWrap);

    this.planSectionEl = document.createElement('section');
    this.planSectionEl.className = 'project-card-plan';

    this.planHeaderEl = document.createElement('div');
    this.planHeaderEl.className = 'project-card-section-header';
    this.planHeaderEl.innerHTML = `
      <div class="project-card-section-title">Project Brief</div>
      <div class="project-card-section-caption">Keep the goal and next action close to the live terminal activity.</div>
    `;

    this.planGridEl = document.createElement('div');
    this.planGridEl.className = 'project-card-plan-grid';

    this.objectiveField = this._createField({
      key: 'objective',
      label: 'Objective',
      placeholder: 'What outcome are we trying to ship?',
      multiline: true,
      rows: 3,
    });
    this.successCriteriaField = this._createField({
      key: 'successCriteria',
      label: 'Definition of Done',
      placeholder: 'How will we know this project is complete?',
      multiline: true,
      rows: 3,
    });
    this.nextActionField = this._createField({
      key: 'nextAction',
      label: 'Next Action',
      placeholder: 'What should happen next in the terminal flow?',
      multiline: true,
      rows: 2,
    });
    this.notesField = this._createField({
      key: 'notes',
      label: 'Notes',
      placeholder: 'Risks, blockers, commands to remember, or checkpoints.',
      multiline: true,
      rows: 2,
    });

    this.planGridEl.append(
      this.objectiveField.root,
      this.successCriteriaField.root,
      this.nextActionField.root,
      this.notesField.root
    );
    this.planSectionEl.append(this.planHeaderEl, this.planGridEl);

    this.summaryEl = document.createElement('section');
    this.summaryEl.className = 'project-card-summary';

    this.totalMetricEl = this._createMetric('Tracked', '0');
    this.runningMetricEl = this._createMetric('Running', '0');
    this.idleMetricEl = this._createMetric('Idle', '0');
    this.exitedMetricEl = this._createMetric('Exited', '0');
    this.summaryEl.append(
      this.totalMetricEl.root,
      this.runningMetricEl.root,
      this.idleMetricEl.root,
      this.exitedMetricEl.root
    );

    this.terminalsSectionEl = document.createElement('section');
    this.terminalsSectionEl.className = 'project-card-terminals';

    this.terminalsHeaderEl = document.createElement('div');
    this.terminalsHeaderEl.className = 'project-card-section-header';
    this.terminalsHeaderEl.innerHTML = `
      <div class="project-card-section-title">Terminal Pulse</div>
      <div class="project-card-section-caption">Live summaries of the terminal cards currently attached to this workspace.</div>
    `;

    this.listEl = document.createElement('div');
    this.listEl.className = 'project-card-list';

    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'project-card-empty';
    this.emptyEl.textContent = 'No terminal cards yet. Create a terminal to start tracking execution.';

    this.terminalsSectionEl.append(this.terminalsHeaderEl, this.listEl, this.emptyEl);
    this.bodyEl.append(this.healthEl, this.planSectionEl, this.summaryEl, this.terminalsSectionEl);

    this._applyPersistedData();
    this.updateTerminalStatuses([]);
  }

  _applyPersistedData() {
    this.objectiveField.input.value = this.data.objective;
    this.successCriteriaField.input.value = this.data.successCriteria;
    this.nextActionField.input.value = this.data.nextAction;
    this.notesField.input.value = this.data.notes;
  }

  _createMetric(label, value) {
    const root = document.createElement('div');
    root.className = 'project-card-metric';

    const labelEl = document.createElement('div');
    labelEl.className = 'project-card-metric-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'project-card-metric-value';
    valueEl.textContent = value;

    root.append(labelEl, valueEl);
    return { root, labelEl, valueEl };
  }

  _createField({ key, label, placeholder, multiline = false, rows = 2 }) {
    const root = document.createElement('label');
    root.className = 'project-card-field';

    const labelEl = document.createElement('div');
    labelEl.className = 'project-card-field-label';
    labelEl.textContent = label;

    const input = multiline ? document.createElement('textarea') : document.createElement('input');
    if (!multiline) {
      input.type = 'text';
    }

    input.className = multiline
      ? 'project-card-field-input project-card-field-textarea'
      : 'project-card-field-input';
    input.placeholder = placeholder;
    input.value = this.data[key] || '';
    input.spellcheck = false;

    if (multiline) {
      input.rows = rows;
    }

    input.addEventListener('pointerdown', () => {
      if (this.onFocus) this.onFocus(this.paneId);
    });
    input.addEventListener('input', () => {
      this.data[key] = input.value;
      this.requestPersist();
    });

    root.append(labelEl, input);
    return { root, input };
  }

  _setHealthState({ tone, badge, headline, detail }) {
    this.healthBadgeEl.dataset.tone = tone;
    this.healthBadgeEl.textContent = badge;
    this.healthHeadlineEl.textContent = headline;
    this.healthDetailEl.textContent = detail;
  }

  updateTerminalStatuses(terminals) {
    this.terminals = Array.isArray(terminals) ? terminals : [];
    const running = this.terminals.filter((item) => item.status === 'running').length;
    const idle = this.terminals.filter((item) => item.status === 'idle' || item.status === 'starting').length;
    const exited = this.terminals.filter((item) => item.status === 'exited').length;
    const latest = this.terminals[0] || null;

    this.totalMetricEl.valueEl.textContent = String(this.terminals.length);
    this.runningMetricEl.valueEl.textContent = String(running);
    this.idleMetricEl.valueEl.textContent = String(idle);
    this.exitedMetricEl.valueEl.textContent = String(exited);

    if (!this.terminals.length) {
      this._setHealthState({
        tone: 'muted',
        badge: 'Waiting',
        headline: 'No terminals linked yet.',
        detail: 'Create a terminal card and this project card will start tracking its execution state.',
      });
    } else if (exited > 0) {
      this._setHealthState({
        tone: 'danger',
        badge: 'Needs Attention',
        headline: `${formatCount(exited, 'terminal')} exited recently.`,
        detail: latest?.preview || 'Review the exited terminals and restart the blocked flow when ready.',
      });
    } else if (running > 0) {
      this._setHealthState({
        tone: 'running',
        badge: 'Executing',
        headline: `${formatCount(running, 'terminal')} currently running.`,
        detail: latest?.preview || 'Live output will appear here as commands progress.',
      });
    } else {
      this._setHealthState({
        tone: 'idle',
        badge: 'Standing By',
        headline: `${formatCount(idle, 'terminal')} ready for the next step.`,
        detail: latest?.preview || 'Everything is idle right now. Use the next action field to queue the next command.',
      });
    }

    this.listEl.innerHTML = '';
    this.emptyEl.hidden = this.terminals.length > 0;

    this.terminals
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .forEach((terminal) => {
        const item = document.createElement('article');
        item.className = 'project-card-item';
        item.dataset.status = terminal.status;

        const statusDot = document.createElement('div');
        statusDot.className = 'project-card-item-dot';

        const content = document.createElement('div');
        content.className = 'project-card-item-content';

        const titleRow = document.createElement('div');
        titleRow.className = 'project-card-item-title-row';

        const titleEl = document.createElement('div');
        titleEl.className = 'project-card-item-title';
        titleEl.textContent = terminal.title;

        const statusEl = document.createElement('div');
        statusEl.className = 'project-card-item-status';
        statusEl.textContent = terminal.status;

        const previewEl = document.createElement('div');
        previewEl.className = 'project-card-item-preview';
        previewEl.textContent = terminal.preview || 'No recent output yet.';

        titleRow.append(titleEl, statusEl);
        content.append(titleRow, previewEl);

        const focusButton = document.createElement('button');
        focusButton.type = 'button';
        focusButton.className = 'project-card-focus-button';
        focusButton.textContent = 'Focus';
        focusButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (this.onRequestFocusCard) {
            this.onRequestFocusCard(terminal.id);
          }
        });

        item.append(statusDot, content, focusButton);
        this.listEl.appendChild(item);
      });
  }

  receiveWorkspaceState({ terminals }) {
    this.updateTerminalStatuses(terminals);
  }

  getPersistData() {
    return {
      ...this.data,
    };
  }
}

window.ProjectCard = ProjectCard;

CardRegistry.register({
  type: 'project',
  cardClass: ProjectCard,
  buttonLabel: 'Project Card',
  icon: '\u{1F4CB}',
  shortcutKey: 'P',
  shortcutHint: 'Add Project Card (Ctrl+Shift+P)',
  order: 10,
  spawnBounds: { widthRatio: 0.58, heightRatio: 0.72, minWidth: 460, minHeight: 360 },
});
