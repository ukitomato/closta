---
description: 'Task list for R-1 フォルダ登録とランタイム検出'
---

# Tasks: フォルダ登録とランタイム検出 (R-1)

**Input**: [spec.md](spec.md) / [plan.md](plan.md) / [research.md](research.md) /
[data-model.md](data-model.md) / [contracts/](contracts/) / [quickstart.md](quickstart.md)

**Tests**: SC-001 / SC-003 / SC-006 〜 SC-017 はテストの存在そのものを受け入れ条件にしている。

## Format

`[ID] [P?] Description` — `BE` = Node / Electron 側、`FE` = renderer、`SH` = ツール / ドキュメント / CI。
`[P]` は同 phase 内で並列実行可能 (別ファイル・依存なし)。

`## US-1` 〜 `## US-5` が template の Phase 3〜7 に対応する。
target 別の索引は末尾。

---

## Phase 1: Setup — 公式 CLI による初期化

- [x] SH-001 公式 CLI で scaffold を生成し、リポジトリルートに取り込む (FR-033)
- [x] SH-002 `pnpm-workspace.yaml` の `allowBuilds` を設定し `pnpm install` を通す
- [x] SH-003 scaffold の既定メタデータを AD-023「公開 ID と配布メタデータ」に修正する (FR-042)
- [x] SH-004 `webPreferences` を `sandbox` / `contextIsolation` 有効・`nodeIntegration` 無効にし、
      preload を CommonJS 出力のまま維持することをビルド設定で明示する (FR-039)
- [x] SH-005 エントリのプラットフォーム分岐 2 箇所に、同じ行の末尾で注記を付ける (Principle II v1.1.0)
- [x] SH-006 [P] `.gitignore` からエディタ設定を外し、scaffold のデバッグ構成を追跡対象にする
- [x] SH-007 assistant-ui の公式 CLI で design system を導入する。**Element は採用しない** (FR-033)
- [x] SH-008 SH-007 の生成物を確認し、Principle XIII の検証条件が成立するかを判定する。
      結果を SH-017 の AD-024 #10 に反映する

**Checkpoint**: 開発起動で空のウィンドウが立ち上がり、ビルドが無改変で通る

---

## Phase 2: Foundational — レイヤと依存規則 (BLOCKING)

SH-010 〜 SH-016 は US-4 の成果物でもある。ここで作るのは仕組み、US-4 は検証と CI 搭載。

### レイヤ構造

- [x] SH-010 5 レイヤのディレクトリを作成し、tsconfig の `include` を拡張する。
      **`target` / `lib` を Electron 同梱 Node に合わせ、根拠をコメントで残す** (FR-034 / AD-013)

### 依存規則の強制

- [x] SH-011 `eslint-plugin-boundaries` で AD-023 §7 の許可行列を設定する。
      `ui → domain` は型と副作用のない純粋関数まで (AD-025)。node builtins も対象に含める (FR-035)
- [x] SH-012 `no-restricted-imports` を設定する — パス操作の標準モジュールは
      **パス API の実装ファイル 1 つのみ**許可 (接頭辞あり / なし、サブパスを含む)。
      `electron` は `app` レイヤと `infra/secrets/` のみ。
      プラットフォーム判定とプロセス起動の標準モジュールは `infra/runtime/` のみ。
      ネイティブモジュールは `agents` / `domain` で禁止 (FR-025 / FR-036 / FR-038 / FR-041)
- [x] SH-013 dependency-cruiser を設定する — **推移的**ルールとして
      `agents ⇢ electron / ネイティブモジュール` 到達禁止 /
      `domain ⇢ I/O モジュール` 到達禁止 (接頭辞付きの別名も含む。パス操作モジュールは含めない) /
      **パス操作モジュールへの到達を実装ファイル 1 つに限定** (`require()` を塞ぐ唯一の層) /
      **`ui ⇢ node builtins` 到達禁止** /
      状態を持つ調停クラスから I/O モジュールへの直接依存を禁止 /
      `agents ↛ infra` / `app ↮ ui` / 循環依存 (FR-035)
