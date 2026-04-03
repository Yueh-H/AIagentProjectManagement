function normalizePromptData(data = {}) {
  return {
    targetMissionId: typeof data.targetMissionId === 'string' ? data.targetMissionId : '',
    history: Array.isArray(data.history) ? data.history : [],
  };
}

class PromptCard extends BaseCard {
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
      cardType: 'prompt',
      title,
      bounds,
      defaultTitle: 'Prompt Input',
      headerHint: 'Send prompts to mission cards',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.onRequestFocusCard = onRequestFocusCard;
    this.data = normalizePromptData(data);
    this.missions = []; // { id, title, sessionId, status }
    this._historyIndex = -1;
    this._isRunning = false;

    this.el.classList.add('prompt-card');
    this.bodyEl.classList.add('prompt-card-body');

    // Target mission selector
    this.targetSectionEl = document.createElement('div');
    this.targetSectionEl.className = 'prompt-target-section';

    const targetLabelEl = document.createElement('div');
    targetLabelEl.className = 'prompt-field-label';
    targetLabelEl.textContent = 'Target Mission';

    this.targetSelectEl = document.createElement('select');
    this.targetSelectEl.className = 'prompt-select';
    this.targetSelectEl.addEventListener('pointerdown', () => {
      this._requestCardFocus({ preserveDomFocus: true });
    });
    this.targetSelectEl.addEventListener('change', () => {
      this.data.targetMissionId = this.targetSelectEl.value;
      this._updateStatus();
      this.requestPersist();
    });

    this.targetSectionEl.append(targetLabelEl, this.targetSelectEl);

    // Status indicator
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'prompt-target-status';

