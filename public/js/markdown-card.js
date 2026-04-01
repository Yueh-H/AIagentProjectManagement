function normalizeMarkdownCardData(data = {}) {
  return {
    markdown: typeof data.markdown === 'string' ? data.markdown : '',
  };
}

function trimBlankLines(text = '') {
  return text.replace(/^\n+/, '').replace(/\n+$/, '');
}

function splitToggleContent(text = '') {
  const normalized = trimBlankLines(text.replace(/\r\n?/g, '\n'));
  const lines = normalized ? normalized.split('\n') : [];
  const firstContentIndex = lines.findIndex((line) => line.trim());

  if (firstContentIndex === -1) {
    return {
      summary: 'Toggle',
      body: '',
    };
  }

  return {
    summary: lines[firstContentIndex],
    body: trimBlankLines(lines.slice(firstContentIndex + 1).join('\n')),
  };
}

const MARKDOWN_CARD_HTML_RENDERERS = {
  htmlInline: {
    u(_, { entering }) {
      return {
        type: entering ? 'openTag' : 'closeTag',
        tagName: 'u',
      };
    },
  },
  toggle(node) {
    const { summary, body } = splitToggleContent(node?.literal || '');
    const tokens = [
      {
        type: 'openTag',
        tagName: 'details',
        outerNewLine: true,
        attributes: { class: 'markdown-card-toggle-block', open: '' },
      },
      {
        type: 'openTag',
        tagName: 'summary',
        attributes: { class: 'markdown-card-toggle-summary' },
      },
      { type: 'text', content: summary },
      { type: 'closeTag', tagName: 'summary' },
    ];

    if (body) {
      tokens.push({
        type: 'openTag',
        tagName: 'div',
        attributes: { class: 'markdown-card-toggle-body' },
      });
      tokens.push({ type: 'text', content: body });
      tokens.push({ type: 'closeTag', tagName: 'div' });
    }

    tokens.push({
      type: 'closeTag',
      tagName: 'details',
      outerNewLine: true,
    });

    return tokens;
  },
  math(node) {
    return [
      {
        type: 'openTag',
        tagName: 'div',
        outerNewLine: true,
        attributes: { class: 'markdown-card-math-block' },
      },
      { type: 'text', content: trimBlankLines(node?.literal || '') },
      {
        type: 'closeTag',
        tagName: 'div',
        outerNewLine: true,
      },
    ];
  },
};

class MarkdownCard extends BaseCard {
  constructor(cardId, ws, {
    title,
    bounds,
    data,
    getContainerRect,
    onBoundsCommit,
    onFocus,
    onRequestClose,
  } = {}) {
    super(cardId, {
      cardType: 'markdown',
      title,
      bounds,
      defaultTitle: 'Document.md',
      headerHint: 'WYSIWYG markdown',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.data = normalizeMarkdownCardData(data);
    this.editor = null;
    this.editorTheme = null;
    this.themeObserver = null;
    this.isApplyingExternalChange = false;

    this.el.classList.add('markdown-card');
    this.bodyEl.classList.add('markdown-card-body');

    this.editorShellEl = document.createElement('div');
    this.editorShellEl.className = 'markdown-card-editor-shell';
    this.editorShellEl.addEventListener('keydown', (event) => {
      if (!this.editor || !window.EditorShortcuts) return;
      window.EditorShortcuts.handleToastUiEditorKeydown(event, this.editor);
    }, true);
    this.editorShellEl.addEventListener('pointerdown', () => {
      this._requestCardFocus({ preserveDomFocus: true });
    });
    this.bodyEl.append(this.editorShellEl);
  }

  init() {
    this._mountEditor();
    this._observeThemeChanges();
  }

  _getAppTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  _getEditorHeight() {
    return Math.max(220, this.editorShellEl.clientHeight || this.bodyEl.clientHeight || 220);
  }

  _mountEditor({ focus = false } = {}) {
    const Editor = window.toastui?.Editor;
    this._destroyEditor();
    this.editorShellEl.replaceChildren();

    if (!Editor) {
      const fallbackEl = document.createElement('div');
      fallbackEl.className = 'markdown-card-editor-fallback';
      fallbackEl.textContent = 'Markdown editor failed to load.';
      this.editorShellEl.append(fallbackEl);
      return;
    }

    this.editorTheme = this._getAppTheme();
    this.editor = new Editor({
      el: this.editorShellEl,
      height: `${this._getEditorHeight()}px`,
      minHeight: '220px',
      initialEditType: 'wysiwyg',
      initialValue: this.data.markdown,
      previewStyle: 'tab',
      hideModeSwitch: true,
      autofocus: false,
      usageStatistics: false,
      useCommandShortcut: false,
      theme: this.editorTheme === 'dark' ? 'dark' : undefined,
      customHTMLRenderer: MARKDOWN_CARD_HTML_RENDERERS,
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'link'],
        ['code', 'codeblock'],
      ],
    });
    this._registerCustomCommands();
    if (typeof this.editor.changeMode === 'function') {
      this.editor.changeMode('wysiwyg', true);
    }
    this.el._markdownEditor = this.editor;

    this.editor.on('change', () => {
      if (!this.editor) return;
      this.data.markdown = this.editor.getMarkdown();
      if (!this.isApplyingExternalChange) {
        this.requestPersist();
      }
    });

    if (focus) {
      this.editor.focus();
    }
  }

