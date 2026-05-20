"use client";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "#/components/ui/sidebar.tsx";
import { archiveChat, deleteChatRecord } from "#/lib/chat-functions.ts";
import { cn } from "#/lib/utils.ts";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { ArchiveIcon, ChevronRightIcon, MessageSquareTextIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

type ChatSummary = {
  id: string;
  title: string;
};

type PendingAction = {
  chatId: string;
  kind: "archive" | "delete";
} | null;

function ChatActionButton({
  chatId,
  isConfirming,
  kind,
  onAction,
}: {
  chatId: string;
  isConfirming: boolean;
  kind: "archive" | "delete";
  onAction: (chatId: string, kind: "archive" | "delete") => void;
}) {
  const Icon = kind === "archive" ? ArchiveIcon : Trash2Icon;
  const label = kind === "archive" ? "Archive chat" : "Delete chat";

  return (
    <button
      aria-label={isConfirming ? `Confirm ${label.toLowerCase()}` : label}
      className={cn(
        "absolute top-0 right-0 z-10 ml-2 flex h-7 items-center justify-center rounded-md bg-sidebar px-2 text-sidebar-foreground text-xs opacity-0 ring-sidebar-ring outline-hidden transition-[background-color,color,opacity] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:opacity-100 focus-visible:ring-2 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        isConfirming &&
          "bg-destructive text-white opacity-100 hover:bg-destructive/90 hover:text-white focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        isConfirming ? "w-15" : "w-7",
      )}
      onClick={() => onAction(chatId, kind)}
      title={isConfirming ? "confirm" : label}
      type="button"
    >
      {isConfirming ? "confirm" : <Icon className="size-4" />}
    </button>
  );
}

function ChatRow({
  chat,
  isActive,
  isConfirming,
  kind,
  onAction,
}: {
  chat: ChatSummary;
  isActive: boolean;
  isConfirming: boolean;
  kind: "archive" | "delete";
  onAction: (chatId: string, kind: "archive" | "delete") => void;
}) {
  return (
    <SidebarMenuSubItem key={chat.id}>
      <div className="group/row relative flex min-w-0 items-center">
        <SidebarMenuSubButton
          asChild
          className={cn(
            "w-full transition-[padding] group-focus-within/row:pr-10 group-hover/row:pr-10",
            isConfirming && "pr-18 group-focus-within/row:pr-18 group-hover/row:pr-18",
          )}
          isActive={isActive}
          title={chat.title}
        >
          <Link params={{ chatId: chat.id }} to="/chats/$chatId">
            <span className="truncate">{chat.title}</span>
          </Link>
        </SidebarMenuSubButton>
        <ChatActionButton
          chatId={chat.id}
          isConfirming={isConfirming}
          kind={kind}
          onAction={onAction}
        />
      </div>
    </SidebarMenuSubItem>
  );
}

export function NavChats({
  archivedChats,
  chats,
}: {
  archivedChats: ChatSummary[];
  chats: ChatSummary[];
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const currentChatId = /^\/chats\/([^/]+)$/.exec(location.pathname)?.[1];

  async function handleAction(chatId: string, kind: "archive" | "delete") {
    if (pendingAction?.chatId !== chatId || pendingAction.kind !== kind) {
      setPendingAction({ chatId, kind });
      return;
    }

    setPendingAction(null);

    if (kind === "archive") {
      await archiveChat({ data: { chatId } });
      await router.invalidate();
      return;
    }

    await deleteChatRecord({ data: { chatId } });

    if (currentChatId === chatId) {
      await navigate({ to: "/" });
    }

    await router.invalidate();
  }

  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <Collapsible asChild defaultOpen className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip="Chats">
                  <MessageSquareTextIcon />
                  <span>Chats</span>
                  <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {chats.map((chat) => (
                    <ChatRow
                      chat={chat}
                      isActive={location.pathname === `/chats/${chat.id}`}
                      isConfirming={
                        pendingAction?.chatId === chat.id && pendingAction.kind === "archive"
                      }
                      key={chat.id}
                      kind="archive"
                      onAction={handleAction}
                    />
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarMenu>
          <Collapsible asChild className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip="Archive">
                  <ArchiveIcon />
                  <span>Archive</span>
                  <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {archivedChats.map((chat) => (
                    <ChatRow
                      chat={chat}
                      isActive={location.pathname === `/chats/${chat.id}`}
                      isConfirming={
                        pendingAction?.chatId === chat.id && pendingAction.kind === "delete"
                      }
                      key={chat.id}
                      kind="delete"
                      onAction={handleAction}
                    />
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
