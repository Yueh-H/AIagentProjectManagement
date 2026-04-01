const INLINE_SHORTCUTS = Object.freeze({
  KeyB: Object.freeze({ kind: 'inline', style: 'bold', prefix: '**', suffix: '**' }),
  KeyI: Object.freeze({ kind: 'inline', style: 'italic', prefix: '*', suffix: '*' }),
  KeyU: Object.freeze({ kind: 'inline', style: 'underline', prefix: '<u>', suffix: '</u>' }),
})

const BLOCK_SHORTCUTS = Object.freeze({
  '0': Object.freeze({ kind: 'block', blockType: 'paragraph' }),
  '1': Object.freeze({ kind: 'block', blockType: 'heading-1' }),
  '2': Object.freeze({ kind: 'block', blockType: 'heading-2' }),
  '3': Object.freeze({ kind: 'block', blockType: 'heading-3' }),
  '4': Object.freeze({ kind: 'block', blockType: 'checklist' }),
  '5': Object.freeze({ kind: 'block', blockType: 'unordered-list' }),
  '6': Object.freeze({ kind: 'block', blockType: 'ordered-list' }),
  '8': Object.freeze({ kind: 'block', blockType: 'code-block' }),
  '9': Object.freeze({ kind: 'block', blockType: 'math-block' }),
})

const SHIFT_DIGIT_FALLBACKS = Object.freeze({
  ')': '0',
  '!': '1',
  '@': '2',
  '#': '3',
  '$': '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
})

const KEYCODE_DIGIT_FALLBACKS = Object.freeze({
  48: '0',
  49: '1',
  50: '2',
  51: '3',
  52: '4',
  53: '5',
  54: '6',
  55: '7',
  56: '8',
  57: '9',
  96: '0',
  97: '1',
  98: '2',
  99: '3',
  100: '4',
  101: '5',
  102: '6',
  103: '7',
  104: '8',
  105: '9',
})

function hasPrimaryModifier(event) {
  return Boolean(event?.metaKey || event?.ctrlKey)
}

function normalizeSelectionRange(selectionStart = 0, selectionEnd = selectionStart) {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd))
  const end = Math.max(0, Math.max(selectionStart, selectionEnd))
  return { start, end, isCollapsed: start === end }
}

function getShortcutCode(event) {
  if (typeof event?.code === 'string' && event.code) {
    if (/^Digit\d$/.test(event.code)) return event.code.slice(-1)
    if (/^Numpad\d$/.test(event.code)) return event.code.slice(-1)
    return event.code
  }

  if (typeof event?.key !== 'string' || !event.key) return ''
  if (/^\d$/.test(event.key)) return event.key
  if (SHIFT_DIGIT_FALLBACKS[event.key]) return SHIFT_DIGIT_FALLBACKS[event.key]
  const legacyKeyCode = Number.isFinite(event?.which) ? event.which : event?.keyCode
  if (KEYCODE_DIGIT_FALLBACKS[legacyKeyCode]) return KEYCODE_DIGIT_FALLBACKS[legacyKeyCode]
  return `Key${event.key.toUpperCase()}`
}

function getShortcutFromEvent(event) {
  if (!event || event.isComposing || event.repeat || !hasPrimaryModifier(event)) return null

  const code = getShortcutCode(event)
  if (!code) return null

  if (!event.altKey && !event.shiftKey) {
    return INLINE_SHORTCUTS[code] || null
  }

  if (!event.altKey && !event.shiftKey) return null
  return BLOCK_SHORTCUTS[code] || null
}