    // Input area
    this.inputSectionEl = document.createElement('div');
    this.inputSectionEl.className = 'prompt-input-section';

    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'prompt-textarea';
    this.inputEl.placeholder = 'Type a prompt for this mission...\nEnter to send, Shift+Enter for new line\nMission context is automatically included';
    this.inputEl.rows = 5;
    this.inputEl.spellcheck = false;
    this.inputEl.addEventListener('pointerdown', () => {
      this._requestCardFocus({ preserveDomFocus: true });
    });
    this.inputEl.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this._send();
        return;
      }
      if (event.key === 'ArrowUp' && this.inputEl.selectionStart === 0) {
        event.preventDefault();
        this._navigateHistory(-1);
        return;
      }
      if (event.key === 'ArrowDown' && this.inputEl.selectionStart === this.inputEl.value.length) {
        event.preventDefault();
        this._navigateHistory(1);
      }
    });

    // Attachments area
    this._attachments = []; // { name, content, size }

    this.attachSectionEl = document.createElement('div');
    this.attachSectionEl.className = 'prompt-attach-section';
    this.attachSectionEl.hidden = true;

    this.attachListEl = document.createElement('div');
    this.attachListEl.className = 'prompt-attach-list';

    this.attachSectionEl.appendChild(this.attachListEl);

    // File input (hidden) + upload button
    this.fileInputEl = document.createElement('input');
    this.fileInputEl.type = 'file';
    this.fileInputEl.multiple = true;
    this.fileInputEl.className = 'prompt-file-input-hidden';
    this.fileInputEl.accept = '.txt,.md,.json,.csv,.js,.ts,.py,.html,.css,.yaml,.yml,.xml,.log,.sh,.sql,.env,.toml,.ini,.cfg,.conf,.jsx,.tsx,.vue,.svelte,.go,.rs,.java,.c,.cpp,.h,.hpp,.rb,.php,.swift,.kt,.r,.m,.mm';
    this.fileInputEl.addEventListener('change', () => this._handleFiles(this.fileInputEl.files));

    this.uploadButtonEl = document.createElement('button');
    this.uploadButtonEl.type = 'button';
    this.uploadButtonEl.className = 'prompt-upload-button';
    this.uploadButtonEl.textContent = '\u{1F4CE} Attach';
    this.uploadButtonEl.title = 'Attach files (text, code, data)';
    this.uploadButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.fileInputEl.click();
    });

    // Drag & drop on textarea
    this.inputEl.addEventListener('dragover', (event) => {
      event.preventDefault();
      this.inputEl.classList.add('prompt-textarea-dragover');
    });
    this.inputEl.addEventListener('dragleave', () => {
      this.inputEl.classList.remove('prompt-textarea-dragover');
    });
    this.inputEl.addEventListener('drop', (event) => {
      event.preventDefault();
      this.inputEl.classList.remove('prompt-textarea-dragover');
      if (event.dataTransfer?.files?.length) {
        this._handleFiles(event.dataTransfer.files);
      }
    });

    // Action bar
    this.actionBarEl = document.createElement('div');
    this.actionBarEl.className = 'prompt-action-bar';

    this.abortButtonEl = document.createElement('button');
    this.abortButtonEl.type = 'button';
    this.abortButtonEl.className = 'prompt-abort-button';
    this.abortButtonEl.textContent = 'Abort';
    this.abortButtonEl.hidden = true;
    this.abortButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._abort();
    });

    this.goToMissionButtonEl = document.createElement('button');
    this.goToMissionButtonEl.type = 'button';
    this.goToMissionButtonEl.className = 'prompt-focus-button';
    this.goToMissionButtonEl.textContent = 'Go to Mission';
    this.goToMissionButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.data.targetMissionId && this.onRequestFocusCard) {
        this.onRequestFocusCard(this.data.targetMissionId);
      }
    });

    this.sendButtonEl = document.createElement('button');
    this.sendButtonEl.type = 'button';
    this.sendButtonEl.className = 'prompt-send-button';
    this.sendButtonEl.textContent = 'Send';
    this.sendButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._send();
    });

    this.actionBarEl.append(this.uploadButtonEl, this.abortButtonEl, this.goToMissionButtonEl, this.sendButtonEl);
    this.inputSectionEl.append(this.inputEl, this.attachSectionEl, this.fileInputEl, this.actionBarEl);

    // History section
    this.historySectionEl = document.createElement('div');
    this.historySectionEl.className = 'prompt-history-section';

    const historyHeaderEl = document.createElement('div');
    historyHeaderEl.className = 'prompt-field-label';
    historyHeaderEl.textContent = 'History';

    this.historyListEl = document.createElement('div');
    this.historyListEl.className = 'prompt-history-list';

    this.historySectionEl.append(historyHeaderEl, this.historyListEl);

    this.bodyEl.append(
      this.targetSectionEl,
      this.statusEl,
      this.inputSectionEl,
      this.historySectionEl,
    );

    this._syncMissionOptions();
    this._updateStatus();
    this._renderHistory();
  }

  _getSelectedMission() {
    return this.missions.find((m) => m.id === this.data.targetMissionId) || null;
  }

  _send() {
    const text = this.inputEl.value.trim();
    if (!text && !this._attachments.length) return;
    if (this._isRunning) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const mission = this._getSelectedMission();
    if (!mission || !mission.sessionId) {
      this.statusEl.textContent = 'No mission selected';
      this.statusEl.dataset.tone = 'danger';
      return;
    }

    this._setRunning(true);

    // Build prompt parts
    const parts = [];

    // Mission context
    if (mission.context) {
      parts.push(`以下是目前的任務上下文，請根據此資訊回應：\n\n${mission.context}\n\n---`);
    }

    // Attached files
    if (this._attachments.length) {
      parts.push('以下是使用者附加的檔案內容：');
      for (const file of this._attachments) {
        parts.push(`\n📎 File: ${file.name} (${this._formatSize(file.size)})\n\`\`\`\n${file.content}\n\`\`\``);
      }
      parts.push('---');
    }

    // User prompt
    parts.push(text || '請分析以上附加的檔案內容');

    this.ws.send(JSON.stringify({
      type: 'claude-exec',
      sessionId: mission.sessionId,
      paneId: this.paneId,
      prompt: parts.join('\n\n'),
    }));

    const attachNames = this._attachments.map(f => f.name);
    this.data.history.unshift({
      text: text || `[${attachNames.join(', ')}]`,
      timestamp: Date.now(),
      target: mission.title || mission.id,
      attachments: attachNames,
    });
    if (this.data.history.length > 50) this.data.history.length = 50;
    this._historyIndex = -1;

    this.inputEl.value = '';
    this._attachments = [];
    this._renderAttachments();
    this.fileInputEl.value = '';
    this.requestPersist();
    this._renderHistory();
  }

  _abort() {
    const mission = this._getSelectedMission();
    if (mission?.sessionId) {
      this.ws.send(JSON.stringify({
        type: 'claude-abort',
        sessionId: mission.sessionId,
      }));
    }
    this._setRunning(false);
  }

  _handleFiles(fileList) {
    if (!fileList || !fileList.length) return;

    const MAX_FILE_SIZE = 500 * 1024; // 500KB per file
    const MAX_FILES = 10;

    const remaining = MAX_FILES - this._attachments.length;
    const files = Array.from(fileList).slice(0, remaining);

    let processed = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        this._attachments.push({
          name: file.name,
          content: `[File too large: ${this._formatSize(file.size)}, max ${this._formatSize(MAX_FILE_SIZE)}]`,
          size: file.size,
          error: true,
        });
        processed++;
        if (processed === files.length) this._renderAttachments();
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        this._attachments.push({
          name: file.name,
          content: reader.result,
          size: file.size,
        });
        processed++;
        if (processed === files.length) this._renderAttachments();
      };
      reader.onerror = () => {
        this._attachments.push({
          name: file.name,
          content: `[Failed to read file]`,
          size: file.size,
          error: true,
        });
        processed++;
        if (processed === files.length) this._renderAttachments();
      };
      reader.readAsText(file);
    }
  }

  _renderAttachments() {
    this.attachListEl.innerHTML = '';
    this.attachSectionEl.hidden = this._attachments.length === 0;

    this._attachments.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'prompt-attach-chip';
      if (file.error) chip.classList.add('prompt-attach-error');

      const nameEl = document.createElement('span');
      nameEl.className = 'prompt-attach-name';
      nameEl.textContent = `\u{1F4CE} ${file.name}`;

      const sizeEl = document.createElement('span');
      sizeEl.className = 'prompt-attach-size';
      sizeEl.textContent = this._formatSize(file.size);

      const removeEl = document.createElement('button');
      removeEl.type = 'button';
      removeEl.className = 'prompt-attach-remove';
      removeEl.textContent = '\u2715';
      removeEl.title = 'Remove';
      removeEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._attachments.splice(index, 1);
        this._renderAttachments();
      });

      chip.append(nameEl, sizeEl, removeEl);
      this.attachListEl.appendChild(chip);
    });
  }

  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  _setRunning(running) {
    this._isRunning = running;
    this.sendButtonEl.disabled = running;
    this.abortButtonEl.hidden = !running;
    this.inputEl.disabled = running;
    this._updateStatus();
  }

  handleMessage(msg) {
    const mission = this._getSelectedMission();
    if (!mission || msg.sessionId !== mission.sessionId) return;

    if (msg.type === 'claude-status') {
      if (msg.status === 'done') this._setRunning(false);
    }
    if (msg.type === 'claude-error') {
      this._setRunning(false);
      this.statusEl.textContent = `Error: ${msg.message}`;
      this.statusEl.dataset.tone = 'danger';
    }
  }

  _navigateHistory(direction) {
    if (!this.data.history.length) return;
    const nextIndex = this._historyIndex + direction;
    if (nextIndex < -1 || nextIndex >= this.data.history.length) return;
    this._historyIndex = nextIndex;
    this.inputEl.value = nextIndex === -1 ? '' : this.data.history[nextIndex].text;
    this.inputEl.selectionStart = this.inputEl.selectionEnd = this.inputEl.value.length;
  }

  _syncMissionOptions() {
    const prev = this.targetSelectEl.value || this.data.targetMissionId || '';
    this.targetSelectEl.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.missions.length ? 'Select a mission card' : 'No mission cards available';
    this.targetSelectEl.appendChild(placeholder);

    this.missions.slice().sort((a, b) => a.title.localeCompare(b.title)).forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${MISSION_STATUS_ICONS[m.status] || ''} ${m.title}`;
      this.targetSelectEl.appendChild(opt);
    });

    if (!this.data.targetMissionId && this.missions[0]) {
      this.data.targetMissionId = this.missions[0].id;
      this.requestPersist();
    }

    const nextVal = this.missions.some((m) => m.id === prev) ? prev : this.data.targetMissionId;
    this.targetSelectEl.value = nextVal || '';
  }

  _updateStatus() {
    const mission = this._getSelectedMission();
    this.sendButtonEl.disabled = !mission || this._isRunning;
    this.goToMissionButtonEl.disabled = !mission;

    if (!mission) {
      this.statusEl.textContent = 'Select a mission card to send prompts';
      this.statusEl.dataset.tone = 'muted';
      return;
    }

    if (this._isRunning) {
      this.statusEl.textContent = `Claude is working on "${mission.title}"...`;
      this.statusEl.dataset.tone = 'running';
      return;
    }

    this.statusEl.textContent = `Ready — "${mission.title}" (${mission.status})`;
    this.statusEl.dataset.tone = mission.status === 'done' ? 'running' : 'idle';
  }

  _renderHistory() {
    this.historyListEl.innerHTML = '';
    if (!this.data.history.length) {
      this.historySectionEl.hidden = true;
      return;
    }
    this.historySectionEl.hidden = false;

    this.data.history.slice(0, 15).forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'prompt-history-item';

      const textEl = document.createElement('div');
      textEl.className = 'prompt-history-text';
      textEl.textContent = entry.text;

      const metaEl = document.createElement('div');
      metaEl.className = 'prompt-history-meta';
      metaEl.textContent = entry.target || '';

      const resendEl = document.createElement('button');
      resendEl.type = 'button';
      resendEl.className = 'prompt-history-resend';
      resendEl.textContent = 'Resend';
      resendEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.inputEl.value = entry.text;
        this.inputEl.focus();
      });

      item.append(textEl, metaEl, resendEl);
      this.historyListEl.appendChild(item);
    });
  }

  receiveWorkspaceState({ cards }) {
    // Collect mission cards with their context
    this.missions = (Array.isArray(cards) ? cards : [])
      .filter((c) => c.type === 'mission')
      .map((c) => ({
        id: c.id,
        title: c.title,
        sessionId: c.sessionId,
        status: c.status || 'pending',
        context: c.missionContext || '',
      }));

    this._syncMissionOptions();
    this._updateStatus();
  }

  getPersistData() {
    return {
      targetMissionId: this.data.targetMissionId,
      history: this.data.history.slice(0, 50),
    };
  }

  hydratePersistedData(data = {}) {
    this.data = normalizePromptData(data);
    this._syncMissionOptions();
    this._updateStatus();
    this._renderHistory();
  }
}

const MISSION_STATUS_ICONS = {
  pending: '\u{23F3}',
  running: '\u{1F7E2}',
  done: '\u2705',
  failed: '\u{1F534}',
};

window.PromptCard = PromptCard;

CardRegistry.register({
  type: 'prompt',
  cardClass: PromptCard,
  buttonLabel: 'Prompt Input',
  icon: '\u{1F4E8}',
  shortcutKey: 'I',
  shortcutHint: 'Add Prompt Input Card (Ctrl+Shift+I)',
  order: 25,
  spawnBounds: { widthRatio: 0.34, heightRatio: 0.50, minWidth: 360, minHeight: 320 },
});
