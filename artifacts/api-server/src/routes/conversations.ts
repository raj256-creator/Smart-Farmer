import { Router, type IRouter } from "express";
import { db, conversations, messages } from "@workspace/db";
import { eq, desc, asc, and, isNull } from "drizzle-orm";
import {
  CreateConversationBody,
  SendConversationMessageBody,
} from "@workspace/api-zod";
import { generateChatResponse, type ChatMode } from "../lib/aiAnalysis";

function parseId(params: Record<string, string>): number | null {
  const n = parseInt(params.id, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

function parseFarmId(query: Record<string, string | string[]>): number | null {
  const raw = Array.isArray(query.farmId) ? query.farmId[0] : query.farmId;
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

const VALID_MODES: ChatMode[] = ["general", "agro-technical", "analyst"];

const router: IRouter = Router();

router.get("/conversations", async (req, res): Promise<void> => {
  const farmId = parseFarmId(req.query as Record<string, string>);

  const rows = farmId
    ? await db.select().from(conversations).where(eq(conversations.farmId, farmId)).orderBy(desc(conversations.createdAt))
    : await db.select().from(conversations).where(isNull(conversations.farmId)).orderBy(desc(conversations.createdAt));

  const withLastMessage = await Promise.all(
    rows.map(async (conv) => {
      const [lastMsg] = await db
        .select({ content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      return { ...conv, lastMessage: lastMsg?.content ?? null };
    })
  );

  res.json(withLastMessage);
});

router.post("/conversations", async (req, res): Promise<void> => {
  const body = CreateConversationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const farmIdRaw = (req.body as { farmId?: unknown }).farmId;
  const farmId = typeof farmIdRaw === "number" ? farmIdRaw : null;

  const [conv] = await db
    .insert(conversations)
    .values({ title: body.data.title, farmId })
    .returning();
  res.status(201).json(conv);
});

router.patch("/conversations/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  const title = (req.body as { title?: string }).title;
  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const [updated] = await db
    .update(conversations)
    .set({ title: title.trim() })
    .where(eq(conversations.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json(updated);
});

router.delete("/conversations/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));
  res.sendStatus(204);
});

router.get("/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  res.json(rows);
});

router.post("/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  const body = SendConversationMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { message, cropType } = body.data;
  const reqBody = req.body as {
    farmContext?: string;
    mode?: string;
    language?: string;
    imageData?: string;
  };
  const farmContext = reqBody.farmContext ?? null;
  const mode: ChatMode = VALID_MODES.includes(reqBody.mode as ChatMode)
    ? (reqBody.mode as ChatMode)
    : "general";
  const language = typeof reqBody.language === "string" ? reqBody.language : null;
  const imageData = typeof reqBody.imageData === "string" && reqBody.imageData.startsWith("data:image/")
    ? reqBody.imageData
    : null;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const history = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  const aiHistory = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  await db.insert(messages).values({
    conversationId: id,
    role: "user",
    content: message,
  });

  const { reply, suggestions } = await generateChatResponse(
    message,
    cropType ?? null,
    aiHistory,
    farmContext,
    mode,
    language,
    imageData
  );

  await db.insert(messages).values({
    conversationId: id,
    role: "assistant",
    content: reply,
  });

  res.json({ reply, suggestions });
});

export default router;
