/**
 * CardRegistry — extensible card type registration system.
 *
 * Each card type registers itself here with its class and spawn metadata.
 * PaneManager and the toolbar consume the registry to create cards dynamically,
 * so adding a new card type only requires:
 *   1. Create a new JS file (e.g. my-card.js)
 *   2. Call CardRegistry.register({ ... }) at the bottom
 *   3. Add a <script> tag in index.html (before pane-manager.js)
 *
 * No changes to PaneManager, app.js, or index.html toolbar markup needed.
 */
(function () {
  const _types = new Map();

  window.CardRegistry = {
    /**
     * Register a card type.
     *
     * @param {object} descriptor
     * @param {string}   descriptor.type        — unique type key (e.g. 'agent-output')
     * @param {Function} descriptor.cardClass   — constructor that extends BaseCard
     * @param {string}   descriptor.buttonLabel  — toolbar button text
     * @param {string}   [descriptor.buttonId]   — toolbar button id (auto-generated if omitted)
     * @param {string}   [descriptor.shortcutKey] — Ctrl+Shift+<key> shortcut (single uppercase letter)
     * @param {string}   [descriptor.shortcutHint] — tooltip text for the button
     * @param {string}   [descriptor.icon]        — emoji or symbol for context menu
     * @param {object}   [descriptor.spawnBounds] — { widthRatio, heightRatio, minWidth, minHeight }
     * @param {number}   [descriptor.order]      — display order in toolbar (lower = left)
     */
    register(descriptor) {
      if (!descriptor.type || typeof descriptor.cardClass !== 'function') {
        throw new Error('CardRegistry.register requires type and cardClass');
      }
      if (!descriptor.order) descriptor.order = _types.size + 100;
      if (!descriptor.buttonId) descriptor.buttonId = `btn-${descriptor.type}-card`;
      _types.set(descriptor.type, descriptor);
    },

    /** Get a single card type descriptor */
    get(type) {
      return _types.get(type) || null;
    },

    /** Get all registered types ordered by `order` */
    getAll() {
      return Array.from(_types.values()).sort((a, b) => a.order - b.order);
    },

    /** Get spawn bounds config for a type (or null) */
    getSpawnBounds(type) {
      return _types.get(type)?.spawnBounds || null;
    },
  };
})();
