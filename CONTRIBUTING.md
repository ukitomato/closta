# Contributing to Closta

Thanks for your interest. Bug reports, ideas and pull requests are welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Be kind. Assume good intent.

## Building and testing

JDK 21 is required. The Gradle root is `jetbrains/`.

```bash
cd jetbrains
./gradlew check          # everything a pull request must pass
./gradlew buildPlugin    # the plugin zip, in build/distributions/
./gradlew runIde         # a sandbox IDE with the plugin
```

The first run downloads the IDE the plugin builds against (about 1 GB).

`check` runs:

- the unit tests (`src/test`), which need no IDE and start none;
- ktlint and detekt (formatting is in `.editorconfig`; `./gradlew ktlintFormat` fixes most of it);
- `checkLayers`, the layer rules below;
- `checkBundledLibraries`, which fails when a dependency would bundle `io.netty` (the IDE ships its own, and two
  copies clash at run time);
- `verifyPluginProjectConfiguration`.

Development aids, not shown to users. They live in a separate plugin, `jetbrains/dev/` (package
`dev.ukitomato.closta.devtools`), which only `runIde` loads. It is not part of the plugin zip:

- **Tools | Closta: Measure Performance** appears in an internal IDE or one started with `-Dclosta.dev=true`
  (add it to the run configuration's VM options).
- `./gradlew gallery -Pclosta.gallery=<folder>` opens a made-up conversation with every kind of row and card, saves
  PNGs of it into `<folder>`, and closes the IDE. It fails if a scene fails. The README's screenshots are its
  `showcase.png`, taken with `-Pclosta.gallery.only=showcase -Pclosta.gallery.scale=2` once with
  `-Pclosta.gallery.theme=light` and once with `-Pclosta.gallery.theme=dark`. The JVM arguments it passes to the IDE
  are added in `jetbrains/dev/build.gradle.kts`.
- `./gradlew runIde` runs `:dev:runIde`; the root project does not start an IDE itself.

The protocol recorder in `recorder/` has its own tests: `cd recorder && npm test` (Node 18+, no dependencies).

## Architecture

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

## Layer rules

The code lives in four layers under `jetbrains/src/main/kotlin/dev/ukitomato/closta/`: `core/`, `presenter/`,
`providers/` and `platforms/`. `checkLayers` covers the main plugin's sources; the dev plugin counts as platform code. It fails the build when:

1. a file outside `platforms/` imports `com.intellij`;
2. `core/`, `presenter/` or `providers/` imports `platforms/` (dependencies point inward);
3. `core/models/` imports `core.interfaces` or uses `suspend` (the fold stays pure);
4. `src/test` or `src/testFixtures` imports `com.intellij` (tests run without an IDE).

Because of rule 1, `presenter/` cannot look up localized text: it hands the screen values (enums, sealed types), and
`platforms/` turns them into words with `ClostaBundle`.

## Performance budgets

The tests hold these on a synthetic session the size of the largest one seen in use (200 requests, 2,000 tool calls,
150 subagents). A change that breaks one fails `check`.

| | Budget |
| --- | --- |
| Folding the whole session into state | ≤ 150 ms |
| Time per event | flat: the last 1,000 events of a 5,000+ event session cost no more than twice the first 1,000 (+20 ms) |
| Building every row of the conversation | ≤ 300 ms |
| One update while a reply streams in | ≤ 5 ms at p99, and only the last message's rows are rebuilt |

## Conventions

- **UI text** goes into `jetbrains/src/main/resources/messages/ClostaBundle.properties` (English) and
  `ClostaBundle_ja.properties` (Japanese), with the same keys. A test checks that the two agree. In a value with a
  `{0}` parameter, write an apostrophe as `''`.
- **The protocol is not written from memory.** The source of truth, in order: the official
  `@anthropic-ai/claude-agent-sdk` type definitions (shape), the official documentation (meaning), and the captures
  in `providers/claude/fixtures/` (what the CLI really sends). When the types and a capture disagree, the capture wins.
  New protocol behaviour comes with a capture recorded by `recorder/`.
- **Secrets** are stored only in the IDE's password safe. Never log environment variables, tokens or file paths
  from the user's machine.
- **The screen holds no state**: the presenter derives what is shown; UI code reflects it. Release resources with
  `Disposer`.
- Prefer the IDE's own components (editors, diffs, notifications, VCS) over custom ones. No webviews.

## Pull requests

- Keep a pull request to one change, with tests for behaviour that changed.
- Commit messages are one line in English, in the imperative or as a plain statement of what changed.
- Add a line to `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.
- Make sure `./gradlew check` passes.

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
