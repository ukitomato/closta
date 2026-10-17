"use client";

import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/elements/attachment.aui";
import { File } from "@/components/file";
import {
  ComposerCommandPopover,
  ComposerCommandRoot,
} from "@/features/chat/composer-extensions";
import { ThreadFollowupSuggestions } from "@/components/assistant-ui/elements/follow-up-suggestions.aui";
import { Image } from "@/components/image";
import { MarkdownText } from "@/components/markdown-text";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/elements/reasoning.aui";
import { ThinkingIndicator } from "@/components/assistant-ui/elements/thinking-indicator";
import { ToolDisplay } from "@/components/assistant-ui/elements/tool-registry.aui";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/assistant-ui/elements/tool-group.aui";
import { TooltipIconButton } from "@/components/tooltip-icon-button";
import { TranscriptBoundary } from "@/components/assistant-ui/elements/transcript-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useComposerExtensions } from "@/features/chat/composer-extensions-context";
import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_EVENT_DATA_NAME } from "@/features/chat/convert";
import { MessageTimeLabel } from "@/features/chat/MessageTimeLabel";
import {
  authRowText,
  COMPOSER_LABELS,
  permissionModeName,
  pluginRowText,
  QUIET_SYSTEM_EVENT_STATUSES,
  refusalRowText,
  SYSTEM_EVENT_CATEGORY_LABELS,
  SYSTEM_EVENT_LABELS,
  SYSTEM_EVENT_STATUS_LABELS,
  taskTypeLabel,
  THINKING_LABELS,
} from "@/features/chat/labels";
import {
  findMessageElement,
  useLiveThinkingTokens,
  useRegisterTranscriptNavigator,
  useTranscriptDensity,
  useTranscriptSettled,
  type TranscriptNavigator,
} from "@/features/chat/transcript-context";
import { isSystemEventFields } from "@/features/chat/transcript-guard";
import { cn } from "@/lib/utils";
import {
  decodeRetryDetail,
  isTerminalSystemEventStatus,
  splitTaskDetail,
} from "@domain/session/system-event";
import { decodePluginDetail } from "@domain/session/session-init-report";
import type {
  SystemEventCategory,
  SystemEventStatus,
} from "@domain/session/transcript-dto";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  type FileMessagePartComponent,
  type ImageMessagePartComponent,
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  BanIcon,
  MessageCircleQuestionIcon,
  FoldVerticalIcon,
  InfoIcon,
  KeyRoundIcon,
  type LucideIcon,
  MicIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PuzzleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ScissorsIcon,
  ShieldIcon,
  SquareIcon,
  TimerIcon,
  WebhookIcon,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FC,
  type PropsWithChildren,
  type RefObject,
} from "react";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ToolGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
  ReasoningGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
  autoFocus?: boolean | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};

const ThreadComponentsContext =
  createContext<ThreadComponents>(EMPTY_COMPONENTS);

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading;

const ThreadHistorySkeleton: FC = () => (
  <div
    data-slot="aui_thread-history-skeleton"
    role="status"
    className="animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
  >
    <span className="sr-only">Loading conversation</span>
    <Skeleton className="ml-auto h-9 w-2/5 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
    </div>
    <Skeleton className="ml-auto h-9 w-1/3 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-10/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
    </div>
  </div>
);

/**
 * 仮想化の閾値 (FE-042 / AD-033 但し書き / research R-01)。
 *
 * **これ以下は非仮想パス**（`ThreadPrimitive.Viewport` の既存挙動をそのまま使う）、
 * これを超えたら `@tanstack/react-virtual` で仮想化する。この線引きの理由:
 * - react-virtual は `measureElement` による行の実測と padding spacer の再計算を要し、
 *   **小規模ではその複雑性が得るものより回帰面を増やす**（skill reference messages.md §Virtualization:
 *   「マウント/更新がボトルネックのときだけ使う」）。数十件では素の DOM でマウントコストは問題にならない。
 * - 非仮想パスは assistant-ui の `Viewport` が auto-follow / measurement guard を
 *   すでに実装しており、**既存のスクロール挙動の回帰テストがそのまま番人になる** (design-gate H narrative)。
 * 40 は「1 画面には収まらないが数百 ms のマウントにはならない」目安。**実測で見直す** (SC-002/SC-003)。
 */