function replaceRange(value, start, end, replacement) {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`
}

function wrapSelection(state, { prefix, suffix }) {
  const value = typeof state?.value === 'string' ? state.value : ''
  const { start, end, isCollapsed } = normalizeSelectionRange(state?.selectionStart, state?.selectionEnd)
  const selectedText = value.slice(start, end)
  const replacement = `${prefix}${selectedText}${suffix}`

  return {
    value: replaceRange(value, start, end, replacement),
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + (isCollapsed ? 0 : selectedText.length),
  }
}

function getSelectedLineRange(value, selectionStart, selectionEnd) {
  const { start, end } = normalizeSelectionRange(selectionStart, selectionEnd)
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEndAnchor = end > start && value[end - 1] === '\n'
    ? end - 1
    : end
  const nextLineBreak = value.indexOf('\n', lineEndAnchor)
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak

  return { lineStart, lineEnd }
}

function unwrapFencedBlock(text) {
  const trimmed = text.trim()
  if (!trimmed) return null

  const codeMatch = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n```$/)
  if (codeMatch) return codeMatch[1]

  const mathMatch = trimmed.match(/^\$\$\n([\s\S]*?)\n\$\$$/)
  if (mathMatch) return mathMatch[1]

  return null
}

function unwrapToggleBlock(text) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('<details>') || !trimmed.endsWith('</details>')) return null

  const match = trimmed.match(/^<details>\s*\n<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)\n<\/details>$/)
  if (!match) return null

  const summary = match[1]
  const body = match[2].replace(/^\n+/, '').replace(/\n+$/, '')
  return body ? `${summary}\n${body}` : summary
}

