---
id: AD-037
title: SPIKE-4 — assistant-ui の composer は変換確定 Enter を二重ガードで扱う。自前ガードは不要。実行中積み・下書き復元は IME でなく runtime capability として X-2 が持つ
status: accepted
date: 2026-09-27
deciders: [ukitomato]
tags: [ui, spike, verification, principle-viii, i18n]
supersedes: []
superseded-by: []
related: [AD-001, AD-024, AD-033, AD-036]
---

# AD-037: SPIKE-4 — 日本語 IME の composer 挙動

> **status: accepted (2026-09-27)。** SPIKE-4 (X-2「日本語 composer」の前提。roadmap L234 / L162) の結果。
> SPIKE 結果はブランチを切らず main で ADR 化する運用 (roadmap L244)。
> **本 SPIKE はコード・テスト・ハーネスを足さない** — IME E2E と日本語スクリーンショット基盤は X-2 の実装であり、
> 本 ADR のみが SPIKE-4 の成果物である (investigation ≠ implementation。[AD-033](0033-assistant-ui-elements-introduction-cost.md) の先例)。

## Context

SPIKE-4 は「日本語 IME の composer 挙動」を X-2 の spec 着手前に潰す調査である。4 つの問いがある。

1. 変換確定の Enter が送信にならないか
2. 全角混在でレイアウトが崩れないか
3. 実行中に次の入力を積めるか
4. 下書きが復元されるか

そして「**assistant-ui が IME を扱っていなければ自前ガードの要否と方針を出す**」ことが指示である
(prompts.md L184-185: 「assistant-ui 側が `isComposing` を扱っていない場合、自前ガードの実装を spec に含める」)。

### X-1 で送信経路が開いた

