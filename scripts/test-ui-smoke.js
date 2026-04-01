const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const TEST_RESULTS_DIR = path.join(ROOT, 'test-results');
const MARKDOWN_VALUE = '# Handoff\n\n## Agent Output\n- Linked to Agent Shell\n- Streaming recent CLI text\n\n```bash\npnpm test\n```\n';
const MISSION_TITLE = '登入流程任務';
const MISSION_STATUS = '已完成 1/3，等待驗證環節確認。';
const MISSION_GOAL = '把任務卡整理成能一眼看懂目前狀況的格式。';
const MISSION_CRITERIA = [
  '卡片包含目標與完成標準',
  '可以清楚看到負責 terminal',
  'reload 後仍保留任務內容',
];
const MISSION_BLOCKERS = '需要兼顧舊版 mission data 的相容。';
const MISSION_NEXT = '跑 UI smoke test，確認 mission card 也能通過。';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matchesExpectedMarkdown(value) {
  const text = (value || '').trim();
  return text.includes('# Handoff')
    && text.includes('## Agent Output')
    && text.includes('Linked to Agent Shell')
    && text.includes('Streaming recent CLI text')
    && text.includes('```bash')
    && text.includes('pnpm test');
}

function onceMatchFromProcess(child, pattern, label, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);

    const onData = (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(pattern);
      if (match) {
        cleanup();
        resolve(match);
      }
    };

    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`${label} process exited early (code=${code}, signal=${signal})`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('exit', onExit);
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', onExit);
  });
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function waitFor(fn, label, timeoutMs = 15000, intervalMs = 250) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  throw lastError || new Error(`Timed out waiting for ${label}`);
}

async function connectToPageTarget(devtoolsHttpBase, pageUrl) {
  return waitFor(async () => {
    const pages = await fetch(`${devtoolsHttpBase}/json/list`).then((response) => response.json());
    return pages.find((page) => page.type === 'page' && page.url.startsWith(pageUrl)) || null;
  }, 'page target');
}

function createCdpClient(targetWsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(targetWsUrl);
    let nextId = 0;
    const pending = new Map();
    const eventWaiters = new Map();

    const cleanup = () => {
      for (const { reject: pendingReject } of pending.values()) {
        pendingReject(new Error('CDP connection closed'));
      }
      pending.clear();
      for (const waiters of eventWaiters.values()) {
        waiters.forEach(({ reject: waiterReject }) => waiterReject(new Error('CDP connection closed')));
      }
      eventWaiters.clear();
    };

    ws.onerror = reject;

    ws.onclose = () => {
      cleanup();
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.id) {
        const pendingRequest = pending.get(message.id);
        if (!pendingRequest) return;
        pending.delete(message.id);
        if (message.error) {
          pendingRequest.reject(new Error(message.error.message));
        } else {
          pendingRequest.resolve(message.result);
        }
        return;
      }

      const waiters = eventWaiters.get(message.method);
      if (waiters?.length) {
        eventWaiters.delete(message.method);
        waiters.forEach(({ resolve: waiterResolve }) => waiterResolve(message.params));
      }
    };

    ws.onopen = () => {
      const send = (method, params = {}) => new Promise((sendResolve, sendReject) => {
        const id = ++nextId;
        pending.set(id, { resolve: sendResolve, reject: sendReject });
        ws.send(JSON.stringify({ id, method, params }));
      });

      const waitForEvent = (method) => new Promise((eventResolve, eventReject) => {
        const waiters = eventWaiters.get(method) || [];
        waiters.push({ resolve: eventResolve, reject: eventReject });
        eventWaiters.set(method, waiters);
      });

      const evaluate = async (expression) => {
        const result = await send('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        return result.result?.value;
      };

      resolve({
        send,
        waitForEvent,
        evaluate,
        close: () => ws.close(),
      });
    };
  });
}

