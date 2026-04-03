const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const CSS_DIR = path.join(__dirname, '..', 'public', 'css');
const ENTRY = path.join(CSS_DIR, 'style.css');

/** All expected module files (order matches style.css @import order) */
const EXPECTED_MODULES = [
  'variables.css',
  'base.css',
  'toolbar.css',
  'workspace.css',
  'context-menu.css',
  'card-base.css',
  'terminal-card.css',
  'project-card.css',
  'agent-output-card.css',
  'prompt-card.css',
  'markdown-card.css',
  'mission-card.css',
  'input-card.css',
  'output-card.css',
  'theme-light.css',
  'responsive.css',
];

/** JS module → expected CSS module mapping */
const JS_CSS_MAP = {
  'terminal-pane.js':     'terminal-card.css',
  'project-card.js':      'project-card.css',
  'agent-output-card.js': 'agent-output-card.css',
  'prompt-card.js':       'prompt-card.css',
  'markdown-card.js':     'markdown-card.css',
  'mission-card.js':      'mission-card.css',
  'input-card.js':        'input-card.css',
  'output-card.js':       'output-card.css',
};

function readCSS(name) {
  return fs.readFileSync(path.join(CSS_DIR, name), 'utf-8');
}

function extractImports(css) {
  const re = /@import\s+url\(\s*['"]?\.\/([\w-]+\.css)['"]?\s*\)/g;
  const imports = [];
  let m;
  while ((m = re.exec(css)) !== null) imports.push(m[1]);
  return imports;
}

function extractSelectors(css) {
  // Strip comments
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip @keyframes and @media blocks content (keep their selectors inside)
  const re = /([^{}]+)\{/g;
  const selectors = [];
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const sel = m[1].trim();
    if (sel && !sel.startsWith('@import') && !sel.startsWith('@keyframes')) {
      selectors.push(sel);
    }
  }
  return selectors;
}

// ── Tests ──

test('style.css imports all expected modules in correct order', () => {
  const entry = readCSS('style.css');
  const imports = extractImports(entry);
  assert.deepEqual(imports, EXPECTED_MODULES);
});

test('all imported CSS module files exist and are non-empty', () => {
  for (const mod of EXPECTED_MODULES) {
    const filePath = path.join(CSS_DIR, mod);
    assert.ok(fs.existsSync(filePath), `${mod} should exist`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 0, `${mod} should not be empty`);
  }
});

test('style.css contains only imports, no direct rules', () => {
  const entry = readCSS('style.css');
  const stripped = entry.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const lines = stripped.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    assert.ok(
      trimmed.startsWith('@import') || trimmed === '',
      `style.css should only have @imports, found: "${trimmed}"`
    );
  }
});

test('no CSS module imports other modules (flat structure)', () => {
  for (const mod of EXPECTED_MODULES) {
    const css = readCSS(mod);
    const imports = extractImports(css);
    assert.equal(imports.length, 0, `${mod} should not contain @import statements`);
  }
});

test('variables.css defines :root and [data-theme="light"] variable blocks', () => {
  const css = readCSS('variables.css');
  assert.ok(css.includes(':root'), 'should contain :root');
  assert.ok(css.includes('[data-theme="light"]'), 'should contain light theme variables');
  assert.ok(css.includes('--app-bg'), 'should define --app-bg');
  assert.ok(css.includes('--panel-bg'), 'should define --panel-bg');
  assert.ok(css.includes('--accent'), 'should define --accent');
});

test('theme-light.css only contains [data-theme="light"] selectors', () => {
  const css = readCSS('theme-light.css');
  const selectors = extractSelectors(css);
  for (const sel of selectors) {
    assert.ok(
      sel.includes('[data-theme="light"]'),
      `theme-light.css selector should scope to light theme: "${sel}"`
    );
  }
});

test('card-base.css contains .pane-wrapper and resize handle rules', () => {
  const css = readCSS('card-base.css');
  assert.ok(css.includes('.pane-wrapper'), 'should contain .pane-wrapper');
  assert.ok(css.includes('.pane-header'), 'should contain .pane-header');
  assert.ok(css.includes('.pane-resize-handle'), 'should contain .pane-resize-handle');
  assert.ok(css.includes('.pane-close-button'), 'should contain .pane-close-button');
  assert.ok(css.includes('.pane-title-display'), 'should contain .pane-title-display');
  assert.ok(css.includes('.pane-title-input'), 'should contain .pane-title-input');
});

test('each card type CSS contains its expected primary selectors', () => {
  const cardChecks = {
    'terminal-card.css':     ['.terminal-cwd-bar', '.xterm'],
    'project-card.css':      ['.project-card-body', '.project-card-health', '.project-card-item'],
    'agent-output-card.css': ['.agent-card-body', '.agent-card-output', '.agent-block'],
    'prompt-card.css':       ['.prompt-card-body', '.prompt-textarea', '.prompt-send-button', '.prompt-history-section'],
    'markdown-card.css':     ['.markdown-card-body', '.markdown-card-editor-shell'],
    'mission-card.css':      ['.mission-card-body', '.mission-status-panel', '.mission-checklist-section'],
    'input-card.css':        ['.input-card-body', '.input-card-actions', '.input-folder-browser'],
    'output-card.css':       ['.output-card-body', '.output-task-list', '.output-progress-bar'],
  };

  for (const [file, expectedSelectors] of Object.entries(cardChecks)) {
    const css = readCSS(file);
    for (const sel of expectedSelectors) {
      assert.ok(css.includes(sel), `${file} should contain ${sel}`);
    }
  }
});

test('prompt-card.css has no duplicate definitions (dedup check)', () => {
  const css = readCSS('prompt-card.css');
  // Count how many times .prompt-card-body { appears
  const matches = css.match(/\.prompt-card-body\s*\{/g) || [];
  assert.equal(matches.length, 1, '.prompt-card-body should appear exactly once');

  const textareaMatches = css.match(/\.prompt-textarea\s*\{/g) || [];
  assert.equal(textareaMatches.length, 1, '.prompt-textarea should appear exactly once');

  const sendMatches = css.match(/\.prompt-send-button\s*\{/g) || [];
  assert.equal(sendMatches.length, 1, '.prompt-send-button should appear exactly once');
});

test('prompt-card.css includes upload and attach styles (from most complete version)', () => {
  const css = readCSS('prompt-card.css');
  assert.ok(css.includes('.prompt-upload-button'), 'should have upload button');
  assert.ok(css.includes('.prompt-attach-chip'), 'should have attach chip');
  assert.ok(css.includes('.prompt-attach-remove'), 'should have attach remove');
  assert.ok(css.includes('.prompt-textarea-dragover'), 'should have dragover style');
  assert.ok(css.includes('.prompt-mode-button'), 'should have mode toggle');
  assert.ok(css.includes('.prompt-session-id'), 'should have session id');
});

test('responsive.css contains @media queries only', () => {
  const css = readCSS('responsive.css');
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  // All rule blocks should be inside @media
  assert.ok(stripped.includes('@media'), 'should contain @media queries');
  // Should not have top-level selectors outside @media
  const outsideMedia = stripped.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '').trim();
  assert.equal(outsideMedia, '', 'should have no rules outside @media blocks');
});

test('every JS card module has a corresponding CSS module file', () => {
  const jsDir = path.join(__dirname, '..', 'public', 'js');
  for (const [jsFile, cssFile] of Object.entries(JS_CSS_MAP)) {
    const jsExists = fs.existsSync(path.join(jsDir, jsFile));
    if (jsExists) {
      assert.ok(
        fs.existsSync(path.join(CSS_DIR, cssFile)),
        `CSS module ${cssFile} should exist for JS module ${jsFile}`
      );
    }
  }
});

test('no selector appears in more than one module (excluding theme-light.css)', () => {
  const selectorMap = new Map(); // selector → [files]
  const nonThemeModules = EXPECTED_MODULES.filter(m => m !== 'theme-light.css' && m !== 'responsive.css');

  for (const mod of nonThemeModules) {
    const css = readCSS(mod);
    const selectors = extractSelectors(css);
    for (const sel of selectors) {
      // Normalize: trim and collapse whitespace
      const normalized = sel.replace(/\s+/g, ' ').trim();
      if (!selectorMap.has(normalized)) {
        selectorMap.set(normalized, []);
      }
      selectorMap.get(normalized).push(mod);
    }
  }

  const duplicates = [];
  for (const [sel, files] of selectorMap) {
    if (files.length > 1) {
      duplicates.push(`"${sel}" in [${files.join(', ')}]`);
    }
  }

  assert.equal(
    duplicates.length, 0,
    `Selectors should not be duplicated across modules:\n${duplicates.join('\n')}`
  );
});

test('all CSS files have balanced braces', () => {
  for (const mod of EXPECTED_MODULES) {
    const css = readCSS(mod);
    // Strip comments and strings
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
    const opens = (stripped.match(/\{/g) || []).length;
    const closes = (stripped.match(/\}/g) || []).length;
    assert.equal(opens, closes, `${mod} should have balanced braces (open: ${opens}, close: ${closes})`);
  }
});

test('no module contains @import url (only style.css should)', () => {
  for (const mod of EXPECTED_MODULES) {
    const css = readCSS(mod);
    assert.ok(
      !css.includes('@import'),
      `${mod} should not contain @import — only style.css should import modules`
    );
  }
});
