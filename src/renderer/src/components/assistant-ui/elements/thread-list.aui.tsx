"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AuiIf,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { Loader2Icon } from "lucide-react";
import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type FC,
  type ReactNode,
} from "react";

/*
 * `npx assistant-ui@latest add thread-list` の生成物を**削いだもの** (SH-001 / FE-045)。
 *
 * 生成物は 445 行あり、次の 4 つを内蔵していた。R-2 は**読み取り専用**なので外した。
 * 外した理由を残すのは、次に `add --overwrite` した人が「消えている」ことに
 * 気付けるようにするためである。
 *
 * | 外したもの | 理由 |
 * |---|---|
 * | `ThreadListNew` (New Thread ボタン) | R-2 はセッションを**作らない** (FR-003)。起動は X-1。**X-5 の稼働中セッション一覧のために復元した** (下の `ThreadListNew`。R-2 は使わない) |
 * | rename (インライン入力 + `aui.threadListItem.rename`) | config ディレクトリへの**書き込み**になる (FR-013 / Principle X) |
 * | archive / delete (More メニュー) | 同上。**正本はアプリ外にある** (AD-007) |
 * | 検索 + 日付グルーピング (Today / Yesterday / Earlier) | R-2 のまとまりは**登録フォルダ**である (FR-022)。検索は O-3 |
 *
 * **`ThreadListPrimitive.Items` を使わない。** 既定の `Items` は全件を 1 列に並べるが、
 * R-2 はグループごとに区切って並べる必要がある (FR-022 / FR-025 / FR-028)。
 * 呼び出し側が**行の鍵**を渡す形にし、**グループ分けの規則は `features/session-list/` が持つ**
 * (Principle XIII / plan の UI 構成)。
 *
 * 表示に使う値の**選択**は `domain` の `sessionTitle()` が決める (FR-047)。
 * ここは体裁だけを持つ。
 */

/**
 * 行ごとの付帯情報を返す関数 (code-gate iteration 1 / a11y H-005 / ux H-001)。
 *
 * **表題とメタデータを別ブロックに分けない。**
 * 以前は呼び出し側が「表題の列」と「メタデータの列」を**兄弟として縦に並べて**いた。
 * 対応づけは配列の順序だけに依っており、
 * (a) 行にフォーカスしたとき読まれるのは表題だけで、その行を他と識別する情報
 *     (由来ユーザ = FR-052 / worktree = FR-029 / 切り詰めの注記 = FR-049) の
 *     すべてが別の場所にあった。
 * (b) `ThreadListItemsByKey` は runtime が知らない鍵を落とすため、
 *     表題 N-1 行・メタデータ N 行という**行数ずれ**が段階描画の 1 tick ごとに起きた。
 *
 * **props ではなく context で渡す理由**: `ItemByIndex` は行の component を
 * `components` 経由で受け取り、props を通さない。行ごとに component を作ると
 * **毎回の描画で再マウントしてフォーカスが飛ぶ**。
 * 行は自分の鍵を `s.threadListItem.id` から引けるので、
 * 解決関数を 1 つ渡して行側で引く形にする。
 */
const RowMetaContext = createContext<((rowKey: string) => ReactNode) | null>(
  null,
);

/**
 * 行ごとの操作 (X-5 / FE-011)。**Trigger の外・Root の内側**に描く (ボタンの入れ子を作らない)。
 * R-2 は渡さないので行は従来どおり選択だけになる。渡し方は `RowMetaContext` と同じ理由で context。
 */
const RowActionsContext = createContext<((rowKey: string) => ReactNode) | null>(
  null,
);

/**
 * 新しいスレッド = 新規起動 (X-5)。生成物の `ThreadListNew` を、R-2 が外した理由 (セッションを作らない) の外で
 * 復元したもの。adapter の `onSwitchToNewThread` を渡したときだけ使う (R-2 は使わない)。
 */
export const ThreadListNew: FC<
  ComponentPropsWithoutRef<typeof ThreadListPrimitive.New>
