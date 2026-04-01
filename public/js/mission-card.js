function normalizeMissionText(value) {
  return typeof value === 'string' ? value : '';
}

function createChecklistItem({ id, text = '', done = false } = {}) {
  return {
    id: typeof id === 'string' && id.trim()
      ? id
      : `criteria-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text: normalizeMissionText(text),
    done: Boolean(done),
  };
}

function parseLegacyDoneCriteria(text = '') {
  return normalizeMissionText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const done = /^\s*[-*]?\s*\[(?:x|X)\]\s*/.test(line);
      const cleaned = line
        .replace(/^\s*[-*]?\s*\[(?: |x|X)\]\s*/, '')
        .replace(/^\s*[-*]\s*/, '')
        .trim();

      return cleaned ? createChecklistItem({ text: cleaned, done }) : null;
    })
    .filter(Boolean);
}

function normalizeChecklistItems(data = {}) {
  const rawItems = Array.isArray(data.completionCriteria)
    ? data.completionCriteria
    : (Array.isArray(data.checklistItems) ? data.checklistItems : parseLegacyDoneCriteria(data.doneCriteria));

  const items = rawItems
    .map((item) => {
      if (typeof item === 'string') {
        return createChecklistItem({ text: item });
      }
      if (item && typeof item === 'object') {
        return createChecklistItem({
          id: item.id,
          text: item.text,
          done: item.done,
        });
      }
      return null;
    })
    .filter(Boolean);

  if (items.length) return items;

  return [
    createChecklistItem(),
    createChecklistItem(),
    createChecklistItem(),
  ];
}

function normalizeMissionData(data = {}) {
  return {
    goal: normalizeMissionText(data.goal || data.instruction),
    completionCriteria: normalizeChecklistItems(data),
    statusSummary: normalizeMissionText(data.statusSummary || data.resultSummary),
    blockers: normalizeMissionText(data.blockers),
    nextStep: normalizeMissionText(data.nextStep),
    sourcePaneId: typeof data.sourcePaneId === 'string' ? data.sourcePaneId : '',
    status: ['pending', 'running', 'done', 'failed'].includes(data.status) ? data.status : 'pending',
    statusUpdatedAt: typeof data.statusUpdatedAt === 'number' ? data.statusUpdatedAt : Date.now(),
  };
}

function serializeChecklistItems(items = []) {
  return items
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      text: normalizeMissionText(item.text),
      done: Boolean(item.done),
    }))
    .filter((item) => item.id || item.text)
    .map((item) => ({
      id: item.id || createChecklistItem().id,
      text: item.text,
      done: item.done,
    }));
}

function stringifyLegacyDoneCriteria(items = []) {
  return items
    .map((item) => ({
      text: normalizeMissionText(item.text).trim(),
      done: Boolean(item.done),
    }))
    .filter((item) => item.text)
    .map((item) => {
      return `- [${item.done ? 'x' : ' '}] ${item.text}`;
    })
    .join('\n');
}

function getChecklistProgress(items = []) {
  const filledItems = items.filter((item) => normalizeMissionText(item.text).trim());
  const completedItems = filledItems.filter((item) => item.done);

  return {
    completed: completedItems.length,
    total: filledItems.length,
  };
}

const MISSION_STATUS_META = {
  pending: { label: '待開始', tone: 'muted', next: 'running' },
  running: { label: '進行中', tone: 'running', next: 'done' },
  done: { label: '已完成', tone: 'done', next: 'failed' },
  failed: { label: '阻塞中', tone: 'danger', next: 'pending' },
};

const TERMINAL_STATUS_LABELS = {
  running: '執行中',
  idle: '待機中',
  starting: '啟動中',
  exited: '已結束',
};

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return '剛剛更新';
  if (diff < 60) return `${diff} 秒前`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  return `${Math.floor(hrs / 24)} 天前`;
}

function formatTerminalStatus(terminal) {
  if (!terminal) return '未指定';

  const label = TERMINAL_STATUS_LABELS[terminal.status] || '未知狀態';
  if (terminal.status === 'exited' && terminal.exitCode != null) {
    return `${label}（code ${terminal.exitCode}）`;
  }

  return label;
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
      defaultTitle: '任務名稱',
      headerHint: '雙擊標題可改任務名稱',
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

    this.statusPanelEl = document.createElement('section');
    this.statusPanelEl.className = 'mission-status-panel';

    const statusHeaderEl = document.createElement('div');
    statusHeaderEl.className = 'mission-status-panel-head';

    const statusInfoEl = document.createElement('div');
    statusInfoEl.className = 'mission-status-panel-info';

    const statusTitleEl = document.createElement('div');
    statusTitleEl.className = 'mission-section-title';
    statusTitleEl.textContent = '狀態';

    this.statusTimeEl = document.createElement('div');
    this.statusTimeEl.className = 'mission-status-time';

    statusInfoEl.append(statusTitleEl, this.statusTimeEl);

    const statusActionsEl = document.createElement('div');
    statusActionsEl.className = 'mission-status-panel-actions';

    this.progressChipEl = document.createElement('div');
    this.progressChipEl.className = 'mission-status-chip';
    this.progressChipEl.dataset.kind = 'progress';

    this.ownerChipEl = document.createElement('div');
    this.ownerChipEl.className = 'mission-status-chip';
    this.ownerChipEl.dataset.kind = 'owner';

    this.statusButtonEl = document.createElement('button');
    this.statusButtonEl.type = 'button';
    this.statusButtonEl.className = 'mission-status-button';
    this.statusButtonEl.title = '點一下切換狀態';
    this.statusButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._cycleStatus();
    });

    statusActionsEl.append(this.progressChipEl, this.ownerChipEl, this.statusButtonEl);
    statusHeaderEl.append(statusInfoEl, statusActionsEl);

    this.statusSummaryInput = this._createTextInput({
      key: 'statusSummary',
      placeholder: '一句話補充目前情況，例如：已完成 2/3、等待 API key、測試卡在登入流程。',
      rows: 2,
      className: 'mission-status-summary-input',
    });

    this.statusPanelEl.append(statusHeaderEl, this.statusSummaryInput);

    this.goalSection = this._createTextSection({
      key: 'goal',
      title: '目標',
      placeholder: '這張任務卡想完成什麼？',
      rows: 3,
    });

    this.criteriaSectionEl = document.createElement('section');
    this.criteriaSectionEl.className = 'mission-checklist-section';

    const criteriaHeaderEl = document.createElement('div');
    criteriaHeaderEl.className = 'mission-section-header';

    const criteriaTitleWrapEl = document.createElement('div');

    const criteriaTitleEl = document.createElement('div');
    criteriaTitleEl.className = 'mission-section-title';
    criteriaTitleEl.textContent = '完成標準';

    this.criteriaSummaryEl = document.createElement('div');
    this.criteriaSummaryEl.className = 'mission-section-caption';

    criteriaTitleWrapEl.append(criteriaTitleEl, this.criteriaSummaryEl);

    this.addChecklistButtonEl = document.createElement('button');
    this.addChecklistButtonEl.type = 'button';
    this.addChecklistButtonEl.className = 'mission-add-checklist-button';
    this.addChecklistButtonEl.textContent = '+ 新增';
    this.addChecklistButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.data.completionCriteria.push(createChecklistItem());
      this._renderChecklist();
      this.requestPersist();
    });

    criteriaHeaderEl.append(criteriaTitleWrapEl, this.addChecklistButtonEl);

    this.checklistListEl = document.createElement('div');
    this.checklistListEl.className = 'mission-checklist-list';

    this.criteriaSectionEl.append(criteriaHeaderEl, this.checklistListEl);

    this.detailGridEl = document.createElement('div');
    this.detailGridEl.className = 'mission-detail-grid';

    this.blockersSection = this._createTextSection({
      key: 'blockers',
      title: '阻塞點',
      placeholder: '目前卡住的點、依賴項或風險。',
      rows: 3,
    });

    this.nextStepSection = this._createTextSection({
      key: 'nextStep',
      title: '下一步',
      placeholder: '下一個最明確的動作是什麼？',
      rows: 3,
    });

    this.detailGridEl.append(this.blockersSection.root, this.nextStepSection.root);

    this.ownerSectionEl = document.createElement('section');
    this.ownerSectionEl.className = 'mission-owner-section';

    const ownerHeaderEl = document.createElement('div');
    ownerHeaderEl.className = 'mission-section-header';

    const ownerTitleWrapEl = document.createElement('div');

    const ownerTitleEl = document.createElement('div');
    ownerTitleEl.className = 'mission-section-title';
    ownerTitleEl.textContent = '負責 AI';

    const ownerCaptionEl = document.createElement('div');
    ownerCaptionEl.className = 'mission-section-caption';
    ownerCaptionEl.textContent = '選一個 terminal 作為負責 AI；這裡只標記負責對象，不鏡像輸出。';

    ownerTitleWrapEl.append(ownerTitleEl, ownerCaptionEl);

    this.sourceSelectEl = document.createElement('select');
    this.sourceSelectEl.className = 'mission-source-select';
    this.sourceSelectEl.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this._requestCardFocus({ preserveDomFocus: true });
    });
    this.sourceSelectEl.addEventListener('change', () => {
      this.data.sourcePaneId = this.sourceSelectEl.value;
      this.requestPersist();
      this._renderOwnerSection();
    });

    ownerHeaderEl.append(ownerTitleWrapEl, this.sourceSelectEl);

    this.ownerMetaEl = document.createElement('div');
    this.ownerMetaEl.className = 'mission-owner-meta';

    this.selectedTerminalBadgeEl = document.createElement('div');
    this.selectedTerminalBadgeEl.className = 'mission-status-chip';
    this.selectedTerminalBadgeEl.dataset.kind = 'terminal';

    this.ownerStateBadgeEl = document.createElement('div');
    this.ownerStateBadgeEl.className = 'mission-status-chip';
    this.ownerStateBadgeEl.dataset.kind = 'terminal-status';

    this.ownerMetaEl.append(this.selectedTerminalBadgeEl, this.ownerStateBadgeEl);

    this.ownerDescriptionEl = document.createElement('div');
    this.ownerDescriptionEl.className = 'mission-owner-description';

    this.focusButtonEl = document.createElement('button');
    this.focusButtonEl.type = 'button';
    this.focusButtonEl.className = 'mission-focus-button';
    this.focusButtonEl.textContent = '前往 Terminal';
    this.focusButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = this._getSelectedTerminal();
      if (source && this.onRequestFocusCard) {
        this.onRequestFocusCard(source.id);
      }
    });

    this.ownerSectionEl.append(ownerHeaderEl, this.ownerMetaEl, this.ownerDescriptionEl, this.focusButtonEl);

    this.bodyEl.append(
      this.statusPanelEl,
      this.goalSection.root,
      this.criteriaSectionEl,
      this.detailGridEl,
      this.ownerSectionEl,
    );

    this._renderChecklist();
    this._applyStatus();
    this._syncSourceOptions();
    this._renderOwnerSection();
    this._startRelativeTimeUpdater();
  }

  _createTextInput({ key, placeholder, rows = 3, className = 'mission-text-input' }) {
    const input = document.createElement('textarea');
    input.className = className;
    input.placeholder = placeholder;
    input.rows = rows;
    input.spellcheck = false;
    input.value = this.data[key] || '';
    input.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this._requestCardFocus({ preserveDomFocus: true });
    });
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('input', () => {
      this.data[key] = input.value;
      this.requestPersist();
    });
    return input;
  }

  _createTextSection({ key, title, placeholder, rows }) {
    const root = document.createElement('section');
    root.className = 'mission-text-section';

    const header = document.createElement('div');
    header.className = 'mission-section-title';
    header.textContent = title;

    const input = this._createTextInput({
      key,
      placeholder,
      rows,
      className: 'mission-text-input',
    });

    root.append(header, input);
    return { root, input };
  }

  _renderChecklist() {
    this.checklistListEl.innerHTML = '';

    this.data.completionCriteria.forEach((item, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'mission-checklist-item';
      rowEl.dataset.done = item.done ? 'true' : 'false';

      const checkboxEl = document.createElement('input');
      checkboxEl.type = 'checkbox';
      checkboxEl.className = 'mission-checklist-toggle';
      checkboxEl.checked = item.done;
      checkboxEl.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this._requestCardFocus({ preserveDomFocus: true });
      });
      checkboxEl.addEventListener('change', () => {
        item.done = checkboxEl.checked;
        rowEl.dataset.done = item.done ? 'true' : 'false';
        this._updateChecklistSummary();
        this.requestPersist();
      });

      const inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'mission-checklist-input';
      inputEl.placeholder = `完成標準 ${index + 1}`;
      inputEl.value = item.text;
      inputEl.spellcheck = false;
      inputEl.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this._requestCardFocus({ preserveDomFocus: true });
      });
      inputEl.addEventListener('click', (event) => event.stopPropagation());
      inputEl.addEventListener('input', () => {
        item.text = inputEl.value;
        this._updateChecklistSummary();
        this.requestPersist();
      });

      const removeButtonEl = document.createElement('button');
      removeButtonEl.type = 'button';
      removeButtonEl.className = 'mission-checklist-remove';
      removeButtonEl.textContent = '移除';
      removeButtonEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.data.completionCriteria.splice(index, 1);
        if (!this.data.completionCriteria.length) {
          this.data.completionCriteria.push(createChecklistItem());
        }
        this._renderChecklist();
        this.requestPersist();
      });

      rowEl.append(checkboxEl, inputEl, removeButtonEl);
      this.checklistListEl.appendChild(rowEl);
    });

    this._updateChecklistSummary();
  }

  _updateChecklistSummary() {
    const progress = getChecklistProgress(this.data.completionCriteria);

    if (!progress.total) {
      this.criteriaSummaryEl.textContent = '尚未填寫完成標準';
      this.progressChipEl.textContent = '完成標準待補';
      return;
    }

    this.criteriaSummaryEl.textContent = `${progress.completed}/${progress.total} 已完成`;
    this.progressChipEl.textContent = `完成標準 ${progress.completed}/${progress.total}`;
  }

  _cycleStatus() {
    const meta = MISSION_STATUS_META[this.data.status];
    this.data.status = meta.next;
    this.data.statusUpdatedAt = Date.now();
    this._applyStatus();
    this.requestPersist();
  }

  _applyStatus() {
    const meta = MISSION_STATUS_META[this.data.status];
    this.statusPanelEl.dataset.tone = meta.tone;
    this.statusButtonEl.dataset.tone = meta.tone;
    this.statusButtonEl.textContent = meta.label;
    this.statusTimeEl.textContent = formatRelativeTime(this.data.statusUpdatedAt);
  }

  _syncSourceOptions() {
    const previousValue = this.sourceSelectEl.value || this.data.sourcePaneId || '';

    this.sourceSelectEl.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.terminals.length
      ? '選擇負責的 terminal'
      : '目前沒有 terminal';
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

    if (!this.data.sourcePaneId && this.terminals[0]) {
      this.data.sourcePaneId = this.terminals[0].id;
      this.requestPersist();
    }

    const nextValue = this.terminals.some((terminal) => terminal.id === previousValue)
      ? previousValue
      : this.data.sourcePaneId;

    this.sourceSelectEl.value = nextValue || '';
    this._renderOwnerSection();
  }

  _getSelectedTerminal() {
    return this.terminals.find((terminal) => terminal.id === this.data.sourcePaneId) || null;
  }

  _renderOwnerSection() {
    const source = this._getSelectedTerminal();
    const ownerLabel = source?.title || '未指定';
    const statusLabel = formatTerminalStatus(source);

    this.ownerChipEl.textContent = `負責 AI：${ownerLabel}`;
    this.selectedTerminalBadgeEl.textContent = source
      ? `Terminal：${source.title}`
      : 'Terminal：未指定';
    this.ownerStateBadgeEl.textContent = `狀態：${statusLabel}`;

    if (!source) {
      this.ownerDescriptionEl.textContent = '請指定一個負責的 AI / terminal。';
      this.focusButtonEl.disabled = true;
      return;
    }

    this.focusButtonEl.disabled = false;
    this.ownerDescriptionEl.textContent = source.status === 'exited'
      ? `目前由「${source.title}」負責，但這個 terminal 已經結束。`
      : `目前由「${source.title}」負責這張任務卡；底部只標記負責 AI，不顯示 terminal 輸出。`;
  }

  _startRelativeTimeUpdater() {
    this._relativeTimeTimer = setInterval(() => {
      this.statusTimeEl.textContent = formatRelativeTime(this.data.statusUpdatedAt);
    }, 10_000);
  }

  receiveWorkspaceState({ terminals }) {
    this.terminals = Array.isArray(terminals) ? terminals : [];
    this._syncSourceOptions();
    this._renderOwnerSection();
  }

  getPersistData() {
    const completionCriteria = serializeChecklistItems(this.data.completionCriteria);
    const goal = this.data.goal;
    const statusSummary = this.data.statusSummary;

    return {
      goal,
      completionCriteria,
      statusSummary,
      blockers: this.data.blockers,
      nextStep: this.data.nextStep,
      sourcePaneId: this.data.sourcePaneId,
      status: this.data.status,
      statusUpdatedAt: this.data.statusUpdatedAt,
      instruction: goal,
      doneCriteria: stringifyLegacyDoneCriteria(completionCriteria),
      resultSummary: statusSummary,
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
  buttonLabel: '任務',
  icon: '\u{1F3AF}',
  shortcutKey: 'M',
  shortcutHint: '新增任務卡 (Ctrl+Shift+M)',
  order: 15,
  spawnBounds: { widthRatio: 0.5, heightRatio: 0.72, minWidth: 420, minHeight: 380 },
});
