import { AppSidebar } from "#/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { Separator } from "#/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "#/components/ui/sidebar";
import { getSession } from "#/lib/auth-functions.ts";
import { loadAuthedLayoutData } from "#/lib/chat-functions.ts";
import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const session = await getSession();

    if (!session) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    return await loadAuthedLayoutData();
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { archivedChats, chats, user } = Route.useLoaderData();
  const location = useLocation();
  const currentChatId = /^\/chats\/([^/]+)$/.exec(location.pathname)?.[1];
  const currentChat = currentChatId
    ? [...chats, ...archivedChats].find((chat) => chat.id === currentChatId)
    : null;

  return (
    <SidebarProvider>
      <AppSidebar archivedChats={archivedChats} chats={chats} user={user} />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-10">
          <div className="flex min-w-0 items-center gap-2.5 px-3">
            <SidebarTrigger className="-ml-1" />
            {currentChat ? (
              <>
                <Separator
                  orientation="vertical"
                  className="data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                />
                <Breadcrumb className="min-w-0">
                  <BreadcrumbList className="flex-nowrap">
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link to="/">Chats</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="block max-w-[min(50vw,40rem)] truncate">
                        {currentChat.title}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </>
            ) : null}
          </div>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
