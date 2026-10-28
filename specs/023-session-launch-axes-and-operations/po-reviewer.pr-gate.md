# po-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割)

**Run**: 2026-10-28T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: この PR は FR-001〜FR-018 をすべて実装している。SC-001〜SC-008 は自動検証で緑 (`quickstart-results.md` の記録)。SC-009 は実機を行っておらず「未実施」 (`quickstart-results.md:34`)
  - US-1 (権限モード): FR-001〜004 / SC-001・SC-002・SC-005・SC-006
  - US-2 (モデル): FR-005〜007 / SC-003・SC-005・SC-006
  - US-3 (名前): FR-009〜012 / SC-004・SC-005・SC-006
  - 置き場所・記録: FR-013〜018 / SC-007・SC-008
- touched files に該当する charter / Confirmation:
  - session charter の Related Specs / ADRs と X-6 (最初の分割) の節 (`docs/domains/session/charter.md:45,263-264,352-354`)
  - glossary の Session name (`docs/glossary.md:1036`)
  - roadmap の X-6 の行 (`docs/roadmap.md:355`)
  - AD-062 / AD-063 の Confirmation
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (名前の規則の UX 面だけを E で扱う)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:2 Low:1
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ux-reviewer / a11y-reviewer の担当 (理由の見え方は E の AC の観点だけで M-001 に記載)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:2 Low:0

## スコープ要約

動いているセッションについて、次の 3 つを止めずに変えられるようにする。
- 権限モード (安全 3 値の中)
- モデル (Provider のカタログの中)
- 名前 (`renameSession` による transcript の custom-title)

操作は中央のヘッダに置く。あわせて対応表 E 節の `後続: X-6` の 4 行と F 節の 3 行を書き換え、AD-062 / AD-063 を足す。

実装の受け持ちは次のとおり。
- domain の純関数 (`live-settings.ts`)
- main の検証 / registry / 改名の保留と子の起動
- agents の `setPermissionMode` / `setModel`
- renderer の `LiveSettingsControls` / ストア

E2E は 3 本 (名前・モデル・権限モード) を足した。US-3 AC2 (終了後の過去の一覧に同じ名前が出る) と、US-1 / US-2 の SDK 上の実効性は、実機の SC-009 だけで確かめる設計で、その実機は未実施。

## Findings

### [High] US-3 AC4 の「入力が空」で制限の文言が出ない (H-001) (scope: feature)

- **観察**:
  - spec の要求:
    - `spec.md:152` (US-3 AC4)「名前の入力が空・100 文字を超える・改行を含む、**When** 保存しようとする、**Then** 保存は押せず、制限の文言が出る」
    - `spec.md:96`「満たさなければ保存を押せず『1〜100 文字で…』と出す」
    - `data-model.md:229`「保存は `normalizeSessionName` が null なら押せず、制限の文言を出す」
  - 実装: `src/renderer/src/features/shell/LiveSettingsControls.tsx:328` は文言を `invalid && draft !== ''` のときだけ出す。`:292` の `aria-invalid` と `:293` の `aria-describedby` も同じ条件。そのため、空の入力 (名前の無い行で開いた直後や、全部消した後) では保存が押せないのに理由が一切出ない
  - テスト: `LiveSettingsControls.test.tsx:248` の規則の外の表は `'   '`・101 文字・改行の 3 つだけで、AC4 の「空」を含まない。`:196-201` の空のテストは `toBeDisabled()` だけを見て、文言の有無を見ていない
- **同種事象探索**: `draft !== ''` を `LiveSettingsControls.tsx` で検索して 3 件 (`:292`, `:293`, `:328`)。他の部品に同じ条件は無い
- **リスク/影響**: 名前を消して付け直そうとした利用者には、保存が押せない理由が見えない。AC4 の文面と実装が食い違い、AC4 の「空」はテストに 1:1 で落ちていない
- **推奨アクション**: どちらかを選ぶ
  - (a) 一度でも入力に触れた後 (touched) は、空でも `nameRule` を出す。`:292`・`:293`・`:328` の 3 箇所の条件を揃えて直す
  - (b) 「開いた直後の空では文言を出さない」を意図した仕様にするなら、spec.md:152 / :96 と data-model.md:229 の AC を「空は保存が押せない (文言は入力の後)」に書き換える
  - どちらでも `LiveSettingsControls.test.tsx:248` の表に `''` の行を足し、期待を pin する
