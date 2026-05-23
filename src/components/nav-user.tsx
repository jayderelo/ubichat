"use client";

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "#/components/ui/sidebar.tsx";
import { authClient } from "#/lib/auth-client.ts";
import { creditLimitSummaryQueryOptions } from "#/lib/credit-limit-query.ts";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronsUpDownIcon, LogInIcon, LogOutIcon, RefreshCwIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

type OAuthProvider = "github" | "google";

const creditNumberFormatter = new Intl.NumberFormat("en-US");

export function NavUser({
  enableAnonymousAuth,
  user,
}: {
  enableAnonymousAuth: boolean;
  user: {
    name: string;
    email: string;
    avatar: string;
    isAnonymous: boolean;
  };
}) {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const router = useRouter();
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signIn(provider: OAuthProvider) {
    setPendingProvider(provider);

    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/",
      errorCallbackURL: "/",
    });

    if (error) {
      setPendingProvider(null);
    }
  }

  async function signOut() {
    setIsSigningOut(true);

    const { error } = await authClient.signOut();

    if (error) {
      setIsSigningOut(false);
      return;
    }

    await router.invalidate();
    await navigate({ to: "/login" });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <Suspense fallback={<CreditLimitSummaryFallback />}>
              <CreditLimitSummary />
            </Suspense>
            <DropdownMenuSeparator />
            {enableAnonymousAuth && user.isAnonymous ? (
              <>
                <DropdownMenuItem
                  disabled={pendingProvider !== null}
                  onSelect={() => void signIn("google")}
                >
                  <LogInIcon />
                  {pendingProvider === "google" ? "Opening Google..." : "Sign in with Google"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={pendingProvider !== null}
                  onSelect={() => void signIn("github")}
                >
                  <LogInIcon />
                  {pendingProvider === "github" ? "Opening GitHub..." : "Sign in with GitHub"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem disabled={isSigningOut} onSelect={() => void signOut()}>
              <LogOutIcon />
              {isSigningOut ? "Logging out..." : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function CreditLimitSummary() {
  const { data: creditLimitDetails } = useSuspenseQuery(creditLimitSummaryQueryOptions());
  const remainingPercent = Math.min(Math.max(creditLimitDetails.remainingPercent, 0), 100);
  const remainingCredits = creditNumberFormatter.format(creditLimitDetails.remainingCredits);
  const dailyCreditLimit = creditNumberFormatter.format(creditLimitDetails.dailyCreditLimit);

  return (
    <div className="px-2 py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Credit limit</p>
          <p className="text-xs text-muted-foreground">
            {remainingCredits} / {dailyCreditLimit} credits left
          </p>
        </div>
        <span className="text-sm font-medium tabular-nums">{remainingPercent}%</span>
      </div>
      <Progress value={remainingPercent} />
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCwIcon className="size-3.5" />
        <span>Resets daily at 12:00 AM UTC</span>
      </div>
    </div>
  );
}

function CreditLimitSummaryFallback() {
  return (
    <div className="px-2 py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Credit limit</p>
          <p className="text-xs text-muted-foreground">Loading credits...</p>
        </div>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">--%</span>
      </div>
      <Progress value={0} />
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCwIcon className="size-3.5" />
        <span>Resets daily at 12:00 AM UTC</span>
      </div>
    </div>
  );
}
