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
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRightIcon, MessageSquareTextIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

type ChatSummary = {
  id: string;
  title: string;
};

export function NavChats({ chats }: { chats: ChatSummary[] }) {
  const location = useLocation();

  return (
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
                  <SidebarMenuSubItem key={chat.id}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={location.pathname === `/chats/${chat.id}`}
                      title={chat.title}
                    >
                      <Link params={{ chatId: chat.id }} to="/chats/$chatId">
                        <span className="truncate">{chat.title}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
    </SidebarGroup>
  );
}
