import { useState } from "react";
import { cn } from "#/lib/utils.ts";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Field,
  FieldDescription,
  FieldGroup,
} from "#/components/ui/field.tsx";
import { authClient } from "#/lib/auth-client.ts";

type OAuthProvider = "github" | "google";

const callbackURL = "/chats";
const errorCallbackURL = "/login";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: OAuthProvider) {
    setPendingProvider(provider);
    setError(null);

    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      errorCallbackURL,
    });

    if (error) {
      setError(error.message ?? "Unable to start sign in. Please try again.");
      setPendingProvider(null);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Login with Google or GitHub</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <Button
                variant="outline"
                type="button"
                disabled={pendingProvider !== null}
                onClick={() => void signIn("google")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path
                    d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                    fill="currentColor"
                  />
                </svg>
                {pendingProvider === "google" ? "Opening Google..." : "Login with Google"}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={pendingProvider !== null}
                onClick={() => void signIn("github")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58l-.02-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.82 1.1.82 2.22l-.02 3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z"
                  />
                </svg>
                {pendingProvider === "github" ? "Opening GitHub..." : "Login with GitHub"}
              </Button>
            </Field>
            {error ? (
              <FieldDescription className="text-center text-destructive">{error}</FieldDescription>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a> and{" "}
        <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  );
}