const VIRTUALIZE_THRESHOLD = 40;

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  autoFocus = true,
}) => {
  const isEmpty = useAuiState(isNewChatView);
  const messageCount = useAuiState((s) => s.thread.messages.length);

  return (
    <ThreadComponentsContext.Provider value={components}>
      {messageCount > VIRTUALIZE_THRESHOLD ? (
        <VirtualThreadRoot autoFocus={autoFocus} />
      ) : (
        <ThreadRoot isEmpty={isEmpty} autoFocus={autoFocus} />
      )}
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{ isEmpty: boolean; autoFocus: boolean }> = ({
  isEmpty,
  autoFocus,
}) => {
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);
  const density = useTranscriptDensity();
  /** メッセージを含む要素 (会話内検索の navigator が要素を引く範囲。O-3)。 */
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <ThreadPrimitive.Root
      data-density={density}
      className="aui-root aui-thread-root bg-background @container group/thread flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-bg" as string]: "var(--color-card)",
        ["--composer-radius" as string]: "1.5rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <NonVirtualNavigator contentRef={contentRef} />
      {/*
        `turnAnchor` は既定 ("bottom") のまま。registry のテンプレートは "top" を置いていたが、"top" だと
        `autoScroll` の既定が false になり、40 件以下の transcript が最下部に追従しない
        (仮想パスは stickyRef で追従するので、件数で振る舞いが割れていた)。Claude Code は 1 回の依頼で
        tool の呼び出しを多数流すため、最下部にいる間は追従する従来のチャットの振る舞いを採る。
      */}
      <ThreadPrimitive.Viewport
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          ref={contentRef}
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4",
            isEmpty && "justify-center",
          )}
        >
          <AuiIf condition={isNewChatView}>
            <Welcome />
          </AuiIf>
          <AuiIf condition={isHistoryLoadingView}>
            <ThreadHistorySkeleton />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="mb-14 flex flex-col gap-y-6 empty:hidden group-data-[density=compact]/thread:gap-y-3"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "aui-thread-viewport-footer bg-background flex flex-col gap-4 overflow-visible pb-4 md:pb-6",
              !isEmpty &&
                "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
            )}
          >
            <ThreadScrollToBottom />
            <ThreadFollowupSuggestions />
            <LiveThinkingIndicator />
            <Composer autoFocus={autoFocus} />
            <AuiIf condition={(s) => isNewChatView(s) && s.composer.isEmpty}>
              <ThreadSuggestions />
            </AuiIf>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

/**
 * 非仮想パスの会話内検索の navigator (O-3 / 012 data-model §2「移動」)。40 件以下はすべて描かれているので、
 * `findMessageElement` (固定のセレクタ + `dataset.messageId` の厳密比較。id をセレクタに埋め込まない) で引いた要素を
 * `scrollIntoView` で中央に入れる。最下部を離れると `Viewport` の autoScroll は追従しないので、追従はそこで止まる。
 * 本文の更新で `ThreadRoot` (composer を含む) を再描画させないよう、メッセージの購読はこの部品に閉じる。
 */
const NonVirtualNavigator: FC<{ contentRef: RefObject<HTMLDivElement | null> }> = ({
  contentRef,
}) => {
  const messages = useAuiState((s) => s.thread.messages);
  const navigator = useMemo<TranscriptNavigator>(
    () => ({
      root: () => contentRef.current,
      scrollToMessage: (id) => {
        if (!messages.some((message) => message.id === id)) return false;
        const root = contentRef.current;
        const element = root === null ? null : findMessageElement(root, id);
        element?.scrollIntoView({ block: "center" });
        return true;
      },
    }),
    [messages, contentRef],
  );
  useRegisterTranscriptNavigator(navigator);
  return null;
};

/** 仮想行の高さ見積もり (実測 `measureElement` で上書きされる。初期スパン用)。 */
const ESTIMATED_MESSAGE_HEIGHT = 160;
/** 会話内検索で移った先が描かれるのを待つ最大のフレーム数 (描かれたら `scrollIntoView` で合わせ直す。O-3)。 */
const MAX_ALIGN_FRAMES = 10;
/** 「最下部にいる」とみなす許容差 (px)。 */
const AT_BOTTOM_THRESHOLD = 4;

/**
 * 数千メッセージ用の仮想化パス (FE-040/FE-041 / research R-01 / AD-033)。
 *
 * **公式サンプル `examples/with-virtualized-thread` の構造を採る** (ユーザ指示「公式ドキュメントを確認し
 * もっともあるべき形で導入」)。要点と、spec 初稿 (ローカル skill reference 由来) からの調整:
 * - **`ThreadPrimitive.Viewport` / `ViewportProvider` は使わず、自前 `<div>` スクローラが scroll を所有する。**
 *   仮想スクローラは scrollHeight を padding spacer で動的に変えるため、`Viewport` の auto-scroll
 *   (`useThreadViewportAutoScroll`) は流用できない。`ViewportProvider` を置いても `isAtBottom` は
 *   scroll を購読しないため更新されず、`ThreadPrimitive.ScrollToBottom` も機能しない。よって
 *   **auto-follow / jump-to-bottom / measurement guard を自前で持つ**のが公式イディオムである。
 * - 行は padding spacer 間の通常フローに置き `measureElement` で実測 → 測定済み高さが保たれジャンプしない
 *   (SC-002/SC-004)。同時マウント DOM ノード数は可視 + overscan に比例し**総件数に依存しない** (SC-003)。
 * - **`MessageByIndex` を使う** (spec 選択)。R-3 は過去ログ = 静的列で index が安定なため index ベースで足りる。
 *   末尾が伸び窓がずれるライブセッション (X-5) のため、**行のキーと高さのキャッシュはメッセージ id** にした
 *   (`getItemKey`)。turn グルーピング + `Unstable_MessageById` への移行は research R-01 のとおり残課題。
 * - **初期位置は最下部** (最新メッセージ。chat 慣習) とし、追従は stickyRef で持つ。非仮想パスの
 *   `Viewport` (turnAnchor 既定の "bottom" で autoScroll) と同じ振る舞いにそろえる。
 */
