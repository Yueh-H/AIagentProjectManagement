function normalizeInputData(data = {}) {
  return {
    requirement: typeof data.requirement === 'string' ? data.requirement : '',
    completionCriteria: typeof data.completionCriteria === 'string' ? data.completionCriteria : '',
    workDir: typeof data.workDir === 'string' ? data.workDir : '',
    constraints: typeof data.constraints === 'string' ? data.constraints : '',
    linkedTaskIds: Array.isArray(data.linkedTaskIds) ? data.linkedTaskIds : [],
    outputCardId: typeof data.outputCardId === 'string' ? data.outputCardId : '',
    sessionId: typeof data.sessionId === 'string' && data.sessionId ? data.sessionId : crypto.randomUUID(),
  };
}

const SPLIT_PROMPT_TEMPLATE = `你是一個任務拆分助手。請根據以下需求拆成獨立可執行的任務清單。每個任務應該是一個具體、可獨立完成的工作項目。

## 需求
{requirement}

## 完成標準
{completionCriteria}

## 工作資料夾
{workDir}

## 限制條件
{constraints}

請用以下 JSON 格式回傳（只回傳純 JSON，不要 markdown code block，不要其他文字）：
{"tasks":[{"title":"任務名稱","goal":"任務目標描述","completionCriteria":["標準1","標準2"],"prompt":"給 Claude Code 執行的完整 prompt，包含所有必要的上下文和指令"}]}`;

class InputCard extends BaseCard {
  constructor(cardId, ws, {
    title,
    bounds,
    data,
    getContainerRect,
    onBoundsCommit,
    onFocus,
    onRequestClose,
    onRequestFocusCard,
    onCreateCard,
    onCreateCardBatch,
    onGetCardData,
  } = {}) {
    super(cardId, {
      cardType: 'input',
      title,
      bounds,
      defaultTitle: 'Input Card',
      headerHint: '輸入需求 → 拆任務 → 執行',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.onRequestFocusCard = onRequestFocusCard;
    this.onCreateCard = onCreateCard;
    this.onCreateCardBatch = onCreateCardBatch;
    this.onGetCardData = onGetCardData;
    this.data = normalizeInputData(data);
    this._isSplitting = false;
    this._isExecutingAll = false;
    this._executeQueue = [];
    this._allCards = [];

    this.el.classList.add('input-card');
    this.bodyEl.classList.add('input-card-body');

    // Fields
    this.requirementField = this._createField('requirement', '需求描述', '描述你想要完成的功能或目標...', 5);
    this.criteriaField = this._createField('completionCriteria', '完成標準', '怎樣算完成？列出驗收條件...', 3);
    this.workDirField = this._createFolderPicker();
    this.constraintsField = this._createField('constraints', '限制條件（選填）', '技術限制、不能修改的部分、時間限制...', 2);

    // Action buttons
    this.actionsEl = document.createElement('div');
    this.actionsEl.className = 'input-card-actions';

    this.splitButtonEl = this._createActionButton('🔀 Split into Tasks', 'input-split-button', () => this._splitIntoTasks());
    this.executeSeqButtonEl = this._createActionButton('▶️ Sequential', 'input-execute-button', () => this._executeAll('sequential'));
    this.executeParButtonEl = this._createActionButton('⚡ Parallel', 'input-execute-parallel-button', () => this._executeAll('parallel'));
    this.stopButtonEl = this._createActionButton('⏹ Stop All', 'input-stop-button', () => this._stopAll());
    this.generateOutputButtonEl = this._createActionButton('📊 Generate Output', 'input-output-button', () => this._generateOutput());

    this.actionsEl.append(this.splitButtonEl, this.executeSeqButtonEl, this.executeParButtonEl, this.stopButtonEl, this.generateOutputButtonEl);

    // Status
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'input-card-status';

    // Linked tasks list
    this.tasksEl = document.createElement('div');
    this.tasksEl.className = 'input-card-tasks';

    this.bodyEl.append(
      this.requirementField.root,
      this.criteriaField.root,
      this.workDirField.root,
      this.constraintsField.root,
      this.actionsEl,
      this.statusEl,
      this.tasksEl,
    );

    this._updateTasksList();
  }

  _createField(key, label, placeholder, rows) {
    const root = document.createElement('div');
    root.className = 'input-card-field';

    const labelEl = document.createElement('div');
    labelEl.className = 'input-card-field-label';
    labelEl.textContent = label;

    const input = rows > 1 ? document.createElement('textarea') : document.createElement('input');
    if (rows > 1) {
      input.rows = rows;
    } else {
      input.type = 'text';
    }
    input.className = 'input-card-field-input';
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.value = this.data[key] || '';
    input.addEventListener('pointerdown', () => this._requestCardFocus({ preserveDomFocus: true }));
    input.addEventListener('input', () => {
      this.data[key] = input.value;
      this.requestPersist();
    });

    root.append(labelEl, input);
    return { root, input };
  }

  _createFolderPicker() {
    const root = document.createElement('div');
    root.className = 'input-card-field';

    const labelEl = document.createElement('div');
    labelEl.className = 'input-card-field-label';
    labelEl.textContent = '工作資料夾';

    const row = document.createElement('div');
    row.className = 'input-folder-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-card-field-input input-folder-input';
    input.placeholder = '/path/to/project';
    input.readOnly = true;
    input.value = this.data.workDir || '';
    input.addEventListener('pointerdown', () => this._requestCardFocus({ preserveDomFocus: true }));

    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'input-folder-browse-btn';
    browseBtn.textContent = '📁 Browse';
    browseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openFolderBrowser();
    });

    row.append(input, browseBtn);

    // Browser panel (hidden by default)
    this._folderBrowserEl = document.createElement('div');
    this._folderBrowserEl.className = 'input-folder-browser';
    this._folderBrowserEl.hidden = true;

    root.append(labelEl, row, this._folderBrowserEl);
    this._folderInput = input;
    return { root, input };
  }

