class TerminalPane extends BaseCard {
  constructor(paneId, ws, {
    bounds,
    title,
    clientId,
    buffer,
    data,
    getContainerRect,
    onBoundsCommit,
    onFocus,
    onRequestClose,
    onRuntimeChange,
  } = {}) {
    super(paneId, {
      cardType: 'terminal',
      bounds,
      title,
      defaultTitle: `Terminal ${paneId.replace('pane-', '#')}`,
      headerHint: 'Drag to move',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.clientId = clientId || null;
    this.onRuntimeChange = onRuntimeChange;
    this.outputBuffer = window.OutputUtils.clampOutput(buffer || '');
    this.programBuffer = window.OutputUtils.clampOutput(data?.programBuffer || '');
    this.runtime = {
      status: data?.status || (buffer ? 'idle' : 'starting'),
      preview: data?.preview || window.OutputUtils.summarizeOutput(buffer || ''),
      updatedAt: data?.updatedAt || Date.now(),
      exitCode: data?.exitCode ?? null,
    };
    this._idleTimer = null;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'xterm-container';
    this.bodyEl.appendChild(this.containerEl);

    this.terminal = new window.Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: TerminalPane.getXtermTheme(),
    });
    this.fitAddon = new window.FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new window.WebLinksAddon.WebLinksAddon());
    this.terminal.open(this.containerEl);

    if (buffer) {
      this.terminal.write(buffer);
    }

    this.terminal.onData((input) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'input',
          clientId: this.clientId,
          paneId: this.paneId,
          data: input,
        }));
      }
      this._setRuntimeState({
        status: 'running',
        preview: window.OutputUtils.summarizeOutput(input) || this.runtime.preview,
      });
    });

    this.terminal.textarea?.addEventListener('focus', () => {
      this._requestCardFocus({ preserveDomFocus: true });
    });

    this._emitRuntimeChange();
  }

  _emitRuntimeChange() {
    if (this.onRuntimeChange) {
      this.onRuntimeChange(this.paneId, this.getRuntimeInfo());
    }
  }

  _setRuntimeState(partial) {
    this.runtime = {
      ...this.runtime,
      ...partial,
      updatedAt: Date.now(),
    };
    this._emitRuntimeChange();
  }

  _scheduleIdleTransition() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
    }

    this._idleTimer = setTimeout(() => {
      if (this.runtime.status === 'running') {
        this._setRuntimeState({ status: 'idle' });
      }
      this._idleTimer = null;
    }, 1400);
  }

  init() {
    this._setRuntimeState({ status: 'starting' });

    requestAnimationFrame(() => {
      try {
        this.fitAddon.fit();
      } catch (e) { /* element may not be visible yet */ }

      const { cols, rows } = this.terminal;
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'create',
          clientId: this.clientId,
          paneId: this.paneId,
          cols,
          rows,
        }));
      }
      this.scheduleFit();
    });
  }

  handleMessage(message) {
    if (message.type === 'output') {
      this.write(message.data);
      // Only append to programBuffer if this is program output (not user echo)
      if (message.origin !== 'echo') {
        this.programBuffer = window.OutputUtils.clampOutput(
          `${this.programBuffer}${message.data}`
        );
      }
      return;
    }

    if (message.type === 'error') {
      this.write(`\r\n[server error] ${message.message}\r\n`);
      this._setRuntimeState({
        status: 'exited',
        preview: message.message,
      });
      return;
    }

    if (message.type === 'exit') {
      this._setRuntimeState({
        status: 'exited',
        exitCode: message.code ?? null,
        preview: message.code == null ? 'Terminal exited.' : `Exited with code ${message.code}`,
      });
    }
  }

  write(data) {
    this.outputBuffer = window.OutputUtils.clampOutput(`${this.outputBuffer}${data}`);
    this.terminal.write(data);

    const preview = window.OutputUtils.summarizeOutput(data);
    if (preview) {
      this._setRuntimeState({
        status: 'running',
        preview,
        exitCode: null,
      });
      this._scheduleIdleTransition();
    }
  }

  fit() {
    try {
      this.fitAddon.fit();
      const { cols, rows } = this.terminal;
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'resize',
          clientId: this.clientId,
          paneId: this.paneId,
          cols,
          rows,
        }));
      }
    } catch (e) { /* element may not be visible yet */ }
  }

  getPersistData() {
    return {
      status: this.runtime.status,
      preview: this.runtime.preview,
      updatedAt: this.runtime.updatedAt,
      exitCode: this.runtime.exitCode,
      programBuffer: this.programBuffer,
    };
  }

  getRuntimeInfo() {
    return {
      id: this.paneId,
      title: this.getTitle(),
      status: this.runtime.status,
      preview: this.runtime.preview,
      recentOutput: this.outputBuffer,
      programOutput: this.programBuffer,
      outputSize: this.outputBuffer.length,
      updatedAt: this.runtime.updatedAt,
      exitCode: this.runtime.exitCode,
    };
  }

  focus() {
    this.terminal.focus();
  }

  dispose() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'close', clientId: this.clientId, paneId: this.paneId }));
    }
    this.terminal.dispose();
    super.dispose();
  }

  static getXtermTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      return {
        background: '#ffffff',
        foreground: '#37352f',
        cursor: '#37352f',
        cursorAccent: '#ffffff',
        selectionBackground: 'rgba(55, 53, 47, 0.15)',
      };
    }
    return {
      background: '#111827',
      foreground: '#e5e7eb',
      cursor: '#e5e7eb',
      cursorAccent: '#111827',
      selectionBackground: 'rgba(229, 231, 235, 0.2)',
    };
  }
}

window.TerminalPane = TerminalPane;

CardRegistry.register({
  type: 'terminal',
  cardClass: TerminalPane,
  buttonLabel: 'CLI Card',
  icon: '\u{1F4BB}',
  shortcutKey: 'T',
  shortcutHint: 'Add Terminal Card (Ctrl+Shift+T)',
  order: 40,
  spawnBounds: { widthRatio: 0.38, heightRatio: 0.48, minWidth: 380, minHeight: 260 },
});
