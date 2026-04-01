(function attachOutputUtils() {
  const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
  // Also match OSC sequences (e.g. title set), DCS, and other C1 escapes
  const EXTRA_ESC_PATTERN = /\u001b[\]P^_][^\u001b\u0007]*[\u0007\u001b\\]?/g;
  const DEFAULT_BUFFER_LIMIT = 24000;
  const DEFAULT_RECENT_TEXT_LIMIT = 8000;

  // Box drawing & TUI decoration characters
  const BOX_CHARS = /[╭╮╰╯│─┌┐└┘├┤┬┴┼║═╔╗╚╝╠╣╦╩╬▐▛▜▝▘▞▟█▀▄▌▍▎▏░▒▓┃┅┇┉┋╌╍╎╏]/g;

  // Lines that are purely decorative (only box chars, dashes, spaces, thin symbols)
  const DECORATIVE_LINE = /^[\s╭╮╰╯│─┌┐└┘├┤┬┴┼║═╔╗╚╝╠╣╦╩╬▐▛▜▝▘▞▟█▀▄▌▍▎▏░▒▓┃┅┇┉┋╌╍╎╏·•\-=_+*~]+$/;

  // Claude Code spinner/thinking animation patterns — always dropped (even if they
  // contain ⏺ or other "meaningful" characters, since they are never real content).
  // These are checked BEFORE the MEANINGFUL_LINE guard so they always get filtered.
  const SPINNER_PATTERNS = [
    // Any line starting with spinner-only Unicode symbols (✳✢✶✻✽) — these NEVER
    // appear in real content, only in Claude Code's thinking animation.
    // Catches full words (✳Boondoggling…) AND partial fragments (✳A, ✳Av, ✳Boo)
    /^[✳✢✶✻✽]/,
    // Spinner word lines with other symbol prefixes + capitalised word + "…"
    /^[·+◐◑◒◓⏺●■□▪▫★☆⊙⊚⊛⊜∙∘○◉◎\s]*[A-Z][a-z]+…/,
    // "(thinking with <effort> effort)" — standalone or trailing
    /\(thinking\s+with\s+\w+\s+effort\)/i,
    // Effort mode indicators: "medium·/effort", "⏺ medium · /effort", "◐ high · /effort"
    /^[⏺●◐◑◒◓\s·]*(?:low|medium|high|max)\s*[·\s]*\/?effort/i,
    // "esc to interrupt" status line
    /esc\s*to\s*interrupt/i,
    // Bare spinner words without the trailing …  (e.g. "Boondoggling" on its own line)
    // Exclude known block markers: "Agent", "Read", "Edit", "Write", "Bash", "Grep", "Glob"
    /^[·+◐◑◒◓⏺●\s]*(?!Agent|Read|Edit|Write|Bash|Grep|Glob|Task|Search|Plan)[A-Z][a-z]{3,}[.…]*$/,
    // Asterisk-prefixed short fragments — spinner word fragments after ANSI stripping
    // (e.g. *avni, *ng, *g, *ee — partial spinner words where ✳ became *)
    /^[*][a-z]{1,6}[.…]*$/,
    // Lines that are just a symbol + whitespace (spinner frame remnants)
    /^[✳✢✶✻✽·+◐◑◒◓●■□▪▫★☆⊙⊚⊛⊜∙∘○◉◎\s]+$/,
  ];

  // Known TUI chrome patterns (Claude Code UI, status bars, etc.)
  const TUI_CHROME_PATTERNS = [
    /^ClaudeCode\s*v/i,
    /^Opus\s+\d/i,
    /^Sonnet\s+\d/i,
    /^Haiku\s+\d/i,
    /Claude\s*Max/i,
    /^Welcome\s*back/i,
    /Tips\s*for\s*getting/i,
    /^Run\s*\/init\s*to/i,
    /^Note:\s*You\s*have/i,
    /^Recent\s*activity/i,
    /^No\s*recent\s*activity/i,
    /^\?\s*for\s*shortcuts/i,
    /^Update\s*available/i,
    /^brew\s*upgrade\s*claude/i,
    /context\)\s*with\s*me/i,
    /^\/Users\/\w+/,               // macOS home path artifacts
    /^[A-Z]:\\Users\\/i,           // Windows home path artifacts
    /^[A-Za-z][\w\s-]*[A-Za-z]$/, // Bare name lines (e.g. "Jen-YuehHsiao") - no CJK, no punctuation
    /Image\s+in\s+clipboard/i,    // System clipboard notification
    /ctrl\+v\s+to\s+paste/i,      // System paste hint
  ];

  // But keep lines that contain CJK characters or meaningful prompt markers
  const MEANINGFUL_LINE = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff❯>⏺●]/;

  function stripAnsi(text = '') {
    return String(text)
      .replace(ANSI_PATTERN, '')
      .replace(EXTRA_ESC_PATTERN, '');
  }

  function clampOutput(text = '', limit = DEFAULT_BUFFER_LIMIT) {
    return String(text).slice(-limit);
  }

  /**
   * Strip ANSI + normalize newlines only — preserves all text content.
   * Used for raw terminal mirroring.
   */
  function toPlainText(text = '', limit = DEFAULT_RECENT_TEXT_LIMIT) {
    return stripAnsi(clampOutput(text, limit))
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Aggressively clean TUI output to extract only meaningful agent content.
   * Strips box drawing, decorative lines, and known TUI chrome patterns.
   * Designed for Agent Output Card display.
   */
  function extractAgentContent(text = '', limit = DEFAULT_RECENT_TEXT_LIMIT) {
    const plain = stripAnsi(clampOutput(text, limit));

    const lines = plain
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => {
        // Remove box-drawing chars, then trim
        return line.replace(BOX_CHARS, ' ').replace(/\s{2,}/g, ' ').trim();
      });

    const filtered = lines.filter((line) => {
      if (!line) return false;
      // Drop lines that are purely decorative
      if (DECORATIVE_LINE.test(line)) return false;
      // Drop spinner/thinking animations — checked BEFORE MEANINGFUL_LINE
      // because spinner lines can contain ⏺ or other "meaningful" chars
      if (SPINNER_PATTERNS.some((pat) => pat.test(line))) return false;
      // Drop known TUI chrome, but preserve lines with meaningful content (CJK, prompts)
      if (!MEANINGFUL_LINE.test(line) && TUI_CHROME_PATTERNS.some((pat) => pat.test(line))) return false;
      // Drop very short lines (≤2 chars) — only keep CJK characters
      if (line.length <= 2 && !/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(line)) return false;
      return true;
    });

    return filtered
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Extract structured conversation blocks from agent output.
   * Returns array of { role: 'user'|'agent'|'system', text: string } objects.
   */
  function parseAgentBlocks(text = '') {
    const clean = extractAgentContent(text);
    const blocks = [];
    let currentBlock = null;

    clean.split('\n').forEach((line) => {
      // User prompt line (❯ or > prefix)
      if (/^[❯>]\s+/.test(line)) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { role: 'user', text: line.replace(/^[❯>]\s+/, '') };
        return;
      }
      // Agent response line (⏺ prefix used by Claude Code)
      // But skip if the remainder is an effort/spinner artifact (e.g. "⏺medium·/effort")
      if (/^[⏺●]\s*/.test(line)) {
        const body = line.replace(/^[⏺●]\s*/, '').trim();
        if (!body || /^(?:low|medium|high|max)\s*[·\s]*\/?effort/i.test(body)) return;
        if (currentBlock) blocks.push(currentBlock);
        // "⏺ Agent" is just a block marker — start a new agent block with empty text
        // Real content will follow on subsequent lines
        const isMarkerOnly = /^Agent$/i.test(body);
        currentBlock = { role: 'agent', text: isMarkerOnly ? '' : body };
        return;
      }
      // Continuation of current block
      if (currentBlock) {
        currentBlock.text += '\n' + line;
      } else {
        // Unattributed text — treat as agent output
        currentBlock = { role: 'agent', text: line };
      }
    });

    if (currentBlock) blocks.push(currentBlock);

    // Trim all block text
    return blocks.map((b) => ({ ...b, text: b.text.trim() })).filter((b) => b.text);
  }

  /**
   * Detect the current phase of the agent from the raw terminal buffer tail.
   *
   * Returns one of:
   *   'idle'      — prompt visible, user hasn't typed yet or terminal is quiet
   *   'input'     — user is currently typing a prompt (❯ line at the end, no agent block after)
   *   'thinking'  — agent is processing (spinner / thinking lines at the tail)
   *   'responding' — agent is actively streaming a response (⏺ block with real text at tail)
   *   'done'      — agent finished responding (real content present, no spinner at tail)
   */
  function detectAgentPhase(rawText = '') {
    const plain = stripAnsi(rawText);
    // Take the last ~40 non-empty lines for tail analysis
    const tailLines = plain
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((l) => l.replace(BOX_CHARS, ' ').replace(/\s{2,}/g, ' ').trim())
      .filter(Boolean)
      .slice(-40);

    if (!tailLines.length) return 'idle';

    // Walk backwards from the tail to find the latest meaningful signal
    let sawSpinner = false;
    let sawAgentContent = false;
    let sawUserPrompt = false;

    for (let i = tailLines.length - 1; i >= 0 && i >= tailLines.length - 20; i--) {
      const line = tailLines[i];

      const isSpinner = SPINNER_PATTERNS.some((pat) => pat.test(line));
      const isDecorative = DECORATIVE_LINE.test(line);
      const isChrome = !MEANINGFUL_LINE.test(line) &&
        TUI_CHROME_PATTERNS.some((pat) => pat.test(line));

      if (isSpinner || isDecorative || isChrome) {
        if (isSpinner) sawSpinner = true;
        continue;
      }

      // Real content line — what kind?
      if (/^[❯>]\s*/.test(line)) {
        sawUserPrompt = true;
        break;
      }
      if (/^[⏺●]\s*/.test(line)) {
        const body = line.replace(/^[⏺●]\s*/, '').trim();
        if (body && !/^(?:low|medium|high|max)\s*[·\s]*\/?effort/i.test(body)) {
          sawAgentContent = true;
        }
        break;
      }
      // Some real text without a marker — likely part of an ongoing agent response
      sawAgentContent = true;
      break;
    }

    if (sawSpinner && !sawAgentContent) return 'thinking';
    if (sawUserPrompt && !sawAgentContent) return 'input';
    if (sawAgentContent && sawSpinner) return 'responding';
    if (sawAgentContent) return 'done';
    return 'idle';
  }

  function summarizeOutput(text = '', limit = 120) {
    // Try extracting clean content first
    const clean = extractAgentContent(text);
    if (clean) {
      const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
      return lines[lines.length - 1]?.slice(0, limit) || '';
    }

    // Fallback to basic stripping
    const basic = stripAnsi(text)
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return basic[basic.length - 1]?.slice(0, limit) || '';
  }

  window.OutputUtils = {
    DEFAULT_BUFFER_LIMIT,
    DEFAULT_RECENT_TEXT_LIMIT,
    stripAnsi,
    clampOutput,
    toPlainText,
    extractAgentContent,
    parseAgentBlocks,
    detectAgentPhase,
    summarizeOutput,
  };
})();
