function normalizeOutputData(data = {}) {
  return {
    parentInputId: typeof data.parentInputId === 'string' ? data.parentInputId : '',
    linkedTaskIds: Array.isArray(data.linkedTaskIds) ? data.linkedTaskIds : [],
    requirement: typeof data.requirement === 'string' ? data.requirement : '',
    completionCriteria: typeof data.completionCriteria === 'string' ? data.completionCriteria : '',
    summary: typeof data.summary === 'string' ? data.summary : '',
    sessionId: typeof data.sessionId === 'string' && data.sessionId ? data.sessionId : crypto.randomUUID(),
  };
}

const OUTPUT_PROMPT_TEMPLATE = `請根據以下任務執行結果，產生一份簡潔的驗收摘要報告。

## 原始需求
{requirement}

## 完成標準
{completionCriteria}

## 各任務結果
{taskResults}

請用 markdown 格式提供：
1. **整體完成度**（百分比 + 一句話摘要）
2. **各任務結果摘要**（表格或清單）
3. **未完成項目和建議**（如果有的話）
4. **驗收結論**（通過/不通過/部分通過）`;

class OutputCard extends BaseCard {
  constructor(cardId, ws, {
    title,
    bounds,
    data,
    getContainerRect,
    onBoundsCommit,
    onFocus,
    onRequestClose,
    onRequestFocusCard,
    onGetCardData,
  } = {}) {
    super(cardId, {
      cardType: 'output',
      title,
      bounds,
      defaultTitle: 'Output Summary',
      headerHint: '驗收摘要',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.onRequestFocusCard = onRequestFocusCard;
    this.onGetCardData = onGetCardData;
    this.data = normalizeOutputData(data);
    this._allCards = [];
    this._isGenerating = false;

    this.el.classList.add('output-card');
    this.bodyEl.classList.add('output-card-body');

    // Task status overview
    this.overviewEl = document.createElement('section');
    this.overviewEl.className = 'output-overview';

    const overviewHeaderEl = document.createElement('div');
    overviewHeaderEl.className = 'output-section-title';
    overviewHeaderEl.textContent = '任務狀態';

    this.taskListEl = document.createElement('div');
    this.taskListEl.className = 'output-task-list';

    this.overviewEl.append(overviewHeaderEl, this.taskListEl);

    // Summary section
    this.summarySectionEl = document.createElement('section');
    this.summarySectionEl.className = 'output-summary-section';

    const summaryHeaderEl = document.createElement('div');
    summaryHeaderEl.className = 'output-section-header';

    const summaryTitleEl = document.createElement('div');
    summaryTitleEl.className = 'output-section-title';
    summaryTitleEl.textContent = '驗收摘要';

    this.regenerateButtonEl = document.createElement('button');
    this.regenerateButtonEl.type = 'button';
    this.regenerateButtonEl.className = 'output-regenerate-button';
    this.regenerateButtonEl.textContent = '🔄 Regenerate';
    this.regenerateButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._generateSummary();
    });

    summaryHeaderEl.append(summaryTitleEl, this.regenerateButtonEl);

    this.summaryOutputEl = document.createElement('div');
    this.summaryOutputEl.className = 'output-summary-content';

    this.summarySectionEl.append(summaryHeaderEl, this.summaryOutputEl);

    this.bodyEl.append(this.overviewEl, this.summarySectionEl);

    this._renderTaskOverview();
    this._renderSummary();

    // Auto-generate on first create if we have tasks
    if (!this.data.summary && this.data.linkedTaskIds.length) {
      setTimeout(() => this._generateSummary(), 500);
    }
  }

  _generateSummary() {
    if (this._isGenerating) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Collect task results
    const taskResults = this._getLinkedTaskCards().map(task => {
      const data = this.onGetCardData ? this.onGetCardData(task.id) : null;
      return {
        title: task.title,
        status: task.status,
        lastResult: task.lastResult || data?.statusSummary || '（無結果）',
      };
    });

    if (!taskResults.length) {
      this.summaryOutputEl.textContent = '沒有關聯的任務卡可以彙整。';
      return;
    }

    this._isGenerating = true;
    this.regenerateButtonEl.disabled = true;
    this.regenerateButtonEl.textContent = '⏳ Generating...';
    this.data.summary = '';

    const taskResultsText = taskResults.map((t, i) =>
      `### Task ${i + 1}: ${t.title}\n- **狀態:** ${t.status}\n- **結果:** ${t.lastResult}`
    ).join('\n\n');

    const prompt = OUTPUT_PROMPT_TEMPLATE
      .replace('{requirement}', this.data.requirement || '（未提供）')
      .replace('{completionCriteria}', this.data.completionCriteria || '（未指定）')
      .replace('{taskResults}', taskResultsText);

    this.ws.send(JSON.stringify({
      type: 'claude-exec',
      sessionId: this.data.sessionId,
      paneId: this.paneId,
      prompt,
    }));
  }

