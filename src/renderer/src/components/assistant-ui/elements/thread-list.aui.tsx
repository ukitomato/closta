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
import { type ComponentPropsWithoutRef, type FC } from "react";

/*
 * `npx assistant-ui@latest add thread-list` の生成物を**削いだもの** (SH-001 / FE-045)。
 *
 * 生成物は 445 行あり、次の 4 つを内蔵していた。R-2 は**読み取り専用**なので外した。
 * 外した理由を残すのは、次に `add --overwrite` した人が「消えている」ことに
 * 気付けるようにするためである。
 *
 * | 外したもの | 理由 |
 * |---|---|
 * | `ThreadListNew` (New Thread ボタン) | R-2 はセッションを**作らない** (FR-003)。起動は X-1 |
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
  ComponentPropsWithoutRef<"div"> & { rowKeys: readonly string[] }
> = ({ className, rowKeys, ...props }) => {
  const threadIds = useAuiState((s) => s.threads.threadIds);

  return (
    <div
      data-slot="aui_thread-list-items"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    >
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
    </div>
  );
};

/** 取得中の骨組み。**取得の完了を待たずに枠を描く**ための部品 (SC-008)。 */
export const ThreadListSkeleton: FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="セッションを取得しています"
          data-slot="aui_thread-list-skeleton-wrapper"
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

  return (
    <ThreadListItemPrimitive.Root
      data-slot="aui_thread-list-item"
      className="group hover:bg-muted focus-visible:bg-muted data-active:bg-muted has-focus-visible:bg-muted relative flex h-8 items-center rounded-md transition-colors focus-visible:outline-none"
    >
      <ThreadListItemPrimitive.Trigger
        data-slot="aui_thread-list-item-trigger"
        className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center rounded-md px-2.5 text-start text-sm outline-none focus-visible:ring-1"
      >
        {isRunning && (
          <Loader2Icon
            aria-hidden
            data-slot="aui_thread-list-item-running"
            className="text-muted-foreground me-1.5 size-3.5 shrink-0 animate-spin"
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
      </ThreadListItemPrimitive.Trigger>
    </ThreadListItemPrimitive.Root>
  );
};
