# po-reviewer Review: Claude Code からの問いに答える UI と composer のコマンドの候補 (O-10)

**Run**: 2026-10-18T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/018-session-answer-ui-and-composer-commands/spec.md

## 初回読了 viewpoint

- FR/SC: 本 PR は FR-001〜FR-017 と SC-001〜SC-010 のすべてを実装している、または影響を与える。この review で重く見たのは次の 4 組。
  - FR-012 / SC-006 (コマンドの候補と IME)
  - FR-015 / SC-008 (編集して再試行)
  - FR-007 / FR-008 / SC-003 (Elicitation のカード)
  - FR-001〜FR-003 / SC-001 (AskUserQuestion の回答)
- touched files に該当する charter / Confirmation:
  - session charter の Mission「差配」に、US-1 / US-2 (利用者が答えて差配を続ける) が直接つながる
  - AD-052 Confirmation (キー集合の pin・項目 16)
  - AD-053 Confirmation (QUERY_OPTION_KEYS 9・SESSION_EVENT_KINDS 9)
  - ui charter (composer の持ち主)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:3 Low:1
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:1 Medium:1 Low:0

## スコープ要約

O-10 は次の 4 つを入れる。

1. `AskUserQuestion` の答える部品と、AD-052 の射影
2. Elicitation の form / URL のカードと `elicitation_complete` の行 (AD-053)
3. composer のスラッシュコマンドの候補と、日本語のボタン名・フォーカスを奪わない変更
4. 拒否の行の「編集して再試行」

diff は domain / agents / main / preload / renderer と記録の文書にまたがる。code-gate は PASS で、Vitest は 3340 件が通った。quickstart の結果では、V-3 (実機の目視) と V-1 の `git diff` の照合と E2E が未実施である。

## Findings

### [High] コマンドの一覧があると、候補に当たらない `/xxx` を Enter で送れなくなる (H-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/chat/slash-commands.ts:79-89` の `slashMatcher` は、入力の先頭が `/` で、カーソルが最初の空白より前にあれば、候補の数に関係なく trigger を返す。
  - ライブラリの `node_modules/@assistant-ui/react/dist/primitives/composer/trigger/TriggerPopoverResource.js:26` は `open = detection.trigger !== null && adapter && behavior` で、一致の件数を見ない。
  - `triggerKeyboardResource.js:71-80` は、`open` のときの Enter で `e.preventDefault()` を呼び、`navigableList[highlightedIndex]` が無くても `return true` する。このため `ComposerInput.js:79-80` で送信に進まない。
  - 結果として、セッションがコマンドの一覧を報告した後に、一覧に無いコマンドや、空白を含まない `/tmp/foo` のような 1 語の入力で Enter を押すと、何も起きない。中身の無い listbox が出るだけで、送られない。Escape を押すまで送れない。
- **同種事象探索**:
  - `一致しない|no match|zzz|候補が無` を `LivePane.composer.test.tsx` で探した: 0 件。この場合のテストが無い。
  - `src/renderer/src/features/session/LivePane.composer.test.tsx` の `it(` を見た: 136 / 164 / 179 / 195 行に、候補に当たらない場合が無い。
- **リスク/影響**:
  - 既存の振る舞いが壊れる (regression)。O-10 より前は、`/foo` を Enter で Claude Code に送れていた。
  - US-3 AC4 は「入力はそのまま送れる」を一覧が無い場合にしか書いておらず、一覧があって一致しない場合が spec の Edge Cases にも漏れている。
  - Claude Code が一覧に報告しないコマンドや入力を送れず、利用者には理由が分からない。
- **推奨アクション**:
  - 候補が 0 件のときは popover を開かない、または Enter を奪わないようにする。たとえば `slashMatcher` の中で `searchSlashCommands(entries, query).items.length === 0` なら null を返す (matcher を entries から作る closure にする)。
  - component テストを 1 件足す: 一覧があり、一致しない `/zzz` を Enter で送れること。
  - spec の US-3 に、一致しないときに送れることの AC を足す。
