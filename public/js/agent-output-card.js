function normalizeAgentOutputData(data = {}) {
  return {
    sourcePaneId: typeof data.sourcePaneId === 'string' ? data.sourcePaneId : '',
    agentName: typeof data.agentName === 'string' ? data.agentName : '',
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
    claudeMessages: Array.isArray(data.claudeMessages) ? data.claudeMessages : [],
  };
}

class AgentOutputCard extends BaseCard {
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
      cardType: 'agent-output',
      title,
      bounds,
      defaultTitle: 'Agent Output',
      headerHint: 'Follow CLI output',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.onRequestFocusCard = onRequestFocusCard;
    this.data = normalizeAgentOutputData(data);
    this.terminals = [];
    this._cachedResultBlocks = [];  // Last cleanly-parsed agent result

    this.el.classList.add('agent-card');
    this.bodyEl.classList.add('agent-card-body');

    this.settingsEl = document.createElement('section');
    this.settingsEl.className = 'agent-card-settings';

    this.sourceField = this._createFieldShell('Source CLI');
    this.sourceSelectEl = document.createElement('select');
    this.sourceSelectEl.className = 'agent-card-select';
    this.sourceSelectEl.addEventListener('pointerdown', () => {
      this._requestCardFocus({ preserveDomFocus: true });
    });
    this.sourceSelectEl.addEventListener('change', () => {
      this.data.sourcePaneId = this.sourceSelectEl.value;
      this.requestPersist();
      this._renderSourceState();
    });
    this.sourceField.root.appendChild(this.sourceSelectEl);

    this.agentNameField = this._createFieldShell('Agent Label');
    this.agentNameInputEl = document.createElement('input');
    this.agentNameInputEl.type = 'text';
    this.agentNameInputEl.className = 'agent-card-input';
    this.agentNameInputEl.placeholder = 'claude-code / codex / custom agent';
    this.agentNameInputEl.value = this.data.agentName;
    this.agentNameInputEl.spellcheck = false;
    this.agentNameInputEl.addEventListener('pointerdown', () => {
      this._requestCardFocus({ preserveDomFocus: true });
    });
    this.agentNameInputEl.addEventListener('input', () => {
      this.data.agentName = this.agentNameInputEl.value;
      this.requestPersist();
      this._renderSourceState();
    });
    this.agentNameField.root.appendChild(this.agentNameInputEl);

    this.sessionField = this._createFieldShell('Claude Session ID (optional)');
    this.sessionInputEl = document.createElement('input');
    this.sessionInputEl.type = 'text';
    this.sessionInputEl.className = 'agent-card-input';
    this.sessionInputEl.placeholder = 'Paste session ID from Prompt Card to receive structured output';
    this.sessionInputEl.value = this.data.sessionId;
    this.sessionInputEl.spellcheck = false;
    this.sessionInputEl.addEventListener('pointerdown', () => {
      this._requestCardFocus({ preserveDomFocus: true });
    });
    this.sessionInputEl.addEventListener('input', () => {
      this.data.sessionId = this.sessionInputEl.value.trim();
      this.requestPersist();
    });
    this.sessionField.root.appendChild(this.sessionInputEl);

    this.settingsEl.append(this.sourceField.root, this.agentNameField.root, this.sessionField.root);

    this.summaryEl = document.createElement('section');
    this.summaryEl.className = 'agent-card-summary';

    this.statusBadgeEl = document.createElement('div');
    this.statusBadgeEl.className = 'agent-card-status-badge';

    const summaryCopyEl = document.createElement('div');
    summaryCopyEl.className = 'agent-card-summary-copy';

    this.summaryTitleEl = document.createElement('div');
    this.summaryTitleEl.className = 'agent-card-summary-title';

    this.summaryPreviewEl = document.createElement('div');
    this.summaryPreviewEl.className = 'agent-card-summary-preview';

    summaryCopyEl.append(this.summaryTitleEl, this.summaryPreviewEl);
    this.summaryEl.append(this.statusBadgeEl, summaryCopyEl);

    this.outputSectionEl = document.createElement('section');
    this.outputSectionEl.className = 'agent-card-output-section';

