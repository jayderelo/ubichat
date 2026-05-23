import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "#/components/login-form.tsx";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  navigate: vi.fn(),
  signInAnonymous: vi.fn(),
  signInSocial: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));

vi.mock("#/lib/auth-client.ts", () => ({
  authClient: {
    signIn: {
      anonymous: mocks.signInAnonymous,
      social: mocks.signInSocial,
    },
  },
}));

describe("LoginForm", () => {
  it("hides guest sign-in when anonymous auth is disabled", () => {
    render(<LoginForm enableAnonymousAuth={false} />);

    expect(screen.queryByRole("button", { name: /continue as guest/i })).not.toBeInTheDocument();
  });

  it("signs in anonymously and enters the app when enabled", async () => {
    const user = userEvent.setup();
    mocks.signInAnonymous.mockResolvedValueOnce({ error: null });

    render(<LoginForm enableAnonymousAuth={true} />);

    await user.click(screen.getByRole("button", { name: /continue as guest/i }));

    await waitFor(() => {
      expect(mocks.signInAnonymous).toHaveBeenCalled();
      expect(mocks.invalidate).toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
    });
  });
});