- **根拠**: spec US-3 AC4 / Clarifications「名前の入力の制限」/ data-model §8.2
- **scope 根拠**: touched files (`LiveSettingsControls.tsx` / `.test.tsx` / spec.md) の中で直せる

### [Medium] 押せない理由が見えるのは hover の tooltip だけで、AC の「理由つきで押せない」の検証の基準が曖昧 (M-001) (scope: feature)

- **観察**: 次の 3 箇所とも、理由は `title` 属性と `sr-only` の span だけで出していて、画面上の文字にはなっていない
  - モデルの選択: `LiveSettingsControls.tsx:78` (`title`)・`:103-107` (`sr-only`)
  - 権限モード: `:156`・`:176-180`
  - 「名前を変更」のボタン (編集前): `:265`・`:271-275`
- spec の文面: US-2 AC6 (`spec.md:135`) と US-3 AC3 (`spec.md:151`) は「理由つきで押せない」とだけ書く。FR-013 は「理由を出す」と書くが、見える文字か accessible description かを決めていない
- テスト (`LiveSettingsControls.test.tsx:262-268`) は `toHaveAccessibleDescription` だけを見る
- **リスク/影響**: マウスで hover しない利用者 (キーボードだけで使う、またはタッチの晴眼者) には、既定の Provider のセッションでモデルが選べない理由が見えない。AC がどちらにも読めるので、PO が受け入れを判断できない
- **推奨アクション**: AC3 / AC6 に「理由は accessible description と tooltip で出す (見える文字は編集中だけ)」のように表示面を明記する。見える文字が要るなら、ヘッダの下の 1 行 (`LiveSettingError` と同じ置き場所) に出す
- **根拠**: spec US-2 AC6 / US-3 AC3 / FR-013
- **scope 根拠**: touched files の中で直せる

### [Medium] 改名の結果を待つ間のプロンプトの保留 (U-9) を利用者は知るすべがない (M-002) (scope: feature)

- **観察**: `src/main/app/session-launch-service.ts:493-497` は改名の結果が出るまで `send-prompt` を保留し、出すのはログの `[session] prompts held n=` だけ。renderer 側は `changing: 'name'` の間、名前の編集に「変更中です」を出す (`LiveSettingsControls.tsx:333-336`) が、composer や会話には保留中の印が無い。保留は最長で改名の期限 (10 秒。spec.md:92) まで続く
- **同種事象探索**: renderer の `heldPrompts` / `保留` を検索して 0 件 (`src/renderer/src/features` に保留を表示する経路が無い)
- **リスク/影響**: 保存の直後に送ったプロンプトが最長 10 秒反応しない。利用者が送れなかったと思って二重に送る (保留は届いた順に全部送るので、同じプロンプトが 2 回実行される) と、UX が損なわれる
- **推奨アクション**: Edge Cases (`spec.md:166`) に「保留の間の表示」を足す。最小案は、composer に触れずに中央のヘッダの「変更中です」を名前の編集の外 (見出しの横) にも出すこと。範囲外にするなら「保留中の印は X-6 の後続」と Out of Scope に明記する
- **根拠**: spec U-9 / PO-6 (エラー時の出口と待ち状態の明示)
- **scope 根拠**: touched files の中で直せる (表示を足すなら CenterHeader / LiveSettingsControls)

### [Medium] US-1 / US-2 の中核の便益と US-3 AC2 は実機の SC-009 だけで確かめる設計で、その実機が未実施 (M-003) (scope: feature)