- [x] SH-014 `scripts/constitution/` に検証スクリプトを実装する — research R-08 の**検証項目すべて**
      (現在 11 項目。項目 9 = 関連付け API、項目 10 = CSP、項目 11 = ナビゲーション拒否と origin 定数)。
      許可リストはスクリプト内の名前付き定数とする。文字列リテラルを走査し、
      引数配列で構成されたコマンドも捕捉する。プラットフォーム分岐の検出は
      等価な API と構文変形 (分割代入・ブラケット記法) を含める。
      **項目 6 は「定数と一致するか」だけでなく、(i) 定数が単一のリテラルであること、
      (ii) 標準入力へ書く式が定数の識別子そのものであること、(iii) 定数の内容が許可する
      コマンド形の allow-list に収まること、の 3 点を検査する**。
      **項目 10 は CSP が FR-040 の directive 集合を満たすことと `unsafe-inline` /
      `unsafe-eval` の不在の両方を検査する。開発用の CSP 定義も走査対象に含め除外しない**。
      **項目 11 として `setWindowOpenHandler` の存在と送信元 origin 定数の単一性を追加する**。
      **検証スコープに `scripts/` を含め、除外はファイル単位の明示リストとする**
      (FR-036 / FR-037 / FR-040 / FR-041 / SC-016)
- [x] SH-015 `package.json` に `lint` / `typecheck` / `depcruise` / `check:constitution` /
      `test` / `test:rules` スクリプトを追加する
- [x] SH-016 [P] Vitest と Testing Library を設定する。`domain` はモックゼロで書け、
      preload をスタブした renderer 単体テストが書けること

### Constitution と registry の追随

- [x] SH-017 `docs/decisions/0024-constitution-verification-paths.md` を起票し、
      plan の「#2 の内訳」**17 項目**をまとめて改める。**version bump は MINOR (v1.2.0)**。
      #13 / #14 は NON-NEGOTIABLE の改定にあたるため既存違反 enumeration を伴う。
      **#14 (Principle I の Statement) / #15 (XI の Exceptions) / #16 (XIV 本文) /
      #17 (未解決候補 #2) は本 feature の完了で事実と食い違う本文**であり、
      検証条件だけを直しても閉じない
- [x] SH-018 [P] `docs/decisions/0025-workspace-folder-carries-location.md` を起票する —
      所在を伴う作業フォルダ / パス型モデルの一般化と AD-004 の読み替え /
      AD-004 と AD-023 の調停 / `ui → domain` の範囲 / 安全側解釈の位置づけ /
      **R-2 への申し送り 2 件** (停止中ディストロ内のセッションは対象外 /
      列挙用プロセス起動モジュールの追加には ADR が要る)
- [x] SH-019 [P] `.specify/spec-gate/reviewers.yml` と **`.claude/agents/` 配下で Principle の
      条件式・ディレクトリ名を本文に持つ箇所**を AD-023 / AD-024 に追随させる
      (`autoModeSafe === false` → `!== true`、`src/supervisor/` → `src/agents/`)。
      `database-reviewer` の発火条件に設定層を追加する

### domain の型と規則

- [x] BE-001 [P] パス型 — 3 名前空間と生成関数、`PathMapping` (data-model §1 / §2)。
      **`isSameDistro(a, b)` を定義する — `NamespaceId` からディストロ成分を取り出してよい
      唯一の場所とし、比較は完全一致 (部分一致で書くと `Ubuntu` が `Ubuntu-26.04` に当たる)**。
      **`RuntimePath` と `WslUncPath` は名前空間識別子をディストロ粒度で保持する**。
      `WslUncPath` は識別子と値に埋め込まれたディストロ名の一致を生成時に検証する
- [x] BE-002 [P] `capabilities` 型と**allowlist による `autoModeSafe` の導出**、
      安全側解釈の単一判定点 (data-model §3 / FR-008)
- [x] BE-003 [P] `RuntimeDescriptor` / `AgentRuntime` / 検出インタフェース /
      **実行中確認済みを表す型** (外部から組み立てられない形にし、
      **対象ディストロの識別子を保持する**。data-model §5)
- [x] BE-004 [P] `WorkspaceFolder` を判別可能な union にし、
      **名前空間照合を 1 つの純粋関数に集約**する (data-model §6)
- [x] BE-005 パス API の実装 — **パス操作の標準モジュールを import してよい唯一のファイル**。
      ホスト / ランタイム両名前空間の操作、相互変換、UNC 変換、合成、
      **子・親のパスの組み立て** (IPC が完成した値を返すため。contracts/ipc-capability.md)。
      **入口で名前空間識別子の一致を検証する。セグメント境界照合 + 最長一致。**
      **`from === to` は恒等として接頭辞照合を行わない** (`Win32Runtime` の `host`)。
      **UNC 変換は対象ディストロ識別子を必須引数で受け取る** (FR-021 / FR-025 / FR-026)