  getPersistData() {
    if (this.editor) {
      this.data.markdown = this.editor.getMarkdown();
    }

    return {
      markdown: this.data.markdown,
    };
  }

  hydratePersistedData(data = {}) {
    this.data = normalizeMarkdownCardData(data);
    if (this.editor) {
      this.isApplyingExternalChange = true;
      this.editor.setMarkdown(this.data.markdown, false);
      this.editor.changeMode?.('wysiwyg', true);
      this.isApplyingExternalChange = false;
    }
  }

  fit() {
    if (!this.editor) return;
    this.editor.setHeight(`${this._getEditorHeight()}px`);
  }

  _registerCustomCommands() {
    if (!this.editor || typeof this.editor.addCommand !== 'function') return;

    this.editor.addCommand('wysiwyg', 'underline', (_, state, dispatch) => {
      const underline = state?.schema?.marks?.u;
      if (!underline) return false;

      const { selection, tr, doc } = state;
      const { from, to, empty, $from } = selection;

      if (empty) {
        const activeMarks = state.storedMarks || $from.marks() || [];
        const hasUnderline = Boolean(underline.isInSet(activeMarks));
        const nextMarks = hasUnderline
          ? activeMarks.filter((mark) => mark.type !== underline)
          : underline.create().addToSet(activeMarks);

        dispatch(tr.setStoredMarks(nextMarks));
        return true;
      }

      let fullyUnderlined = true;
      doc.nodesBetween(from, to, (node) => {
        if (!node.isText) return;
        if (!underline.isInSet(node.marks)) {
          fullyUnderlined = false;
        }
      });

      if (fullyUnderlined) {
        dispatch(tr.removeMark(from, to, underline).scrollIntoView());
        return true;
      }

      dispatch(tr.addMark(from, to, underline.create()).scrollIntoView());
      return true;
    });
  }

  _observeThemeChanges() {
    if (!window.MutationObserver) return;

    this.themeObserver = new MutationObserver(() => {
      const nextTheme = this._getAppTheme();
      if (nextTheme === this.editorTheme) return;

      const markdown = this.editor ? this.editor.getMarkdown() : this.data.markdown;
      const shouldFocus = this.el.contains(document.activeElement);
      this.data.markdown = markdown;
      this._mountEditor({ focus: shouldFocus });
      this.fit();
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  _destroyEditor() {
    if (!this.editor) return;
    this.editor.off('change');
    this.editor.destroy();
    this.editor = null;
    this.el._markdownEditor = null;
  }

  dispose() {
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    this._destroyEditor();
    super.dispose();
  }
}

window.MarkdownCard = MarkdownCard;

CardRegistry.register({
  type: 'markdown',
  cardClass: MarkdownCard,
  buttonLabel: 'Markdown',
  icon: '\u{1F4DD}',
  shortcutKey: 'M',
  shortcutHint: 'Add Markdown Card (Ctrl+Shift+M)',
  order: 30,
  spawnBounds: { widthRatio: 0.64, heightRatio: 0.78, minWidth: 520, minHeight: 360 },
});