- **観察**:
  - `quickstart-results.md:34` は「quickstart V-0〜V-6 (SC-009): 未実施」
  - 便益の前提は `spec.md:213-216` の Assumptions 4 件がすべて「実機で確かめる」。中身は次の 4 つ
    - `setPermissionMode` / `setModel` がストリーミング入力のセッションで効き、ターンを中断しない
    - `renameSession` が JSONL を壊さない
    - WSL の UNC の config ディレクトリに書ける
    - `setPermissionMode` の後に Claude Code が新しい権限モードを報告する
  - E2E の改名は子も transcript の書き込みも起こさない (`src/main/app/e2e-capability.ts:703-708`)
  - US-3 AC2 (終了後の過去の区画に同じ名前が出て、検索で当たる) を自動で確かめるテストは無い
- **リスク/影響**: マージの条件 (SC-001〜008) が緑でも、US-1「`plan` に切り替えたら書き込みの tool が実行されない」と US-3 の「過去の一覧で探せる」という便益は観察されていない。夜間の規則 (未実施と書いてマージ) には沿っているので、これを High にはしない
- **推奨アクション**: roadmap の X-6 の行 (`docs/roadmap.md:355`) の未確認の項目に次の 3 つを明記して残す (既にあれば、そのとおりかを照合する)
  - US-1 AC2 の書き込みの tool の抑止
  - US-3 AC2 の過去の一覧での表示
  - Assumptions の 4 件
- **根拠**: spec SC-009 /「合否の扱い」/ PO-2
- **scope 根拠**: touched files (roadmap / quickstart-results) の中で直せる

### [Medium] 改名の失敗の原因がログで区別できない (M-004) (scope: feature) [H]

- **観察**: `src/main/app/session-rename-service.ts:48,50,52,57,76` は、次の原因をすべて `write-failed` に潰している
  - 会話のレコードが無い
  - 列挙対象が決まらない
  - 起動ゲートが通らない
  - 子が失敗した (期限を含む)
  - 例外
- ログは `[session] rename ok` / `rename failed` の 2 行だけ (`:81`)。renderer の表示も「名前を変更できませんでした」の 1 種類 (`labels.ts:449`)
- **リスク/影響**: 未実施の実機 (WSL の UNC への書き込み、期限 10 秒) で失敗したとき、サポートや開発者がどの段で落ちたかを特定できない (PO-7 の運用の視点)。名前・会話の id・パスを出さないという制約は、段の名前 (例: `stage=target|gate|spawn|timeout`) を出すことと両立する
- **推奨アクション**: 失敗のログに固定の語彙の段の名前を 1 つ足す。秘匿の対象 (名前・id・パス) は出さない
- **根拠**: FR-009 (名前をログに出さない) / PO-7
- **scope 根拠**: touched files の中で直せる

### [Low] 権限モード・モデルの変更中は select が元の値に戻って見える (L-001) (scope: feature)

- **観察**: `LiveSettingsControls.tsx:152` の権限モードの select は、`meters` から読んだ値で制御する controlled 要素。そのため選んだ直後から結果が返るまで、表示は元の値に戻る。モデルも同じで、`running-session-store.ts:1008-1015` は成功の後にしか `currentModelId` を更新しない
- **リスク/影響**: 短い間、選んだ値が「効かなかった」ように見える。ただし変更中は busy で再選択できず、結果が返れば表示も直る
- **推奨アクション**: 変更中は選んだ値を淡色で出す。またはこの挙動を Edge Cases に明記する

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `draft !== ''` (LiveSettingsControls.tsx) | 3 | src/renderer/src/features/shell/LiveSettingsControls.tsx:292, :293, :328 |
| M-002 | `heldPrompts\|保留` (src/renderer/src/features) | 0 | - |
| M-004 | `write-failed` (session-rename-service.ts) | 5 | src/main/app/session-rename-service.ts:48, :50, :52, :57, :76 |

## Verdict

- Critical: 0
- High: 1
- Medium: 4
- Low: 1
