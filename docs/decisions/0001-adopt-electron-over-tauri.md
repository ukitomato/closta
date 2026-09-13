---
status: accepted
date: 2026-09-12
id: AD-001
deciders: ukitomato
tags: [shell, ui]
supersedes: []
superseded-by: []
---

# AD-001: Electron を採用する（Tauri ではない）

## Context

デスクトップシェルとして Electron と Tauri を比較した。Tauri は起動速度とバンドルサイズで
明確に優位であり、`node-pty` の再ビルド税からも解放される。

## Decision

**Electron を採用する。最新安定版を追随する。**

## Rationale

**(1) 軽量性の効き幅が小さい。**
本アプリの重量は `claude` ネイティブプロセス（セッションあたり数百 MB オーダー）が支配する。
シェル本体の差は 10 セッション時点で総使用量の数パーセントにとどまる。

**(2) WebView 分岐のコストが軸 1（UI 完成度）に直撃する。**
Tauri の WebView は macOS が WKWebView、Windows が WebView2 と異なる。実装する UI は
エンジン差が出やすい領域にほぼ全て乗っている。

- **日本語 IME**: composer の「変換確定中の Enter は送信しない」処理は `isComposing` と
  `compositionend` / `keydown` の発火順序に依存し、この順序がエンジン間で異なる
- **高頻度ストリーミング描画**: トークン単位の再レンダリング
- **仮想スクロール**: 数千メッセージの transcript でのスクロールアンカリング挙動
- **xterm.js**: WebGL renderer のサポート状況がエンジンで異なる

UI 完成度を製品の採否条件に据える以上、2 エンジン分の UI 検証コストは受け入れられない。

## Consequences

- 同梱 Node が実行時の言語機能を決める制約を負う（[AD-013](0013-node-and-electron-versioning.md)）
- ネイティブバイナリの asar 展開が必要になる（[AD-009](0009-unpack-native-binaries-from-asar.md)）
- `node-pty` に `electron-rebuild` が必要になる
- Tauri を採る場合でも Agent SDK は失われない（`externalBin` に `bun build --compile` した
  Node sidecar を同梱、`extractFromBunfs()` 使用）。ただし Node/Bun ランタイムが同居するため
  軽量性の優位はさらに縮む

## 再評価の条件 — SPIKE-3 で測定済み（条件は満たされない）

`claude` プロセス 1 本の実メモリが 150MB 程度に収まり、かつ軸 1 が一段落した後であれば
再検討に値する、としていた。**2026-09-13 に SPIKE-3 で実測した結果、条件は満たされない。**

### 測定結果（Ubuntu-26.04 / claude 2.1.270 / ext4 の作業ディレクトリ）

`claude --print --verbose --input-format stream-json --output-format stream-json` を
stdin を開いたまま起動し、メッセージを送らない idle 状態の VmRSS を測定した。

| 同時起動数 | 1 本あたり RSS | 合計 |
|---|---|---|
| 1 本 | **225 MB** | 225 MB |
| 5 本 | **226 MB** | 1,133 MB |

**並列してもプロセスあたりの RSS はほぼ変わらない。** 共有ページによる節約は実質効いておらず、
各プロセスがほぼフルに 225 MB を保持する。バイナリ自体も 224 MB の単一 ELF である。

これは **API を呼んでいない idle 状態の値**であり、実際のセッションでは文脈を抱えるぶん
さらに増える。**225 MB は下限である。**

### 判断

- **150 MB の閾値を大きく上回るため、AD-001 の再評価条件は成立しない。Electron 採用を維持する**
- 10 セッションで 2.25 GB。Electron シェル本体（200 MB 前後）は総使用量の **8% 程度**にあたる。
  本 ADR が「10 セッション時点で総使用量の数パーセント」としていた見立ては、
  やや楽観的だったが結論は変わらない
- 移行コストは [AD-010](0010-supervisor-runs-standalone.md) により限定されるため、
  将来 `claude` 側が大幅に軽量化された場合は再測定して再検討する余地は残る

## References

- PLAN.md §1.3（UI に関する立場）、§4（軸 1）
- Constitution Principle VIII（日本語環境で破綻しない）
