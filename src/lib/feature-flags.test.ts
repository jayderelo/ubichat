import { afterEach, describe, expect, it } from "vitest";
import { isAnonymousAuthEnabled } from "#/lib/feature-flags.ts";

const originalFlag = process.env.FLAG_ENABLE_ANONYMOUS_AUTH;

afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.FLAG_ENABLE_ANONYMOUS_AUTH;
    return;
  }

  process.env.FLAG_ENABLE_ANONYMOUS_AUTH = originalFlag;
});

describe("feature flags", () => {
  it("enables anonymous auth only when the flag is exactly true", () => {
    process.env.FLAG_ENABLE_ANONYMOUS_AUTH = "true";

    expect(isAnonymousAuthEnabled()).toBe(true);
  });

  it("keeps anonymous auth disabled for unset or non-true values", () => {
    delete process.env.FLAG_ENABLE_ANONYMOUS_AUTH;
    expect(isAnonymousAuthEnabled()).toBe(false);

    process.env.FLAG_ENABLE_ANONYMOUS_AUTH = "1";
    expect(isAnonymousAuthEnabled()).toBe(false);

    process.env.FLAG_ENABLE_ANONYMOUS_AUTH = "TRUE";
    expect(isAnonymousAuthEnabled()).toBe(false);
  });
});
