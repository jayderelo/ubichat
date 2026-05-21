import { eq } from "drizzle-orm";
import { userSettings } from "../../database/schema/app-schema";
import { db } from "#/lib/db.ts";

export type UserModelSettings = {
  reasoningPreferences: Record<string, string>;
  selectedModelId: string | null;
};

export async function getUserModelSettings(userId: string): Promise<UserModelSettings> {
  const [settings] = await db
    .select({
      reasoningPreferences: userSettings.reasoningPreferences,
      selectedModelId: userSettings.selectedModelId,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return {
    reasoningPreferences: settings?.reasoningPreferences ?? {},
    selectedModelId: settings?.selectedModelId ?? null,
  };
}

export async function upsertUserModelSettings({
  modelId,
  reasoningModeId,
  userId,
}: {
  modelId: string;
  reasoningModeId?: string | null;
  userId: string;
}) {
  const existing = await getUserModelSettings(userId);
  const reasoningPreferences = {
    ...existing.reasoningPreferences,
    ...(reasoningModeId ? { [modelId]: reasoningModeId } : {}),
  };
  const now = new Date();

  const [settings] = await db
    .insert(userSettings)
    .values({
      reasoningPreferences,
      selectedModelId: modelId,
      updatedAt: now,
      userId,
    })
    .onConflictDoUpdate({
      set: {
        reasoningPreferences,
        selectedModelId: modelId,
        updatedAt: now,
      },
      target: userSettings.userId,
    })
    .returning();

  return settings;
}