const VirtualThreadRoot: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  const messageCount = useAuiState((s) => s.thread.messages.length);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const density = useTranscriptDensity();
  /*
   * **行のキーと高さのキャッシュはメッセージ id で持つ** (X-5 / SC-003)。ライブセッションは末尾が伸び、assistant-ui に
   * 渡す窓 (RunningSessionsProvider の MESSAGE_WINDOW) もずれるため、index をキーにすると窓がずれるたびに全行が別のメッセージに
   * 入れ替わって再マウント・再測定になり long task が出る (実測)。描画は従来どおり MessageByIndex で行う。
   */
  const messages = useAuiState((s) => s.thread.messages);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** 末尾追従中か。読者が上にスクロールしたら false にして追従を止める。 */
  const stickyRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /*
   * MessageByIndex は role で部品を選ぶので、システムイベントの行 (assistant の data part。O-2) は assistant の枠の中で
   * 振り分ける (非仮想パスの ThreadMessage と同じ規則)。
   */
  const messageComponents = useMemo(
    () => ({
      UserMessage,
      AssistantMessage: AssistantOrSystemEvent,
      SystemMessage,
    }),
    [],
  );

  // react-virtual は memo 化できない関数を返すため React Compiler はこのコンポーネントの
  // 自動 memo 化をスキップする (公式サンプル `examples/with-virtualized-thread` と同じ既知の制約)。
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messageCount,
    getItemKey: (index) => messages[index]?.id ?? index,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
    getScrollElement: () => scrollerRef.current,
    initialRect: { height: 800, width: 800 },
    overscan: 6,
    scrollToFn: (offset, _options, instance) => {
      const el = instance.scrollElement;
      if (!el) return;
      // 追従中に「ほぼ最下部」なら微調整で位置を奪わない (measurement guard)。
      if (stickyRef.current) {
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll - el.scrollTop <= AT_BOTTOM_THRESHOLD && offset < maxScroll) return;
      }
      el.scrollTo(0, offset);
    },
  });

  const jumpToBottom = useCallback(() => {
    stickyRef.current = true;
    if (messageCount > 0) virtualizer.scrollToIndex(messageCount - 1, { align: "end" });
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (el && stickyRef.current) el.scrollTop = el.scrollHeight;
    });
  }, [messageCount, virtualizer]);

  /*
   * 会話内検索の navigator (O-3 / 012 data-model §2「移動」)。id から assistant-ui に渡したメッセージの添字を引き
   * (`===`)、`scrollToIndex` で中央へ寄せる。可変の高さで目標に止まらないことがあるので、要素が描かれたら
   * `scrollIntoView` で合わせ直す (plan RK-03)。**移るときに最下部への追従を切る** (R-3 のアンカリングと同じ扱い)。
   * 要素は `findMessageElement` で引き、id をセレクタに埋め込まない。
   */
  const navigator = useMemo<TranscriptNavigator>(
    () => ({
      root: () => scrollerRef.current,
      scrollToMessage: (id) => {
        const index = messages.findIndex((message) => message.id === id);
        if (index === -1) return false;
        stickyRef.current = false;
        virtualizer.scrollToIndex(index, { align: "center" });
        let frames = 0;
        const align = (): void => {
          const scroller = scrollerRef.current;
          const element = scroller === null ? null : findMessageElement(scroller, id);
          if (element !== null) {
            element.scrollIntoView({ block: "center" });
            return;
          }
          frames += 1;
          if (frames < MAX_ALIGN_FRAMES) requestAnimationFrame(align);
        };
        requestAnimationFrame(align);
        return true;
      },
    }),
    [messages, virtualizer],
  );
  useRegisterTranscriptNavigator(navigator);

  // ユーザの上スクロールで追従解除、最下部復帰で再武装 (公式サンプルの disarm ガード)。
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let lastScrollTop = el.scrollTop;
    let lastScrollHeight = el.scrollHeight;
    let lastClientHeight = el.clientHeight;
    const onScroll = (): void => {
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_THRESHOLD;
      if (atBottom) {
        stickyRef.current = true;
      } else if (
        el.scrollTop < lastScrollTop &&
        el.scrollHeight === lastScrollHeight &&
        Math.abs(el.clientHeight - lastClientHeight) <= 1
      ) {
        // コンテンツ伸長ではなくユーザ操作による上スクロールのときだけ追従を切る。
        stickyRef.current = false;
      }
      lastScrollTop = el.scrollTop;
      lastScrollHeight = el.scrollHeight;
      lastClientHeight = el.clientHeight;
      setIsAtBottom(atBottom);
    };
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY < 0) stickyRef.current = false;
    };
    const disarm = (): void => {
      stickyRef.current = false;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", disarm, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", disarm);
    };
  }, []);

  // コンテンツの高さが変わったら (measureElement 反映・伸長)、追従中は最下部を保つ。
  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (stickyRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // run 開始で最下部へ (R-3 は composer 無効で run が無いため実質不発。X-1 の伸長に備える)。
  const prevIsRunningRef = useRef(false);
  useLayoutEffect(() => {
    if (isRunning && !prevIsRunningRef.current) jumpToBottom();
    prevIsRunningRef.current = isRunning;
  }, [isRunning, jumpToBottom]);

  // 初期表示は最下部 (最新メッセージ。過去ログを chat 慣習で開く)。
  const didInitialJumpRef = useRef(false);
  useLayoutEffect(() => {
    if (didInitialJumpRef.current || messageCount === 0) return;
    didInitialJumpRef.current = true;
    jumpToBottom();
  }, [messageCount, jumpToBottom]);

  /*
   * **composer は本文の更新で再描画させない** (X-5 / SC-003)。本コンポーネントは react-virtual のため React Compiler の
   * 自動 memo 化から外れ、本文が 1 件届くたびに子の Composer まで再描画される。Composer の textarea は再描画のたびに
   * 自動リサイズ (getComputedStyle + scrollHeight の強制レイアウト) を走らせるため、表示中の本文の更新と打鍵が重なると
   * long task になる (実測)。composer の状態は Composer 自身が assistant-ui から購読する。
   */
  const composer = useMemo(() => <Composer autoFocus={autoFocus} />, [autoFocus]);

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = Math.max(
    0,
    virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0),
  );

  return (
    <ThreadPrimitive.Root
      data-density={density}
      className="aui-root aui-thread-root bg-background @container group/thread flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-bg" as string]: "var(--color-card)",
        ["--composer-radius" as string]: "1.5rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <div
        ref={scrollerRef}
        data-slot="aui_thread-viewport"
        data-virtualized="true"
        className="relative flex-1 overflow-x-auto overflow-y-scroll overscroll-contain scroll-smooth"
      >
        <div
          ref={contentRef}
          className="mx-auto w-full max-w-(--thread-max-width) px-4 pt-4"
        >
          <div data-slot="aui_message-group" style={{ paddingTop, paddingBottom }}>
            {items.map((item) => (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="pb-6 group-data-[density=compact]/thread:pb-3"
              >
                <ThreadPrimitive.MessageByIndex
                  index={item.index}
                  components={messageComponents}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="aui-thread-viewport-footer bg-background sticky bottom-0 overflow-visible px-4 pb-4 md:pb-6">
        <div className="relative mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-4">
          {!isAtBottom && <VirtualScrollToBottom onClick={jumpToBottom} />}
          <LiveThinkingIndicator />
          {composer}
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
};

/**
 * **実行中の思考の印** (O-4 / 014 spec FR-012 / US-4 AC4。data-model §4「進み具合」/ research R-07)。
 *
 * - 思考のブロックが完成するまで Reasoning の part は無いので、transcript の末尾 (viewport の footer の composer の上) に
 *   1 行で出す。表示は registry の Thinking indicator (Reasoning の表示の語彙)
 * - 値は実行中のペインが Thread の外側から渡す購読元 (`LiveProgressContext`) から自分で購読する — 本文の更新で composer を
 *   描き直さず、思考の更新で本文を描き直さない。過去ログには購読元が無いので出ない
 * - 次の主ループの assistant のメッセージとターンの終わり (`turn`) で、稼働中のストアが値を消す (印も消える)
 * - live region にしない (`role="status"` を重ねて毎秒読ませない)
 * - 文字色は `text-muted-foreground` (light で 4.83:1。WCAG 1.4.3)。vendored の root の `text-foreground/55` と値の span の
 *   `text-foreground/30` は 4.5:1 に届かないので、vendored を直さず呼び出し側で上書きする (014 pr-gate R1 H-001)
 */
const LiveThinkingIndicator: FC = () => {
  const tokens = useLiveThinkingTokens();
  if (tokens === null) return null;
  return (
    <ThinkingIndicator
      label={THINKING_LABELS.thinking}
      elapsed={THINKING_LABELS.tokens(tokens)}
      className="px-2 text-xs text-muted-foreground [&_.tabular-nums]:text-muted-foreground"
    />
  );
};

const VirtualScrollToBottom: FC<{ onClick: () => void }> = ({ onClick }) => (
  <TooltipIconButton
    tooltip={COMPOSER_LABELS.scrollToBottom}
    variant="outline"
    type="button"
    onClick={onClick}
    aria-label={COMPOSER_LABELS.scrollToBottom}
    className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 left-1/2 z-10 -translate-x-1/2 rounded-full p-4"
  >
    <ArrowDownIcon />
  </TooltipIconButton>
);

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);
  const isSystemEvent = useAuiState(isSystemEventMessageState);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  if (role === "system") return <SystemMessage />;
  // システムイベントの行は AssistantMessage (footer・action bar・branch picker・running indicator) を通さない (O-2)。
  if (isSystemEvent) return <SystemEventRow />;
  return <AssistantMessageComponent />;
};