- [x] BE-006 [P] 接頭辞照合を**標準モジュールに依存しない別モジュール**に置く
      (`ui` から到達できるようにするため。data-model §7)
- [x] BE-007 [P] IPC DTO を `domain` に置く。**生の capability 値と再導出の素材を含めない**
      (contracts/ipc-capability.md)

### app レイヤと IPC 境界

- [x] BE-008 preload — `contextBridge` で単一 capability を公開する (FR-039)
- [x] BE-009 IPC ハンドラの基盤 — **送信元とペイロードをすべて未信頼として検証**する
      (contracts/ipc-capability.md の検証表)。**送信元の検証を省かない** —
      検証表の先頭行であり、ペイロード検証だけでは AD-023 の要件を満たさない (FR-039)
- [x] BE-010 composition root — **Electron 由来の値をここで解決し `infra` / `domain` に注入**する。
      `AgentRuntime` を descriptor から**都度組み立てるファクトリ**を結線する (FR-038)
- [x] BE-011 ウィンドウ生成 — **カスタムプロトコルの登録と CSP の設定** (FR-040)。
      **ハンドラは正規化後も同梱 renderer 出力ディレクトリ配下に収まる要求だけを解決する**
      (親ディレクトリ参照とその符号化形を拒否する)。
      **CSP に `unsafe-inline` / `unsafe-eval` を含めない (開発ビルドでも)**。
      **scaffold の `setWindowOpenHandler` を維持し、外部 URL への遷移と新規ウィンドウ生成を
      拒否する (外部リンクは OS の既定ブラウザへ委譲)**。
      **許可する送信元 origin の集合を 1 つの定数に置き、開発ビルドの配信元もそこに含める
      (環境で検証を無効化する分岐を作らない)**。OS へのプロトコル関連付け API を呼ばない
- [x] BE-012 単一インスタンス制限。2 つ目は既存ウィンドウに合流する (FR-020 / SC-014)
- [x] FE-001 Zustand store とアプリシェル。preload の capability のみを使う。**UI 文言は日本語** (FR-047)

**Checkpoint**: lint / 型検査 / 依存グラフ検証 / Principle 検証が**すべて違反 0 件**で通る (SC-009)

---

## US-1 — 起動先ランタイムの検出と提示 (P1) 🎯 MVP

**Goal**: `Win32Runtime` と WSL ディストロごとの `WslRuntime` が capabilities つきで一覧される

### Tests

- [x] BE-020 [P] 列挙 3 系統の出力パーステスト。フィクスチャに
      **UTF-16LE / CRLF / 翻訳済みヘッダ / 既定マーカー / 空白を含む名 / 数字を含む名**を含める (SC-002 / SC-011)
- [x] BE-021 [P] capabilities 判定のテスト — 実地判定 4 項目 / WSL1 / 停止中 /
      実行中かつ未判定 / **判定出力が不完全** / **必須依存が Windows マウント配下にのみ解決される
      (既定・非既定のマウント位置の両方)** / **再判定中に安全側に倒れること** /
      `Win32Runtime` の固定値 (SC-003)

### Implementation

- [x] BE-022 ディストロ列挙 — **3 系統を並列に 1 回ずつ**。
      **ディストロ名の文字種を列挙の時点で検証し、満たさない名前は descriptor を作らず
      列挙不能として理由つきで返す** (data-model §4)。UTF-8 要求、復帰文字の除去、
      ヘッダの読み飛ばし、**状態を文字列一致で判定しない**、
      **バージョンは既知の名前を剥がした残りから読む** (FR-002 / contracts C-1・C-2)
- [x] BE-023 実行状態の確認 — **実行中確認済みの値を作る唯一の経路**。
      一括取得に対応する (FR-007 / FR-010 / contracts C-3)
- [x] BE-024 [P] `Win32Runtime` の descriptor 生成 (固定 capabilities。**`probedAt` を含める** —
      含めないと導出式が `unknown` を返し AD-003 と charter KPI を満たさない)。
      パス変換ロジックは持たずパス API に委ねる (FR-004)
- [x] BE-025 WSL1 の固定値導出 (実地テストなし。FR-004)。
      **固定値に `probedAt` を含める**。
      **実行中の WSL1 にはマッピング取得のためだけに 1 回呼び出しを発行する** —
      免除されるのは sandbox 判定であってパス変換のマッピングではない (data-model §3 / §8 第 2 段)
