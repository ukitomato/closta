<div align="center">

# Closta

**The Claude Code agent inside JetBrains IDEs, with the IDE's own editors, diffs and VCS changes.**

A Kotlin plugin that drives the `claude` command over its bidirectional stream-json protocol and draws the
conversation in native Swing. No webview.

[![IntelliJ](https://img.shields.io/badge/IntelliJ-2026.2%2B-000000?logo=intellijidea&logoColor=white)](https://www.jetbrains.com/idea/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-CLI-D97757)](https://docs.claude.com/en/docs/claude-code)
[![Amazon Bedrock](https://img.shields.io/badge/Amazon%20Bedrock-supported-FF9900)](https://aws.amazon.com/bedrock/)
[![Kotlin](https://img.shields.io/badge/Kotlin-2.4-7F52FF?logo=kotlin&logoColor=white)](https://kotlinlang.org/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Build](https://github.com/ukitomato/closta/actions/workflows/build.yml/badge.svg)](https://github.com/ukitomato/closta/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/ukitomato/closta)](https://github.com/ukitomato/closta/releases)

</div>

---

Running Claude Code in a terminal next to the IDE means reading its edits as text, approving them in a different
window, and losing track of sessions that wait for you. **Closta** puts the agent in the IDE: edits arrive as diffs,
a turn's changes as VCS changes, and every question the agent asks as a card you answer where it appears. A window at
the bottom shows all your sessions, so the one that waits is never out of sight.

<!-- Plugin description -->
Use the Claude Code agent inside the IDE, with native editors, diffs and VCS changes.

Closta runs the `claude` command (the Claude Code CLI) and shows the conversation with the IDE's own components.

- Conversations in the Closta tool window or in editor tabs, several at a time.
- Tool permissions, file edits (as diffs), plans and questions as cards, answered in place.
- A turn's changes as VCS changes, opened in the IDE's combined diff.
- A Closta window at the bottom with every session (what waits, what runs, what finished) and the MCP servers.
- A jump to the next session that waits for you, from anywhere in the IDE.
- Rewind and fork from a message, resume saved conversations, and start a conversation in a new git worktree.
- The `claude` command's own sign-in, or Amazon Bedrock with an MFA code. Secrets stay in the IDE's password safe.

**Requirements:** the `claude` command on your `PATH` and signed in, or an Amazon Bedrock account with access to
Claude models.

**Getting started:** open the **Closta** tool window on the right, or choose **Tools | Closta | Closta: New
Conversation**. Amazon Bedrock is set up in **Settings | Tools | Closta**.

[Report a problem](https://github.com/ukitomato/closta/issues) ·
[Ask a question](https://github.com/ukitomato/closta/discussions)
<!-- Plugin description end -->

## ✨ Features

- 💬 **Conversations in the sidebar or in editor tabs** — several at a time. The `+` of a window opens a new one in
  that window; its ▾ menu chooses an editor tab, the sidebar or a new git worktree.
- 🗂 **A Closta window at the bottom** — a **Sessions** tab groups every session by what waits, runs or finished, with
  a detail pane that answers permissions, questions, plans and edits in place. An **MCP** tab lists the servers of the
  conversation last in view; turn them on or off and reconnect them.
- ⏭ **Jump to what waits** — **Ctrl+Alt+Shift+Period** goes to the next session that waits, from anywhere in the IDE;
  **Alt+Shift+W** in the message box goes to the card waiting in the conversation.
- 🃏 **Approvals as cards** — tool permissions, file edits shown as diffs, plans and questions.
- 🔀 **A turn's changes as VCS changes**, opened in the IDE's combined diff; revert or keep them all.
- ⏪ **Rewind and fork** — go back to before a message (the conversation only, or the files too), or continue from it
  in a copy.
- ⏹ **Stop and closed tabs** — Esc stops a reply. A session whose tab you close keeps running; a notification says
  so, and Sessions stops it or opens it again.
- 🔁 **Resume saved conversations**, and start a conversation in a new **git worktree**.
- 🔌 **Provider switch** — next to the `+`, choose the provider new conversations start with: the `claude` command's
  own sign-in, or **Amazon Bedrock** with an MFA code. A running conversation keeps its provider.
- 🧠 **IDE context for the agent** — an in-process MCP server gives it the diagnostics the IDE has already found.
- 🎛 **Model, effort and permission mode** switched while the conversation runs; image and PDF attachments.
- 🐧 **WSL** — a project opened from `\\wsl$\…` runs `claude` inside that distribution.
- 🌐 English UI, and Japanese when the IDE runs in Japanese.

## 📦 Install

Requires IntelliJ IDEA 2026.2.4 or later (build 262+), or another IntelliJ-based IDE of the same version, and either
the [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI (`claude`) on your `PATH`, signed in, or an Amazon
Bedrock account with access to Claude models.

1. Download `closta-<version>.zip` from [Releases](https://github.com/ukitomato/closta/releases).
2. In the IDE, open **Settings | Plugins**, click the gear icon, choose **Install Plugin from Disk…**, and pick the zip.
3. Restart the IDE.

## 🚀 Usage

| Where | What it does |
| --- | --- |
| **Closta** tool window (right) | A conversation in the sidebar. `+` starts a new one, ▾ chooses where, the history button resumes a saved one here, the provider switch sits next to them |
| **Closta** tool window (bottom) | **Sessions**: every session and what it waits for, answered in place. **MCP**: the servers of the conversation last in view |
| **Tools \| Closta \| Closta: New Conversation** | A new conversation in an editor tab |
| **Tools \| Closta \| Closta: New Conversation in the Sidebar** | A new conversation in the Closta tool window |
| **Tools \| Closta \| Closta: New Conversation in a Worktree** | Creates a git worktree and opens a conversation there |
| **Tools \| Closta \| Closta: Resume a Saved Conversation** | Lists the conversations `claude` saved for the project |
| **Tools \| Closta \| Closta: Next Waiting Session** | Goes to the next session that waits for you |

| Key | Where | What it does |
| --- | --- | --- |
| Ctrl+Alt+Shift+O | Anywhere | New conversation in an editor tab |
| Ctrl+Alt+Shift+Period | Anywhere | Next waiting session |
| Enter / Shift+Enter | Message box | Send / new line |
| Esc | Message box | Stop the reply |
| Shift+Tab | Message box | Change the permission mode |
| Alt+K | Message box | Insert the editor's selection as `@path#L5-10` |
| Alt+Shift+W | Message box | Go to the card waiting for an answer |
| `@` | Message box | Complete a file name |

## ⚙️ Configuration

**Settings | Tools | Closta**

- **Anthropic** (default): uses the `claude` command's own sign-in (`claude` → `/login`). Optionally set a model.
- **Amazon Bedrock**: set the region, the MFA device ARN and the long-term access keys. When a session starts, Closta
  asks for an MFA code and gets temporary credentials from AWS STS; nothing needs the `aws` command or `~/.aws`.
  Model IDs for Sonnet and Haiku can be overridden.

The active provider is used for new conversations; the provider switch next to a window's `+` changes the same
choice. **Settings | Tools | Closta | Behaviour** sets whether unsaved files are saved before a message is sent,
whether `@` file completion leaves out ignored files, and the permission mode new conversations start in.

## 🔧 How it works

```
   IntelliJ IDE
     platforms/   Swing UI, tool windows, editors, diffs, settings   (the only layer that may use com.intellij)
        │  shows
        ▼
     presenter/   what the screen shows, derived from the state
        │  reads
        ▼
     core/        the conversation model: a pure fold of the CLI's events into state
        ▲
        │  events
     providers/   the claude process, the stream-json codec, Anthropic / Bedrock / WSL launch, MCP
        │  stdin / stdout (stream-json)
        ▼
   claude   (Claude Code CLI, one process per conversation)
```

The code is under `jetbrains/src/main/kotlin/dev/ukitomato/closta/`. `./gradlew check` runs `checkLayers`, which
fails the build when a file breaks these rules. See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📊 Performance budgets

The tests hold these on a synthetic session the size of the largest one seen in use (200 requests, 2,000 tool calls,
150 subagents):

| | Budget |
| --- | --- |
| Folding the whole session into state | ≤ 150 ms |
| Time per event | flat: the last 1,000 events of a 5,000+ event session cost no more than twice the first 1,000 (+20 ms) |
| Building every row of the conversation | ≤ 300 ms |
| One update while a reply streams in | ≤ 5 ms at p99, and only the last message's rows are rebuilt |

## 🛠 Building from source

JDK 21 is required; Gradle downloads the IDE it builds against (about 1 GB on the first run).

```bash
cd jetbrains
./gradlew check buildPlugin      # tests, lint, layer and UI rules; the zip is in build/distributions/
./gradlew runIde                 # a sandbox IDE with the plugin
```

The protocol captures the tests replay are recorded with the Node tool in [`recorder/`](recorder/README.md).

## 📋 Notes

- Closta starts one `claude` process per conversation and talks to it only over stdin and stdout. What the agent may
  do is decided by `claude` and its permission mode; Closta shows the requests and sends your answers.
- The conversation goes from `claude` to Anthropic, or to Amazon Bedrock when that provider is chosen. Closta itself
  calls only AWS STS, to get Bedrock's temporary credentials.
- A project opened from a WSL path needs `claude` installed inside that distribution.

## 🤝 Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Security issues:
see [SECURITY.md](SECURITY.md).

## 📄 License

[Apache License 2.0](LICENSE). Third-party notices are in [NOTICE](NOTICE).

### Disclaimer

Not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.
