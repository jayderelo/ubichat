import { AppSidebar } from "#/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "#/components/ui/breadcrumb";
import { Separator } from "#/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "#/components/ui/sidebar";
import { getSession } from "#/lib/auth-functions.ts";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const session = await getSession();

    if (!session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-h-svh">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex min-w-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Chats</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
