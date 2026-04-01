const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const TEST_RESULTS_DIR = path.join(ROOT, 'test-results');
const MARKDOWN_VALUE = '# Handoff\n\n## Agent Output\n- Linked to Agent Shell\n- Streaming recent CLI text\n\n```bash\npnpm test\n```\n';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        projectButtonReady: !!document.getElementById('btn-agent-card'),
        markdownButtonReady: !!document.getElementById('btn-markdown-card'),
      }))()`);

      if (snapshot?.terminalReady && snapshot.projectButtonReady && snapshot.markdownButtonReady) {
        return snapshot;
      }

      return null;
    }, 'initial terminal card');

    await cdp.evaluate(`(() => {
      const terminalTitle = document.querySelector('.pane-wrapper[data-card-type="terminal"] .pane-title-input');
      if (terminalTitle) {
        terminalTitle.value = 'Agent Shell';
        terminalTitle.dispatchEvent(new Event('input', { bubbles: true }));
        terminalTitle.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      document.getElementById('btn-agent-card')?.click();
      document.getElementById('btn-markdown-card')?.click();
    })()`);

    await waitFor(async () => {
      const snapshot = await cdp.evaluate(`(() => ({
        agentCardReady: !!document.querySelector('.pane-wrapper[data-card-type="agent-output"]'),
        markdownCardReady: !!document.querySelector('.pane-wrapper[data-card-type="markdown"]'),
        sourceOptionCount: document.querySelector('.agent-card-select')?.options?.length || 0,
      }))()`);

      if (snapshot?.agentCardReady && snapshot.markdownCardReady && snapshot.sourceOptionCount > 1) {
        return snapshot;
      }

      return null;
    }, 'new cards and terminal source options');

    await cdp.evaluate(`(() => {
      const agentCard = document.querySelector('.pane-wrapper[data-card-type="agent-output"]');
      const markdownCard = document.querySelector('.pane-wrapper[data-card-type="markdown"]');

      const agentTitle = agentCard?.querySelector('.pane-title-input');
      if (agentTitle) {
        agentTitle.value = 'Claude Feed';
        agentTitle.dispatchEvent(new Event('input', { bubbles: true }));
        agentTitle.dispatchEvent(new Event('blur', { bubbles: true }));
      }

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

      const markdownTitle = markdownCard?.querySelector('.pane-title-input');
      if (markdownTitle) {
        markdownTitle.value = 'handoff.md';
        markdownTitle.dispatchEvent(new Event('input', { bubbles: true }));
        markdownTitle.dispatchEvent(new Event('blur', { bubbles: true }));
      }

      const markdownEditor = markdownCard?.querySelector('.markdown-card-editor');
      if (markdownEditor) {
        markdownEditor.value = ${JSON.stringify(MARKDOWN_VALUE)};
        markdownEditor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);

    const beforeReload = await waitFor(async () => {
      const snapshot = await cdp.evaluate(`(() => ({
        cardTypes: [...document.querySelectorAll('.pane-wrapper')].map((node) => node.dataset.cardType),
        agentSource: document.querySelector('.agent-card-select')?.value || '',
        agentOutput: document.querySelector('.agent-card-output')?.textContent || '',
        markdown: document.querySelector('.markdown-card-editor')?.value || '',
      }))()`);

      if (
        Array.isArray(snapshot?.cardTypes)
        && snapshot.cardTypes.includes('agent-output')
        && snapshot.cardTypes.includes('markdown')
        && snapshot.agentSource
        && snapshot.agentOutput.trim()
        && snapshot.markdown === MARKDOWN_VALUE
      ) {
        return snapshot;
      }

      return null;
    }, 'ui smoke state before reload', 15000, 300);

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
        markdownTitle: document.querySelector('.pane-wrapper[data-card-type="markdown"] .pane-title-input')?.value || '',
        markdown: document.querySelector('.markdown-card-editor')?.value || '',
      }))()`);

      if (Array.isArray(snapshot?.cardTypes) && snapshot.cardTypes.includes('agent-output') && snapshot.cardTypes.includes('markdown')) {
        return snapshot;
      }

      return null;
    }, 'ui smoke state after reload', 15000, 300);

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    assert.ok(beforeReload.agentOutput.trim().length > 0, 'agent output card should capture terminal text');
    assert.deepEqual(afterReload.cardTypes, ['terminal', 'agent-output', 'markdown']);
    assert.equal(afterReload.terminalTitle, 'Agent Shell');
    assert.equal(afterReload.agentTitle, 'Claude Feed');
    assert.equal(afterReload.agentName, 'claude-code');
    assert.equal(afterReload.agentSource, beforeReload.agentSource);
    assert.equal(afterReload.markdownTitle, 'handoff.md');
    assert.equal(afterReload.markdown, MARKDOWN_VALUE);
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