/** `convert.ts` がシステムイベントの行に付ける印 (`metadata.custom.systemEvent`)。 */
const isSystemEventMessageState = (s: AssistantState): boolean =>
  s.message.metadata.custom["systemEvent"] === true || isHistoryBoundary(s);

/**
 * 過去ログの圧縮の境界 (domain の divider を `convert.ts` が data part 1 つに写したメッセージ。行の印は付かない)。実行中の行と
 * 同じ `SystemEventRow` (→ `TranscriptBoundary`) で描く (O-6 / 016 data-model §1「過去ログの圧縮」)。
 */
const isHistoryBoundary = (s: AssistantState): boolean => {
  const data = systemEventDataOf(s);
  return isSystemEventFields(data) && data.category === "compact-boundary";
};

/** 仮想化パスの assistant の枠: システムイベントの行を振り分ける (ThreadMessage と同じ規則)。 */
const AssistantOrSystemEvent: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext);
  const isSystemEvent = useAuiState(isSystemEventMessageState);
  return isSystemEvent ? <SystemEventRow /> : <AssistantMessageComponent />;
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip={COMPOSER_LABELS.scrollToBottom}
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
      <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-medium tracking-tight duration-200">
        How can I help you today?
      </h1>
    </div>
  );
};

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions flex w-full flex-wrap items-center justify-center gap-2 px-4">
      <ThreadPrimitive.Suggestions>
        {() => <ThreadSuggestionItem />}
      </ThreadPrimitive.Suggestions>
    </div>
  );
};