- [x] BE-026 capability 判定 — **実行中確認済みの値のみを受け取り**、
      1 回の呼び出しで判定材料とマッピングを取得する。**スクリプトは標準入力で渡し、
      定義済みの内容に固定する**。**マッピングを先に確定させてから依存の判定を行い、
      解決パスが Windows マウント配下なら不在扱いとする**。
      **完了の標識と項目の完全性を検査する** (FR-005 / FR-023 / research R-02)
- [x] BE-027 検出結果のキャッシュ — キーに識別子を含む。**再検出は明示操作のみ**。
      descriptor 更新時に `AgentRuntime` を破棄する (FR-010 / FR-011 / contracts C-6)
- [x] BE-028 ランタイム関連の IPC ハンドラと通知。**判定バッチでは実行状態を一括で 1 回確認**し、
      単発の再判定では毎回確認する。未判定の descriptor を先に返す (SC-004 / SC-005)
- [x] BE-029 [P] WSL が利用できないときに**例外を投げず** `Win32Runtime` のみを返す経路 (FR-012 / SC-015)
- [x] BE-030 [P] **SC-004 の計測点** — 一覧描画・判定バッチ・キャッシュ再表示・ブラウズ階層移動を
      計測し、開発ビルドでログ出力する
- [x] FE-010 ランタイム一覧 UI — capabilities / 未判定 / 判定中 / **判定失敗 (再検出の導線つき)** /
      **列挙不能 (理由つき)** /
      **seccomp の 3 値 (未判定を区別)** /
      不足依存の案内と**導入手順への導線**を日本語で表示する。
      **無人実行の可否表示は表示用の値を使い、生の値から再導出しない** (FR-009 / FR-047)
- [x] FE-011 [P] 「再検出」操作と通知の購読 (FR-010)

**Checkpoint**: quickstart V-1 が通る。**検証前後で停止中ディストロの状態が変わらず、
停止中の識別子で IPC を直接叩いても拒否される** (SC-005)

---

## US-2 — 所在を選んで作業フォルダを登録する (P1)

### Tests

- [x] BE-040 [P] パス正規化と重複判定のテスト — ドライブレターの大小、末尾セパレータ、
      空白・日本語・非 ASCII (SC-013)
- [x] BE-048 [P] **IPC ハンドラの検証テスト** — preload をスタブせず main 側ハンドラを直接呼び、
      **検証表の各行**について不正入力が拒否されることを確認する (SC-018)。
      送信元不一致 / 期限切れトークン / 他送信元のトークン / `unc:<D>` を `wsl:<D>` として渡す /
      バックスラッシュを含む POSIX 値 / 未検出 descriptor の所在 / 所在 `windows` への `beginBrowse`
- [x] BE-041 [P] 永続化の復元テスト — JSON 破損 / スキーマ版不一致 /
      **所在の種別は一致するがディストロ名が異なる** / **`id` 重複** /
      **制御文字や長さ超過の `displayName`** / **バックスラッシュを含む POSIX パス値** /
      **文字種制約を満たさない `location.distroName`** の 7 ケースで、読めた分が復元され件数・理由・退避先が返ること。**起動失敗 0 件** (SC-013)

### Implementation

- [x] BE-042 パス正規化と重複判定の純粋関数 (FR-016)
- [x] BE-043 [P] UNC 経由の列挙 — **完成した UNC パスを受け取る**。
      **返す値は `wsl:<D>` の `RuntimePath` に変換済みとし、`unc:<D>` を IPC 境界へ出さない**。
      **期限の検査はファイルアクセスの前に行い、失敗検知に依存しない** (data-model §5)。
      **有効期間内の実行中確認済みの値に対してのみ発行**し、
      **値と UNC 値が同じディストロを指すことを `isSameDistro()` で検証する**
      (`wsl:<D>` と `unc:<D>` は種別が異なるため「種別まで完全一致」は適用できない)。
      **各エントリと親・現在地のパスを完成した値として返す** (呼び出し元に合成させない)。
      権限不足・長さ超過・未検出を区別して返す (FR-015 / FR-025 / contracts C-5)
- [x] BE-044 [P] JSON 永続化 — **ユーザデータのパスを引数で受け取る**。`electron` を import しない。
      スキーマ版と名前空間つきパスを保存し、フィールドを allow-list で固定する。
      **allow-list はキー名の許可であり、値の検証を別に行う** (`id` の形式と一意性 /
      `displayName` の長さと制御文字 / `registeredAt` / パス値の文字種)。
      **復元失敗時は上書き前に退避**し、atomic 置換で書く (FR-019 / contracts/workspace-store.md)
