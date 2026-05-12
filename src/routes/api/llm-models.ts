import { getPublicLlmConfig } from "#/lib/llm-config.ts";
import { auth } from "#/lib/auth.ts";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/llm-models")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        return Response.json(await getPublicLlmConfig());
      },
    },
  },
});
