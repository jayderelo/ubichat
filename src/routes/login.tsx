import { LoginForm } from "#/components/login-form.tsx";
import { getAnonymousAuthEnabled, getSession } from "#/lib/auth-functions.ts";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await getSession();

    if (session) {
      throw redirect({ to: "/" });
    }
  },
  loader: async () => {
    return {
      enableAnonymousAuth: await getAnonymousAuthEnabled(),
    };
  },
  component: Login,
});

function Login() {
  const { enableAnonymousAuth } = Route.useLoaderData();

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <LoginForm className="w-full max-w-sm" enableAnonymousAuth={enableAnonymousAuth} />
    </main>
  );
}
