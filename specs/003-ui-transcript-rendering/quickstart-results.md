# Quickstart 実測・判定結果: transcript の基本表示 (R-3)

- **記録日**: 2026-09-24
- **対象**: R-3 (003-ui-transcript-rendering)
- **様式**: [quickstart.md](quickstart.md) の V-1〜V-9 に対応
- **判定の位置づけ**: SC-010 (見栄えの一次判断) の rubric 判定表 (a〜d) の**記録が done の必須 artifact**。
  実機操作の実施自体は人間 deferred。**機械確認**は `tests/spec-artifacts/r3-quickstart-rubric.test.ts` が
  rubric-a〜rubric-d の行と判定の存在を検査する (SH-067b)。

## SC の自動検証状況 (実機不要な範囲)

**「PASS」は自動検証で満たした範囲を指す。核心が実機のみで測れる SC は実機 pending を明示する** (pr-gate H-003)。

| SC | 内容 | 経路 | 状態 |
|---|---|---|---|
| SC-001 | 変換・記録順・役割 (unit) | `transcript.test.ts` (対応表) / `ChatScreen.test.tsx` (合成 fixture の順序描画) | **unit PASS** |
| SC-001 (SDK 等価性) | 同一 sessionId の SDK 直呼びとの件数・順序・役割一致 (**核心**) | quickstart **V-1 (実機)** | **pending (実機。人間 deferred)** |
| SC-003 | 同時マウント DOM ノード数が総件数に依存しない | `virtualization.test.tsx` (200 vs 3,000 でマウント数一致) | **PASS** |
| SC-005 | 未完 markdown で描画が破綻しない / 未定義 tool の fallback | `ChatScreen.test.tsx` (未完フェンス / fallback) | **PASS** |
| SC-007 | 本文が invoke 応答 (handshake) に含まれない (port transfer) | `session-ipc.test.ts` / `transcript-service.test.ts` | **PASS** |
| SC-008 | 非 UUID / traversal 拒否 / XSS 無害化 / URL allowlist | `session-ipc.test.ts` / `safe-url.test.ts` / `ChatScreen.test.tsx` | **PASS** |
| SC-009 | content ブロック種別すべてに表示先 | `transcript-schema.test.ts` / data-model §3 | **PASS** |

## SC-010 rubric 判定表 (見栄えの一次判断)

**凡例**: 判定 = `OK` / `NG` / `未実施`（実機・人間 deferred）。
自動検証で裏取りできる観点は根拠を併記するが、**見た目の一次判断は実機でしか確定しない**ため
実機未実施の観点は `未実施` とする（記録の存在が done の必須項目。OK 化は実機後）。

| key | 観点 | 判定 | 根拠 / メモ |
|---|---|---|---|
| rubric-a | markdown 見出し/リスト/コードブロックのハイライトが Claude Code TUI と同等以上 | 未実施 | 実機での TUI 比較が必要。`MarkdownText` (remark-gfm + code header) は導入済み |
| rubric-b | 日本語全角混在行で行送り・折返しが破綻しない | 未実施 | 実機での目視が必要。`wrap-break-word` 等は既存 element に付随 |
| rubric-c | fallback tool 表示が tool 名/入力/結果を欠落なく示す | 未実施 | 自動検証は PASS (`ChatScreen.test.tsx` の未定義 tool fallback で tool 名/入力/結果を確認)。実機の見た目は未確認 |
| rubric-d | 数千件でスクロールが破綻しない (位置飛び 0) | 未実施 | 自動検証は PASS (`virtualization.test.tsx` でマウント数一定 = SC-003)。位置飛び 0 の実体験は実機 (V-5) 待ち |

> **一次判断**: 実機 V-1〜V-9 の実施後にここへ結論を記す。いずれかが `NG` なら charter の
> domain-specific Principle「見た目の判断を先送りしない」に従い、charter / roadmap / PLAN.md §4 の
> 見直しを別 task として起票する。

## 実機 V-1〜V-9 (人間 deferred)

| V | 内容 | 状態 |
|---|---|---|
| V-1 | 過去 transcript を実データで読む (SC-001) | 未実施 (実機) |
| V-2 | 未定義 tool の fallback (SC-005) | 未実施 (実機。自動検証は PASS) |
| V-3 | WSL 内セッションを起動せず読む | 未実施 (実機) |
| V-4 | 越境 `/mnt/c` のセッション | 未実施 (実機) |
| V-5 | 数千メッセージのスクロール (SC-002/SC-003) | 未実施 (実機。SC-003 自動検証は PASS) |
| V-6 | 逐次伸長でスクロールが奪われない (SC-004) | 未実施 (実機) |
| V-7 | 日本語の健全性 (SC-006) | 未実施 (実機) |
| V-8 | 空・失敗状態 / composer 無効 | 未実施 (実機。composer 無効の自動検証は PASS) |
| V-9 | 見栄えの一次判断 (SC-010 rubric) | 未実施 (実機。上表を実機で埋める) |

> **持ち主**: 実機再実行の持ち主は R-3 (roadmap R-3 申し送り #7 = 旧 R-2 SH-089 を継承)。