- **根拠**: spec US-3 AC4 の趣旨 (入力はそのまま送れる)、FR-012 (「選ぶと…送らない」は候補を選んだときだけ)、PO-4 の Edge case の漏れ
- **scope 根拠**: touched files の `slash-commands.ts` / `composer-extensions.tsx` で直せる

### [High] SC-006 の計測経路の E2E が中身の無い検査になっている (stub がコマンドの一覧を出さない) (H-002) (scope: feature)

- **観察**:
  - `e2e/ime.spec.ts:93-105` の O-10 SC-006 のテストは、`[data-slot="composer-command-popover"]` が 0 件であることを確かめる。
  - しかし E2E の stub `src/main/app/e2e-capability.ts` が出すイベントは `state` / `message` / `interrupt-receipt` だけで、`meter` (`commands` / `init-report`) を出さない。
  - このため `ComposerCommandPopover` は `commands === null` で null を返し (`src/renderer/src/features/chat/composer-extensions.tsx:39`)、`ComposerCommandRoot` も popover の根を付けない (同 `:21`)。
  - 結果として、IME のガードがあっても無くても、このテストは必ず通る。
- **同種事象探索**:
  - `command|slash` (-i) を `e2e/` で探した: 本テストの 1 行 (`e2e/ime.spec.ts:100`) と、無関係の Command palette の行だけ。
  - `kind: 'meter'|type: 'commands'|'init-report'` を `src/main` で探した: 0 件。
  - component テストの `isComposing|229` を、popover を出した状態で探した: 0 件 (`ime-guard.test.tsx` は popover が無い状態だけを見ている)。
- **リスク/影響**:
  - SC-006 と US-3 AC3 (変換中は候補が出ず、矢印・Enter が変換に渡る。Principle VIII) を確かめる手段が、実際には無い。
  - ライブラリの `isComposing` のガード (`ComposerInput.js:78`) が、版を上げたときに変わっても検出できない (RK-05 が懸念した点そのもの)。
- **推奨アクション**:
  - E2E の stub に、起動の直後に `commands` の `meter` (2〜3 件) を流す fixture を足す。
  - テストの冒頭で、変換していない `/` で popover が出ることを確かめる (正の対照)。その後、変換中の `/にほんご` で popover が出ず、送信もされないことを確かめる。
  - あわせて component テストに、一覧がある状態で `isComposing: true` の ArrowDown / Enter が候補の選択に使われないことを足す。
- **根拠**: SC-006 の計測経路、Principle VIII (IME)、PO-2 (SC を確かめられること)
- **scope 根拠**: touched files の `e2e/ime.spec.ts` / `src/main/app/e2e-capability.ts` で直せる

### [Medium] Elicitation の form の検証に落ちたとき、理由が「入力を確かめてください」としか出ず、どの項目かが分からない (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/labels.ts:222` の `invalid: '入力を確かめてください'` は、`ElicitationCard.tsx:193-195` で、必須の未入力・minLength・範囲外・数として読めない値のどれで落ちても同じ 1 文として出る。項目ごとの印も無い。
- **リスク/影響**: U-6 (e) の「送らずにカードに理由を出す」を文の上では満たすが、どの項目で落ちたのかは分からない。必須の項目が多い form では、利用者が直す場所を探すことになる。
- **推奨アクション**: `matchesElicitationSchema` が外れた項目の key を返す形にし、その項目の欄に `aria-invalid` と短い理由を出す。
- **根拠**: spec U-6 (e)、PO-3 (受け入れ条件の具体性)
- **scope 根拠**: touched files の範囲で直せる

### [Medium] 「編集して再試行」が戻す文は「拒否の行より前の最も近い user-* の行」で、拒否された入力と一致しない場合がある (M-002) (scope: feature)