const ThreadSuggestionItem: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200">
      <SuggestionPrimitive.Trigger send asChild>
        <Button
          variant="ghost"
          className="aui-thread-welcome-suggestion text-foreground hover:bg-muted border-border/60 h-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors"
        >
          <SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1" />
          <SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 empty:hidden" />
        </Button>
      </SuggestionPrimitive.Trigger>
    </div>
  );
};

const Composer: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  // **IME 変換中フラグ** (X-2 / FR-001(d) / AC-6)。変換中のマウス送信で未確定文字列を送らない
  // 「確定優先」判定に使う。assistant-ui は keydown の isComposing で確定 Enter を守るが、mouse 送信経路は
  // 守らない (E2E で検出) ため、AD-037 D1(d) が認める最小処理をここだけに足す (keydown ガードは新設しない)。
  const composingRef = useRef(false);
  return (
    <ComposerCommandRoot>
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerCommandPopover />
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="aui_composer-shell"
          className="border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))]"
        >
          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder={COMPOSER_LABELS.composerPlaceholder}
            className="aui-composer-input caret-primary placeholder:text-muted-foreground/60 max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 outline-none"
            /*
             * 押したボタンが自分ごと消えたときのフォーカスの行き先の印 (O-4 FR-019 / 014 data-model §8)。
             * 探すのは `features/session/focus-handoff.ts` で、入力の振る舞いは変えない。
             */
            data-composer-input=""
            rows={1}
            autoFocus={autoFocus}
            /*
             * ターンの開始 (`thread.runStart`) で入力にフォーカスを移さない (O-10 FR-014 / research R-12)。サイドバーの行などに
             * あるフォーカスを奪わない。スレッドの切り替え (`unstable_focusOnThreadSwitched`) は既定のまま
             * (行の選択の直後に打てる今の挙動を保つ。spec U-6 (c))。
             */
            unstable_focusOnRunStart={false}
            enterKeyHint="send"
            aria-label={COMPOSER_LABELS.composerInput}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
          />
          <ComposerAction composing={composingRef} />
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
    </ComposerCommandRoot>
  );
};

const ComposerAction: FC<{ composing: RefObject<boolean> }> = ({ composing }) => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      <ComposerAddAttachment />
      <div className="flex items-center gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate asChild>
              <TooltipIconButton
                tooltip={COMPOSER_LABELS.startVoice}
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-dictate text-muted-foreground hover:text-foreground size-7 rounded-full"
                aria-label={COMPOSER_LABELS.startVoice}
              >
                <MicIcon className="aui-composer-dictate-icon size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation asChild>
              <TooltipIconButton
                tooltip={COMPOSER_LABELS.stopVoice}
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-stop-dictation text-destructive size-7 rounded-full"
                aria-label={COMPOSER_LABELS.stopVoice}
              >
                <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
              </TooltipIconButton>
            </ComposerPrimitive.StopDictation>
          </AuiIf>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton
              tooltip={COMPOSER_LABELS.send}
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-7 rounded-full"
              aria-label={COMPOSER_LABELS.send}
              onMouseDownCapture={(e) => {
                // 変換中は blur による確定を止める (未確定のまま保持し、下の click ガードで送信を塞ぐ)。
                if (composing.current) e.preventDefault();
              }}
              onClickCapture={(e) => {
                // 変換中のマウス送信は未確定文字列を送らない (AC-6 / FR-001(d))。確定は Enter に委ねる。
                if (composing.current) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              <ArrowUpIcon className="aui-composer-send-icon size-4" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-7 rounded-full"
              aria-label={COMPOSER_LABELS.stop}
            >
              <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  const {
    // R-4: 既定を toolName dispatcher (ToolDisplay) にする。未対応 tool は内部で ToolFallback に落ちる
    // (FE-023 / tool-registry.aui.tsx)。**この slot を override すると 7 種の専用表示が dispatcher ごと
    // 置換される** (R-4 の ChatScreen は override しない。design-gate PR-L-3)。
    ToolFallback: ToolFallbackComponent = ToolDisplay,
    ToolGroup,
    ReasoningGroup,
  } = useContext(ThreadComponentsContext);
  /*
   * transcript の情報密度 (O-2 / FR-012 / research R-06)。comfortable は Tool group を開いて、compact は Tool group と
   * Reasoning を閉じて出す。**`key` に密度を含め、密度を切り替えたときだけ作り直す** — 新しいメッセージ・ストリーミングでは
   * 作り直さないので、利用者が個々に開閉したものは保たれる。
   */
  const density = useTranscriptDensity();
  const comfortable = density === "comfortable";
  // 会話内検索が要素を引く印 (O-3 / 012 data-model §2)。外部由来の id は React の属性として渡すだけ。
  const messageId = useAuiState((s) => s.message.id);

  const ACTION_BAR_PT = "pt-1.5";
  // Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
  const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      data-message-id={messageId}
      className="fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pb-7.5 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-chainOfThought", "group-reasoning"],
            "tool-call": ["group-chainOfThought", "group-tool"],
            "standalone-tool-call": [],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought":
                return <div data-slot="aui_chain-of-thought">{children}</div>;
              case "group-tool":
                if (ToolGroup) {
                  return <ToolGroup group={part}>{children}</ToolGroup>;
                }
                return (
                  <ToolGroupRoot
                    key={`tool-group-${density}`}
                    variant="ghost"
                    defaultOpen={comfortable}
                  >
                    <ToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === "running"}
                    />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                );
              case "group-reasoning": {
                if (ReasoningGroup) {
                  return (
                    <ReasoningGroup group={part}>{children}</ReasoningGroup>
                  );
                }
                const running = part.status.type === "running";
                // compact は応答中も閉じたまま (印は trigger の active で示す)。comfortable は既存の既定のまま。
                return (
                  <ReasoningRoot
                    key={`reasoning-${density}`}
                    streaming={comfortable && running}
                  >
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                );
              }
              case "text":
                // 会話内検索の強調の対象の印 (O-3 / 012 data-model §2)。text part だけに付け、箱は作らない (`contents`)。
                return (
                  <div data-search-text="" className="contents">
                    <MarkdownText />
                  </div>
                );
              case "reasoning":
                return <Reasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallbackComponent {...part} />;
              case "data":
                return part.dataRendererUI;
              case "file":
                return (
                  <div data-slot="aui_assistant-message-file" className="py-1">
                    <File {...part} />
                  </div>
                );
              case "image":
                return (
                  <div data-slot="aui_assistant-message-image" className="py-1">
                    <Image {...part} />
                  </div>
                );
              case "indicator":
                return (
                  <span
                    data-slot="aui_assistant-message-indicator"
                    className="animate-pulse font-sans"
                    aria-label="Assistant is working"
                  >
                    {"●"}
                  </span>
                );
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
        {/* 時刻 (O-9 / FR-006)。ActionBar の autohide の外で常に出す。data part だけのメッセージ (境界) には出ない。 */}
        <MessageTimeLabel className="mt-1" />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserFilePart: FileMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-file" className="py-1">
    <File {...part} />
  </div>
);