    const outputHeaderEl = document.createElement('div');
    outputHeaderEl.className = 'agent-card-output-header';
    outputHeaderEl.innerHTML = `
      <div class="agent-card-output-title">Agent Result Stream</div>
      <div class="agent-card-output-caption">Recent plain-text output captured from the linked CLI terminal.</div>
    `;

    this.outputEl = document.createElement('div');
    this.outputEl.className = 'agent-card-output';

    this.focusButtonEl = document.createElement('button');
    this.focusButtonEl.type = 'button';
    this.focusButtonEl.className = 'agent-card-focus-button';
    this.focusButtonEl.textContent = 'Focus Source';
    this.focusButtonEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = this._getSelectedTerminal();
      if (source && this.onRequestFocusCard) {
        this.onRequestFocusCard(source.id);
      }
    });

    this.outputSectionEl.append(outputHeaderEl, this.outputEl, this.focusButtonEl);
    this.bodyEl.append(this.settingsEl, this.summaryEl, this.outputSectionEl);

    this._syncSourceOptions();
    this._renderSourceState();
  }

  _createFieldShell(label) {
    const root = document.createElement('label');
    root.className = 'agent-card-field';

    const labelEl = document.createElement('div');
    labelEl.className = 'agent-card-field-label';
    labelEl.textContent = label;

    root.appendChild(labelEl);
    return { root, labelEl };
  }

  _syncSourceOptions() {
    const previousValue = this.sourceSelectEl.value || this.data.sourcePaneId || '';

    this.sourceSelectEl.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.terminals.length
      ? 'Choose a terminal to follow'
      : 'No terminal sources available';
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
  }

  _getSelectedTerminal() {
    return this.terminals.find((terminal) => terminal.id === this.data.sourcePaneId) || null;
  }

  _setSummaryState({ tone, status, title, preview }) {
    this.statusBadgeEl.dataset.tone = tone;
    this.statusBadgeEl.textContent = status;
    this.summaryTitleEl.textContent = title;
    this.summaryPreviewEl.textContent = preview;
  }

  handleMessage(msg) {
    // Only process claude messages that match our sessionId
    if (!this.data.sessionId) return;

    if (msg.type === 'claude-data' && msg.sessionId === this.data.sessionId) {
      this._appendClaudeMessage(msg.data);
      return;
    }

    if (msg.type === 'claude-status' && msg.sessionId === this.data.sessionId) {
      if (msg.status === 'running') {
        this._setSummaryState({
          tone: 'running',
          status: 'Running',
          title: `${this.data.agentName || 'Claude'} is thinking...`,
          preview: 'Processing prompt via claude CLI session...',
        });
      } else if (msg.status === 'done') {
        this._setSummaryState({
          tone: 'idle',
          status: 'Done',
          title: `${this.data.agentName || 'Claude'} — session ${this.data.sessionId}`,
          preview: `Completed (exit code ${msg.code ?? 0})`,
        });
      }
      return;
    }

    if (msg.type === 'claude-error' && msg.sessionId === this.data.sessionId) {
      this._appendClaudeMessage({ type: 'error', text: msg.message });
    }
  }

  _appendClaudeMessage(obj) {
    this.data.claudeMessages.push(obj);
    // Keep last 200 messages
    if (this.data.claudeMessages.length > 200) {
      this.data.claudeMessages = this.data.claudeMessages.slice(-200);
    }
    this._renderClaudeOutput();
  }

  _renderClaudeOutput() {
    this.outputEl.innerHTML = '';

    if (!this.data.claudeMessages.length) {
      this.outputEl.textContent = 'Waiting for Claude session output...';
      return;
    }

    for (const msg of this.data.claudeMessages) {
      const el = document.createElement('div');

      if (msg.type === 'assistant') {
        // Assistant text message
        const content = msg.message?.content;
        if (!content) continue;

        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              el.className = 'agent-block agent-block-agent';
              const label = document.createElement('span');
              label.className = 'agent-block-label';
              label.textContent = '\u23FA Agent';
              const text = document.createElement('pre');
              text.className = 'agent-block-text';
              text.textContent = block.text;
              el.append(label, text);
            }
          }
        } else if (typeof content === 'string') {
          el.className = 'agent-block agent-block-agent';
          const label = document.createElement('span');
          label.className = 'agent-block-label';
          label.textContent = '\u23FA Agent';
          const text = document.createElement('pre');
          text.className = 'agent-block-text';
          text.textContent = content;
          el.append(label, text);
        }
      } else if (msg.type === 'tool_use' || msg.type === 'tool_result') {
        el.className = 'agent-block agent-block-tool';
        const label = document.createElement('span');
        label.className = 'agent-block-label';
        label.textContent = msg.type === 'tool_use'
          ? `\u{1F527} ${msg.tool?.name || msg.name || 'Tool'}`
          : '\u{1F4E6} Result';
        const text = document.createElement('pre');
        text.className = 'agent-block-text';
        if (msg.type === 'tool_use') {
          text.textContent = JSON.stringify(msg.tool?.input || msg.input || {}, null, 2);
        } else {
          const content = msg.content || msg.output || '';
          text.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        }
        el.append(label, text);
      } else if (msg.type === 'result') {
        el.className = 'agent-block agent-block-agent';
        const label = document.createElement('span');
        label.className = 'agent-block-label';
        label.textContent = '\u2705 Result';
        const text = document.createElement('pre');
        text.className = 'agent-block-text';
        text.textContent = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2);
        el.append(label, text);
      } else if (msg.type === 'error') {
        el.className = 'agent-block agent-block-error';
        const label = document.createElement('span');
        label.className = 'agent-block-label';
        label.textContent = '\u274C Error';
        const text = document.createElement('pre');
        text.className = 'agent-block-text';
        text.textContent = msg.text || msg.message || JSON.stringify(msg);
        el.append(label, text);
      } else if (msg.type === 'raw') {
        el.className = 'agent-block agent-block-system';
        const text = document.createElement('pre');
        text.className = 'agent-block-text';
        text.textContent = msg.text;
        el.append(text);
      } else {
        // Unknown type — show raw JSON
        continue;
      }

      if (el.children.length) {
        this.outputEl.appendChild(el);
      }
    }

    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  _renderOutput(rawOutput) {
    this.outputEl.innerHTML = '';

    if (!rawOutput) {
      this.outputEl.textContent = 'No agent output connected yet.';
      return;
    }

    const phase = window.OutputUtils.detectAgentPhase(rawOutput);

    // During 'thinking' phase — agent is processing a new prompt.
    // Show "Thinking..." instead of stale old results.
    if (phase === 'thinking') {
      this._showPhaseStatus('Thinking...', 'Agent is processing the request.');
      return;
    }

    // Only update the cache when the agent is actively producing or just finished
    // content (done/responding). Do NOT update during 'input' phase — the buffer
    // tail contains the user's keystrokes which pollute the parsed blocks.
    if (phase === 'done' || phase === 'responding') {
      const blocks = window.OutputUtils.parseAgentBlocks(rawOutput);
      const lastAgentIdx = blocks.map((b) => b.role).lastIndexOf('agent');

      if (lastAgentIdx >= 0) {
        let startIdx = lastAgentIdx;
        for (let i = lastAgentIdx - 1; i >= 0; i--) {
          if (blocks[i].role === 'user') { startIdx = i; break; }
        }
        this._cachedResultBlocks = blocks.slice(startIdx);
      }
    }

    // Render cached result if available
    if (this._cachedResultBlocks.length > 0) {
      this._renderBlocks(this._cachedResultBlocks);
      return;
    }

    // Nothing to show
    this.outputEl.textContent = 'Waiting for agent output...';
  }

  _renderBlocks(blocks) {
    blocks.forEach((block) => {
      const el = document.createElement('div');
      el.className = `agent-block agent-block-${block.role}`;

      const label = document.createElement('span');
      label.className = 'agent-block-label';
      label.textContent = block.role === 'user' ? '> You' : '⏺ Agent';

      const text = document.createElement('pre');
      text.className = 'agent-block-text';
      text.textContent = block.text;

      el.append(label, text);
      this.outputEl.appendChild(el);
    });

    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  _showPhaseStatus(title, caption) {
    this.outputEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-card-phase-status';

    const titleEl = document.createElement('div');
    titleEl.className = 'agent-card-phase-title';
    titleEl.textContent = title;

    const captionEl = document.createElement('div');
    captionEl.className = 'agent-card-phase-caption';
    captionEl.textContent = caption;

    wrapper.append(titleEl, captionEl);
    this.outputEl.appendChild(wrapper);
  }

  _renderSourceState() {
    const agentLabel = this.data.agentName.trim() || 'Linked Agent';

    // If this card has a Claude session and has received messages, show those
    if (this.data.sessionId && this.data.claudeMessages.length > 0) {
      this._renderClaudeOutput();
      return;
    }

    const source = this._getSelectedTerminal();

    if (!source && !this.data.sessionId) {
      this._setSummaryState({
        tone: 'muted',
        status: 'Waiting',
        title: `${agentLabel} is not linked yet.`,
        preview: 'Pick a terminal source or set a Claude Session ID.',
      });
      this._renderOutput('');
      this.focusButtonEl.disabled = true;
      return;
    }

    if (!source && this.data.sessionId) {
      this._setSummaryState({
        tone: 'idle',
        status: 'Session Ready',
        title: `${agentLabel} — session ${this.data.sessionId}`,
        preview: 'Waiting for prompts via Prompt Input card...',
      });
      this.outputEl.innerHTML = '';
      this.outputEl.textContent = 'Claude session linked. Send a prompt to see output here.';
      this.focusButtonEl.disabled = true;
      return;
    }

    this.focusButtonEl.disabled = false;

    // Prefer programOutput (user echo removed) over raw recentOutput
    const rawOutput = source.programOutput || source.recentOutput || '';
    const phase = window.OutputUtils.detectAgentPhase(rawOutput);

    // Build summary based on phase
    let tone, statusText, preview;
    if (source.status === 'exited') {
      tone = 'danger';
      statusText = 'Exited';
      preview = 'Terminal process has exited.';
    } else if (phase === 'thinking') {
      tone = 'running';
      statusText = 'Thinking';
      preview = 'Agent is processing the request...';
    } else if (phase === 'input') {
      tone = 'idle';
      statusText = 'Awaiting Input';
      preview = 'User is composing a prompt.';
    } else if (phase === 'responding') {
      tone = 'running';
      statusText = 'Responding';
      preview = 'Agent is streaming a response...';
    } else {
      tone = source.status === 'running' ? 'running' : 'idle';
      statusText = source.status;
      const cleanPreview = window.OutputUtils.extractAgentContent(rawOutput);
      preview = cleanPreview
        ? cleanPreview.split('\n').filter(Boolean).pop()?.slice(0, 120)
        : 'Waiting for the next chunk of agent output.';
    }

    this._setSummaryState({
      tone,
      status: statusText,
      title: `${agentLabel} following ${source.title}`,
      preview,
    });

    this._renderOutput(rawOutput);
  }

  receiveWorkspaceState({ terminals }) {
    this.terminals = Array.isArray(terminals) ? terminals : [];
    this._syncSourceOptions();
    this._renderSourceState();
  }

  getPersistData() {
    return {
      sourcePaneId: this.data.sourcePaneId,
      agentName: this.data.agentName,
      sessionId: this.data.sessionId,
      // Don't persist claudeMessages — they can be large and are ephemeral
    };
  }

  hydratePersistedData(data = {}) {
    this.data = normalizeAgentOutputData(data);
    this.agentNameInputEl.value = this.data.agentName;
    this.sessionInputEl.value = this.data.sessionId;
    this._syncSourceOptions();
    this._renderSourceState();
  }
}

window.AgentOutputCard = AgentOutputCard;

CardRegistry.register({
  type: 'agent-output',
  cardClass: AgentOutputCard,
  buttonLabel: 'Agent Output',
  icon: '\u{1F916}',
  shortcutKey: 'A',
  shortcutHint: 'Add Agent Output Card (Ctrl+Shift+A)',
  order: 20,
  spawnBounds: { widthRatio: 0.56, heightRatio: 0.62, minWidth: 480, minHeight: 320 },
});