- **観察**: `src/renderer/src/features/session/LivePane.tsx:288-313` の `refusedUserText` は、拒否の行より前で最も近い `user-*` の行の文を返す。`appendUser` は、積んだ入力 (steer / queue) を dispatch した時点で行を足す (`running-session-store.ts:532` / `:660-675`)。
- **リスク/影響**: 実行中に追加の入力を送った後で拒否が出ると、拒否された入力ではなく後から送った入力が composer に入ることがある。US-4 AC2 の「拒否されたターンにアプリから送った文」と食い違う。
- **推奨アクション**: 少なくとも、data-model §5 と spec の Edge Cases に「拒否の行の直前の利用者の入力を、拒否された入力とみなす」ことを既知の近似として書く。厳密にするなら、拒否されたターンの開始で送った入力の id を行に結び付ける。
- **根拠**: US-4 AC2、RK-09
- **scope 根拠**: touched files の範囲で直せる

### [Medium] SC-001 / SC-010 の計測経路の一部 (V-3 の実機の目視・V-1 の `git diff` の照合) が未実施のまま、reviewing に進んでいる (M-003) (scope: feature)

- **観察**: `specs/018-session-answer-ui-and-composer-commands/quickstart-results.md:9` に「`git diff main...HEAD` の目視による差分の照合はしていない (未実施)」、`:25` に「V-3 未実施」、`:21` に「E2E は CI の job で確かめる (未実施)」とある。
- **リスク/影響**:
  - SC-001 は計測経路に「tool_result の中身の記録 (O-5 V-3 から預かった項目)」を含むが、O-5 から O-10 へ預けた項目は未記録のまま残る。
  - spec の Assumptions は未確認のまま残すことを認めている。ただし、どの SC が自動のテストだけで確かめられたのかが記録から読めない。
- **推奨アクション**: quickstart-results に、SC ごとに「自動で確かめた / 未確認」の表を置く。V-1 の `git diff` の照合は、機械で確かめられるので実施する。
- **根拠**: PO-2、SC-001 / SC-010 の計測経路
- **scope 根拠**: 本 spec の記録

### [Medium] H 観点: H-001 の振る舞いを検出するテストが無く、コマンドの一覧がある状態での送信の既存の振る舞いを守るテストが無い (M-004) (scope: feature)

- **観察**: `LivePane.composer.test.tsx` のコマンドの候補の describe (135〜) には、候補を選ぶ・閉じる・件数・一覧が無い、の 4 件しかない。一覧があるときに、候補を選ばずに送れることを確かめるテストが無い。
- **リスク/影響**: H-001 のような regression を CI が検出できない。
- **推奨アクション**: H-001 の推奨アクションのテストと同じものを足す。
- **根拠**: reviewer-base の H 観点
- **scope 根拠**: touched files の範囲

### [Low] URL のカードのリンクを中クリックや文脈メニューで開くと `accept` が返らず、カードが残る (L-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/ElicitationCard.tsx:239-249` は、`onClick` のときだけ `onRespond('accept')` を呼ぶ。`auxclick` (中クリック) や文脈メニューから開いた場合は、ブラウザは開くが `accept` を送らない。
- **リスク/影響**: U-8 が避けようとした「リンクだけ開いて accept を送らないと、承認待ちが残る」状態が、操作の仕方によっては起きる。
- **推奨アクション**: `onAuxClick` でも同じく `accept` を返すか、この限界を既知の限界として記録する。
- **根拠**: spec U-8
- **scope 根拠**: touched files の範囲

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `一致しない\|no match\|zzz\|候補が無` in LivePane.composer.test.tsx | 0 | (テストなし) |
| H-001 | `open = detection.trigger` / `case "Enter"` in assistant-ui trigger | 2 | node_modules/@assistant-ui/react/dist/primitives/composer/trigger/TriggerPopoverResource.js:26, triggerKeyboardResource.js:71 |
| H-002 | `command\|slash` (-i) in e2e/ | 1 (該当) | e2e/ime.spec.ts:100 |
| H-002 | `kind: 'meter'\|type: 'commands'\|'init-report'` in src/main | 0 | (stub は meter を出さない) |
| M-001 | `invalid:` in features/session/labels.ts | 1 | src/renderer/src/features/session/labels.ts:222 |
| M-002 | `refusedUserText` | 1 | src/renderer/src/features/session/LivePane.tsx:288 |

## Verdict

- Critical: 0
- High: 2
- Medium: 4
- Low: 1
