import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins/anonymous";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import * as schema from "../../database/schema/auth-schema";
import { transferAnonymousUserData } from "#/lib/anonymous-user-transfer.ts";
import { db } from "#/lib/db.ts";
import { isAnonymousAuthEnabled } from "#/lib/feature-flags.ts";

const plugins = isAnonymousAuthEnabled()
  ? [
      anonymous({
        async onLinkAccount({ anonymousUser, newUser }) {
          await transferAnonymousUserData({
            anonymousUserId: anonymousUser.user.id,
            targetUserId: newUser.user.id,
          });
        },
      }),
      tanstackStartCookies(),
    ]
  : [tanstackStartCookies()];

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.BETTER_AUTH_URL,
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins,
});