- [x] BE-045 [P] 所在 `windows` のネイティブフォルダピッカー。**`app` レイヤに置く** (FR-013 / FR-038)
- [x] BE-046 フォルダ関連の IPC ハンドラ。**ブラウズセッションを開く操作で実行状態を 1 回確認**し、
      トークンに紐づけて一定時間再利用する。階層移動でプロセスを起動しない。
      **階層移動は `{ root | child | parent }` で受け、パスの合成は main 側のパス API で行う。**
      **移動先がトークンの所在と同じ名前空間かをディストロ名まで検証する。**
      **重複登録を弾くときは既存エントリを返す**。
      **所在 `windows` へのブラウズセッション要求は常に拒否する** (host の入口はピッカーのみ)。
      **`target.of` の名前空間はトークンと種別まで完全一致を要求する**
      (FR-010 / FR-015 / FR-016 / FR-025 / SC-004)
- [x] BE-047 登録フォルダの到達可能性を **3 値**で判定して通知する (data-model §6 の第 0 段 + 畳み込み)。
      **所在ディストロが停止しているだけのものを「到達不可」に潰さない**。
      **実在確認は所在 `wsl` では `infra/fs` 経由とし、実行中確認済みの値を持つときだけ発行する。
      持たないときは実在確認をせず `blocked` で止める** (`folder-missing` を出してはならない)。
      **実在確認は登録済みエントリに限る** (FR-017 / FR-027 / SC-005)
- [x] FE-020 所在選択 UI。**停止中ディストロを選んだら起動と再検出の導線**を出し、
      黙って起動しない (FR-018)
- [x] FE-021 フォルダブラウザ。**main が返すパスをそのまま使い、renderer でパス文字列を
      連結しない** (FR-025)。権限不足・長さ超過を日本語で提示する (FR-047)
- [x] FE-022 [P] 登録フォルダ一覧 — 空状態の導線 / 到達可能性 **3 値**の区別表示 /
      **解除操作はすべてのエントリに出し、解除を「勧める」表示は「到達不可」のときだけにする**
      (「一時的に解決不能」には解消手順。越境の案内が旧エントリの解除を含むため操作は制限しない) /
      **復元できなかった件数と理由の提示** (FR-013 / FR-017 / FR-019 / SC-013)

**Checkpoint**: quickstart V-2 が通る

---

## US-3 — フォルダとランタイムの組み合わせを解決する (P1)

### Tests

- [x] BE-050 [P] パス変換の**性質テスト** — SC-001 の **12 ケース**
      (**別ディストロの UNC 値で変換不能** / **`Win32Runtime` の恒等変換** /
      **バックスラッシュを含む POSIX 値で変換不能** を含む)
- [x] BE-051 [P] 判定 3 段の**全セル**を網羅するテスト。
      **所在 WSL かつ Windows マウント配下が越境になること**、
      **到達可能な組み合わせの停止中ランタイムが「一時的に解決不能」になり選択肢に残ること**、
      **停止中でも別ディストロなら「到達不可」で選択肢に出ないこと** (順序の固定)、
      **実行中かつ判定未完了 / 判定失敗が「一時的に解決不能」になること**、
      **マッピングに無いドライブが `WslRuntime` との組み合わせで「到達不可」になること**、
      **実行中 WSL1 がマッピングを持ち第 3 段に進むこと** (`probeState` で分岐しないこと)、
      **`blocked` から解消手順を経て `unreachable` に確定した組み合わせで理由が返ること**
      (SC-006 / SC-007)

### Implementation

- [x] BE-052 解決関数 — 到達可能性 3 値と越境の判定を
      **「到達可否 → 変換材料の有無 → 変換と越境」の順**で行う (data-model §8)。**接頭辞照合モジュールを使い、
      パス API には依存しない**。越境時は影響・推奨配置先・手順の 3 要素を、
      解決不能時は手順を必ず返す (FR-027 〜 FR-031)
- [x] BE-053 解決の IPC ハンドラ。変換は main 側で行い、マッピングの中身を renderer に渡さない
- [x] FE-030 組み合わせ選択 UI — **「到達不可」は選択肢に出さず、「一時的に解決不能」は出して
      解消手順を示す**。**選択肢が 0 件のときは理由と次の操作を示す** (到達可能なランタイム 0 件 /
      **登録フォルダ 0 件**の双方。後者は登録画面への導線)。
      **解消手順を実行した結果「到達不可」に確定した組み合わせは、消すと同時に理由を示す**
      (黙って消さない。FR-028)。
      理由を内部識別子のままでなく日本語で提示する (FR-028 / FR-047 / SC-007)
