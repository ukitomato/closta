<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="jetbrains/src/main/resources/META-INF/pluginIcon_dark.svg">
  <img src="jetbrains/src/main/resources/META-INF/pluginIcon.svg" width="88" alt="">
</picture>

# Closta

**JetBrains IDEでClaude CodeをネイティブUIで使うための、サードパーティ製プラグイン**

[![IntelliJ IDEA 2025.3+](.github/assets/badges/intellij.svg)](https://www.jetbrains.com/idea/)
[![Claude Code CLI](.github/assets/badges/claude.svg)](https://docs.claude.com/en/docs/claude-code)
[![Amazon Bedrock](.github/assets/badges/bedrock.svg)](https://aws.amazon.com/bedrock/)
[![Kotlin 2.4](.github/assets/badges/kotlin.svg)](https://kotlinlang.org/)
[![JDK 25](.github/assets/badges/jdk.svg)](https://openjdk.org/)
![Native Swing, no webview](.github/assets/badges/swing.svg)
[![License: Apache-2.0](.github/assets/badges/license.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/ukitomato/closta)](https://github.com/ukitomato/closta/releases)

[English](README.md) | 日本語

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/demo-dark.gif">
  <img src=".github/assets/demo-light.gif" alt="IntelliJ IDEAで動くClosta。サイドバーで始めた会話が下のSessionsにほかのセッションと並び、Claudeがdiffのカードで出した編集を許可するとKotlinファイルが書き換わる。会話をエディタのタブへ移して続ける" width="900">
</picture>

</div>

この文書は[英語版](README.md)の抄訳です。内容が食い違うときは英語版に従ってください。

Clostaはインストール済みのClaude Code CLI（`claude`）を動かし、会話をIDEのSwingの部品で表示します。編集はdiffで、1ターン分の変更はVCSの変更で、承認はカードで見せます。webviewは使いません。

- 会話はClostaツールウィンドウかエディタのタブで開き、いくつでも並べられる
- ツールの許可・ファイルの編集（diff）・計画・質問をカードで表示し、その場で答える
- 1ターン分の変更を、VCSの変更としてIDEのdiffでまとめて開く
- 下のClostaウィンドウに、待っている・動いている・終わったセッションとMCPサーバーを並べる
- IDEのどこからでも、待っている次のセッションへ移る
- メッセージから巻き戻す・分岐する、保存した会話を再開する
- 信頼したプロジェクトでは、新しいgit worktreeで会話を始める
- 認証は`claude`コマンドのサインインか、MFAコードを使うAmazon Bedrock。秘密はIDEのパスワードセーフに置く

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/screenshot-dark.png">
  <img src=".github/assets/screenshot-light.png" alt="IntelliJ IDEAで動くClosta。Kotlinのファイル、サイドバーで編集の承認を待つ会話、下のSessionsで質問に答えるところ" width="900">
</picture>

## 仕組み

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/architecture-dark.png">
  <img src=".github/assets/architecture-light.png" alt="IDEの中のClostaがstream-jsonでclaude CLIとやり取りし、claudeがAnthropicかAmazon Bedrockにつなぐ構成図" width="900">
</picture>

</div>

Clostaは会話ごとに`claude`のプロセスを1つ起動し、stdinとstdoutだけでやり取りします。会話は`claude`からAnthropicへ送られます。
Bedrockを選んだときの送り先はAmazon Bedrockです。Closta自身が呼ぶのは、Bedrockの一時認証情報を取るAWS STSだけです。

## 必要なもの

- IntelliJ IDEA 2025.3以降（build 253+）。上限は設けておらず、ビルドごとにPlugin Verifierで2025.3.6と2026.2.4を検査している
- [Claude Code](https://docs.claude.com/ja/docs/claude-code/setup) CLI（`claude`）。Clostaには同梱していないので、インストールして`PATH`に置く
- `claude`でのサインインか、Claudeモデルを使えるAmazon Bedrockのアカウント。Bedrockも同じ`claude`を通して使う

## インストール

1. [Releases](https://github.com/ukitomato/closta/releases)から`closta-<version>.zip`を取得する
2. IDEで「Settings | Plugins」を開き、歯車から「Install Plugin from Disk…」を選んでzipを指定する
3. IDEを再起動する

ダウンロードを確かめるには、同じリリースの`SHA256SUMS`をzipの隣に置いて`sha256sum -c SHA256SUMS`を実行します。

右側のClostaツールウィンドウを開くか、「Tools | Closta | Closta: New Conversation」で会話を始めます。
IDEが日本語で動いているときは画面も日本語になります。

## キー

| キー | 場所 | 動作 |
| --- | --- | --- |
| Ctrl+Alt+Shift+O | どこでも | エディタのタブで新しい会話 |
| Ctrl+Alt+Shift+Period | どこでも | 待っている次のセッションへ |
| Enter / Shift+Enter | 入力欄 | 送信 / 改行 |
| Esc | 入力欄 | 返答を止める |
| Shift+Tab | 入力欄 | 権限モードを切り替える |
| Alt+K | 入力欄 | エディタの選択範囲を`@path#L5-10`で挿入 |
| Alt+Shift+W | 入力欄 | 答えを待っているカードへ |
| `@` | 入力欄 | ファイル名を補完 |

## 設定

「Settings | Tools | Closta」で設定します。

| プロバイダ | 設定 |
| --- | --- |
| Anthropic（既定） | `claude`コマンドのサインイン（`claude` → `/login`）を使う。モデルは任意で指定 |
| Amazon Bedrock | IAMユーザーの長期アクセスキーとMFAデバイス。下の「Amazon Bedrock」を参照 |

### Amazon Bedrock

ClostaはMFAデバイスを持つIAMユーザーとしてBedrockにサインインします。`aws`コマンドも`~/.aws`も要りません。

AWS側で用意するもの:

- MFAデバイス（仮想かハードウェア）と長期アクセスキー（`AKIA…`）を持つIAMユーザー
- そのユーザーにClaudeのモデルの呼び出しを許すIAMポリシーと、リージョンで有効にしたモデル。[Claude Code on Amazon Bedrock](https://docs.claude.com/ja/docs/claude-code/amazon-bedrock)を参照

設定の手順:

1. 「Settings | Tools | Closta」を開き、「+」から「Amazon Bedrock」を選ぶ
2. 次の項目を入れて「Apply」をクリックする

   | 項目 | 値 |
   | --- | --- |
   | 名前 | 任意。プロバイダの切り替えとサインインの画面に出る |
   | AWS リージョン | `us-east-1`など。STSとBedrockの両方に使う |
   | MFA デバイス | 仮想デバイスのARN（`arn:aws:iam::123456789012:mfa/name`）か、ハードウェアのシリアル番号 |
   | セッションの長さ (秒) | 900〜129600（15分〜36時間）。既定は43200（12時間） |
   | アクセスキー ID / シークレットアクセスキー | IAMユーザーの長期キー。IDEのパスワードストレージに置き、二度と表示しない |
   | モデル (省略可) | `claude`が最初に使うモデル |
   | Sonnet のモデル ID / Haiku のモデル ID | `claude`の既定の代わりに使う推論プロファイルのIDかARN |

3. 「新しいセッションのプロバイダー」で追加したプロバイダを選ぶ。Clostaウィンドウの「+」の隣の切り替えでも選べる

会話を始めるとMFAコードを聞かれ、STSの`GetSessionToken`で一時認証情報を取ります。取った認証情報は、期限の15分前まで次の会話でも使います。会話の途中で期限が切れたら、セッションを再起動して新しいコードを入れます。

| IDEの環境変数を`claude`に | 変数 |
| --- | --- |
| 渡さない | `AWS_PROFILE`・`AWS_BEARER_TOKEN_BEDROCK`・`CLAUDE_CODE_SKIP_BEDROCK_AUTH`・ほかのプロバイダの切り替え・Anthropicの認証情報 |
| 渡す | `ANTHROPIC_BEDROCK_BASE_URL`・プロキシ・モデルの変数 |

パスワードをメモリーにだけ置く設定のIDEでは、終了したときに長期キーが消えます。「Settings | Appearance & Behavior | System Settings | Passwords」でKeePassかシステムのキーチェーンを選んでください。

WSLで`#com.intellij.execution`のデバッグログを有効にすると、`idea.log`にCLIへ渡すAWSの一時認証情報が出ることがあります。そのログは共有しないでください。

## ライセンス

[Apache License 2.0](LICENSE)。Clostaは個人のプロジェクトで、Anthropic・JetBrains・Amazon Web Services・Kotlin Foundationとは関係がなく、承認も受けていません。ClaudeとClaude CodeはAnthropicの、IntelliJ IDEAはJetBrainsの、Amazon BedrockとAWSはAmazon.com, Inc.またはその関連会社の、KotlinはKotlin Foundationの商標です。これらの名前は、互換性を説明するためだけに使っています。