function stripLineBlockSyntax(line) {
  const trimmed = line.trim()
  if (!trimmed) return ''

  return trimmed
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/^[-+*]\s+\[(?: |x|X)\]\s+/, '')
    .replace(/^[-+*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
}

function normalizeBlockText(text) {
  let next = typeof text === 'string' ? text : ''
  next = unwrapToggleBlock(next) || next
  next = unwrapFencedBlock(next) || next
  return next.split('\n').map(stripLineBlockSyntax).join('\n')
}

function trimEdgeBlankLines(text) {
  return text.replace(/^\n+/, '').replace(/\n+$/, '')
}

function formatLineBlock(text, formatter) {
  const lines = normalizeBlockText(text).split('\n')
  const nextText = formatter(lines)

  return {
    text: nextText,
    cursorOffset: nextText.length,
  }
}

function formatPrefixedLines(lines, prefix) {
  if (lines.length === 1 && !lines[0]) {
    return prefix
  }

  return lines.map((line) => (line ? `${prefix}${line}` : '')).join('\n')
}

function formatOrderedList(lines) {
  if (lines.length === 1 && !lines[0]) {
    return '1. '
  }

  let index = 1
  return lines.map((line) => {
    if (!line) return ''
    const nextLine = `${index}. ${line}`
    index += 1
    return nextLine
  }).join('\n')
}

function formatToggleBlock(text) {
  const normalized = trimEdgeBlankLines(normalizeBlockText(text))
  const lines = normalized ? normalized.split('\n') : []
  const summaryIndex = lines.findIndex((line) => line.trim())
  const summary = summaryIndex === -1 ? 'Toggle' : lines[summaryIndex]
  const body = summaryIndex === -1
    ? ''
    : trimEdgeBlankLines(lines.slice(summaryIndex + 1).join('\n'))

  const nextText = body
    ? `<details>\n<summary>${summary}</summary>\n\n${body}\n</details>`
    : `<details>\n<summary>${summary}</summary>\n\n</details>`

  return {
    text: nextText,
    cursorOffset: body
      ? nextText.length - '\n</details>'.length
      : '<details>\n<summary>'.length + summary.length,
  }
}

function formatFencedBlock(text, fence) {
  const content = trimEdgeBlankLines(normalizeBlockText(text))
  const nextText = `${fence}\n${content}\n${fence}`

  return {
    text: nextText,
    cursorOffset: fence.length + 1 + content.length,
  }
}

function formatBlockText(text, blockType) {
  switch (blockType) {
    case 'paragraph':
      return formatLineBlock(text, (lines) => lines.join('\n'))
    case 'heading-1':
      return formatLineBlock(text, (lines) => formatPrefixedLines(lines, '# '))
    case 'heading-2':
      return formatLineBlock(text, (lines) => formatPrefixedLines(lines, '## '))
    case 'heading-3':
      return formatLineBlock(text, (lines) => formatPrefixedLines(lines, '### '))
    case 'checklist':
      return formatLineBlock(text, (lines) => formatPrefixedLines(lines, '- [ ] '))
    case 'unordered-list':
      return formatLineBlock(text, (lines) => formatPrefixedLines(lines, '- '))
    case 'ordered-list':
      return formatLineBlock(text, formatOrderedList)
    case 'toggle-list':
      return formatToggleBlock(text)
    case 'code-block':
      return formatFencedBlock(text, '```')
    case 'math-block':
      return formatFencedBlock(text, '$$')
    default:
      return {
        text: typeof text === 'string' ? text : '',
        cursorOffset: 0,
      }
  }
}

function replaceSelectedLines(state, shortcut) {
  const value = typeof state?.value === 'string' ? state.value : ''
  const { start, end, isCollapsed } = normalizeSelectionRange(state?.selectionStart, state?.selectionEnd)
  const { lineStart, lineEnd } = getSelectedLineRange(value, start, end)
  const selectedBlock = value.slice(lineStart, lineEnd)
  const nextBlock = formatBlockText(selectedBlock, shortcut.blockType)

  return {
    value: replaceRange(value, lineStart, lineEnd, nextBlock.text),
    selectionStart: lineStart + (isCollapsed ? nextBlock.cursorOffset : 0),
    selectionEnd: lineStart + (isCollapsed ? nextBlock.cursorOffset : nextBlock.text.length),
  }
}

function applyShortcutEdit(state, shortcut) {
  if (!shortcut) return null
  if (shortcut.kind === 'inline') return wrapSelection(state, shortcut)
  if (shortcut.kind === 'block') return replaceSelectedLines(state, shortcut)
  return null
}

function applyEditToTextarea(textarea, edit) {
  const scrollTop = textarea.scrollTop
  const scrollLeft = textarea.scrollLeft

  textarea.value = edit.value
  textarea.selectionStart = edit.selectionStart
  textarea.selectionEnd = edit.selectionEnd
  textarea.scrollTop = scrollTop
  textarea.scrollLeft = scrollLeft
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

function handleTextareaKeydown(event, textarea) {
  if (!textarea || textarea.readOnly || textarea.disabled) return false

  const shortcut = getShortcutFromEvent(event)
  if (!shortcut) return false

  const edit = applyShortcutEdit({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
  }, shortcut)

  event.preventDefault()
  if (edit) {
    applyEditToTextarea(textarea, edit)
  }
  return true
}

function applyShortcutToToastUiEditor(editor, shortcut) {
  if (!editor || typeof editor.exec !== 'function' || !shortcut) return false

  if (shortcut.kind === 'inline') {
    switch (shortcut.style) {
      case 'bold':
        editor.exec('bold')
        return true
      case 'italic':
        editor.exec('italic')
        return true
      case 'underline':
        editor.exec('underline')
        return true
      default:
        return false
    }
  }

  switch (shortcut.blockType) {
    case 'paragraph':
      editor.exec('heading', { level: 0 })
      return true
    case 'heading-1':
      editor.exec('heading', { level: 1 })
      return true
    case 'heading-2':
      editor.exec('heading', { level: 2 })
      return true
    case 'heading-3':
      editor.exec('heading', { level: 3 })
      return true
    case 'checklist':
      editor.exec('taskList')
      return true
    case 'unordered-list':
      editor.exec('bulletList')
      return true
    case 'ordered-list':
      editor.exec('orderedList')
      return true
    case 'toggle-list':
      editor.exec('customBlock', { info: 'toggle' })
      return true
    case 'code-block':
      editor.exec('codeBlock')
      return true
    case 'math-block':
      editor.exec('customBlock', { info: 'math' })
      return true
    default:
      return false
  }
}

function handleToastUiEditorKeydown(event, editor) {
  const shortcut = getShortcutFromEvent(event)
  if (!shortcut) return false

  const applied = applyShortcutToToastUiEditor(editor, shortcut)
  if (!applied) return false

  event.preventDefault?.()
  event.stopPropagation?.()
  return true
}

const EditorShortcuts = {
  getShortcutFromEvent,
  applyShortcutEdit,
  handleTextareaKeydown,
  applyShortcutToToastUiEditor,
  handleToastUiEditorKeydown,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EditorShortcuts
}

if (typeof window !== 'undefined') {
  window.EditorShortcuts = EditorShortcuts
}