- [x] FE-031 越境バッジと推奨案内。**越境でも選択可能**にする (FR-030 / SC-006)
- [x] FE-032 [P] **renderer 単体テスト** — preload をスタブし、
      (a) 到達不可が選択肢 DOM に現れない、(a2) **解消手順の実行後に消えた組み合わせの理由が描かれる**、
      (b) 解決不能が現れて手順が描かれる、
      (c) 越境案内の 3 要素が描かれる、(d) 復元失敗の件数が描かれる、
      (e) WSL 非搭載時に一覧が壊れない (SC-006 / SC-007 / SC-013 / SC-015)

**Checkpoint**: quickstart V-3 / V-5 が通る。**この時点で R-2 に着手してよい**

---

## US-4 — 依存規則違反がその場で止まる (P1 / Foundational)

- [x] SH-020 `tests/rule-fixtures/` に違反サンプルと**期待表**を置く。2 群に分ける。- **(a) ルールが直接見ている形** — `domain` からの I/O import / `agents` から推移的に
      `electron` / パス操作モジュールの直接 import / 注記なしのプラットフォーム分岐 /
      許可外での docker 名指し / 名前空間の取り違え / 循環依存 - **(b) 等価経路** — `require()` / 動的 import / 等価なプラットフォーム判定 API /
      分割代入とブラケット記法 / 環境を変えるサブコマンドの引数配列 /
      出力系コマンドとリダイレクトの組み合わせによるディストロ内の永続化 /
      許可外モジュールからのプロセス起動 / 実行中確認済みの型の偽造 /
      `ui` から `domain` 経由での builtin 到達 /
      **`ui` でのパス文字列の連結** (import が発生しないため lint もグラフ検証も掛からない) /
      **正規の実行中確認済みの値を別ディストロに流用する** /
      **IPC 境界で `PathDTO.namespace` を付け替える (接頭辞の文字列剥がし)** - **US-4 の AC-1 〜 AC-11 が名指す経路は、群 (a) / (b) の別を問わずすべて
      SC-008 の全数検出対象**である (SH-011 〜 SH-014 と型検査が実装対象としている)。
      群 (b) の残余 — どの AC も名指していない等価経路 — だけが SC-017 の追跡対象になる
- [x] SH-021 **ルール検証ランナー** (`test:rules`) を実装する — サンプルを一時的に検査対象へ
      展開して各検証を実行し、**期待表との一致**を assert して後始末する。
      通常の lint / 検証は**違反 0 件のまま**であること (SC-008 / SC-009 / SC-017)
- [x] SH-022 CI ワークフローを追加する — lint / 型検査 / test / depcruise /
      check:constitution / test:rules。**ランナーは Windows を基準**とし、
      Node は Active LTS を基準に Current を許容失敗ジョブで回す (AD-013)。
      **Principle VIII の Automated 検証を R-1 でどこまで載せるかを決め、
      載せない分は延期条件を AD-024 に記録する**
- [x] SH-023 [P] **SH-017 の AD-024 が accepted になった後**、Constitution の各検証を
      **改定後の条件で**実行し違反 0 件を記録する。記録先は BOOTSTRAP 側とし、
      無ければ section を新設する

**Checkpoint**: quickstart V-4 が通る。CI が緑

---

## US-5 — リポジトリを訪れた人が現状を把握できる (P3 / Polish)

R-1 の完了条件だが **R-2 をブロックしない**。

- [x] SH-030 `README.md` を全文英語で書き、scaffold の README を置き換える。
      **1 行要約 / 実装 status / ライセンス表記の 3 節**を持ち、未実装機能を実装済みのように
      書かない (FR-044 / SC-012)
- [x] SH-031 [P] `LICENSE` に MIT License 全文を置き、`package.json` と一致させる (FR-045)
- [x] SH-032 [P] `docs/runtime/wsl-sandbox-dependencies.md` を作成し、
      sandbox の必須依存の導入手順をディストリビューション別に記載する。
      capabilities の導線が指すアンカーを定義する (FR-048)
- [x] SH-033 [P] `docs/glossary.md` を更新する — data-model §10 の**追加語すべて**と既存 4 項目の修正、
      Detected synonyms の 2 行 (FR-046)

**Checkpoint**: quickstart V-7 が通る

---

## Phase 8: Polish & Cross-Cutting

