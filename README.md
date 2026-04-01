# AI Agent Project Management Workspace

A browser-based workspace for running CLI agents and organizing work as draggable cards on an infinite canvas.

See [CHANGELOG.md](./CHANGELOG.md) for the current project snapshot and version history.

This project combines:

- terminal sessions powered by `node-pty` and `xterm.js`
- project and mission tracking cards
- agent-output cards that follow CLI-driven agent responses
- markdown cards that preserve raw `.md` source
- SQLite-backed persistence for layout, card data, and terminal buffers

## What You Can Do

- Open multiple terminal cards and work with them side by side
- Drag, resize, rename, and close cards on a large canvas
- Create project cards to track goals, next actions, and terminal health
- Create mission cards for focused AI tasks with status, done criteria, and linked output
- Create agent output cards that follow a terminal and surface the latest agent response stream
- Create markdown cards that store exact `.md` text without converting it to rich text
- Refresh the page and recover your layout, card state, and recent terminal buffers
- Add new card types through the registry without rewriting the toolbar or pane manager

## Card Types

### Project Card

Use this as a high-level dashboard for the workspace:

- objective
- definition of done
- next action
- notes
- tracked terminal health summary

### Mission Card

Use this for a single AI task unit:

- mission instruction
- done criteria
- status cycle: `pending -> running -> done -> failed`
- linked terminal output
- result summary

### Agent Output Card

Use this to follow one terminal as an agent stream:

- choose a source CLI card
- assign an agent label such as `claude-code` or `codex`
- view parsed user/agent blocks when possible
- keep a focused, readable output surface separate from the raw terminal

### Markdown Card

Use this to keep exact markdown notes:

- raw `.md` text stays intact
- headings, lists, code fences, and tables are preserved as plain source
- content persists across reloads

### CLI Card

Use this as the live shell / agent execution surface:

- interactive terminal via `node-pty`
- auto-fit resizing with `xterm.js`
- terminal state summaries shared with other cards

## Tech Stack

- Node.js
- Express
- WebSocket (`ws`)
- `node-pty`
- `xterm.js`
- SQLite via `node:sqlite`
- plain HTML, CSS, and browser-side JavaScript

## Getting Started

### Requirements

- Node.js 22+ recommended
- npm
- macOS / Linux shell environment for PTY-backed terminals

### Install

```bash
npm install
```

### Run

```bash
npm start
```

By default the app prefers port `3000`. If that port is already in use, it will automatically retry the next available port and print the final URL in the terminal.

You can also force a port:

```bash
PORT=3005 npm start
```

## Card Automation API

The server now exposes a small local API so CLI agents such as Claude Code can create and update workspace cards without clicking in the browser.

### Discover workspaces

```bash
curl http://127.0.0.1:3000/api/workspaces
```

If you only use one browser workspace, the CLI helper can default to the most recently updated one.

### Create a markdown card

```bash
curl -X POST http://127.0.0.1:3000/api/cards \
  -H 'content-type: application/json' \
  -d '{
    "type": "markdown",
    "title": "Claude Notes.md",
    "data": {
      "markdown": "# Claude Notes\n\n- created from API\n"
    }
  }'
```

### Update card content

```bash
curl -X PATCH http://127.0.0.1:3000/api/cards/pane-2 \
  -H 'content-type: application/json' \
  -d '{
    "append": {
      "markdown": "\n- append one more line\n"
    }
  }'
```

Supported writable card types:

- `markdown`
- `project`
- `agent-output`

### CLI helper for Claude Code

Instead of hand-writing `curl`, you can run:

```bash
npm run cards -- create --type markdown --title "Claude Notes.md" --markdown "# Claude Notes"
```

Append more content later:

```bash
npm run cards -- update pane-2 --append-markdown $'\n- one more line'
```

List cards in the latest workspace:

```bash
npm run cards -- list-cards
```

## Test Commands

### Unit tests

```bash
npm run test:unit
```

### UI smoke test

```bash
npm run test:ui
```

This test:

- starts the server on a random port
- opens a headless Chrome-compatible browser
- creates `Agent Output` and `Markdown` cards
- verifies reload persistence
- saves a screenshot to `test-results/ui-smoke-cards.png`

If Chrome is installed in a non-standard location, set `CHROME_BIN`:

```bash
CHROME_BIN="/path/to/your/browser" npm run test:ui
```

### Full test suite

```bash
npm run test:all
```

## Persistence

Workspace state is stored in:

```text
data/web-terminal.sqlite
```

Persisted data includes:

- card positions and sizes
- card titles
- card-specific form data
- recent terminal output buffers

Important note:

- terminal layout and recent output are restored after refresh
- live PTY processes are not reattached after the browser connection closes

## Project Structure

```text
public/
  css/
  js/
server/
scripts/
test/
data/
```

Key files:

- `public/js/card-registry.js`: card-type registration system
- `public/js/pane-manager.js`: workspace orchestration and state hydration
- `public/js/base-card.js`: draggable/resizable card base class
- `server/ws-handler.js`: terminal websocket lifecycle
- `server/state-store.js`: SQLite persistence
- `scripts/test-ui-smoke.js`: browser smoke test

## Adding A New Card Type

The workspace is registry-driven.

1. Create a new browser-side card class that extends `BaseCard`
2. Register it with `CardRegistry.register(...)`
3. Load the script before `pane-manager.js` in `public/index.html`

Because the toolbar and pane manager read from the registry, a registered card type can appear in the UI without hard-coding button markup.

## Current Scope

This project is designed as a lightweight, hackable local workspace for AI-assisted terminal workflows. It focuses on:

- card-based orchestration
- CLI-connected agent monitoring
- project/task context in the same surface as execution
- simple local persistence

It is not yet a multi-user hosted platform, and it does not currently preserve live shell processes across full reconnects.