[AD-036](0036-single-session-launch-process-and-live-stream.md) (X-1) が composer の送信経路を初めて本番で開けた。
`src/renderer/src/features/session/SessionScreen.tsx:151` は `isDisabled` を **`runState === 'error' || killed` のときだけ** true にし、
通常は composer が有効で `onNew` → `session.send` が発火する。R-3 まで `isDisabled: true` で閉じていた経路
([AD-024](0024-constitution-verification-paths.md) #18) が、X-1 で開いた。したがって IME 挙動は「描画だけ」ではなく
「実際に送信される経路」の問題になった。

### 一次情報は grep ではなくライブラリ実ソースと公式テストにする (AD-024 #18)

AD-024 #18 と Constitution Principle VIII の Verification が明記するとおり、**Principle VIII の
`bad_pattern_grep` (`grep -rnE "onKeyDown|key === 'Enter'" src/ | grep -v "isComposing"`) は本 Principle の番人ではない**。
送信も IME ガードも `@assistant-ui/react` の内側で起きるため `src/` には現れず、grep は常に 0 件を返す。
`existing_violations: 0` は遵守の証拠にならない。AD-024 の「検証の正本を grep から移す」に従い、
本 SPIKE は **ライブラリの実ソースと公式テストを一次情報**とする。

### 測定方法

AD-033 (SPIKE-2) の先例に倣い、新規ハーネスを起こさず **main に実在する構成**を対象にした。
`@assistant-ui/react@0.15.19` の `ComposerPrimitive.Input` 実装と、Closta 側の配線
(`thread.aui.tsx` の `Composer` / `SessionScreen.tsx` の `useExternalStoreRuntime`) を読む。
electron `39.8.10` (Chromium ベースの単一エンジン。[AD-001](0001-adopt-electron-over-tauri.md) が Electron を選んだ
理由の一つが「`isComposing`/`compositionend`/`keydown` の発火順序が 2 エンジンで異なる検証コストを避ける」ことだった)。

## 調査結果 (実測)

### 1. 変換確定の Enter は送信にならない — 二重ガード + React 19 同期 + drop 復帰

`node_modules/@assistant-ui/react/src/primitives/composer/ComposerInput.tsx` を読むと、IME は**明示的に**扱われている。

| 箇所 | 行 | 内容 |
|---|---|---|
| `handleKeyPress` | L225 | `if (e.nativeEvent.isComposing) return;` — keydown 段で変換中を検出し、`Enter` 分岐 (L234) に入る**前に** return。**確定 Enter 誤送信の一次ガード** |
| `compositionRef` | L195-196 / L390-396 | `onCompositionStart` で `true`、`onCompositionEnd` で `false`。text/cursor broadcast を変換中は抑制する追跡フラグ |
| `onChange` (React 19 同期) | L365-388 | 変換中も `flushTapSync(() => aui.composer.setText(e.target.value))` で controlled value を同期し、React 19 が textarea を stale 値へ巻き戻すのを防ぐ |
| compositionend の drop 復帰 | L372-374 | `compositionRef` が立ったまま `nativeIsComposing` が false のとき (ブラウザが `compositionend` を落とした) `compositionRef` を復帰させる |
| `onCompositionEnd` の確定反映 | L397-414 | 確定時に最終値を `setText` し cursor を更新 |
| `useEscapeKeydown` | L203 | `if (e.isComposing) return;` — Escape も変換中は無視 |

公式テスト `ComposerInput.test.tsx` がこれらを固定している。

- L414-424「ignores Enter while an IME composition is active」— `requestSubmit` が呼ばれず `defaultPrevented === false`
- L265-278「syncs setText during active composition so React 19 cannot reset the textarea」— 韓国語 IME (ㄱ→가) で検証
- L280-294「commits the final value on compositionend」
- L296-309「recovers when compositionend is dropped before the next input」
- L577-588「ignores Escape while an IME composition is active」

**結論**: assistant-ui は IME を、しかも CJK IME (韓国語のテスト) を念頭に扱っている。確定 Enter のガードは
`nativeEvent.isComposing` (keydown 時) を見る形で、W3C 準拠の Chromium では確定の Enter の keydown は
`isComposing === true` (keyCode 229) で来るため効く。**prompts.md X-2 前提の「assistant-ui が `isComposing` を
扱っていない」条件は不成立であり、自前 IME ガードの新設は不要**である (作り変えない最小案)。

### 2. Closta 側の配線もガードを殺していない

`thread.aui.tsx:518-525` の `Composer` は `ComposerPrimitive.Input` を **`submitMode` 既定 (`"enter"`) /
`onKeyDown` 未上書き**で使う。ライブラリは `onKeyDown` を `composeEventHandlers` で差し込む (ComposerInput.tsx:389) ため、
消費側が独自 `onKeyDown` を足してもライブラリのガードは残る。`SessionScreen.tsx:131-136` の `onNew` は
`extractText().trim()` が空なら送らない。R-3 由来の `ChatScreen.test.tsx` (L262-275) が既に
「変換確定直後の Enter が送信経路に届かない」を回帰テストしている — ただし**これは `isDisabled: true` 前提**の番人であり、
X-1 で送信経路が開いた有効 composer に対する IME 検証ではない (§5)。

### 3. 全角混在レイアウト — textarea なので原理的に崩れない。行送りの見えは目視が残る

`ComposerPrimitive.Input` は `react-textarea-autosize` の `<textarea>` (ComposerInput.tsx:444)。全角/半角混在の折返しは
ネイティブ textarea が行う。Closta の composer は `text-base leading-6 max-h-48 min-h-10 resize-none` (thread.aui.tsx:520)。
要素の水平あふれでレイアウトが崩れる経路は無い。ただし **行送り (line-height) と全角の見えは、R-3 の rubric-b
(日本語行送り) と同じくフォント・字幅に依存し、ソースからも単体テストからも断定できない** (jsdom はフォントも字幅も
持たない。AD-024)。→ **人間 deferred / X-2 の日本語スクリーンショット比較で担保する**。

### 4. 「実行中の入力積み」「下書き復元」は IME 挙動ではない — runtime capability / composer state の設計事項

SPIKE-4 のスコープ (IME) の外だが、X-2 プロンプトが要求するので現状を切り分けて記録し X-2 に渡す。

- **実行中の入力積み (queue)**: `handleKeyPress` L253-255 `if (threadState.isRunning && !hasQueue) return;` —
  queue capability が無ければ実行中の Enter 送信はブロックされる。加えて `thread.aui.tsx:570-597` は
  `isRunning` のとき Send ボタンを Cancel (中断) に差し替える。X-1 の `useExternalStoreRuntime`
  (`SessionScreen.tsx:140-167`) は **queue capability を宣言していない**。→ **現状「実行中に次の入力を積む」はできない。**
  これは IME ではなく runtime capability の問題。X-2 は (a) external store runtime に queue を持たせるか、
  (b) 送信中も入力を保持して手動再送する UX か、を spec で決める。SDK 側 (AD-036) は単一 query の streaming input で、
  積んだ入力を claude へどう渡すか (次ターンにキュー / interrupt して steer) は session domain と要調整。
- **下書き復元 (draft restore)**: 2 種を混同しない。
  - (i) スレッド切替時の下書き保持 — external store runtime の composer state は runtime インスタンスに紐づく。
    X-1 は単一セッションでスレッド切替が無く現状問題化しない。`unstable_useComposerInputHistory` は ArrowUp/Down の
    送信済み履歴呼び戻し (別機能。しかも `@deprecated`) で、下書き復元とは別物。
  - (ii) 画面遷移・再起動をまたぐ下書き — `SessionScreen` は phase (entry/launching/active) や
    `isDisabled = error/killed` で Thread を再構成し、その過程で入力中テキストは失われる。永続下書きが要るなら
    composer text を feature 側 state / 永続層へ退避する設計が要る。標準の assistant-ui には
    「セッションをまたぐ下書き永続」は無い。→ **X-2 の FR。**

### 5. Principle VIII Automated (A)(B) の持ち主は X-2 である

AD-024 #18 / Constitution VIII (L519-522) は、Automated (A) IME E2E テスト / (B) 日本語スクリーンショット比較を
「composer の**送信経路を開ける最初の feature**で E2E 基盤と同時に載せる。`isDisabled: true` を外す変更が入った時点で
本項は**必須**になる」とし、v1.2.3 で延期先を「M4 完了後に再検討し、**SPIKE-4 の結果と合わせて再確認**」とした。

**X-1 (AD-036) がその『`isDisabled` を外す変更』を入れた。** 送信経路は既に開いている。したがって発動条件は満たされ、
X-2 プロンプト自身が「IME の E2E テストと日本語を含むスクリーンショット比較を CI に載せる」を明示的にスコープに含む。
→ **(A)(B) の持ち主は X-2 に確定する。** roadmap L120「E2E / 検証基盤 feature (M4 後)」からこの 2 項目を X-2 へ移す。
現在 main には有効 composer に対する IME E2E は無い (X-1 で開いてから X-2 で閉じるまでの窓) — これは既知 debt。

## Decision

### D1. X-2 で自前 IME ガードを新設しない (作り変えない最小案)

assistant-ui の `ComposerPrimitive.Input` が変換確定 Enter を二重ガード (keydown の `nativeEvent.isComposing`
+ `compositionRef`) し、React 19 の controlled-value 同期と compositionend drop 復帰まで持つ。prompts.md X-2 前提の
「自前ガードを spec に含める」条件は不成立。**X-2 は既存ガードを殺さないことを守る** — `onKeyDown` で
`preventDefault` しない / `submitMode` を既定 (`"enter"`) のまま使う / `Input` を独自 textarea に差し替えない。
回帰は E2E で固定する。

### D2. 「実行中の入力積み」「下書き復元」は IME でなく runtime capability / composer state として X-2 spec が扱う

SPIKE-4 は現状を切り分けた: 実行中積みは queue capability 不在で不可、下書き復元は標準機能に無い。
方針の確定 (queue を持たせるか手動再送か / 下書きの永続範囲) は X-2 の spec/plan が session domain と調整して決める。

### D3. Principle VIII Automated (A) IME E2E / (B) 日本語スクリーンショット比較の持ち主を X-2 に確定する

送信経路は X-1 で開いた。roadmap L120 の「E2E / 検証基盤 feature (M4 後)」からこの 2 項目を外し X-2 に移す。
X-2 プロンプトと整合。Automated の正本は **grep ではなく E2E + スクリーンショット比較**である (AD-024 の
「検証の正本を grep から移す」/「bad_pattern_grep は番人でない」と整合)。

### D4. 本 SPIKE はコード・テスト・ハーネスを足さない (investigation ≠ implementation)

IME E2E とスクリーンショット基盤は X-2 の実装コミットで入れる (AD-033 の先例)。本 ADR のみが SPIKE-4 の成果物。

## Consequences

### 良くなること

- X-2 の spec が「自前 IME ガードの新設」を FR から落とせる。実装コストが「既存ガードを殺さない回帰 (E2E) +
  queue/draft の新規設計 + IME E2E / 日本語スクショ基盤」に絞られる。
- Principle VIII の宙に浮いた延期 (持ち主未定・M4 後) が X-2 に着地する (持ち主のいない延期を残さない。AD-028 §5)。

### 代償 / リスク・人間 deferred

- **Chromium 実機での確定 Enter の `isComposing` タイミングは目視 E2E で確認が要る。** ソースは「`isComposing` を見て
  ガードする」ことを決定的に示すが、electron 39.8.10 上で確定 Enter の keydown が `isComposing === true` で来ることの
  実機確認は本 SPIKE では未実施 (GUI の IME 操作は自動で行えない)。R-3 の rubric 一次判断と同じ**人間 deferred** として
  X-2 の quickstart / E2E に置く。単一 Chromium エンジンのため 2 エンジン分の検証は不要 (AD-001)。
- **全角混在の行送り・折返しの見え**は目視 (X-2 の日本語スクリーンショット比較) が担保する。ソース・単体テストは
  フォント/字幅を持たない (AD-024)。
- 現在 main には有効 composer の IME E2E が無い (X-1 で送信経路が開いてから X-2 で閉じるまでの窓)。既知 debt。

### 申し送り (持ち主 = X-2)

- [ ] X-2 spec: 自前 IME ガードを新設しない旨を明記し、既存ガードを殺さない回帰 (E2E) を FR 化する。
- [ ] X-2 spec: queue (実行中積み) と draft 復元の方針を session domain と調整して確定する。
- [ ] roadmap L120 / Constitution VIII: Automated (A)(B) の持ち主を X-2 に更新する (本 ADR を根拠)。

## Confirmation

- ライブラリ実ソース: `node_modules/@assistant-ui/react/src/primitives/composer/ComposerInput.tsx`
  L195-196 / L390-414 (`compositionRef` / onCompositionStart/End)、L221-269 (`handleKeyPress` の
  `nativeEvent.isComposing` ガード)、L365-388 (onChange の React 19 同期・drop 復帰)、L198-219 (Escape の isComposing 無視)。
- 公式テスト: `ComposerInput.test.tsx` L414-424 / L265-278 / L280-294 / L296-309 / L577-588。
- Closta 配線: `thread.aui.tsx:509-531` (`Composer` — `submitMode` 既定・`onKeyDown` 未上書き) /
  `thread.aui.tsx:570-597` (isRunning で Send→Cancel) / `SessionScreen.tsx:131-167`
  (`isDisabled = error/killed` のみ・`onNew` の trim・queue capability 非宣言) /
  `ChatScreen.test.tsx:248-276` (composer 回帰。`isDisabled` 前提)。
- バージョン: `@assistant-ui/react` 0.15.19 / electron 39.8.10。
- grep が番人でないこと: AD-024 #18 / Constitution VIII Verification (L515-522)。

## References

- SPIKE-4 (`docs/roadmap.md` L234 / X-2 = L162 / SPIKE 結果は ADR 化 = L244)
- `docs/prompts.md` L178-185 (X-2 正式プロンプトと前提)
- [AD-036](0036-single-session-launch-process-and-live-stream.md) (X-1 が送信経路を開けた / 単一 query streaming input)
- [AD-024](0024-constitution-verification-paths.md) #18 (Principle VIII の Automated (A)(B) / bad_pattern_grep は番人でない / 検証の正本を grep から移す)
- [AD-033](0033-assistant-ui-elements-introduction-cost.md) (SPIKE の測定方法の先例 / investigation ≠ implementation)
- [AD-001](0001-adopt-electron-over-tauri.md) (Electron 採用理由の一つが IME の 2 エンジン検証回避)
- Constitution Principle VIII「日本語環境で破綻しない」(L496-523) / Principle XV (i18n)
- ライブラリ: `ComposerInput.tsx` / `ComposerInput.test.tsx` / `unstable/useComposerInputHistory.ts`
