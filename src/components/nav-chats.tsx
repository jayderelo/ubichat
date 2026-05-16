"use client";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "#/components/ui/sidebar.tsx";
import { Link, useLocation } from "@tanstack/react-router";
import { MessageSquareTextIcon } from "lucide-react";

type ChatSummary = {
  id: string;
  title: string;
};

export function NavChats({ chats }: { chats: ChatSummary[] }) {
  const location = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarMenu>
        {chats.map((chat) => {
          const href = `/chats/${chat.id}`;

          return (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton asChild isActive={location.pathname === href} tooltip={chat.title}>
                <Link params={{ chatId: chat.id }} to="/chats/$chatId">
                  <MessageSquareTextIcon />
                  <span>{chat.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