async function run() {
  await fsp.mkdir(TEST_RESULTS_DIR, { recursive: true });

  const chromeBin = findChromeBinary();
  if (!chromeBin) {
    throw new Error('Could not find a Chrome-compatible browser. Set CHROME_BIN to your browser executable.');
  }

  const chromeProfileDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'web-terminal-smoke-chrome-'));
  const screenshotPath = path.join(TEST_RESULTS_DIR, 'ui-smoke-cards.png');

  let serverProcess;
  let chromeProcess;
  let cdp;

  async function stopChildProcess(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;

    child.kill('SIGTERM');
    const exited = await Promise.race([
      new Promise((resolve) => child.once('exit', () => resolve(true))),
      sleep(1000).then(() => false),
    ]);

    if (!exited && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }

  try {
    serverProcess = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const serverMatch = await onceMatchFromProcess(
      serverProcess,
      /Web Terminal running at (http:\/\/localhost:\d+)/,
      'web terminal server'
    );
    const serverUrl = serverMatch[1];

    chromeProcess = spawn(chromeBin, [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--remote-debugging-port=0',
      `--user-data-dir=${chromeProfileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      serverUrl,
    ], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const devtoolsMatch = await onceMatchFromProcess(
      chromeProcess,
      /DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+)/,
      'headless chrome'
    );
    const devtoolsHttpBase = `http://127.0.0.1:${devtoolsMatch[2]}`;
    const pageTarget = await connectToPageTarget(devtoolsHttpBase, serverUrl);

    cdp = await createCdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.bringToFront');

    if ((await cdp.evaluate('document.readyState')) !== 'complete') {
      await cdp.waitForEvent('Page.loadEventFired');
    }

    await waitFor(async () => {
      const snapshot = await cdp.evaluate(`(() => ({
        terminalReady: !!document.querySelector('.pane-wrapper[data-card-type="terminal"]'),
        agentOutputButtonReady: !!document.getElementById('btn-agent-output-card'),
        missionButtonReady: !!document.getElementById('btn-mission-card'),
        markdownButtonReady: !!document.getElementById('btn-markdown-card'),
      }))()`);

      if (snapshot?.terminalReady && snapshot.agentOutputButtonReady && snapshot.missionButtonReady && snapshot.markdownButtonReady) {
        return snapshot;
      }

      return null;
    }, 'initial terminal card');

    await cdp.evaluate(`(() => {
      const setPaneTitle = (selector, value) => {
        const pane = document.querySelector(selector);
        const titleDisplay = pane?.querySelector('.pane-title-display');
        const titleInput = pane?.querySelector('.pane-title-input');
        if (titleDisplay) titleDisplay.textContent = value;
        if (titleInput) {
          titleInput.value = value;
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
          titleInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      };

      setPaneTitle('.pane-wrapper[data-card-type="terminal"]', 'Agent Shell');

      document.getElementById('btn-agent-output-card')?.click();
      document.getElementById('btn-mission-card')?.click();
      document.getElementById('btn-markdown-card')?.click();
    })()`);

    await waitFor(async () => {
      const snapshot = await cdp.evaluate(`(() => ({
        agentCardReady: !!document.querySelector('.pane-wrapper[data-card-type="agent-output"]'),
        missionCardReady: !!document.querySelector('.pane-wrapper[data-card-type="mission"]'),
        markdownCardReady: !!document.querySelector('.pane-wrapper[data-card-type="markdown"]'),
        sourceOptionCount: document.querySelector('.agent-card-select')?.options?.length || 0,
        missionSourceOptionCount: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-source-select')?.options?.length || 0,
      }))()`);

      if (
        snapshot?.agentCardReady
        && snapshot.missionCardReady
        && snapshot.markdownCardReady
        && snapshot.sourceOptionCount > 1
        && snapshot.missionSourceOptionCount > 1
      ) {
        return snapshot;
      }

      return null;
    }, 'new cards and terminal source options');

    await cdp.evaluate(`(() => {
      const setPaneTitle = (pane, value) => {
        const titleDisplay = pane?.querySelector('.pane-title-display');
        const titleInput = pane?.querySelector('.pane-title-input');
        if (titleDisplay) titleDisplay.textContent = value;
        if (titleInput) {
          titleInput.value = value;
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
          titleInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      };

      const agentCard = document.querySelector('.pane-wrapper[data-card-type="agent-output"]');
      const missionCard = document.querySelector('.pane-wrapper[data-card-type="mission"]');
      const markdownCard = document.querySelector('.pane-wrapper[data-card-type="markdown"]');

      setPaneTitle(agentCard, 'Claude Feed');
      setPaneTitle(missionCard, ${JSON.stringify(MISSION_TITLE)});

      const agentNameInput = agentCard?.querySelector('.agent-card-input');
      if (agentNameInput) {
        agentNameInput.value = 'claude-code';
        agentNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const sourceSelect = agentCard?.querySelector('.agent-card-select');
      if (sourceSelect && sourceSelect.options.length > 1) {
        sourceSelect.value = sourceSelect.options[1].value;
        sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const missionStatusInput = missionCard?.querySelector('.mission-status-summary-input');
      if (missionStatusInput) {
        missionStatusInput.value = ${JSON.stringify(MISSION_STATUS)};
        missionStatusInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const missionGoalInput = missionCard?.querySelector('.mission-text-section .mission-text-input');
      if (missionGoalInput) {
        missionGoalInput.value = ${JSON.stringify(MISSION_GOAL)};
        missionGoalInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const missionChecklistInputs = missionCard?.querySelectorAll('.mission-checklist-input') || [];
      missionChecklistInputs.forEach((input, index) => {
        const nextValue = ${JSON.stringify(MISSION_CRITERIA)}[index];
        if (!nextValue) return;
        input.value = nextValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const missionChecklistToggle = missionCard?.querySelector('.mission-checklist-toggle');
      if (missionChecklistToggle) {
        missionChecklistToggle.checked = true;
        missionChecklistToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const missionDetailInputs = missionCard?.querySelectorAll('.mission-detail-grid .mission-text-input') || [];
      if (missionDetailInputs[0]) {
        missionDetailInputs[0].value = ${JSON.stringify(MISSION_BLOCKERS)};
        missionDetailInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (missionDetailInputs[1]) {
        missionDetailInputs[1].value = ${JSON.stringify(MISSION_NEXT)};
        missionDetailInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }

      const missionSourceSelect = missionCard?.querySelector('.mission-source-select');
      if (missionSourceSelect && missionSourceSelect.options.length > 1) {
        missionSourceSelect.value = missionSourceSelect.options[1].value;
        missionSourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setPaneTitle(markdownCard, 'handoff.md');

      const markdownEditor = markdownCard?._markdownEditor;
      if (markdownEditor) {
        markdownEditor.setMarkdown('Shortcut heading', false);
        markdownEditor.changeMode?.('wysiwyg', true);
        markdownEditor.focus();

        markdownCard
          ?.querySelector('.toastui-editor-ww-container .ProseMirror')
          ?.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            altKey: true,
            code: 'Digit1',
            key: '1',
          }));

        const toolbar = markdownCard?.querySelector('.toastui-editor-defaultUI-toolbar');
        markdownCard.dataset.shortcutMarkdown = markdownEditor.getMarkdown();
        markdownCard.dataset.toolbarDisplay = toolbar ? getComputedStyle(toolbar).display : 'missing';
        markdownEditor.setMarkdown(${JSON.stringify(MARKDOWN_VALUE)}, false);
      }
    })()`);

    let lastBeforeReloadSnapshot = null;
    let beforeReload;

    try {
      beforeReload = await waitFor(async () => {
        const snapshot = await cdp.evaluate(`(() => ({
        cardTypes: [...document.querySelectorAll('.pane-wrapper')].map((node) => node.dataset.cardType),
        agentSource: document.querySelector('.agent-card-select')?.value || '',
        agentOutput: document.querySelector('.agent-card-output')?.textContent || '',
        missionTitle: document.querySelector('.pane-wrapper[data-card-type="mission"] .pane-title-input')?.value || '',
        missionStatus: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-status-summary-input')?.value || '',
        missionGoal: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-text-section .mission-text-input')?.value || '',
        missionChecklist: [...document.querySelectorAll('.pane-wrapper[data-card-type="mission"] .mission-checklist-input')].map((input) => input.value),
        missionChecklistDone: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-checklist-toggle')?.checked || false,
        missionBlockers: document.querySelectorAll('.pane-wrapper[data-card-type="mission"] .mission-detail-grid .mission-text-input')[0]?.value || '',
        missionNext: document.querySelectorAll('.pane-wrapper[data-card-type="mission"] .mission-detail-grid .mission-text-input')[1]?.value || '',
        missionSource: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-source-select')?.value || '',
        missionHasOutputPreview: !!document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-output-preview'),
        markdown: document.querySelector('.pane-wrapper[data-card-type="markdown"]')?._markdownEditor?.getMarkdown() || '',
        markdownPreview: document.querySelector('.pane-wrapper[data-card-type="markdown"] .toastui-editor-ww-container .toastui-editor-contents')?.textContent || '',
        markdownShortcutMarkdown: document.querySelector('.pane-wrapper[data-card-type="markdown"]')?.dataset?.shortcutMarkdown || '',
        markdownToolbarDisplay: document.querySelector('.pane-wrapper[data-card-type="markdown"]')?.dataset?.toolbarDisplay || '',
      }))()`);
        lastBeforeReloadSnapshot = snapshot;

        if (
          Array.isArray(snapshot?.cardTypes)
          && snapshot.cardTypes.includes('agent-output')
          && snapshot.cardTypes.includes('mission')
          && snapshot.cardTypes.includes('markdown')
          && snapshot.agentSource
          && snapshot.agentOutput.trim()
          && snapshot.missionTitle === MISSION_TITLE
          && snapshot.missionGoal === MISSION_GOAL
          && snapshot.missionSource
          && !snapshot.missionHasOutputPreview
          && matchesExpectedMarkdown(snapshot.markdown)
          && snapshot.markdownPreview.includes('Agent Output')
          && snapshot.markdownShortcutMarkdown.startsWith('# Shortcut heading')
          && snapshot.markdownToolbarDisplay === 'none'
        ) {
          return snapshot;
        }

        return null;
      }, 'ui smoke state before reload', 15000, 300);
    } catch (error) {
      throw new Error(`${error.message}\nLast before-reload snapshot: ${JSON.stringify(lastBeforeReloadSnapshot)}`);
    }

    const loadEvent = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.reload', { ignoreCache: true });
    await loadEvent;

    const afterReload = await waitFor(async () => {
      const snapshot = await cdp.evaluate(`(() => ({
        cardTypes: [...document.querySelectorAll('.pane-wrapper')].map((node) => node.dataset.cardType),
        terminalTitle: document.querySelector('.pane-wrapper[data-card-type="terminal"] .pane-title-input')?.value || '',
        agentTitle: document.querySelector('.pane-wrapper[data-card-type="agent-output"] .pane-title-input')?.value || '',
        agentName: document.querySelector('.agent-card-input')?.value || '',
        agentSource: document.querySelector('.agent-card-select')?.value || '',
        agentSummary: document.querySelector('.agent-card-summary-title')?.textContent || '',
        agentOutput: document.querySelector('.agent-card-output')?.textContent || '',
        missionTitle: document.querySelector('.pane-wrapper[data-card-type="mission"] .pane-title-input')?.value || '',
        missionStatus: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-status-summary-input')?.value || '',
        missionGoal: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-text-section .mission-text-input')?.value || '',
        missionChecklist: [...document.querySelectorAll('.pane-wrapper[data-card-type="mission"] .mission-checklist-input')].map((input) => input.value),
        missionChecklistDone: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-checklist-toggle')?.checked || false,
        missionBlockers: document.querySelectorAll('.pane-wrapper[data-card-type="mission"] .mission-detail-grid .mission-text-input')[0]?.value || '',
        missionNext: document.querySelectorAll('.pane-wrapper[data-card-type="mission"] .mission-detail-grid .mission-text-input')[1]?.value || '',
        missionSource: document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-source-select')?.value || '',
        missionHasOutputPreview: !!document.querySelector('.pane-wrapper[data-card-type="mission"] .mission-output-preview'),
        markdownTitle: document.querySelector('.pane-wrapper[data-card-type="markdown"] .pane-title-input')?.value || '',
        markdown: document.querySelector('.pane-wrapper[data-card-type="markdown"]')?._markdownEditor?.getMarkdown() || '',
        markdownPreview: document.querySelector('.pane-wrapper[data-card-type="markdown"] .toastui-editor-ww-container .toastui-editor-contents')?.textContent || '',
        markdownToolbarDisplay: getComputedStyle(document.querySelector('.pane-wrapper[data-card-type="markdown"] .toastui-editor-defaultUI-toolbar')).display,
      }))()`);

      if (
        Array.isArray(snapshot?.cardTypes)
        && snapshot.cardTypes.includes('agent-output')
        && snapshot.cardTypes.includes('mission')
        && snapshot.cardTypes.includes('markdown')
      ) {
        return snapshot;
      }

      return null;
    }, 'ui smoke state after reload', 15000, 300);

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    assert.ok(beforeReload.agentOutput.trim().length > 0, 'agent output card should capture terminal text');
    assert.deepEqual(afterReload.cardTypes, ['terminal', 'agent-output', 'mission', 'markdown']);
    assert.equal(afterReload.terminalTitle, 'Agent Shell');
    assert.equal(afterReload.agentTitle, 'Claude Feed');
    assert.equal(afterReload.agentName, 'claude-code');
    assert.equal(afterReload.agentSource, beforeReload.agentSource);
    assert.equal(afterReload.missionTitle, MISSION_TITLE);
    assert.equal(afterReload.missionStatus, MISSION_STATUS);
    assert.equal(afterReload.missionGoal, MISSION_GOAL);
    assert.deepEqual(afterReload.missionChecklist.slice(0, MISSION_CRITERIA.length), MISSION_CRITERIA);
    assert.equal(afterReload.missionChecklistDone, true);
    assert.equal(afterReload.missionBlockers, MISSION_BLOCKERS);
    assert.equal(afterReload.missionNext, MISSION_NEXT);
    assert.equal(afterReload.missionSource, beforeReload.missionSource);
    assert.equal(afterReload.missionHasOutputPreview, false);
    assert.equal(afterReload.markdownTitle, 'handoff.md');
    assert.equal(matchesExpectedMarkdown(afterReload.markdown), true);
    assert.ok(afterReload.markdownPreview.includes('Agent Output'));
    assert.equal(afterReload.markdownToolbarDisplay, 'none');
    assert.ok(afterReload.agentSummary.includes('claude-code following Agent Shell'));
    assert.ok(afterReload.agentOutput.trim().length > 0, 'agent output should still be readable after reload');

    console.log(`UI smoke test passed. Screenshot saved to ${screenshotPath}`);
  } finally {
    cdp?.close();
    await stopChildProcess(chromeProcess);
    await stopChildProcess(serverProcess);

    await fsp.rm(chromeProfileDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
