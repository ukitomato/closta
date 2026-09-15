# Closta

Desktop app for running and managing Claude Code sessions across isolated runtimes.

## Status

**Early development. Closta cannot run or display a Claude Code session yet.**

This repository currently contains one completed feature — runtime detection and
workspace folder registration — plus the application shell it needs. Everything
related to sessions, transcripts, and chat is not implemented.

### What works today

| Area | What you can actually do |
|---|---|
| Runtime detection | Enumerate the Windows host and every installed WSL distribution, with version and running state |
| Sandbox capabilities | Probe a running distribution for the dependencies an isolated session would need, and report what is missing |
| Workspace folders | Register a folder together with its location (Windows or a specific distribution), browse both namespaces, and persist the list |
| Path resolution | Decide, for a folder and runtime pair, whether the folder is reachable and whether using it crosses a filesystem boundary |

Detection never starts a stopped distribution. Listing and probing only touch
distributions that are already running.

### What does not work yet

- **No session support.** Sessions are neither listed, started, resumed, nor displayed
- **No chat.** The assistant-ui components are installed, but no runtime or backend is wired to them. Nothing sends a message anywhere
- **No containers.** Only the Windows host and WSL are detected. Docker is out of scope for now
- **No installer.** The app runs from source; packaging and signing are not set up

### Platform support

**Windows only.** Detection targets `wsl.exe` and Windows path semantics, and the
build has only been exercised on Windows 11. The macOS and Linux build scripts come
from the project scaffold and are untested.

## Requirements

- Windows 11
- Node.js 24 (Active LTS)
- pnpm 12
- WSL 2 with at least one distribution, if you want anything beyond the host runtime

## Development

```bash
pnpm install
pnpm dev
```

### Verification

Each command is also a step in CI (`.github/workflows/verify.yml`).

```bash
pnpm lint                # ESLint, including the layer dependency rules
pnpm typecheck           # TypeScript, both projects
pnpm depcruise           # dependency-cruiser: transitive reach and cycles
pnpm check:constitution  # project-specific invariants
pnpm test                # unit tests
pnpm test:rules          # checks that the rules above actually fire on violations
```

`pnpm test:rules` exists because a rule that matches nothing looks exactly like a
rule with no violations. It deploys deliberate violations into the source tree,
asserts that the expected checker reports each one, and cleans up afterwards.

### Build

```bash
pnpm build      # typecheck, then bundle
pnpm build:win  # bundle and package for Windows
```

## Documentation

Design documents are written in Japanese and live under [`docs/`](docs/).

- [`docs/decisions/`](docs/decisions/) — architecture decision records
- [`docs/domains/`](docs/domains/) — domain charters
- [`docs/roadmap.md`](docs/roadmap.md) — planned features and their order
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — project invariants

## License

MIT. See [LICENSE](LICENSE).