const UserImagePart: ImageMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-image" className="py-1">
    <Image {...part} />
  </div>
);

/**
 * system メッセージの最小表示 (R-3。コンパクション境界などの区切り)。
 *
 * 会話の主役ではないので action bar を付けず、中央寄せの控えめな体裁にする。
 */
const SystemText: TextMessagePartComponent = ({ text }) => (
  <span className="aui-system-text">{text}</span>
);

const SystemMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_system-message-root"
      data-role="system"
      className="fade-in animate-in motion-reduce:animate-none my-1 flex justify-center px-2 duration-150 [contain-intrinsic-size:auto_48px] [content-visibility:auto]"
    >
      <div className="text-muted-foreground text-center text-xs">
        <MessagePrimitive.Parts components={{ Text: SystemText }} />
      </div>
    </MessagePrimitive.Root>
  );
};

/** 行の data part の `data` (検証して読む。外れたら行を描かない)。 */
const systemEventDataOf = (s: AssistantState): unknown => {
  const part = s.message.parts[0];
  return part?.type === "data" && part.name === SYSTEM_EVENT_DATA_NAME
    ? part.data
    : undefined;
};

/**
 * 行の detail の文言 (空なら detail を出さない。O-4 / 014 data-model §3 / §5)。
 * - task: 種類 (`task_type`。進み具合を合成した detail は `splitTaskDetail` で種類だけを取る) の文言
 * - API の再試行: 回数・HTTP の状態・待ち時間 (`decodeRetryDetail`。形が合わなければ出さない)
 * - 権限モード: detail の鍵 (知らない鍵は `unknown`) の名前を入れた文
 * - コンテキストの圧縮: 出さない (detail は常に空。`compact_error` は届かない)
 * - Hook: detail (`hook_event`) のまま
 * - 認証: 出さない (detail は常に空。状態ごとの文は案内の段。O-5 / 015 data-model §4)
 * - プラグイン: 導入中の印・数・最後のマーケットプレイスの名前 (`decodePluginDetail`。形が合わなければ出さない)
 * - 拒否: 固定の文 (モデル名・この応答だけ・分類の訳。`refusalRowText`。説明・本文は別の段)
 * - 知らせ: detail (本文の規則を通した 1 行) のまま
 * - 境界 (圧縮・作り直し): 行ではなく `TranscriptBoundary` が描くので出さない
 */
function systemEventDetailText(
  category: SystemEventCategory,
  name: string,
  detail: string,
  status: SystemEventStatus | null,
): string {
  switch (category) {
    case "task":
      return taskTypeLabel(splitTaskDetail(detail).taskType);
    case "api-retry": {
      const retry = decodeRetryDetail(detail);
      return retry === null ? "" : SYSTEM_EVENT_LABELS.retryDetail(retry);
    }
    case "permission-mode":
      return SYSTEM_EVENT_LABELS.permissionModeChanged(
        permissionModeName(detail),
      );
    case "compaction":
      return "";
    case "hook":
      return detail;
    case "auth":
      return "";
    case "plugin": {
      const plugin = decodePluginDetail(detail);
      return plugin === null ? "" : pluginRowText(plugin, status);
    }
    case "refusal":
      return refusalRowText(status, name, detail).text;
    case "informational":
      return detail;
    case "elicitation":
      return SYSTEM_EVENT_LABELS.elicitationComplete(name);
    case "compact-boundary":
    case "conversation-reset":
      return "";
  }
}

/** 本文を折り返して全文を出す行 (`truncate` しない。拒否の説明・知らせの本文は 120 コードポイントで切れている。U-3)。 */
const isWrappedCategory = (category: SystemEventCategory): boolean =>
  category === "refusal" ||
  category === "informational" ||
  category === "elicitation";

