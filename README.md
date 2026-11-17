# NocoBase CLI GUI

A compact, local web GUI for the [NocoBase CLI v2](https://nocode.docs.nocobase.com/nocobase-cli/installation/cli) (`nb`).
It wraps the real CLI instead of reimplementing it, so whatever `nb` can do stays the source of truth.

The app runs a small server on `127.0.0.1` and opens the UI in a Chrome/Edge app window (no tabs or URL bar),
falling back to your default browser.

## Features

| Area | What you can do |
| --- | --- |
| **Environments** | List envs with status; start, stop, restart, upgrade; set current; remove (optional `--purge`); open app / folder; create a new env (quick install or the `nb init --ui` browser wizard) |
| **Database** | Check, start and stop the built-in database |
| **Backup** | Create and restore backups |
| **License** | Status, instance ID, activate from a key file |
| **Plugins** | Search, filter, enable / disable |
| **Logs** | Live `nb app logs` with filter, pause, copy, tail size |
| **Terminal** | Real login shell (xterm + node-pty); falls back to an `nb`-only runner if pty is unavailable |
| **Proxy** | nginx / caddy driver, start / stop / reload / restart, generate config |
| **Settings** | Install or update `@nocobase/cli`, `nb config`, shell session setup |

## Requirements

- Node.js 18 or newer
- The NocoBase CLI on your `PATH` (`npm i -g @nocobase/cli@alpha`). You can also install it from **Settings**.
- Docker, if your envs use Docker or the built-in database

## Quick start

```bash
npx nocobase-cli-gui
```

Or install globally:

```bash
npm i -g nocobase-cli-gui
nocobase-cli-gui
```

Options:

| Flag / env | Description |
| --- | --- |
| `--no-open` | Don't open a window automatically |
| `--port=5000` or `PORT=5000` | Listen on a specific port (default `4173`, next free port if busy) |

### Clickable icon

- Use a launcher from [`launchers/`](launchers): `.command` (macOS), `.bat` (Windows), `.desktop` (Linux).
- Or open the app once and use your browser's **Install app** (PWA) for a dock / taskbar icon.
  The server must be running for the installed app to work.

## Security

The server can run shell commands, so it is locked down:

- Listens on `127.0.0.1` only.
- A random token is generated on every start. It is delivered through the printed URL, then stored in an
  `HttpOnly`, `SameSite=Strict` cookie.
- Requests with a foreign `Host` or `Origin` header are rejected, including WebSocket upgrades.
- Never expose the port to a network or forward it.

## Development

```bash
git clone https://github.com/atlesg/nocobase-cli-gui.git
cd nocobase-cli-gui
npm install
npm run dev        # Vite on :5173 (UI) + API server on :4173
```

Open <http://localhost:5173>. Dev mode skips the access token.

```bash
npm run typecheck
npm run build      # dist/web (UI) + dist/server.js
npm start          # run the production build
```

### Project structure

```
bin/cli.js          entry point (npx / global bin)
src/server/         local HTTP + WebSocket server, nb runner, pty
src/renderer/       React UI (Vite)
launchers/          double-click launchers per OS
public/             PWA manifest and icons
```

### Notes on the CLI

- Commands are sent as `topic:command` (e.g. `env:list`) and retried in the spaced form (`env list`) if the CLI
  reports "command not found", so the GUI works with CLI builds that dispatch only one of the two.
- Output is parsed from the CLI's table output and JSON flags (`env info --json`, `env status`, `plugin list`).
  If a future CLI version changes these formats, the affected page may need an update.

## License

[MIT](LICENSE)
