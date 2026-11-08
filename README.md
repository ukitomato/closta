<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="jetbrains/src/main/resources/META-INF/pluginIcon_dark.svg">
  <img src="jetbrains/src/main/resources/META-INF/pluginIcon.svg" width="88" alt="">
</picture>

# Closta

**Claude Code as a native JetBrains IDE plugin, with Anthropic or Amazon Bedrock.**

[![IntelliJ IDEA 2026.2+](.github/assets/badges/intellij.svg)](https://www.jetbrains.com/idea/)
[![Claude Code CLI](.github/assets/badges/claude.svg)](https://docs.claude.com/en/docs/claude-code)
[![Amazon Bedrock](.github/assets/badges/bedrock.svg)](https://aws.amazon.com/bedrock/)
[![Kotlin 2.4](.github/assets/badges/kotlin.svg)](https://kotlinlang.org/)
[![JDK 21](.github/assets/badges/jdk.svg)](https://openjdk.org/)
![Native Swing, no webview](.github/assets/badges/swing.svg)
[![License: Apache-2.0](.github/assets/badges/license.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/ukitomato/closta)](https://github.com/ukitomato/closta/releases)

English | [日本語](README.ja.md)

Closta runs the Claude Code CLI you have installed and shows the conversation in the IDE's own Swing components:
edits as diffs, a turn's changes as VCS changes, approvals as cards. No webview.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/screenshot-dark.png">
  <img src=".github/assets/screenshot-light.png" alt="Closta in IntelliJ IDEA: a Kotlin file, a conversation waiting on an edit in the sidebar, and the Sessions window answering a question" width="900">
</picture>

</div>

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

**Requirements:** the [Claude Code](https://docs.claude.com/en/docs/claude-code/setup) CLI (`claude`) installed and on
your `PATH`; Closta does not bundle it. Sign in with `claude`, or use an Amazon Bedrock account with access to Claude
models.

**Getting started:** open the **Closta** tool window on the right, or choose **Tools | Closta | Closta: New
Conversation**. Amazon Bedrock is set up in **Settings | Tools | Closta**.

[Report a problem](https://github.com/ukitomato/closta/issues) ·
[Ask a question](https://github.com/ukitomato/closta/discussions)
<!-- Plugin description end -->

## More features

- The `+` of a window opens a new conversation in that window; its ▾ menu chooses an editor tab, the sidebar or a
  new git worktree.
- The **Sessions** tab answers permissions, questions, plans and edits in its detail pane. The **MCP** tab turns the
  servers on or off and reconnects them.
- A turn's changes can be reverted or kept all at once.
- Rewind goes back to before a message: the conversation only, or the files too.
- Esc stops a reply. A session whose tab you close keeps running; Sessions stops it or opens it again.
- The provider switch next to the `+` chooses the provider new conversations start with. A running conversation keeps
  its provider.
- Model, effort and permission mode can be switched while the conversation runs. Images and PDFs can be attached.
- A project opened from `\\wsl$\…` runs `claude` inside that distribution, where it must be installed.
- The UI is in English, and in Japanese when the IDE runs in Japanese.

## How it works

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/architecture-dark.png">
  <img src=".github/assets/architecture-light.png" alt="Closta in the JetBrains IDE talks to your claude CLI over stream-json; claude talks to Anthropic or Amazon Bedrock" width="900">
</picture>

</div>

- Closta starts one `claude` process per conversation and talks to it only over stdin and stdout. What the agent may
  do is decided by `claude` and its permission mode; Closta shows the requests and sends your answers.
- The conversation goes from `claude` to Anthropic, or to Amazon Bedrock when that provider is chosen. Closta itself
  calls only AWS STS, to get Bedrock's temporary credentials.
- An in-process MCP server gives the agent the diagnostics the IDE has already found.

## Install

Requires IntelliJ IDEA 2026.2.4 or later (build 262+), or another IntelliJ-based IDE of the same version, and the
[Claude Code](https://docs.claude.com/en/docs/claude-code/setup) CLI. Amazon Bedrock runs through the same `claude`
command, so it is needed with either provider.

1. Download `closta-<version>.zip` from [Releases](https://github.com/ukitomato/closta/releases).
2. In the IDE, open **Settings | Plugins**, click the gear icon, choose **Install Plugin from Disk…**, and pick the zip.
3. Restart the IDE.

## Keys

All commands are under **Tools | Closta**.

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

## Configuration

**Settings | Tools | Closta**

- **Anthropic** (default): uses the `claude` command's own sign-in (`claude` → `/login`). Optionally set a model.
- **Amazon Bedrock**: set the region, the MFA device ARN and the long-term access keys. When a session starts, Closta
  asks for an MFA code and gets temporary credentials from AWS STS; nothing needs the `aws` command or `~/.aws`.
  Model IDs for Sonnet and Haiku can be overridden.
  Under WSL, with debug logging on for `#com.intellij.execution`, `idea.log` can contain the temporary credentials passed
  to the CLI. Do not share such a log.

**Settings | Tools | Closta | Behaviour** sets whether unsaved files are saved before a message is sent, whether `@`
file completion leaves out ignored files, and the permission mode new conversations start in.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers building from source, the
architecture and the performance budgets the tests hold. Security issues: see [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE). Third-party notices are in [NOTICE](NOTICE).

Not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.