/** task の行の進み具合の文言 (O-4 / 014 data-model §4「進み具合」)。task でない・進み具合が無い・復号できなければ null。 */
function taskProgressText(
  category: SystemEventCategory,
  detail: string,
): string | null {
  if (category !== "task") return null;
  const { progress } = splitTaskDetail(detail);
  return progress === null ? null : SYSTEM_EVENT_LABELS.taskProgress(progress);
}

/** 行の種類のアイコン。 */
const SYSTEM_EVENT_ICONS: Readonly<Record<SystemEventCategory, LucideIcon>> = {
  hook: WebhookIcon,
  task: TimerIcon,
  "api-retry": RefreshCwIcon,
  compaction: FoldVerticalIcon,
  "permission-mode": ShieldIcon,
  auth: KeyRoundIcon,
  plugin: PuzzleIcon,
  "compact-boundary": ScissorsIcon,
  "conversation-reset": RotateCcwIcon,
  refusal: BanIcon,
  informational: InfoIcon,
  elicitation: MessageCircleQuestionIcon,
};

/**
 * Hook / Background task と O-4 の行 (API の再試行・コンテキストの圧縮・権限モード) のシステムイベントの行
 * (O-2 / FR-009 / data-model §2「描き分け」。O-4 / 014 data-model §3 / §4)。
 *
 * - 1 つの Hook / task は 1 行。同じ id の更新は store / domain が合成済み (ここは描くだけ)。API の再試行は
 *   ターンごとに 1 行 (同じターンの再試行は同じ行で書き換わる。014 spec US-2 AC4)。圧縮は 1 回の圧縮で 1 行
 *   (圧縮中 → 成功 / 失敗に書き換わる)。権限モードは変わるたびに 1 行。task の行は種類の後ろに進み具合
 *   (トークン・tool の回数・経過時間) を並べ、進み具合の更新で種類は消えない
 * - assistant の発話と見分けられる控えめな 1 行 (system メッセージの体裁)。**footer・action bar・branch picker・
 *   running indicator を付けない** — 末尾がこの行で `isRunning` でも、実行中の印は composer 側の既存の表示に任せる
 * - 状態の文言は `Badge`、名前は「」で括った muted の別の span (偽の状態の文言を含む名前と区別する)。
 *   名前・detail は会話由来なので**テキストノードだけ**で描き、1 行で切り詰める (`truncate`)
 * - 終わりを表さない状態の行は、記録にこれ以上の終わりが来ない (セッションの終了・失敗の後 / 過去ログ) とき
 *   「結果不明」。失敗した Hook には設定とログを確かめる案内、失敗・強制停止した task には tool の呼び出しの
 *   表示を見る案内を添える (出力本文は出さない)
 *
 * registry 照合 (Principle XIII): 既存の system メッセージの体裁 + 導入済みの `Badge` (状態)。
 * ToolFallback / Reasoning / Tool group (開閉する card) は 1 行の状態表示に過剰で、tool 呼び出しと誤読させるため採らない。
 */
