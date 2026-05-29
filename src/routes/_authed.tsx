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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { getAnonymousAuthEnabled, getSession } from "#/lib/auth-functions.ts";
import { loadAuthedLayoutData } from "#/lib/chat-functions.ts";
import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { ChartAreaIcon, EditIcon, MessageCircleIcon } from "lucide-react";

export const Route = createFileRoute("/_authed")({
  ssr: "data-only",
  beforeLoad: async () => {
    const session = await getSession();

    if (!session) {
      throw redirect({ to: "/login" });
    }
  },
  loader: async () => {
    const [layoutData, enableAnonymousAuth] = await Promise.all([
      loadAuthedLayoutData(),
      getAnonymousAuthEnabled(),
    ]);

    return {
      ...layoutData,
      enableAnonymousAuth,
    };
  },
  pendingComponent: AuthedLayoutPending,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { archivedChats, chats, enableAnonymousAuth, user } = Route.useLoaderData();
  const location = useLocation();
  const isVisualizePage = location.pathname === "/visualize";
  const currentChatId = /^\/chats\/([^/]+)$/.exec(location.pathname)?.[1];
  const currentChat = currentChatId
    ? [...chats, ...archivedChats].find((chat) => chat.id === currentChatId)
    : null;

  return (
    <SidebarProvider>
      <AppSidebar
        archivedChats={archivedChats}
        chats={chats}
        enableAnonymousAuth={enableAnonymousAuth}
        user={user}
      />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-10">
          <div className="flex min-w-0 items-center gap-2.5 px-3">
            <SidebarTrigger className="-ml-1" />
            {currentChat || isVisualizePage ? (
              <>
                <Separator
                  orientation="vertical"
                  className="data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                />
                <Breadcrumb className="min-w-0">
                  <BreadcrumbList className="flex-nowrap">
                    {!isVisualizePage && (
                      <>
                        <BreadcrumbItem>
                          <BreadcrumbLink asChild>
                            <Link to="/">Chats</Link>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                      </>
                    )}
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="block max-w-[min(50vw,40rem)] truncate">
                        {isVisualizePage ? "Visualize" : currentChat?.title}
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

function AuthedLayoutPending() {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" disabled>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <MessageCircleIcon className="size-4" />
                </div>
                <div className="grid flex-1 gap-1 text-left leading-tight">
                  <Skeleton className="h-4 w-20 bg-sidebar-accent" />
                  <Skeleton className="h-3 w-24 bg-sidebar-accent" />
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <PendingSidebarItem icon={<EditIcon />} widthClassName="w-20" />
            <PendingSidebarItem icon={<ChartAreaIcon />} widthClassName="w-16" />
          </SidebarGroup>
          <SidebarGroup className="gap-1">
            <Skeleton className="mx-2 mb-1 h-3 w-12 bg-sidebar-accent" />
            <PendingSidebarItem widthClassName="w-36" />
            <PendingSidebarItem widthClassName="w-28" />
            <PendingSidebarItem widthClassName="w-40" />
            <PendingSidebarItem widthClassName="w-24" />
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex h-12 items-center gap-2 rounded-md px-2">
            <Skeleton className="size-8 rounded-lg bg-sidebar-accent" />
            <div className="grid flex-1 gap-1 group-data-[collapsible=icon]:hidden">
              <Skeleton className="h-4 w-28 bg-sidebar-accent" />
              <Skeleton className="h-3 w-36 bg-sidebar-accent" />
            </div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b">
          <div className="flex min-w-0 items-center gap-2.5 px-3">
            <SidebarTrigger className="-ml-1" disabled />
            <Separator
              orientation="vertical"
              className="data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            />
            <Skeleton className="h-4 w-28" />
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end px-4 py-6">
            <div className="mb-6 flex flex-col gap-5">
              <PendingMessage align="start" widths={["w-52", "w-72", "w-40"]} />
              <PendingMessage align="end" widths={["w-64", "w-48"]} />
              <PendingMessage align="start" widths={["w-56", "w-80", "w-60"]} />
            </div>
            <div className="rounded-xl border bg-background p-3 shadow-xs">
              <div className="flex min-h-20 flex-col justify-between gap-4">
                <Skeleton className="h-4 w-48" />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-8 rounded-md" />
                    <Skeleton className="size-8 rounded-md" />
                  </div>
                  <Skeleton className="size-8 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function PendingSidebarItem({
  icon,
  widthClassName,
}: {
  icon?: React.ReactNode;
  widthClassName: string;
}) {
  return (
    <SidebarMenuItem>
      <div className="flex h-8 items-center gap-2 rounded-md px-2">
        {icon ? (
          <span className="flex size-4 shrink-0 text-sidebar-foreground/60">{icon}</span>
        ) : (
          <Skeleton className="size-4 rounded-md bg-sidebar-accent" />
        )}
        <Skeleton className={`h-4 bg-sidebar-accent group-data-[collapsible=icon]:hidden ${widthClassName}`} />
      </div>
    </SidebarMenuItem>
  );
}

function PendingMessage({
  align,
  widths,
}: {
  align: "end" | "start";
  widths: string[];
}) {
  return (
    <div className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[80%] flex-col gap-2 rounded-lg border p-3 ${
          align === "end" ? "items-end bg-muted/60" : "bg-background"
        }`}
      >
        {widths.map((widthClassName, index) => (
          <Skeleton
            // The list is static and intentionally ordered to create a message-like silhouette.
            key={`${widthClassName}-${index}`}
            className={`h-4 max-w-full ${widthClassName}`}
          />
        ))}
      </div>
    </div>
  );
}