> = ({ className, ...props }) => {
  return (
    <ThreadListPrimitive.New
      data-slot="aui_thread-list-new"
      className={cn(
        "hover:bg-muted data-active:bg-accent focus-visible:ring-ring flex h-8 items-center rounded-md px-2.5 text-sm font-medium outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
};

export const ThreadListRoot: FC<
  ComponentPropsWithoutRef<typeof ThreadListPrimitive.Root>
> = ({ className, ...props }) => {
  return (
    <ThreadListPrimitive.Root
      data-slot="aui_thread-list-root"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  );
};

/**
 * 指定した**鍵**の行だけを並べる。
 *
 * **位置ではなく鍵で渡す。** `ItemByIndex` は位置で行を指すが、その位置は
 * runtime 側のスレッド一覧の順序で決まる。外部ストアの `threads` を差し替えても
 * runtime への反映は**同じ描画では終わらない**ため、
 * 呼び出し側が持つ位置をそのまま渡すと範囲外の位置を指して
 * `useClientLookup: key "undefined" not found` で画面全体が落ちる (実測)。
 *
 * **runtime が知らない鍵は描かない。** 描けない行を無視するのは、
 * 次の描画で必ず現れるためである (外部ストアの反映は 1 tick 遅れるだけ)。
 */
export const ThreadListItemsByKey: FC<
  ComponentPropsWithoutRef<"div"> & {
    rowKeys: readonly string[];
    /** 行ごとの付帯情報。**行の内側に描かれる** (a11y H-005)。 */
    renderMeta?: (rowKey: string) => ReactNode;
    /** 行ごとの操作 (X-5)。Trigger の外・行の内側に描かれる。 */
    renderActions?: (rowKey: string) => ReactNode;
  }
> = ({ className, rowKeys, renderMeta, renderActions, ...props }) => {
  const threadIds = useAuiState((s) => s.threads.threadIds);

  return (
    <div
      data-slot="aui_thread-list-items"
      /*
       * **リストであることを支援技術に伝える** (a11y H-004)。
       * `ThreadListPrimitive` の実体は素の div であり role を持たない。
       * element の写しから書き込み操作を外したときに semantics も一緒に落ちていた。
       */
      role="list"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    >
      <RowMetaContext.Provider value={renderMeta ?? null}>
        <RowActionsContext.Provider value={renderActions ?? null}>
          {rowKeys.map((rowKey) => {
            const index = threadIds.indexOf(rowKey);
            if (index < 0) return null;
            return (
              <ThreadListPrimitive.ItemByIndex
                key={rowKey}
                index={index}
                components={{ ThreadListItem }}
              />
            );
          })}
        </RowActionsContext.Provider>
      </RowMetaContext.Provider>
    </div>
  );
};

/** 取得中の骨組み。**取得の完了を待たずに枠を描く**ための部品 (SC-008)。 */
export const ThreadListSkeleton: FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    /*
     * **`role="status"` は最外殻に 1 つだけ置く** (code-gate iteration 1 / a11y H-001)。
     *
     * 以前は骨組みの**行ごと**に付いていたため status region が 5 個同時にマウントされ、
     * しかも `Skeleton` はテキストを持たないので**通知の内容が空**だった。
     * live region はアクセシブル名ではなく**内容の変化**を読むため、
     * `aria-label` では「取得中」が伝わらない。文字を中に入れる。
     */
    <div
      role="status"
      data-slot="aui_thread-list-skeleton-wrapper"
      className="flex flex-col gap-0.5"
    >
      <span className="sr-only">セッションを取得しています</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          /* 骨組みそのものは読ませない。内容は上の 1 行が持つ。 */
          aria-hidden
          className="flex h-8 items-center px-2.5"
        >
          <Skeleton
            data-slot="aui_thread-list-skeleton"
            className="h-3.5 w-full"
          />
        </div>
      ))}
    </div>
  );
};

/** 取得中だけ骨組みを出す。判定は runtime の状態に任せる。 */
export const ThreadListLoading: FC = () => {
  return (
    <AuiIf condition={(s) => s.threads.isLoading}>
      <ThreadListSkeleton />
    </AuiIf>
  );
};

/**
 * 1 行。**選択しか行えない。**
 *
 * `Trigger` だけを置き、`More` メニュー (rename / archive / delete) を持たない。
 * 生成物は `group-hover:pe-9` などで More ボタン分の余白を空けていたが、
 * ボタンが無いので余白も外してある。
 */
