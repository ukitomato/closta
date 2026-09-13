---
status: accepted
date: 2026-09-12
id: AD-014
deciders: ukitomato
tags: [naming]
supersedes: []
superseded-by: []
---

# AD-014: 名称と識別子

## Context

AI エージェント領域の命名は現在進行形で埋まっており、意味的に適合する語ほど先に取られている。

## Decision

**プロダクト名は Closta。** cloister（回廊）の縮約による造語である。

中庭を囲んで独立した房が並び、中央から全体を見渡せる構造に由来する。英語の `cloistered`
（隔離された）と同根であり、**隔離・俯瞰・差配**という本プロダクトの 3 要素を 1 語に含む。

### 識別子

| 用途 | 値 |
|---|---|
| リポジトリ / パッケージ名 | `closta` |
| CLI 名 | `closta` |
| spec-gate の daily wrapper prefix | `cl`（`/cl-spec`、`/cl-plan` ほか） |
| 環境変数の接頭辞 | `CLOSTA_` |
| 設定ディレクトリ | `~/.closta` |
| ドメイン | `closta.dev` |

## 命名時に確立した判定基準

今後の派生パッケージ名にも同じ基準を使う。

- **同一領域（AI エージェント / 開発者ツール / コンテナ管理）に同名が存在する場合は失格。**
  一般的な知名度ではなく、領域の重なりが判断軸である
- **別領域の同名は許容する。** CMS テーマ、バイオインフォマティクス、医療機関、金融などとの
  衝突は、開発者が検索する文脈が異なるため実害が小さい
- **GitHub のユーザー名 / org が個人に取得済みの場合は避ける。** 製品でなくとも名前空間が使えない

## 経緯

Atrium / Barbican / Reeve / Portcullis / Seneschal / Gantry / Orrery / Carrel / Davit / Apiary の
10 語を検討し、すべて衝突した。うち Seneschal は「Claude を使う AI パイプラインオーケストレータ」、
Gantry は「プロバイダ中立のエージェントランタイム」、Orrery は「エージェント支援開発の
オブザーバビリティ層」、Davit は「コンテナ管理の macOS GUI」であり、いずれも本プロダクトと
同一領域だった。

辞書語による探索を断念して造語に切り替え、造語 10 案のうち 3 案が完全に空きであった。
そこから短さと語源の可読性で Closta を選んだ。

この経緯を残すのは、将来「なぜ普通の英単語にしなかったのか」という問いが必ず出るためである。

## Consequences

- 着手時に `gh` / `npm` / `crates.io` / `closta.dev` を押さえる必要がある。空きを確認済みだが、
  放置すれば取られる
- git remote は `https://github.com/ukitomato/closta.git` に設定済み

## References

- PLAN.md 冒頭（語源）、§14（実行手順 ステップ 0）
