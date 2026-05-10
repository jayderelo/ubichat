# AGENTS.md

Guidance for AI agents working in this repository. Keep changes aligned with the current scaffold and prefer small, verified edits.

## Project Snapshot

`ubichat` is an AI chat web application scaffolded with TanStack Start. The intended product direction is provider-flexible chat through the Vercel AI SDK, including Azure OpenAI support.

Current stack:

- Runtime/build: Vite, TanStack Start, TanStack Router, Nitro
- UI: React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Base UI/Radix-adjacent primitives, lucide-react
- AI UI: copied-in `ai-elements` components under `src/components/ai-elements`
- AI SDK: `ai`, `@ai-sdk/react`, `@ai-sdk/azure`
- Auth: Better Auth with Drizzle adapter
- Database: PostgreSQL through `pg`, Drizzle ORM, Drizzle Kit
- Tooling: npm, Vitest, oxlint, oxfmt

## Commands

Use npm. Do not introduce pnpm/yarn lockfiles.

```bash
npm install
npm run dev
npm run build
npm run test
npm run lint
npm run lint:fix
npm run fmt
npm run fmt:check
npm run db:generate
npm run db:push
```

Run the narrowest useful checks after a change. For shared code, routing, auth, or database work, prefer at least:

```bash
npm run lint
npm run test
npm run build
```

## Repository Layout

- `src/routes`: TanStack Router file routes. `src/routeTree.gen.ts` is generated; do not hand-edit it.
- `src/router.tsx`: router creation and registration.
- `src/routes/__root.tsx`: root document, metadata, global CSS link, providers, devtools.
- `src/components/ui`: shadcn/ui source components.
- `src/components/ai-elements`: AI Elements source components. Treat these as local source, not a black-box package.
- `src/components`: app-level composed components.
- `src/lib`: shared application code such as auth client/server setup and utilities.
- `src/hooks`: shared React hooks.
- `src/styles.css`: Tailwind v4 imports, shadcn theme variables, and global styles.
- `database/schema`: Drizzle schema. Keep migrations in `database/migrations` when generated.

## TypeScript And Imports

- Use strict TypeScript. Avoid `any` unless the boundary is genuinely untyped and a narrower type would be misleading.
- Use the configured import alias `#/*` for source imports, for example `#/components/ui/button`.
- This repo currently uses extensionful local imports in some files, but new code should be consistent with nearby files. Do not churn imports just for style.
- Keep server-only code out of client components. Database, Better Auth server config, provider keys, and AI provider construction belong on the server.
- Preserve `verbatimModuleSyntax` expectations: use type-only imports when importing types only.

## Routing And TanStack Start

- Add routes as files under `src/routes` with `createFileRoute`.
- Keep route components, loaders, and route-local server functions close to the route that owns them.
- Use `createServerFn` for type-safe server work called from the client. Validate inputs with Zod or an equivalent runtime validator before side effects.
- Use API/server routes for streaming chat endpoints and webhook-like HTTP handlers.
- Do not edit `src/routeTree.gen.ts`; let the router plugin regenerate it.
- Keep `defaultPreload: "intent"` behavior in `src/router.tsx` unless there is a specific product reason to change it.

## AI SDK And Provider Rules

- Build provider integration behind a thin server-side abstraction so chat code can switch between Azure and other AI SDK providers.
- Never expose provider API keys, Azure resource names, deployment IDs, or auth tokens to browser bundles.
- Prefer AI SDK primitives such as `streamText`, `generateText`, `convertToModelMessages`, `UIMessage`, and `useChat` where appropriate.
- Streaming chat should return proper streaming responses from server/API routes rather than buffering complete assistant messages.
- Keep provider selection explicit and typed. Model IDs/deployments should come from server-side config or database records, not hardcoded inside UI components.
- Normalize provider-specific details at the boundary. UI components should not need to know whether the selected model is Azure, OpenAI, or another provider.
- For chat state, prefer AI SDK message types and parts over ad hoc message shapes unless a persistent storage schema requires a mapped representation.

## AI Elements Usage

- Use existing `src/components/ai-elements` components before inventing custom chat UI.
- Typical chat composition should use components such as conversation, message, prompt-input, reasoning, tool, sources, code-block, attachments, and model-selector.
- These components are copied into the repo. It is acceptable to adapt them, but keep changes local, focused, and consistent with the component’s existing API.
- When adding more AI Elements, use the project package runner:

```bash
npx ai-elements@latest
```

## shadcn/ui And Styling

- Use existing shadcn/ui components from `src/components/ui` before adding new markup.
- Add shadcn components with:

```bash
npx shadcn@latest add <component>
```

- This project uses `components.json` with `style: "base-nova"`, Tailwind CSS v4, CSS variables, lucide icons, and aliases rooted at `#`.
- Prefer semantic tokens such as `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`.
- Do not create parallel theme files. Theme variables belong in `src/styles.css`.
- Use `cn()` from `#/lib/utils` for conditional classes.
- Use `gap-*` for spacing instead of `space-x-*` or `space-y-*`.
- Use `size-*` when width and height are equal.
- Buttons with icons should use lucide icons when available.
- Keep the app UI dense, direct, and tool-like. This is a chat/productivity app, not a marketing landing page.

## Auth

- Server auth config lives in `src/lib/auth.ts`.
- Client auth helper lives in `src/lib/auth-client.ts`.
- Better Auth uses Drizzle through the schema in `database/schema/auth-schema.ts`.
- Required environment variables currently include:
  - `DATABASE_URL`
  - `BETTER_AUTH_URL`
  - `GITHUB_CLIENT_ID`
  - `GITHUB_CLIENT_SECRET`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- Do not commit secrets or add real secret values to examples.
- After changing Better Auth plugins, auth schema, or database tables, regenerate or push schema intentionally with Drizzle/Better Auth tooling as appropriate.
- Keep auth checks on the server for protected data access. Client checks are for UX only.

## Database

- Drizzle config is in `drizzle.config.ts`.
- Schema files live under `database/schema`.
- Use explicit indexes and relations for query paths that will matter for chat history, sessions, projects, or memberships.
- Do not handwrite migrations unless the generated migration is insufficient and you understand the DDL.
- Before `npm run db:push`, make sure the target `DATABASE_URL` is intentional.

## Testing And Quality

- Put tests near the code they verify or in the existing project test convention when one emerges.
- Use Vitest and Testing Library for React behavior.
- For AI/provider code, mock network/provider calls. Do not make tests depend on live model APIs.
- For database code, prefer isolated tests with a test database or mock at the repository boundary.
- Run formatting with `npm run fmt` only when useful; avoid formatting unrelated files.

## Environment And Secrets

- Keep `.env` local. Do not print or commit secret values.
- Browser-exposed variables must be intentionally public. Provider credentials and database URLs must remain server-only.
- When adding a new required environment variable, document the name and purpose in the relevant setup docs without including real values.

## Git Hygiene

- Check `git status --short` before and after edits.
- Do not revert user changes or unrelated files.
- Keep commits focused by feature or fix.
- Avoid editing generated files unless the tool that owns them generated the change.

## Before Finishing

For most code changes, report:

- What changed
- Which checks ran
- Any checks that could not run and why
- Any follow-up that is truly needed

