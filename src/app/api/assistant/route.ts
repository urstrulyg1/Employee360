import { db } from "@/db";
import { aiConversations, aiMessages, employeePreferences } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { answerQuestion, llmConfigured, maybePolishWithLlm } from "@/lib/assistant";

/** GET — assistant availability + conversation history. */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const conversationId = u.searchParams.get("conversationId");
  const [prefs] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, user.id)).limit(1);

  const conversations = await db.select().from(aiConversations)
    .where(eq(aiConversations.userId, user.id)).orderBy(desc(aiConversations.updatedAt)).limit(30);

  const messages = conversationId
    ? await db.select().from(aiMessages)
        .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.userId, user.id)))
        .orderBy(asc(aiMessages.createdAt))
    : [];

  return ok({
    enabled: prefs?.aiEnabled ?? true,
    llmConfigured: llmConfigured(),
    provider: llmConfigured() ? (process.env.OPENAI_API_KEY ? "openai" : "anthropic") : "grounded",
    conversations,
    messages,
  });
});

/** POST — ask a question. Answer is always grounded in the user's own records. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ question?: string; conversationId?: string }>(req);
  const question = String(body.question ?? "").trim();
  if (!question) throw new ApiError(400, "Question is required");
  if (question.length > 500) throw new ApiError(400, "Question is too long (max 500 chars)");

  const [prefs] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, user.id)).limit(1);
  if (prefs && prefs.aiEnabled === false) throw new ApiError(403, "AI assistant is disabled in Settings.");

  // conversation
  let conversationId = body.conversationId;
  if (conversationId) {
    const [conv] = await db.select().from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, user.id))).limit(1);
    if (!conv) throw new ApiError(404, "Conversation not found");
  } else {
    const [conv] = await db.insert(aiConversations).values({
      userId: user.id, title: question.slice(0, 80),
    }).returning();
    conversationId = conv.id;
  }

  await db.insert(aiMessages).values({
    conversationId, userId: user.id, role: "user", content: question,
  });

  let answer = await answerQuestion(user.id, question);
  answer = await maybePolishWithLlm(answer, question);

  const [saved] = await db.insert(aiMessages).values({
    conversationId, userId: user.id, role: "assistant",
    content: answer.markdown, intent: answer.intent,
    sources: answer.sources, provider: answer.provider,
  }).returning();

  await db.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conversationId));
  await audit(user.id, "assistant", conversationId, "asked", { intent: answer.intent, sources: answer.sources.length });

  return ok({ conversationId, message: saved, answer }, 201);
});

/** PATCH — edit a generated report (user owns the final wording). */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ messageId?: string; content?: string }>(req);
  if (!body.messageId || typeof body.content !== "string") throw new ApiError(400, "messageId and content are required");
  const [existing] = await db.select().from(aiMessages)
    .where(and(eq(aiMessages.id, body.messageId), eq(aiMessages.userId, user.id))).limit(1);
  if (!existing) throw new ApiError(404, "Message not found");
  const [row] = await db.update(aiMessages).set({ content: body.content, edited: true })
    .where(eq(aiMessages.id, body.messageId)).returning();
  await audit(user.id, "assistant", body.messageId, "edited_answer");
  return ok(row);
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ conversationId?: string }>(req);
  if (!body.conversationId) throw new ApiError(400, "conversationId required");
  await db.delete(aiConversations)
    .where(and(eq(aiConversations.id, body.conversationId), eq(aiConversations.userId, user.id)));
  return ok({ deleted: true });
});
