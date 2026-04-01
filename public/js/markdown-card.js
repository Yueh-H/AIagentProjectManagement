function normalizeMarkdownCardData(data = {}) {
  return {
    markdown: typeof data.markdown === 'string' ? data.markdown : '',
  };
}

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
      headerHint: 'Markdown source',
      getContainerRect,
      onBoundsCommit,
      onFocus,
      onRequestClose,
    });

    this.ws = ws;
    this.data = normalizeMarkdownCardData(data);

    this.el.classList.add('markdown-card');
    this.bodyEl.classList.add('markdown-card-body');

    this.infoEl = document.createElement('section');
    this.infoEl.className = 'markdown-card-info';

    this.infoTitleEl = document.createElement('div');
    this.infoTitleEl.className = 'markdown-card-info-title';
    this.infoTitleEl.textContent = 'Exact Markdown Source';

    this.infoCaptionEl = document.createElement('div');
    this.infoCaptionEl.className = 'markdown-card-info-caption';
    this.infoCaptionEl.textContent = 'This card stores raw .md content as plain text, so headings, lists, fences, and tables stay intact.';

    this.infoMetaEl = document.createElement('div');
    this.infoMetaEl.className = 'markdown-card-info-meta';

    this.editorEl = document.createElement('textarea');
    this.editorEl.className = 'markdown-card-editor';
    this.editorEl.placeholder = '# Release Notes\n\n## Goals\n- Track agent output\n- Capture next steps\n\n```bash\nnpm test\n```';
    this.editorEl.spellcheck = false;
    this.editorEl.wrap = 'off';
    this.editorEl.value = this.data.markdown;
    this.editorEl.addEventListener('pointerdown', () => {
      if (this.onFocus) this.onFocus(this.paneId);
    });
    this.editorEl.addEventListener('input', () => {
      this.data.markdown = this.editorEl.value;
      this._updateMeta();
      this.requestPersist();
    });

    this.infoEl.append(this.infoTitleEl, this.infoCaptionEl, this.infoMetaEl);
    this.bodyEl.append(this.infoEl, this.editorEl);

    this._updateMeta();
  }

  _updateMeta() {
    const text = this.data.markdown || '';
    const lineCount = text ? text.split('\n').length : 0;
    const charCount = text.length;
    this.infoMetaEl.textContent = `${lineCount} lines • ${charCount} chars`;
  }

  getPersistData() {
    return {
      markdown: this.data.markdown,
    };
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
