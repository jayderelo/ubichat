"use client";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
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
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === `/chats/${chat.id}`}
                      tooltip={chat.title}
                      className="truncate"
                    >
                      <Link params={{ chatId: chat.id }} to="/chats/$chatId">
                        {chat.title}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
    </SidebarGroup>
  );
}
