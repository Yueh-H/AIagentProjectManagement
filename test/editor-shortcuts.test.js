const test = require('node:test')
const assert = require('node:assert/strict')

const EditorShortcuts = require('../public/js/editor-shortcuts.js')

test('Cmd/Ctrl+B wraps the selected text in markdown bold markers', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    code: 'KeyB',
  })

  const edit = EditorShortcuts.applyShortcutEdit({
    value: 'hello world',
    selectionStart: 6,
    selectionEnd: 11,
  }, shortcut)

  assert.deepEqual(edit, {
    value: 'hello **world**',
    selectionStart: 8,
    selectionEnd: 13,
  })
})

test('Cmd/Ctrl+U wraps the selected text in underline tags', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    code: 'KeyU',
  })

  const edit = EditorShortcuts.applyShortcutEdit({
    value: 'note',
    selectionStart: 0,
    selectionEnd: 4,
  }, shortcut)

  assert.deepEqual(edit, {
    value: '<u>note</u>',
    selectionStart: 3,
    selectionEnd: 7,
  })
})

test('Cmd/Ctrl+option/shift+1 converts the current line into a level-1 heading', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    code: 'Digit1',
  })

  const edit = EditorShortcuts.applyShortcutEdit({
    value: 'Launch plan',
    selectionStart: 6,
    selectionEnd: 6,
  }, shortcut)

  assert.deepEqual(edit, {
    value: '# Launch plan',
    selectionStart: 13,
    selectionEnd: 13,
  })
})

test('Cmd/Ctrl+option/shift+2 inserts a heading prefix on an empty line', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    code: 'Digit2',
  })

  const edit = EditorShortcuts.applyShortcutEdit({
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
  }, shortcut)

  assert.deepEqual(edit, {
    value: '## ',
    selectionStart: 3,
    selectionEnd: 3,
  })
})

test('Cmd/Ctrl+option/shift+4 converts selected lines into checklist items', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    code: 'Digit4',
  })

  const edit = EditorShortcuts.applyShortcutEdit({
    value: '# One\n- Two\n3. Three',
    selectionStart: 0,
    selectionEnd: '# One\n- Two\n3. Three'.length,
  }, shortcut)

  assert.deepEqual(edit, {
    value: '- [ ] One\n- [ ] Two\n- [ ] Three',
    selectionStart: 0,
    selectionEnd: '- [ ] One\n- [ ] Two\n- [ ] Three'.length,
  })
})

test('Cmd/Ctrl+option/shift+7 no longer maps to a block shortcut', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    code: 'Digit7',
  })

  assert.equal(shortcut, null)
})

test('Cmd/Ctrl+option/shift+8 converts the current block into a fenced code block', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    code: 'Digit8',
  })

  const edit = EditorShortcuts.applyShortcutEdit({
    value: '## npm test',
    selectionStart: 5,
    selectionEnd: 5,
  }, shortcut)

  assert.deepEqual(edit, {
    value: '```\nnpm test\n```',
    selectionStart: 12,
    selectionEnd: 12,
  })
})

test('Cmd/Ctrl+option/shift+9 converts the current block into a math block', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    code: 'Digit9',
  })

  const edit = EditorShortcuts.applyShortcutEdit({
    value: 'x^2 + y^2 = z^2',
    selectionStart: 3,
    selectionEnd: 3,
  }, shortcut)

  assert.deepEqual(edit, {
    value: '$$\nx^2 + y^2 = z^2\n$$',
    selectionStart: 18,
    selectionEnd: 18,
  })
})

test('Cmd/Ctrl+option/shift+0 strips known block syntax back to plain text', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    code: 'Digit0',
  })

  const edit = EditorShortcuts.applyShortcutEdit({
    value: '- [ ] Keep exact markdown',
    selectionStart: 0,
    selectionEnd: 0,
  }, shortcut)

  assert.deepEqual(edit, {
    value: 'Keep exact markdown',
    selectionStart: 'Keep exact markdown'.length,
    selectionEnd: 'Keep exact markdown'.length,
  })
})

test('WYSIWYG shortcut handler maps Cmd/Ctrl+B to the bold command', () => {
  const commands = []
  const handled = EditorShortcuts.handleToastUiEditorKeydown({
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    code: 'KeyB',
    preventDefault() {},
    stopPropagation() {},
  }, {
    exec(command, payload) {
      commands.push({ command, payload })
    },
  })

  assert.equal(handled, true)
  assert.deepEqual(commands, [{ command: 'bold', payload: undefined }])
})

test('WYSIWYG shortcut handler maps paragraph and custom blocks to editor commands', () => {
  const commands = []
  const editor = {
    exec(command, payload) {
      commands.push({ command, payload })
    },
  }

  EditorShortcuts.handleToastUiEditorKeydown({
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    code: 'Digit0',
    preventDefault() {},
    stopPropagation() {},
  }, editor)

  EditorShortcuts.handleToastUiEditorKeydown({
    ctrlKey: true,
    metaKey: false,
    altKey: true,
    shiftKey: false,
    code: 'Digit9',
    preventDefault() {},
    stopPropagation() {},
  }, editor)

  assert.deepEqual(commands, [
    { command: 'heading', payload: { level: 0 } },
    { command: 'customBlock', payload: { info: 'math' } },
  ])
})

test('shifted digit shortcuts still resolve from legacy keyCode fallback', () => {
  const shortcut = EditorShortcuts.getShortcutFromEvent({
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: true,
    key: '$',
    keyCode: 52,
  })

  assert.deepEqual(shortcut, { kind: 'block', blockType: 'checklist' })
})