  handleMessage(msg) {
    if (msg.sessionId !== this.data.sessionId) return;

    if (msg.type === 'claude-data' && msg.data?.type === 'result') {
      this.data.summary = typeof msg.data.result === 'string' ? msg.data.result : JSON.stringify(msg.data.result);
      this._renderSummary();
      this.requestPersist();
    }

    if (msg.type === 'claude-status' && msg.status === 'done') {
      this._isGenerating = false;
      this.regenerateButtonEl.disabled = false;
      this.regenerateButtonEl.textContent = '🔄 Regenerate';
    }

    if (msg.type === 'claude-error') {
      this._isGenerating = false;
      this.regenerateButtonEl.disabled = false;
      this.regenerateButtonEl.textContent = '🔄 Regenerate';
      this.summaryOutputEl.textContent = `Error: ${msg.message}`;
    }
  }

  _getLinkedTaskCards() {
    return this._allCards.filter(c =>
      c.type === 'mission' && this.data.linkedTaskIds.includes(c.id)
    );
  }

  _renderTaskOverview() {
    this.taskListEl.innerHTML = '';
    const tasks = this._getLinkedTaskCards();

    if (!tasks.length) {
      this.taskListEl.textContent = '無關聯任務。';
      return;
    }

    const statusIcons = { pending: '⏳', running: '🔄', done: '✅', failed: '❌' };

    tasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'output-task-item';
      item.dataset.status = task.status;

      item.innerHTML = `<span class="output-task-icon">${statusIcons[task.status] || '❓'}</span><span class="output-task-name">${task.title}</span><span class="output-task-status">${task.status}</span>`;

      item.addEventListener('click', () => {
        if (this.onRequestFocusCard) this.onRequestFocusCard(task.id);
      });

      this.taskListEl.appendChild(item);
    });

    // Summary bar
    const done = tasks.filter(t => t.status === 'done').length;
    const bar = document.createElement('div');
    bar.className = 'output-progress-bar';
    bar.innerHTML = `<div class="output-progress-fill" style="width: ${tasks.length ? (done / tasks.length * 100) : 0}%"></div>`;

    const label = document.createElement('div');
    label.className = 'output-progress-label';
    label.textContent = `${done}/${tasks.length} tasks completed`;

    this.taskListEl.prepend(label, bar);
  }

  _renderSummary() {
    this.summaryOutputEl.innerHTML = '';

    if (!this.data.summary) {
      this.summaryOutputEl.textContent = '點擊 "Regenerate" 產生驗收摘要。';
      return;
    }

    // Use Toast UI Viewer if available
    const Viewer = window.toastui?.Editor?.factory;
    if (Viewer) {
      try {
        Viewer({
          el: this.summaryOutputEl,
          viewer: true,
          initialValue: this.data.summary,
          theme: document.documentElement.getAttribute('data-theme') === 'light' ? undefined : 'dark',
        });
        return;
      } catch { /* fallback */ }
    }

    // Fallback
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = this.data.summary;
    this.summaryOutputEl.appendChild(pre);
  }

  receiveWorkspaceState({ cards }) {
    this._allCards = Array.isArray(cards) ? cards : [];
    this._renderTaskOverview();
  }

  getPersistData() {
    return {
      parentInputId: this.data.parentInputId,
      linkedTaskIds: this.data.linkedTaskIds,
      requirement: this.data.requirement,
      completionCriteria: this.data.completionCriteria,
      summary: this.data.summary,
      sessionId: this.data.sessionId,
    };
  }

  hydratePersistedData(data = {}) {
    this.data = normalizeOutputData(data);
    this._renderTaskOverview();
    this._renderSummary();
  }
}

window.OutputCard = OutputCard;

CardRegistry.register({
  type: 'output',
  cardClass: OutputCard,
  buttonLabel: 'Output Card',
  icon: '\u{1F4CA}',
  shortcutKey: 'O',
  shortcutHint: 'Add Output Card (Ctrl+Shift+O)',
  order: 35,
  spawnBounds: { widthRatio: 0.42, heightRatio: 0.60, minWidth: 440, minHeight: 380 },
});