- [x] SH-040 Agent SDK を依存に追加し `asarUnpack` を設定する。**本 feature では呼び出さない**
- [x] SH-041 ビルドとインストーラ生成を**1 回完走**させ、ネイティブバイナリが展開された状態で
      含まれることを確認する。**結果を `docs/decisions/` に記録する** (FR-043 / SC-010)
- [x] SH-042 [P] `docs/domains/runtime/charter.md` を更新する — plan「上流 SSoT の追随」の表のとおり
- [x] SH-043 [P] `docs/domains/isolation/charter.md` の `autoModeSafe` 前提 2 箇所を更新する
      (**I-3 着手前に必須**)
- [x] SH-044 [P] `docs/domains/_overview.md` を更新する — invariant のパス API 表記と R-1 行の実体
- [x] SH-045 [P] AD-015 / AD-016 の Open Question のうち本 feature で決着したものを閉じ、
      AD-025 へのリンクを張る
- [x] SH-046 [P] `docs/roadmap.md` を更新する — R-1 行 / SPIKE-13 の状態 /
      **R-2 の依存を「R-1 の US-1〜US-3 完了」に細分**
- [x] SH-047 [P] `docs/discovery.md` / `docs/prompts.md` /
      `.specify/templates/plan-template.md` / `PLAN.md` を更新する — Tech Stack、
      `supervisor` を実ディレクトリとして参照している箇所、
      **`runtime.path` 表記 (AD-024 #14)**。plan-template は Constitution Check の
      チェック項目そのものであり、放置すると R-2 以降の全 plan が旧文言で判定する
- [x] SH-050 [P] `docs/domains/ui/charter.md` の **Out of scope に「他 domain の操作 UI
      (一覧・登録・選択画面) は各 domain が持つ。本 domain は transcript / tool 表示の
      element 選定と見た目を持つ」を追加**し、Principle XII の持ち主を明確にする。
      **In scope は触らない** — 実体は既に「preload / IPC **越しの**ストリーミングブリッジ」に
      限定されており、基盤そのものを掲げてはいない。
      あわせて「renderer の配信プロトコル・CSP 基線・検証項目 10 は R-1 が `app` レイヤで固定する。
      `ui` 系 feature がこれを超える指定を要する場合は、nonce / hash で `unsafe-inline` を
      用いずに満たすか、緩和を ADR で記録する」を追記する
- [x] SH-049 [P] `docs/domains/session/charter.md` の KPI に「**実行中のディストロについて**」の
      限定を加える (**R-2 着手前に必須**)。停止中ディストロ内のセッションは SC-005 の帰結として
      R-2 では列挙できない
- [x] SH-048 quickstart の V-1 〜 V-7 を実機で通し、結果を記録する
      **V-4 / V-5 / V-7 は通過。V-1 / V-2 / V-6 は一部。V-3 は未実施。**
      画面操作を要する細目は**実施者の判断で打ち切った** — 手順は
      [manual-checklist.md](manual-checklist.md) に残してある。
      結果と、未実施が後続に持つ意味は [quickstart-results.md](quickstart-results.md) に記録した

---

## Task index by target

### Backend (`main` / `preload` / `domain` / `agents`)

| ID | 概要 | Story |
|---|---|---|
| BE-001 〜 BE-007 | `domain` の型・パス API・接頭辞照合・capabilities・DTO | Foundational |
| BE-008 〜 BE-012 | preload / IPC 検証 / composition root / ウィンドウ + CSP / 単一インスタンス | Foundational |
| BE-020 〜 BE-021 | 検出パースと capabilities 判定のテスト | US-1 |
| BE-022 〜 BE-030 | 列挙 / 実行状態確認 / Win32 / WSL1 / 判定 / キャッシュ / IPC / 未搭載経路 / 計測 | US-1 |
| BE-040 〜 BE-041 / BE-048 | 正規化・重複・復元・IPC 検証のテスト | US-2 |
| BE-042 〜 BE-047 | 正規化 / UNC 列挙 / 永続化 / ピッカー / IPC / 到達可能性 3 値の判定 | US-2 |
| BE-050 〜 BE-051 | パス変換の性質テスト / 解決表の網羅テスト | US-3 |
| BE-052 〜 BE-053 | 解決 / IPC | US-3 |

### Frontend (`renderer`)

| ID | 概要 | Story |
|---|---|---|
| FE-001 | store とアプリシェル | Foundational |
| FE-010 〜 FE-011 | ランタイム一覧 / 再検出 | US-1 |
| FE-020 〜 FE-022 | 所在選択 / フォルダブラウザ / 登録一覧 + 復元報告 | US-2 |
| FE-030 〜 FE-032 | 組み合わせ選択 / 越境バッジ / renderer 単体テスト | US-3 |

### Shared (ツール / ドキュメント / CI)

| ID | 概要 | Story |
|---|---|---|
| SH-001 〜 SH-008 | 初期化・メタデータ・design system・Principle XIII 条件の確認 | Setup |
| SH-010 〜 SH-016 | レイヤ + tsconfig / ESLint / dependency-cruiser / 検証スクリプト / Vitest | Foundational |
| SH-017 〜 SH-019 | AD-024 (17 項目) / AD-025 / reviewers.yml | Foundational |
| SH-020 〜 SH-023 | 違反サンプル 2 群 / ルール検証ランナー / CI / Principle 実測 | US-4 |
| SH-030 〜 SH-033 | README / LICENSE / 導入手順文書 / glossary | US-5 |
| SH-040 〜 SH-050 | パッケージング + 記録 / charter ×4 / _overview / ADR / roadmap / discovery + template / 実機検証 | Polish |

---

## Dependencies & Execution Order

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational)  ← BLOCKING。US-4 の仕組み側を含む
    ↓
