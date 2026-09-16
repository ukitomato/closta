---
status: accepted
date: 2026-09-15
id: AD-026
deciders: ukitomato
tags: [packaging, toolchain]
supersedes: []
superseded-by: []
---

# AD-026: インストーラ生成の第 1 段階の実測と、ホスト環境に起因する 2 つの回避策

## Context

[SPIKE-13](../roadmap.md) は 2 段階に分けてある。R-1 で**薄く 1 回通し**、
D-1 の前に本格確認する。分けた理由は、**配布経路の詰まりが D-1 で初めて見つかると
配布経路ごと失われる**からである (FR-043 / SC-010)。

本 ADR は第 1 段階の結果を記録する。
[AD-009](0009-unpack-native-binaries-from-asar.md) が決めた「ネイティブバイナリを
asar から展開する」が実際に成立するかが確認対象である。

## Decision

### 1. Agent SDK は依存として入れ、ネイティブバイナリはパッケージごと展開する

`@anthropic-ai/claude-agent-sdk` 0.3.270 を `dependencies` に入れた。
**R-1 では呼び出さない。** 配布経路だけ先に通す。

実行ファイルはプラットフォーム別の optional dependency 側にある。

| 項目 | 実測 |
|---|---|
| 実行ファイル | `@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe` |
| サイズ | 227 MB (展開後) |
| 展開先 | `resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/` |
| 実行ビット | 維持されている |
| 署名 | electron-builder が `signtool.exe` で処理した |

`asarUnpack` は**実行ファイル名ではなくパッケージ名**で指定した。
SDK 側で同梱物の名前が変わっても追随が要らない。

```yaml
asarUnpack:
  - resources/**
  - node_modules/@anthropic-ai/claude-agent-sdk-*/**
```

**AD-009 は成立した。** asar 外に展開され、実行ビットも保たれている。

### 2. 生成物の実測値

| 項目 | 値 |
|---|---|
| `dist/closta-1.0.0-setup.exe` | **約 176 MB** |
| `resources/app.asar` | 約 61 MB |
| Electron | 39.8.10 |
| electron-builder | 26.15.3 |

**インストーラの大半は `claude.exe` である。** 配布サイズの議論を D-1 で行う際、
削減余地はアプリ側のバンドルではなく SDK 同梱バイナリの扱いにある。

### 3. パッケージングは `scripts/build/package.mjs` 経由で行う

**素の `electron-builder` では、開発ホストでインストーラを作れなかった。**
原因は 2 つあり、どちらも electron-builder 側の不具合ではなく、
ホストのセキュリティ製品との相互作用である。

#### (a) 同梱の 7-Zip が古く、実行が阻止される

electron-builder は NSIS ツールセット (`.7z`) の展開に自前の `7za.exe` を落としてくる。
これが古い版であるため、セキュリティ製品がプロセスを止め、
`AssignProcessToJobObject: (6) ハンドルが無効です。` で**展開そのものが行われない**。

展開されないまま「壊れたキャッシュ」として再試行されるので、
**何度実行しても同じ地点で止まり、進捗しない**。

→ **`ELECTRON_BUILDER_7ZIP_PATH` でホストの 7-Zip (26.01) を使わせる。**
electron-builder が公式に読む環境変数である
(`app-builder-lib/out/toolsets/7zip.js` の `resolve()`)。

#### (b) 展開直後のディレクトリを rename できない

展開は `<dir>.tmp` に行い、最後に `<dir>` へ rename する。
書き終えた直後のファイル群をセキュリティ製品が走査しており、
その窓の間 Windows は親ディレクトリの rename を `EPERM` で拒む。

**これは恒常的な失敗ではない。** 同じディレクトリが実行ごとに成功と失敗の
両方になることを実測した。手動で数百 ms 後に rename すると成功する。

→ electron-builder は rename を再試行しないので、
**失敗後に残った `<dir>.tmp` をこちらで昇格させ、状態ファイルを `complete` にして**
再実行する。状態ファイルの形式は `app-builder-lib/out/util/cacheState.js` に従う。

#### 意図的にしていないこと

- **`node_modules` に手を入れていない。** 上記はどちらも外側から効く手段である
- **セキュリティ製品の除外設定を触っていない。** ビルドのために防御を下げない
- **CI にインストーラ生成を載せていない。** FR-043 は「1 回通す」ことを求めており、
  毎回回すことは求めていない。CI ([SH-022](../../.github/workflows/verify.yml)) は
  `pnpm build` (型検査 + バンドル) までとする

## Consequences

- `pnpm build:win` / `build:mac` / `build:linux` / `build:unpack` は
  `scripts/build/package.mjs` を経由する。引数はそのまま `electron-builder` に渡る
- **(a) の回避策はホストに 7-Zip が入っていることを前提にする。**
  入っていなければ何もせず既定の挙動になる。その環境で (a) が再現するかは未確認である
- **`.cache/` を `.gitignore` に入れた** — `ELECTRON_BUILDER_CACHE` を
  プロジェクト配下に向けた場合の置き場である。原因切り分けで使った
- D-1 の本格確認では、**署名・公証・自動更新**が追加で必要になる。
  本 ADR はそこには触れていない
- **`pnpm` の警告を 1 件持ち越す。** electron-builder が
  「platform-specific optional dependencies not bundled」と警告する。
  他プラットフォーム向けの `claude.exe` 相当が入っていないという意味であり、
  Windows 向けビルドでは正しい状態である。**クロスプラットフォームのビルドを
  始める時点で再確認する**

## Alternatives considered

- **セキュリティ製品の除外設定を入れる** — ビルドのために防御を下げる。
  かつ、他の開発機やビルド機で再現できない設定をビルド手順の前提にすることになる
- **`node_modules` にパッチを当てる (`patch-package` 等)** — rename の再試行を
  electron-builder 本体に入れる形。上流の変更に追随し続ける必要があり、
  外側から同じ結果を得られる以上、割に合わない
- **NSIS をやめて zip 配布にする** — 第 1 段階の目的 (インストーラ生成を 1 回通す) を
  満たさない。D-1 で詰まる可能性を残したまま先送りすることになる

## References

- [AD-009](0009-unpack-native-binaries-from-asar.md) — ネイティブバイナリは asar から展開する
- [AD-002](0002-use-agent-sdk-not-cli.md) — Agent SDK を使う
- [AD-013](0013-node-and-electron-versioning.md) — Node と Electron のバージョン方針
- `specs/001-runtime-folder-registration-runtime-detection/spec.md` FR-043 / SC-010
- `scripts/build/package.mjs` — 回避策の実装
