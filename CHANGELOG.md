# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Installs on IntelliJ IDEA 2025.3 and later (build 253+), down from 2026.2.

## [0.1.0] - 2026-11-06

### Added

- Conversations with the Claude Code agent in the tool window and in editor tabs, over the `claude` CLI's
  bidirectional stream-json protocol, with a native Swing UI.
- A Closta window at the bottom: a Sessions tab that groups every session by what waits, runs or finished and answers
  permissions, questions, plans and edits in place, and an MCP tab with the servers of the conversation last in view.
- Notifications for sessions out of view, and Next Waiting Session (Ctrl+Alt+Shift+Period) from anywhere in the IDE;
  Alt+Shift+W in the message box goes to the card that waits.
- A `+` in each window for a new conversation there, with a menu to open it in an editor tab, the sidebar or a new
  git worktree, and a switch for the provider new conversations start with.
- Esc stops a reply; a session whose tab is closed keeps running, says so, and can be stopped or reopened from
  Sessions.
- Cards for tool permissions, file edits (as diffs), plans and questions.
- A turn's changes as VCS changes in the IDE's combined diff.
- Verified on IntelliJ IDEA 2026.2 and 2026.3 with the Plugin Verifier.
- Rewind (conversation, or files and conversation) and fork from a message; resume saved conversations; conversations
  in a new git worktree.
- MCP servers: their states, turning them on and off, reconnecting.
- An in-process MCP server that gives the agent the IDE's diagnostics.
- Model, effort and permission mode switching; image and PDF attachments.
- Providers: the `claude` command's own sign-in, and Amazon Bedrock with MFA (secrets in the IDE's password safe).
- Running `claude` inside WSL for projects opened from a WSL path.
- English and Japanese UI.

[Unreleased]: https://github.com/ukitomato/closta/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ukitomato/closta/releases/tag/v0.1.0
