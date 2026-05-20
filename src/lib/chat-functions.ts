import { createServerFn } from "@tanstack/react-start";
import { chatIdSchema, createChatSchema } from "#/lib/chat-actions.core.ts";
import { chatActions } from "#/lib/chat-actions.server.ts";

export const loadAuthedLayoutData = createServerFn({ method: "GET" }).handler(async () => {
  return await chatActions.loadAuthedLayoutData();
});

export const createChatFromFirstMessage = createServerFn({ method: "POST" })
  .inputValidator(createChatSchema)
  .handler(async ({ data }) => {
    return await chatActions.createChatFromFirstMessage(data);
  });

export const loadChatRouteData = createServerFn({ method: "GET" })
  .inputValidator(chatIdSchema)
  .handler(async ({ data }) => {
    return await chatActions.loadChatRouteData(data);
  });

export const generateAndSaveChatTitle = createServerFn({ method: "POST" })
  .inputValidator(chatIdSchema)
  .handler(async ({ data }) => {
    return await chatActions.generateAndSaveChatTitle(data);
  });

export const archiveChat = createServerFn({ method: "POST" })
  .inputValidator(chatIdSchema)
  .handler(async ({ data }) => {
    return await chatActions.archiveChat(data);
  });

export const deleteChatRecord = createServerFn({ method: "POST" })
  .inputValidator(chatIdSchema)
  .handler(async ({ data }) => {
    return await chatActions.deleteChat(data);
  });