const SystemEventRow: FC = () => {
  const raw = useAuiState(systemEventDataOf);
  const settled = useTranscriptSettled();
  if (!isSystemEventFields(raw)) return null;

  const { category, name, detail, status } = raw;
  // 会話の境界は横いっぱいの区切り (O-6)。行の体裁・状態の文言・案内は持たない。
  if (category === "compact-boundary" || category === "conversation-reset") {
    return <TranscriptBoundary category={category} detail={detail} />;
  }
  const unresolved = settled && !isTerminalSystemEventStatus(status);
  const statusText = unresolved
    ? SYSTEM_EVENT_LABELS.outcomeUnknown
    : status === null || QUIET_SYSTEM_EVENT_STATUSES.has(status)
      ? null
      : SYSTEM_EVENT_STATUS_LABELS[status];
  const wrapped = isWrappedCategory(category);
  // 止まった・注意の知らせは目立たせ、通常の知らせは控えめに (016 data-model §1「見た目」)。
  const attention =
    category === "refusal" ||
    (category === "informational" &&
      (status === "prevented" || status === "warning"));
  const failed = status === "failed";
  const Icon = SYSTEM_EVENT_ICONS[category];
  // 失敗した Hook には設定とログ、失敗・強制停止した task には起動した tool の呼び出しの表示を案内する (pr-gate R2 ux L-004)
  const guidance =
    category === "hook" && failed
      ? SYSTEM_EVENT_LABELS.hookFailedGuidance
      : category === "task" && (failed || status === "killed")
        ? SYSTEM_EVENT_LABELS.taskFailedGuidance
        : category === "auth"
          ? authRowText(status, unresolved)
          : category === "refusal"
            ? refusalRowText(status, name, detail).body || null
            : null;
  const detailText = systemEventDetailText(category, name, detail, status);
  const progressText = taskProgressText(category, detail);

  return (
    <MessagePrimitive.Root
      data-slot="aui_system-event-row"
      data-role="system-event"
      data-category={category}
      data-status={unresolved ? "unresolved" : (status ?? "none")}
      data-tone={attention ? "attention" : "quiet"}
      className="fade-in animate-in motion-reduce:animate-none px-2 duration-150 [contain-intrinsic-size:auto_32px] [content-visibility:auto]"
    >
      <div
        className={cn(
          "flex min-w-0 gap-2 text-xs",
          wrapped ? "flex-wrap items-start" : "items-center",
          attention ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium">
          {SYSTEM_EVENT_CATEGORY_LABELS[category]}
        </span>
        {detailText !== "" ? (
          // 切り詰めた全文は title で見られるようにする (pr-gate R2 a11y M-002)
          <span
            data-slot="system-event-detail"
            className={cn(
              // 拒否・知らせの本文は折り返して全文を出す (O-6)。それ以外は 1 行で切り詰める。
              wrapped ? "min-w-0 wrap-break-word" : "truncate",
              // 権限モードの行の detail は文なので、幅を固定せずに縮める (切り詰めた全文は title)。
              !wrapped &&
                (category === "permission-mode" || category === "plugin"
                  ? "min-w-0"
                  : "max-w-40 shrink-0"),
            )}
            title={detailText}
          >
            {/*
             * task の detail は SDK の task_type。文言の表で読める形に (知らない値はそのまま。pr-gate R1 po L-002)。
             * API の再試行は符号化した数を文言にする (エラーの中身は届かない。復号できなければ出さない。014 spec FR-007)。
             * 権限モードは鍵を文言の表で名前にする (O-4 / 014 data-model §5)。
             */}
            {detailText}
          </span>
        ) : null}
        {progressText !== null ? (
          // task の進み具合 (数だけ。要約・説明は届かない。O-4 / 014 spec FR-013)。種類の後ろに並べる。
          <span
            data-slot="system-event-progress"
            className="min-w-0 truncate"
            title={progressText}
          >
            {progressText}
          </span>
        ) : null}
        {statusText !== null ? (
          <Badge
            data-slot="system-event-status"
            variant={failed && !unresolved ? "destructive" : "outline"}
            className="shrink-0"
          >
            {statusText}
          </Badge>
        ) : null}
        {name !== "" && category !== "refusal" && category !== "elicitation" ? (
          <span
            data-slot="system-event-name"
            className="text-muted-foreground min-w-0 truncate"
            title={name}
          >
            「{name}」
          </span>
        ) : null}
        {category === "refusal" && status === "no-fallback-retry" ? (
          <RetryRefusedButton />
        ) : null}
      </div>
      {guidance !== null ? (
        <p data-slot="system-event-guidance" className="text-muted-foreground mt-1 ps-5.5 text-xs">
          {guidance}
        </p>
      ) : null}
    </MessagePrimitive.Root>
  );
};

/**
 * 拒否の行の「編集して再試行」(O-10 / US-4 / data-model §5)。拒否された文 (稼働中のストアの、拒否の行より前の最も近い
 * 利用者の入力) を composer に戻す。**送らない・巻き戻さない**。文を返せない (過去ログ・前に入力が無い) ときは出さない。
 * composer に下書きがあれば dialog で確かめる (既定のフォーカスは「取り消す」)。
 */
const RetryRefusedButton: FC = () => {
  const aui = useAui();
  const messageId = useAuiState((s) => s.message.id);
  const { retryTextFor } = useComposerExtensions();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const replacedRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const text = retryTextFor?.(messageId) ?? null;
  if (text === null) return null;

  const focusComposer = (): void => {
    buttonRef.current
      ?.closest<HTMLElement>("[data-live-pane]")
      ?.querySelector<HTMLElement>("[data-composer-input]:not(:disabled)")
      ?.focus();
  };
  const place = (): void => {
    // 下書きの保持は `DraftBridge` が composer の text の変化を写す。
    aui.thread().composer().setText(text);
  };

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        size="sm"
        variant="outline"
        className="h-6 shrink-0 px-2 text-xs"
        data-slot="system-event-retry"
        onClick={() => {
          if (aui.thread().composer().getState().text === "") {
            place();
            focusComposer();
          } else {
            setConfirming(true);
          }
        }}
      >
        {SYSTEM_EVENT_LABELS.retry}
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (replacedRef.current) focusComposer();
            else buttonRef.current?.focus();
            replacedRef.current = false;
          }}
        >
          <DialogHeader>
            <DialogTitle>{COMPOSER_LABELS.retryReplaceTitle}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
            >
              {COMPOSER_LABELS.retryCancel}
            </Button>
            <Button
              type="button"
              onClick={() => {
                place();
                replacedRef.current = true;
                setConfirming(false);
              }}
            >
              {COMPOSER_LABELS.retryReplace}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

/**
 * user の本文の text part (O-3 / 012 data-model §2)。assistant-ui の既定の Text (`<p>` の `white-space: pre-line`) と
 * 同じ見た目を class で出し (実行時の `style` 属性を足さない)、会話内検索の強調の対象の印 (`data-search-text`) を付ける。
 * 本文はテキストとして描く。
 */
const UserTextPart: TextMessagePartComponent = ({ text }) => (
  <p data-search-text="" className="whitespace-pre-line">
    {text}
  </p>
);

const UserMessage: FC = () => {
  // 会話内検索が要素を引く印 (O-3 / 012 data-model §2)。外部由来の id は React の属性として渡すだけ。
  const messageId = useAuiState((s) => s.message.id);
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
      data-message-id={messageId}
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
          <MessagePrimitive.Parts
            components={{
              Text: UserTextPart,
              File: UserFilePart,
              Image: UserImagePart,
            }}
          />
        </div>
        {/* 時刻と所要時間 (O-9 / FR-006 / FR-007)。吹き出しの下の右寄せ。 */}
        <div className="mt-1 flex justify-end">
          <MessageTimeLabel withDuration />
        </div>
        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root border-border/60 dark:border-muted-foreground/15 ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg)">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3.5"
            >
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 rounded-full px-3.5">
              Update
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