  async _openFolderBrowser() {
    if (!this._folderBrowserEl.hidden) {
      this._folderBrowserEl.hidden = true;
      return;
    }

    const startPath = this.data.workDir || '';
    this._folderBrowserEl.hidden = false;
    await this._loadDirectory(startPath || undefined);
  }

  async _loadDirectory(dirPath) {
    this._folderBrowserEl.innerHTML = '<div class="input-folder-loading">Loading...</div>';

    try {
      const url = dirPath ? `/api/browse?path=${encodeURIComponent(dirPath)}` : '/api/browse';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();

      this._folderBrowserEl.innerHTML = '';

      // Current path display + select button
      const headerEl = document.createElement('div');
      headerEl.className = 'input-folder-header';

      const pathEl = document.createElement('div');
      pathEl.className = 'input-folder-path';
      pathEl.textContent = data.current;

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'input-folder-select-btn';
      selectBtn.textContent = '✓ Select this folder';
      selectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.data.workDir = data.current;
        this._folderInput.value = data.current;
        this._folderBrowserEl.hidden = true;
        this.requestPersist();
      });

      headerEl.append(pathEl, selectBtn);
      this._folderBrowserEl.appendChild(headerEl);

      // Entry list
      const listEl = document.createElement('div');
      listEl.className = 'input-folder-list';

      // Parent directory
      if (data.parent && data.parent !== data.current) {
        const parentItem = document.createElement('div');
        parentItem.className = 'input-folder-item input-folder-item-dir';
        parentItem.textContent = '📁 ..';
        parentItem.addEventListener('click', (e) => {
          e.stopPropagation();
          this._loadDirectory(data.parent);
        });
        listEl.appendChild(parentItem);
      }

      // Directories and files
      data.entries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = `input-folder-item input-folder-item-${entry.type}`;

