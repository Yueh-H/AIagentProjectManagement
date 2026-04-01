document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('pane-container');
  const toolbar = document.getElementById('toolbar');
  const manager = new PaneManager(container);
  manager.init();

  const isEditableTarget = (target) => {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return Boolean(target.closest('.xterm, .toastui-editor-defaultUI'));
  };

  // --- Theme toggle ---
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const themeBtn = document.createElement('button');
  themeBtn.className = 'theme-toggle';
  themeBtn.title = 'Toggle light / dark theme';
  themeBtn.textContent = savedTheme === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  toolbar.appendChild(themeBtn);

  themeBtn.onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    themeBtn.textContent = next === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19';

    // Update all xterm instances
    const xtermTheme = TerminalPane.getXtermTheme();
    if (manager.panes) {
      manager.panes.forEach((pane) => {
        if (pane.terminal) {
          pane.terminal.options.theme = xtermTheme;
        }
      });
    }
  };

  // Dynamically create toolbar buttons from the card registry
  const shortcutMap = {};

  CardRegistry.getAll().forEach((desc) => {
    let btn = document.getElementById(desc.buttonId);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = desc.buttonId;
      toolbar.appendChild(btn);
    }
    btn.textContent = desc.buttonLabel;
    if (desc.shortcutHint) btn.title = desc.shortcutHint;
    btn.onclick = () => manager.createCard(desc.type);

    if (desc.shortcutKey) {
      shortcutMap[desc.shortcutKey] = desc.type;
    }
  });

  // Keyboard shortcuts (Ctrl+Shift+<key>)
  document.addEventListener('keydown', (e) => {
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.shiftKey && e.code === 'Digit1') {
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      manager.centerViewport({ resetZoom: false });
      return;
    }

    if (e.ctrlKey && e.shiftKey) {
      const type = shortcutMap[e.key];
      if (type) {
        e.preventDefault();
        manager.createCard(type);
      }
    }
  });
});