export const ThreadListItem: FC = () => {
  const isRunning = useAuiState((s) => s.threadListItem.isRunning);
  const rowKey = useAuiState((s) => s.threadListItem.id);
  const isActive = useAuiState(
    (s) => s.threads.mainThreadId === s.threadListItem.id,
  );
  const renderMeta = useContext(RowMetaContext);
  const meta = renderMeta === null ? null : renderMeta(rowKey);
  const renderActions = useContext(RowActionsContext);
  const actions = renderActions === null ? null : renderActions(rowKey);

  return (
    <ThreadListItemPrimitive.Root
      data-slot="aui_thread-list-item"
      /* **リストの項目であることを伝える** (a11y H-004)。実体は素の div である。 */
      role="listitem"
      /*
       * **選択とフォーカスを同じ色で表さない** (a11y H-008)。
       * 以前は `data-active` (選択) と `has-focus-visible` (フォーカス) の
       * どちらも `bg-muted` で、白に対し 1.04:1 の差しかなかった。
       * フォーカスは Trigger の ring (4.83:1) が担う。
       *
       * **選択は面積と形で示す** (pr-gate Round 1 / a11y H-202)。
       * 分離しただけでは足りなかった — 選択は `bg-muted` のままで
       * **`hover` と同色** (どちらも 1.04:1) だったため、
       * 「いま指しているだけの行」と「選択済みの行」を区別できなかった。
       * R-2 は本文を持たないので (`isDisabled: true`)、
       * **この表示が「行を選べた」ことの唯一の視覚的フィードバックである**。
       *
       * 左端に 2px のインジケータを出す。`bg-foreground` は白に対し 19:1 で、
       * WCAG 1.4.11 の 3:1 を満たす。**独自トークンは足していない** (Principle XIII)。
       * `hover` の `bg-muted` は据え置く — hover は状態の識別ではなく
       * ポインタ位置の示唆なので 3:1 は掛からない。
       */
      /*
       * 操作がある行 (X-5) は縦に積む — 横並びの折り返しにすると Trigger の `h-full` が行の高さを取り、
       * 操作の段が行の高さに入らず次の行に重なる (実機で確認)。R-2 の行 (操作なし) は従来の横並びのまま。
       */
      className={cn(
        "group hover:bg-muted data-active:bg-accent data-active:before:bg-foreground relative flex min-h-8 rounded-md transition-colors data-active:font-medium data-active:before:absolute data-active:before:inset-y-1 data-active:before:start-0 data-active:before:w-0.5 data-active:before:rounded-full",
        actions === null ? "items-center" : "flex-col items-stretch",
      )}
    >
      <ThreadListItemPrimitive.Trigger
        data-slot="aui_thread-list-item-trigger"
        /*
         * **選択中であることをフォーカス対象の側に付ける** (a11y M-001)。
         * primitive は `aria-current` を Root (div) に付けるが、
         * フォーカスが当たるのはこの Trigger であり、祖先の `aria-current` は読まれない。
         */
        aria-current={isActive ? "true" : undefined}
        className="focus-visible:ring-ring flex h-full min-w-0 flex-1 flex-col items-start justify-center rounded-md px-2.5 py-1 text-start text-sm outline-none focus-visible:ring-2"
      >
        <span className="flex w-full min-w-0 items-center">
          {isRunning && (
            <Loader2Icon
              aria-hidden
              data-slot="aui_thread-list-item-running"
              /* `motion-reduce` を付ける (a11y M-003)。他のトークンと揃える。 */
              className="text-muted-foreground me-1.5 size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
            />
          )}
          <span
            data-slot="aui_thread-list-item-title"
            className="min-w-0 flex-1 truncate"
          >
            {/*
              **`fallback` に "New Chat" を使わない。** R-2 は会話を作らないので
              「新しい会話」は誤りである。要約が空の行の代替表示は
              `domain` の `sessionTitle()` が決め、呼び出し側が `title` に詰める (FR-047)。
            */}
            <ThreadListItemPrimitive.Title fallback="（表題なし）" />
          </span>
          {isRunning && <span className="sr-only">実行中</span>}
        </span>

        {/*
          **付帯情報を行の中に置く** (a11y H-005 / ux H-001)。
          行にフォーカスしたときに、その行を識別する情報が同じ要素の中にある。
        */}
        {meta !== null && (
          <span
            data-slot="aui_thread-list-item-meta"
            className="text-muted-foreground w-full min-w-0 text-xs"
          >
            {meta}
          </span>
        )}
      </ThreadListItemPrimitive.Trigger>
      {/* 行の操作 (X-5)。Trigger の下に並べる (幅の狭い一覧でも表題を潰さない)。 */}
      {actions !== null && (
        <div
          data-slot="aui_thread-list-item-actions"
          className="flex w-full flex-wrap gap-1 px-2.5 pb-1.5"
        >
          {actions}
        </div>
      )}
    </ThreadListItemPrimitive.Root>
  );
};
