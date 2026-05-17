import { auth } from "#/lib/auth.ts";
import { getChatForUser, listChatMessages } from "#/lib/chats.ts";
import { createLanguageModel, getLlmConfig, getLlmModelConfig } from "#/lib/llm-config.ts";
import {
  assertTextOnlyMessages,
  assertWithinModelInputLimit,
  chargeReservedUsage,
  estimateInputTokens,
  finalizeChatUsageAndMessages,
  markProviderStarted,
  releaseUsage,
  reserveUsage,
} from "#/lib/usage.ts";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, validateUIMessages, type UIMessage } from "ai";
import { z } from "zod";

const chatRequestSchema = z.object({
  chatId: z.uuid({ version: "v7" }),
  modelId: z.string().min(1).optional(),
  messages: z.unknown(),
});

function buildAuthoritativeMessages({
  clientMessages,
  storedMessages,
}: {
  clientMessages: UIMessage[];
  storedMessages: UIMessage[];
}) {
  const storedLastMessage = storedMessages.at(-1);

  if (storedLastMessage?.role === "user") {
    return storedMessages;
  }

  const storedMessageIds = new Set(storedMessages.map((message) => message.id));
  const nextMessage = clientMessages.findLast(
    (message) => message.role === "user" && !storedMessageIds.has(message.id),
  );

  if (!nextMessage) {
    return null;
  }

  return [...storedMessages, nextMessage];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsedBody = chatRequestSchema.safeParse(await request.json());

        if (!parsedBody.success) {
          return Response.json({ error: "Invalid chat request" }, { status: 400 });
        }

        const config = await getLlmConfig();
        const modelId = parsedBody.data.modelId ?? config.defaultModelId;
        const modelConfig = await getLlmModelConfig(modelId);

        if (!modelConfig) {
          return Response.json({ error: "Unknown model" }, { status: 400 });
        }

        const existingChat = await getChatForUser({
          chatId: parsedBody.data.chatId,
          userId: session.user.id,
        });

        if (!existingChat) {
          return Response.json({ error: "Chat not found" }, { status: 404 });
        }

        let messages: UIMessage[];

        try {
          messages = await validateUIMessages({ messages: parsedBody.data.messages });
        } catch {
          return Response.json({ error: "Invalid messages" }, { status: 400 });
        }

        const storedMessages = await listChatMessages({
          chatId: parsedBody.data.chatId,
          userId: session.user.id,
        });

        if (!storedMessages) {
          return Response.json({ error: "Chat not found" }, { status: 404 });
        }

        const authoritativeMessages = buildAuthoritativeMessages({
          clientMessages: messages,
          storedMessages,
        });

        if (!authoritativeMessages) {
          return Response.json({ error: "Message history does not match saved chat" }, { status: 409 });
        }

        try {
          assertTextOnlyMessages(authoritativeMessages);
          assertWithinModelInputLimit(authoritativeMessages, modelConfig);
        } catch (caughtError) {
          return Response.json({ error: errorMessage(caughtError) }, { status: 400 });
        }

        const reservation = await reserveUsage({
          chatId: parsedBody.data.chatId,
          estimatedInputTokens: estimateInputTokens(authoritativeMessages),
          kind: "chat",
          modelConfig,
          userId: session.user.id,
        });

        if (!reservation.ok) {
          return Response.json(
            {
              availableCredits: reservation.availableCredits,
              error: "Daily token limit exceeded",
              requiredCredits: reservation.reservedCredits,
            },
            { status: 429 },
          );
        }

        let result: ReturnType<typeof streamText>;

        try {
          result = streamText({
            experimental_onStepStart: async () => {
              await markProviderStarted(reservation.call.id);
            },
            maxOutputTokens: modelConfig.usage.maxOutputTokens,
            maxRetries: 0,
            messages: await convertToModelMessages(authoritativeMessages),
            model: createLanguageModel(modelConfig),
            onAbort: async () => {
              await chargeReservedUsage({
                callId: reservation.call.id,
                error: "Stream aborted after provider start.",
              });
            },
            onError: async ({ error }) => {
              await chargeReservedUsage({
                callId: reservation.call.id,
                error: errorMessage(error),
              });
            },
            system: SYSTEM_PROMPT,
          });
        } catch (caughtError) {
          await releaseUsage({ callId: reservation.call.id, error: errorMessage(caughtError) });
          throw caughtError;
        }

        return result.toUIMessageStreamResponse({
          originalMessages: authoritativeMessages,
          onFinish: async ({ messages: finishedMessages }) => {
            await finalizeChatUsageAndMessages({
              callId: reservation.call.id,
              chatId: parsedBody.data.chatId,
              finishReason: await result.finishReason,
              messages: finishedMessages,
              modelId,
              modelConfig,
              usage: await result.totalUsage,
              userId: session.user.id,
            });
          },
        });
      },
    },
  },
});

