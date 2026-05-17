import { createServerFn } from "@tanstack/react-start";
import { requireSession } from "#/lib/chat-actions.server.ts";
import { getCurrentUsageSummary } from "#/lib/usage.ts";

export const getCreditLimitSummary = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();

  return await getCurrentUsageSummary(session.user.id);
});
