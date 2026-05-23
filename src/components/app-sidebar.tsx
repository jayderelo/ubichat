"use client";

import * as React from "react";

import { NavChats } from "#/components/nav-chats.tsx";
import { NavUser } from "#/components/nav-user.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "#/components/ui/sidebar.tsx";
import { Link } from "@tanstack/react-router";
import { EditIcon, MessageCircleIcon } from "lucide-react";

type SidebarChat = {
  id: string;
  title: string;
};

type SidebarUser = {
  avatar: string;
  email: string;
  isAnonymous: boolean;
  name: string;
};

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  archivedChats: SidebarChat[];
  chats: SidebarChat[];
  enableAnonymousAuth: boolean;
  user: SidebarUser;
};

export function AppSidebar({
  archivedChats,
  chats,
  enableAnonymousAuth,
  user,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <MessageCircleIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Ubichat</span>
                  <span className="truncate text-xs">AI workspace</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="New Chat">
              <Link to="/">
                <EditIcon />
                <span>New Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarGroup>
        <NavChats archivedChats={archivedChats} chats={chats} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser enableAnonymousAuth={enableAnonymousAuth} user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
