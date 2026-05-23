import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth.ts";
import { isAnonymousAuthEnabled } from "#/lib/feature-flags.ts";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  return await auth.api.getSession({
    headers: getRequestHeaders(),
  });
});

export const getAnonymousAuthEnabled = createServerFn({ method: "GET" }).handler(() => {
  return isAnonymousAuthEnabled();
});
