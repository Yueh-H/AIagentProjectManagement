#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function printUsage() {
  console.error(`
Usage:
  npm run cards -- list-workspaces [--server URL]
  npm run cards -- list-cards [--server URL] [--client-id ID]
  npm run cards -- create --type TYPE [options]
  npm run cards -- update <pane-id> [options]
  npm run cards -- delete <pane-id> [--server URL] [--client-id ID]

Options:
  --server URL               API base URL, default http://127.0.0.1:3000
  --client-id ID             Target workspace id, default latest workspace
  --type TYPE                markdown | project | agent-output
  --title TEXT               Card title
  --activate                 Focus the card after mutation
  --x NUM --y NUM            Card position
  --width NUM --height NUM   Card size

Markdown:
  --markdown TEXT
  --markdown-file PATH
  --append-markdown TEXT
  --append-markdown-file PATH

Project:
  --objective TEXT
  --success-criteria TEXT
  --next-action TEXT
  --notes TEXT
  --append-objective TEXT
  --append-success-criteria TEXT
  --append-next-action TEXT
  --append-notes TEXT

Agent Output:
  --source-pane-id ID
  --agent-name TEXT
`);
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = nextToken;
    index += 1;
  }

  return { options, positionals };
}

function readTextOption(value, filePath) {
  if (typeof filePath === 'string') {
    return fs.readFileSync(path.resolve(filePath), 'utf8');
  }

  if (typeof value === 'string') {
    return value;
  }

  return undefined;
}

function maybeNumber(value) {
  if (value == null || value === true) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildBounds(options) {
  const bounds = {
    x: maybeNumber(options.x),
    y: maybeNumber(options.y),
    width: maybeNumber(options.width),
    height: maybeNumber(options.height),
  };

  return Object.values(bounds).some((value) => value !== undefined) ? bounds : undefined;
}

function buildData(options) {
  const data = {};

  const markdown = readTextOption(options.markdown, options['markdown-file']);
  if (markdown !== undefined) data.markdown = markdown;

  if (typeof options.objective === 'string') data.objective = options.objective;
  if (typeof options['success-criteria'] === 'string') data.successCriteria = options['success-criteria'];
  if (typeof options['next-action'] === 'string') data.nextAction = options['next-action'];
  if (typeof options.notes === 'string') data.notes = options.notes;

  if (typeof options['source-pane-id'] === 'string') data.sourcePaneId = options['source-pane-id'];
  if (typeof options['agent-name'] === 'string') data.agentName = options['agent-name'];

  return Object.keys(data).length ? data : undefined;
}

function buildAppend(options) {
  const append = {};

  const appendMarkdown = readTextOption(options['append-markdown'], options['append-markdown-file']);
  if (appendMarkdown !== undefined) append.markdown = appendMarkdown;

  if (typeof options['append-objective'] === 'string') append.objective = options['append-objective'];
  if (typeof options['append-success-criteria'] === 'string') append.successCriteria = options['append-success-criteria'];
  if (typeof options['append-next-action'] === 'string') append.nextAction = options['append-next-action'];
  if (typeof options['append-notes'] === 'string') append.notes = options['append-notes'];

  return Object.keys(append).length ? append : undefined;
}

function getServerBaseUrl(options) {
  return String(options.server || process.env.WORKSPACE_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload;
}

async function main() {
  const [command, ...restArgs] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  const { options, positionals } = parseArgs(restArgs);
  const baseUrl = getServerBaseUrl(options);

  if (command === 'list-workspaces') {
    const result = await requestJson(`${baseUrl}/api/workspaces`);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'list-cards') {
    const query = options['client-id']
      ? `?clientId=${encodeURIComponent(options['client-id'])}`
      : '';
    const result = await requestJson(`${baseUrl}/api/cards${query}`);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'create') {
    if (typeof options.type !== 'string') {
      throw new Error('Missing required flag: --type');
    }

    const result = await requestJson(`${baseUrl}/api/cards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: options['client-id'],
        type: options.type,
        title: options.title,
        activate: Boolean(options.activate),
        bounds: buildBounds(options),
        data: buildData(options),
      }),
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'update') {
    const paneId = positionals[0] || options['pane-id'];
    if (!paneId) {
      throw new Error('Missing pane id. Use: update <pane-id>');
    }

    const result = await requestJson(`${baseUrl}/api/cards/${encodeURIComponent(paneId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: options['client-id'],
        title: options.title,
        activate: Boolean(options.activate),
        bounds: buildBounds(options),
        data: buildData(options),
        append: buildAppend(options),
      }),
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'delete') {
    const paneId = positionals[0] || options['pane-id'];
    if (!paneId) {
      throw new Error('Missing pane id. Use: delete <pane-id>');
    }

    const query = options['client-id']
      ? `?clientId=${encodeURIComponent(options['client-id'])}`
      : '';
    const result = await requestJson(`${baseUrl}/api/cards/${encodeURIComponent(paneId)}${query}`, {
      method: 'DELETE',
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