US-1 ──┐
US-2 ──┼→  US-3 は US-1 と US-2 の出力を使う
US-3 ←─┘
    ↓  ここで R-2 に着手できる
US-4 / US-5    Phase 2 完了後いつでも着手可
    ↓
Phase 8 (Polish)
```

- **SH-023 は SH-017 の後**でなければならない (改定後の条件で実測するため)
- **SH-043 は I-3 着手前に必須**
- **SH-049 は R-2 着手前に必須**
- **BE-005 (パス API) は BE-001 に依存する。** `[P]` を付けない
- **BE-003 は BE-001 / BE-002 の型を参照する。** `[P]` を付けない
- US-2 は所在の選択肢に US-1 の検出結果を使う。並行させる場合はスタブで代替する
- US-3 の `domain` 側 (BE-050 〜 BE-052) は値を直接組み立ててテストでき先行して書ける
- 同一ファイルを触るタスクは直列 — `eslint.config.mjs` (SH-011 / SH-012)、
  `package.json` (SH-002 / SH-003 / SH-015 / SH-031 / SH-040)、
  エントリ (SH-005 / BE-012)

---

## Implementation Strategy

### MVP (US-1 まで)

Phase 1 → Phase 2 → US-1 を完了させ、**停止**して quickstart V-1 を実機で通す。
とくに SC-005 を、検証前後の状態比較**と**停止中識別子での IPC 直接呼び出しの両方で確認する。
この時点で「このホストで何が使えるか」が分かり、単体で価値がある。

### 増分

Setup + Foundational → US-1 (MVP) → US-2 → **US-3 (ここで R-2 に着手可)** → US-4 → US-5。
**US-4 / US-5 / Phase 8 は R-1 の完了条件だが R-2 をブロックしない。**

### 注意

- **`wsl.exe` をループ内で呼んだ時点で SC-004 は落ちる。** 呼び出し回数を設計の制約として扱う
- **UTF-8 出力の要求漏れは「文字化け」ではなく「検出の全失敗」として現れる**
- **スクリプトを引数で渡すと整形コマンドが静かに壊れる。** 標準入力で渡す
- **`sandbox !== 'none'` と書いた時点で未判定が「安全」になる。** allowlist で書く
- **`/mnt/` を条件に書いた時点でマウント位置を変えた環境が壊れる。** マッピングを基準にする
- **停止中を到達可否より先に見た時点で、起動しても使えない組み合わせに起動を勧めることになる**
- **規則を全称で書いた時点で、その規則が当たる全フィールドを列挙して例外を宣言する義務が生じる**
- **固定値経路で `probedAt` を落とした時点で、`Win32Runtime` が永久に「判定中」と表示される**
- **`DirEntryDTO` に名前しか載せなかった時点で、renderer がパスを連結する。**
  import が発生しないため lint もグラフ検証も止められない
- **`unc:<D>` を IPC 境界へ出した時点で、境界上で接頭辞を剥がす実装になる。**
  これも文字列操作であり検証に掛からない
- **第 2 段を `probeState` で分岐した時点で、実行中 WSL1 の Windows フォルダが全滅する**
- `domain` に I/O を入れると依存グラフ検証が止める。設計の誤りを早期に知らせる仕組みとして使う
- コミットメッセージは**英語の件名 1 行** (Principle XV)