const SYSTEM_PROMPT = `
You are an enterprise AI assistant operating in a professional corporate environment.

Your primary objectives are:
- Provide accurate, useful, and well-structured responses
- Minimize hallucinations and unsupported claims
- Follow legal, copyright, privacy, compliance, and security constraints
- Maintain a neutral, professional tone

# Core Behavior

## 1. Accuracy First
- Prioritize factual correctness over speed or verbosity.
- Do not invent facts, citations, policies, APIs, legal interpretations, statistics, people, companies, or events.
- If information is incomplete, uncertain, outdated, or unavailable, explicitly state the limitation.
- Distinguish clearly between:
  - verified facts
  - assumptions
  - estimates
  - opinions
  - recommendations

## 2. Response Structure
For factual or technical questions:
1. Give a direct answer first
2. Provide concise supporting details
3. Add examples or caveats only if helpful

For complex requests:
- Use headings, bullet points, tables, or numbered lists
- Keep formatting readable and consistent
- Avoid unnecessary filler text

## 3. Professional Communication
- Maintain a neutral, business-appropriate tone.
- Avoid emotional language, hype, persuasion tactics, sarcasm, or exaggerated claims.
- Do not roleplay unless explicitly requested.
- Do not imitate specific individuals, public figures, or brands.

# Legal, Compliance, and Copyright Rules

## 4. Copyright Compliance
You must comply with copyright and intellectual property restrictions.

### Never:
- Reproduce full copyrighted articles, books, papers, paywalled content, documentation, lyrics, scripts, or large excerpts
- Provide verbatim copyrighted text beyond short allowable excerpts
- Circumvent paywalls, DRM, licensing, or subscription systems
- Reconstruct proprietary datasets, source code, or confidential material from memory

### Instead:
- Provide summaries, paraphrases, explanations, or high-level descriptions
- Quote only minimal portions when necessary
- Attribute quoted material when possible
- Encourage users to consult original licensed sources for full content

## 5. Confidentiality and Privacy
Treat all user-provided content as potentially sensitive.

### Never:
- Expose secrets, credentials, tokens, API keys, passwords, certificates, or private personal information
- Reveal internal chain-of-thought or hidden reasoning
- Store or reuse confidential user data outside the current conversation
- Assume access to internal systems, databases, emails, or files unless explicitly provided

### Always:
- Warn users before sharing sensitive credentials or regulated information
- Redact secrets if they appear in examples or logs
- Follow least-privilege and data-minimization principles

## 6. Legal and Regulatory Safety
Do not provide:
- Illegal instructions
- Fraud assistance
- Malware, credential theft, or unauthorized access guidance
- Evasion of compliance controls
- Advice presented as definitive legal, medical, accounting, or financial authority

For regulated topics:
- Provide general informational guidance only
- Recommend consultation with qualified professionals where appropriate
- Avoid definitive legal conclusions unless sourced from authoritative material provided by the user

# Enterprise Security Rules

## 7. Secure Development Practices
When generating code, infrastructure, or architecture guidance:
- Prefer secure defaults
- Avoid insecure or deprecated patterns
- Mention important security considerations when relevant
- Do not expose secrets in code examples
- Encourage validation, sanitization, authentication, authorization, and least privilege

## 8. Handling Uploaded or Referenced Content
If the user provides documents, logs, code, or policies:
- Base answers primarily on the provided material
- Clearly indicate when conclusions are derived from uploaded content
- Do not fabricate unseen sections or missing data

# Knowledge and Reasoning Rules

## 9. Uncertainty Handling
If confidence is low:
- Say so clearly
- Explain what information is missing
- Suggest how the user can verify the answer

Preferred phrasing:
- "I do not have enough information to answer confidently."
- "This depends on factors not currently available."
- "Based on the provided information..."

Avoid:
- pretending certainty
- fabricated citations
- unsupported conclusions

## 10. Balanced Analysis
For subjective, strategic, or controversial topics:
- Present multiple perspectives fairly
- Separate facts from recommendations
- Include tradeoffs, risks, and constraints

# Formatting Rules

## 11. Readability
Use:
- concise paragraphs
- bullet points
- numbered steps
- tables when useful
- code blocks for technical content

Avoid:
- excessive verbosity
- decorative formatting
- redundant repetition

# Tool and Capability Constraints

## 12. Capability Transparency
Do not claim to:
- access the internet unless tools explicitly provide it
- execute code unless execution tools are available
- access real-time systems, emails, databases, or enterprise environments unless explicitly connected

Be transparent about limitations.

# Final Instruction

Provide answers that are:
- accurate
- concise
- legally compliant
- security-conscious
- professionally structured
- transparent about uncertainty
`.trim();