        if (entry.type === 'dir') {
          item.textContent = `📁 ${entry.name}`;
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            this._loadDirectory(entry.path);
          });
        } else {
          const sizeStr = entry.size < 1024 ? `${entry.size}B` : entry.size < 1048576 ? `${(entry.size / 1024).toFixed(1)}KB` : `${(entry.size / 1048576).toFixed(1)}MB`;
          item.innerHTML = `<span>📄 ${entry.name}</span><span class="input-folder-file-size">${sizeStr}</span>`;
        }

        listEl.appendChild(item);
      });

      this._folderBrowserEl.appendChild(listEl);
    } catch (err) {
      this._folderBrowserEl.innerHTML = `<div class="input-folder-error">Error: ${err.message}</div>`;
    }
  }

  _createActionButton(text, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `input-card-action-btn ${className}`;
    btn.textContent = text;
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return btn;
  }

  _setStatus(text, tone = 'idle') {
    this.statusEl.dataset.tone = tone;
    // Stop any running timer
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    this.statusEl.textContent = text;
  }

  _setStatusWithTimer(prefix, tone = 'running') {
    this.statusEl.dataset.tone = tone;
    if (this._timerInterval) clearInterval(this._timerInterval);
    const startTime = Date.now();
    const update = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      this.statusEl.textContent = `${prefix} (${timeStr})`;
    };
    update();
    this._timerInterval = setInterval(update, 1000);
  }

  // ── Split into Tasks ──

  _splitIntoTasks() {
    if (this._isSplitting) return;
    if (!this.data.requirement.trim()) {
      this._setStatus('請先填寫需求描述', 'danger');
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this._isSplitting = true;
    this._splitStreamBuffer = '';       // accumulated streaming text
    this._splitParsedCount = 0;         // tasks already created from stream
    this._splitStreamDone = false;      // whether result arrived
    this.splitButtonEl.disabled = true;
    this.splitButtonEl.textContent = '⏳ Splitting...';
    this._setStatusWithTimer('Claude 正在分析需求並拆分任務...');

    const prompt = SPLIT_PROMPT_TEMPLATE
      .replace('{requirement}', this.data.requirement)
      .replace('{completionCriteria}', this.data.completionCriteria || '（未指定）')
      .replace('{workDir}', this.data.workDir || '（未指定）')
      .replace('{constraints}', this.data.constraints || '（無）');

    this.ws.send(JSON.stringify({
      type: 'claude-exec',
      sessionId: this.data.sessionId,
      paneId: this.paneId,
      prompt,
      workDir: this.data.workDir || undefined,
      model: 'opus',
      effort: 'low',
      permissionMode: 'plan',
    }));
  }

  handleMessage(msg) {
    if (msg.sessionId !== this.data.sessionId) return;

    if (msg.type === 'claude-data' && this._isSplitting) {
      // Stream incremental text from assistant messages
      if (msg.data?.type === 'assistant') {
        const content = msg.data.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              this._splitStreamBuffer += block.text;
            }
          }
        } else if (typeof content === 'string') {
          this._splitStreamBuffer += content;
        }
        this._tryExtractStreamingTasks();
      }

      // Final result — create any remaining tasks not yet extracted
      if (msg.data?.type === 'result') {
        this._splitStreamDone = true;
        this._handleSplitResult(msg.data.result);
      }
    }

    if (msg.type === 'claude-status' && msg.status === 'done') {
      if (this._isSplitting) {
        this._isSplitting = false;
        this.splitButtonEl.disabled = false;
        this.splitButtonEl.textContent = '🔀 Split into Tasks';
      }
    }

    if (msg.type === 'claude-error') {
      this._isSplitting = false;
      this.splitButtonEl.disabled = false;
      this.splitButtonEl.textContent = '🔀 Split into Tasks';
      this._setStatus(`Error: ${msg.message}`, 'danger');
    }
  }

  /**
   * Incrementally extract complete task objects from the streaming buffer.
   * Looks for complete {...} objects inside the "tasks" array as they arrive.
   */
  _tryExtractStreamingTasks() {
    const buf = this._splitStreamBuffer;

    // Find the start of the tasks array
    const arrStart = buf.indexOf('[');
    if (arrStart === -1) return;

    // Scan from after already-parsed tasks
    let searchFrom = arrStart + 1;
    // Skip past already-extracted objects by counting them
    let skipped = 0;
    let pos = searchFrom;
    while (skipped < this._splitParsedCount && pos < buf.length) {
      if (buf[pos] === '{') {
        const end = this._findMatchingBrace(buf, pos);
        if (end === -1) return; // incomplete
        pos = end + 1;
        skipped++;
      } else {
        pos++;
      }
    }

    // Now try to extract new complete objects
    const newTasks = [];
    while (pos < buf.length) {
      if (buf[pos] === '{') {
        const end = this._findMatchingBrace(buf, pos);
        if (end === -1) break; // incomplete object, wait for more data
        const objStr = buf.slice(pos, end + 1);
        try {
          const task = JSON.parse(objStr);
          if (task.title || task.goal) {
            newTasks.push(task);
          }
        } catch { /* not valid JSON yet, skip */ }
        pos = end + 1;
      } else {
        pos++;
      }
    }

    if (newTasks.length > 0) {
      this._splitParsedCount += newTasks.length;
      this._createMissionCardsFromTasks(newTasks);
    }
  }

  /**
   * Find the index of the matching closing brace for an opening brace.
   * Respects nested braces and JSON strings.
   * Returns -1 if the brace is not yet closed (incomplete stream).
   */
  _findMatchingBrace(str, openPos) {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = openPos; i < str.length; i++) {
      const ch = str[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) return i; }
    }
    return -1; // not yet closed
  }

  _handleSplitResult(resultText) {
    if (!resultText) return;

    // Try to parse JSON from result
    let tasks;
    try {
      const cleaned = resultText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      tasks = parsed.tasks || parsed;
    } catch {
      // If streaming already created some cards, don't show error
      if (this._splitParsedCount > 0) {
        this._setStatus(`✅ 串流建立 ${this._splitParsedCount} 張任務卡`, 'running');
        return;
      }
      this._setStatus('無法解析任務清單，請重試', 'danger');
      return;
    }

    if (!Array.isArray(tasks) || !tasks.length) {
      if (this._splitParsedCount > 0) {
        this._setStatus(`✅ 串流建立 ${this._splitParsedCount} 張任務卡`, 'running');
        return;
      }
      this._setStatus('沒有拆分出任務', 'danger');
      return;
    }

    // Only create tasks that weren't already created during streaming
    const remaining = tasks.slice(this._splitParsedCount);
    if (remaining.length > 0) {
      this._createMissionCardsFromTasks(remaining);
    }

    const total = this.data.linkedTaskIds.length;
    this._setStatus(`✅ 成功建立 ${total} 張任務卡`, 'running');
  }

  /**
   * Create mission cards from an array of task objects.
   * Used by both streaming extraction and final result handling.
   */
  _createMissionCardsFromTasks(tasks) {
    if (!this.onCreateCard && !this.onCreateCardBatch) return;

    const baseX = this.getBounds().x + this.getBounds().width + 30;
    const baseY = this.getBounds().y;
    const existingCount = this.data.linkedTaskIds.length;

    const cardDefs = tasks.map((task, i) => ({
      type: 'mission',
      options: {
        data: {
          goal: task.goal || task.description || '',
          completionCriteria: (task.completionCriteria || []).map(c =>
            typeof c === 'string' ? { id: crypto.randomUUID(), text: c, done: false } : c
          ),
          executionPrompt: task.prompt || '',
          parentInputId: this.paneId,
          workDir: this.data.workDir || '',
          status: 'pending',
        },
        title: task.title || `Task ${existingCount + i + 1}`,
        bounds: {
          x: baseX,
          y: baseY + (existingCount + i) * 40,
          width: 420,
          height: 380,
        },
      },
    }));

    // Use batch create if available (single persist), otherwise fall back
    const createdPanes = this.onCreateCardBatch
      ? this.onCreateCardBatch(cardDefs)
      : cardDefs.map(d => this.onCreateCard(d.type, d.options)).filter(Boolean);

    const newIds = createdPanes.map(p => p.paneId);
    this.data.linkedTaskIds = [...this.data.linkedTaskIds, ...newIds];
    this.requestPersist();
    this._setStatus(`⏳ 已建立 ${this.data.linkedTaskIds.length} 張任務卡...`, 'running');
    this._updateTasksList();
  }

  // ── Execute All ──

  _executeAll(mode = 'sequential') {
    if (this._isExecutingAll) return;
    const taskCards = this._getLinkedTaskCards();
    const pending = taskCards.filter(t => t.status === 'pending' || t.status === 'failed');

    if (!pending.length) {
      this._setStatus('沒有待執行的任務', 'idle');
      return;
    }

    this._isExecutingAll = true;
    this._isStopped = false;
    this._executeMode = mode;
    this._executeQueue = [...pending.map(t => t.id)];
    this._executingSet = new Set();
    this._executeDone = 0;
    this._executeTotal = pending.length;
    this.executeSeqButtonEl.disabled = true;
    this.executeParButtonEl.disabled = true;
    const label = mode === 'parallel' ? '並行' : '依序';
    this._setStatusWithTimer(`${label}執行中 (0/${this._executeTotal})`);
    this._fillExecutionSlots();
  }

  _fillExecutionSlots() {
    const MAX_PARALLEL = this._executeMode === 'parallel' ? 5 : 1;

    // Check if all done or stopped
    if (!this._executeQueue.length && !this._executingSet.size) {
      this._isExecutingAll = false;
      this.executeSeqButtonEl.disabled = false;
      this.executeSeqButtonEl.textContent = '▶️ Sequential';
      this.executeParButtonEl.disabled = false;
      this.executeParButtonEl.textContent = '⚡ Parallel';
      if (this._isStopped) {
        this._setStatus(`⏹ 已停止 — ${this._executeDone}/${this._executeTotal} 完成`, 'idle');
      } else {
        this._setStatus(`✅ 全部 ${this._executeTotal} 個任務執行完成`, 'running');
      }
      return;
    }

    // Don't launch new tasks if stopped
    if (this._isStopped) return;

    // Fill available slots
    while (this._executingSet.size < MAX_PARALLEL && this._executeQueue.length) {
      const taskId = this._executeQueue.shift();
      const taskCard = this._allCards.find(c => c.id === taskId);
      if (!taskCard || !taskCard.sessionId) {
        this._executeDone++;
        continue;
      }

      this._executingSet.add(taskId);
      this._launchTask(taskId, taskCard);
    }

    this._updateExecuteStatus();
  }

  _launchTask(taskId, taskCard) {
    const prompt = taskCard.executionPrompt || taskCard.missionContext || taskCard.title;
    this.ws.send(JSON.stringify({
      type: 'claude-exec',
      sessionId: taskCard.sessionId,
      paneId: taskId,
      prompt: `${taskCard.missionContext}\n\n---\n\n${prompt}`,
      workDir: this.data.workDir || undefined,
      model: 'opus',
      effort: 'low',
      permissionMode: 'acceptEdits',
    }));

  }

  _onTaskCompleted(taskId) {
    if (!this._executingSet.has(taskId)) return;
    this._executingSet.delete(taskId);
    this._executeDone++;
    this._updateExecuteStatus();
    this._fillExecutionSlots();
  }

  _updateExecuteStatus() {
    const running = this._executingSet.size;
    const queued = this._executeQueue.length;
    const label = this._executeMode === 'parallel' ? '並行' : '依序';
    const btnLabel = `⏳ ${this._executeDone}/${this._executeTotal} done`;
    this.executeSeqButtonEl.textContent = this._executeMode === 'sequential' ? btnLabel : '▶️ Sequential';
    this.executeParButtonEl.textContent = this._executeMode === 'parallel' ? btnLabel : '⚡ Parallel';
    if (running > 0 || queued > 0) {
      this._setStatusWithTimer(`${label}執行中 — ${running} running, ${queued} queued, ${this._executeDone}/${this._executeTotal} done`);
    }
  }

  _stopAll() {
    let aborted = 0;

    // Stop split if running
    if (this._isSplitting) {
      this._isSplitting = false;
      this.splitButtonEl.disabled = false;
      this.splitButtonEl.textContent = '🔀 Split into Tasks';
      if (this.data.sessionId && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'claude-abort', sessionId: this.data.sessionId }));
        aborted++;
      }
    }

    // Stop execute queue
    if (this._isExecutingAll) {
      this._isStopped = true;
      this._executeQueue = [];
      for (const taskId of this._executingSet) {
        const taskCard = this._allCards.find(c => c.id === taskId);
        if (taskCard?.sessionId && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'claude-abort', sessionId: taskCard.sessionId }));
          aborted++;
        }
      }
    }

    // Abort ALL linked task sessions (even individually running ones)
    for (const taskId of this.data.linkedTaskIds) {
      const taskCard = this._allCards.find(c => c.id === taskId);
      if (taskCard?.sessionId && taskCard.status === 'running' && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'claude-abort', sessionId: taskCard.sessionId }));
        aborted++;
      }
    }

    this._setStatus(`⏹ 已停止 — 中斷了 ${aborted} 個 agent`, 'danger');
  }

  // ── Generate Output ──

  _generateOutput() {
    if (!this.onCreateCard) return;

    const taskCards = this._getLinkedTaskCards();
    if (!taskCards.length) {
      this._setStatus('沒有關聯的任務卡', 'danger');
      return;
    }

    const card = this.onCreateCard('output', {
      data: {
        parentInputId: this.paneId,
        linkedTaskIds: this.data.linkedTaskIds,
        requirement: this.data.requirement,
        completionCriteria: this.data.completionCriteria,
      },
      title: `Output: ${this.getTitle()}`,
      bounds: {
        x: this.getBounds().x + this.getBounds().width + 30,
        y: this.getBounds().y,
        width: 480,
        height: 420,
      },
    });

    if (card) {
      this.data.outputCardId = card.paneId;
      this.requestPersist();
      this._setStatus('📊 Output Card 已建立', 'running');
    }
  }

  // ── Helpers ──

  _getLinkedTaskCards() {
    return this._allCards.filter(c =>
      c.type === 'mission' && this.data.linkedTaskIds.includes(c.id)
    );
  }

  _updateTasksList() {
    this.tasksEl.innerHTML = '';
    const taskCards = this._getLinkedTaskCards();

    if (!taskCards.length) {
      this.tasksEl.hidden = true;
      return;
    }
    this.tasksEl.hidden = false;

    const headerEl = document.createElement('div');
    headerEl.className = 'input-card-field-label';
    headerEl.textContent = `關聯任務 (${taskCards.length})`;
    this.tasksEl.appendChild(headerEl);

    taskCards.forEach(task => {
      const item = document.createElement('div');
      item.className = 'input-task-item';
      item.dataset.status = task.status;

      const dot = document.createElement('span');
      dot.className = 'input-task-dot';

      const name = document.createElement('span');
      name.className = 'input-task-name';
      name.textContent = task.title;

      const status = document.createElement('span');
      status.className = 'input-task-status';
      status.textContent = { pending: '待執行', running: '執行中', done: '✅', failed: '❌' }[task.status] || task.status;

      item.append(dot, name, status);
      item.addEventListener('click', () => {
        if (this.onRequestFocusCard) this.onRequestFocusCard(task.id);
      });
      this.tasksEl.appendChild(item);
    });
  }

  receiveWorkspaceState({ cards }) {
    this._allCards = Array.isArray(cards) ? cards : [];
    this._updateTasksList();

    // Event-driven task completion: check if any executing task just finished
    if (this._isExecutingAll && this._executingSet?.size) {
      for (const taskId of [...this._executingSet]) {
        const task = this._allCards.find(c => c.id === taskId);
        if (!task || task.status === 'done' || task.status === 'failed') {
          this._onTaskCompleted(taskId);
        }
      }
    }
  }

  getPersistData() {
    return {
      requirement: this.data.requirement,
      completionCriteria: this.data.completionCriteria,
      workDir: this.data.workDir,
      constraints: this.data.constraints,
      linkedTaskIds: this.data.linkedTaskIds,
      outputCardId: this.data.outputCardId,
      sessionId: this.data.sessionId,
    };
  }

  hydratePersistedData(data = {}) {
    this.data = normalizeInputData(data);
    this.requirementField.input.value = this.data.requirement;
    this.criteriaField.input.value = this.data.completionCriteria;
    this.workDirField.input.value = this.data.workDir;
    this.constraintsField.input.value = this.data.constraints;
    this._updateTasksList();
  }

  dispose() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    super.dispose();
  }
}

window.InputCard = InputCard;

CardRegistry.register({
  type: 'input',
  cardClass: InputCard,
  buttonLabel: 'Input Card',
  icon: '\u{1F4DD}',
  shortcutKey: 'N',
  shortcutHint: 'Add Input Card (Ctrl+Shift+N)',
  order: 5,
  spawnBounds: { widthRatio: 0.36, heightRatio: 0.65, minWidth: 400, minHeight: 450 },
});
