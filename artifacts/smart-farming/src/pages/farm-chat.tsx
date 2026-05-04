import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { FarmLayout } from "@/components/farm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetFarm } from "@workspace/api-client-react";
import { Bot, User, Send, Loader2, Plus, Trash2, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";

type Conversation = { id: number; title: string; farmId: number | null; createdAt: string; lastMessage?: string | null };
type Message = { id: number; conversationId: number; role: string; content: string; createdAt: string };

function MessageContent({ content }: { content: string }) {
  const sections = ["Understanding the Problem", "Key Insights", "Solution", "Prevention Tips", "Extra Advice"];
  const hasSections = sections.some((s) => content.includes(s));
  if (!hasSections) return <p className="leading-relaxed whitespace-pre-wrap text-sm">{content}</p>;

  const parts: { heading: string; body: string }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const idx = content.indexOf(section);
    if (idx === -1) continue;
    const nextIdx = sections.slice(i + 1).reduce<number>((min, s) => {
      const p = content.indexOf(s, idx + section.length);
      return p !== -1 && p < min ? p : min;
    }, content.length);
    const body = content.slice(idx + section.length, nextIdx).replace(/^[\s:*#-]+/, "").trim();
    parts.push({ heading: section, body });
  }
  if (!parts.length) return <p className="leading-relaxed whitespace-pre-wrap text-sm">{content}</p>;
  return (
    <div className="space-y-3">
      {parts.map(({ heading, body }) => (
        <div key={heading}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary/80 mb-1">{heading}</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
        </div>
      ))}
    </div>
  );
}

export default function FarmChat() {
  const [, params] = useRoute("/farms/:id/chat");
  const farmId = parseInt(params?.id ?? "0", 10);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });
  const queryClient = useQueryClient();

  const [activeId,         setActiveId]         = useState<number | null>(null);
  const [input,            setInput]            = useState("");
  const [sidebarOpen,      setSidebarOpen]      = useState(true);
  const [localSuggestions, setLocalSuggestions] = useState<string[]>([]);
  const [isSending,        setIsSending]        = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const convQueryKey = ["farm-conversations", farmId];
  const msgQueryKey  = ["conversation-messages", activeId];

  // ── Conversations list ──────────────────────────────────────────────────────
  const { data: convList = [], isLoading: loadingConvs } = useQuery({
    queryKey: convQueryKey,
    queryFn: async (): Promise<Conversation[]> => {
      const r = await fetch(`${BASE}/api/conversations?farmId=${farmId}`);
      return r.json();
    },
    enabled: farmId > 0,
  });

  // ── Messages ────────────────────────────────────────────────────────────────
  const { data: msgList = [], isLoading: loadingMsgs } = useQuery({
    queryKey: msgQueryKey,
    queryFn: async (): Promise<Message[]> => {
      if (!activeId) return [];
      const r = await fetch(`${BASE}/api/conversations/${activeId}/messages`);
      return r.json();
    },
    enabled: activeId !== null,
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgList, isSending]);

  const cropList  = ((farm?.crops as string[]) ?? []).join(", ");
  const cropFocus = cropList.split(",")[0]?.trim() ?? null;

  // ── Create conversation ─────────────────────────────────────────────────────
  const createConv = async (title: string): Promise<Conversation> => {
    const r = await fetch(`${BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, farmId }),
    });
    return r.json();
  };

  // ── Delete conversation ─────────────────────────────────────────────────────
  const handleDelete = async (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${BASE}/api/conversations/${convId}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: convQueryKey });
    if (activeId === convId) { setActiveId(null); setLocalSuggestions([]); }
  };

  const handleNewConv = async () => {
    const title = `Session ${new Date().toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    const conv = await createConv(title);
    queryClient.invalidateQueries({ queryKey: convQueryKey });
    setActiveId(conv.id); setLocalSuggestions([]);
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isSending) return;
    setInput(""); setLocalSuggestions([]);
    setIsSending(true);

    try {
      let convId = activeId;
      if (!convId) {
        const conv = await createConv(msg.slice(0, 60));
        queryClient.invalidateQueries({ queryKey: convQueryKey });
        convId = conv.id;
        setActiveId(conv.id);
      }

      const r = await fetch(`${BASE}/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          ...(cropFocus ? { cropType: cropFocus } : {}),
          ...(farm ? {
            farmContext: `Farm: ${farm.name}, Location: ${farm.location}${farm.acreage ? `, Area: ${farm.acreage} acres` : ""}${cropList ? `, Crops: ${cropList}` : ""}.`
          } : {}),
        }),
      });
      const data = await r.json() as { reply: string; suggestions?: string[] };
      setLocalSuggestions(data.suggestions ?? []);
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", convId] });
      queryClient.invalidateQueries({ queryKey: convQueryKey });
    } finally {
      setIsSending(false);
    }
  }, [input, activeId, isSending, farm, cropFocus, cropList, queryClient, BASE]);

  const cropSuggestions = cropFocus
    ? [`Best irrigation for ${cropFocus}?`, `Signs of disease in ${cropFocus}?`, "How to improve soil pH?", "Fertilizer schedule this month?"]
    : ["How to improve soil health?", "Signs of nutrient deficiency?", "Best irrigation schedule?", "Crop rotation advice?"];

  return (
    <FarmLayout farmId={farmId} farmName={farm?.name}>
      <div className="flex overflow-hidden w-full max-w-6xl mx-auto border-x border-border bg-card/50" style={{ height: "calc(100dvh - 105px)" }}>

        {/* Sidebar */}
        <div className={`${sidebarOpen ? "w-56 min-w-[14rem]" : "w-0 min-w-0"} transition-all duration-200 overflow-hidden border-r border-border flex flex-col bg-muted/30 shrink-0`}>
          <div className="p-3 border-b border-border shrink-0">
            <Button size="sm" className="w-full gap-2" onClick={handleNewConv}>
              <Plus className="w-4 h-4" />New Chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loadingConvs && <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
              {!loadingConvs && convList.length === 0 && <p className="text-xs text-muted-foreground text-center py-6 px-2">No conversations yet.</p>}
              {convList.map((conv) => (
                <div key={conv.id}
                  className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${activeId === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"}`}
                  onClick={() => { setActiveId(conv.id); setLocalSuggestions([]); }}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{conv.title}</p>
                    {conv.lastMessage && <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>}
                  </div>
                  <button type="button" onClick={(e) => handleDelete(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Main panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="p-3 border-b border-border bg-card shrink-0 flex items-center gap-3">
            <button onClick={() => setSidebarOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <Bot className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold">AI Farm Assistant</h2>
              <p className="text-xs text-muted-foreground truncate">{cropList ? `Crops: ${cropList}` : "Ask anything about your farm"}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {activeId === null && (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Farm-specific AI assistance</h2>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Conversations here are scoped to <strong>{farm?.name ?? "this farm"}</strong> only. Sensor data from your scans is used as context.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                  {cropSuggestions.map((q) => (
                    <button key={q} onClick={() => handleSend(q)} disabled={isSending}
                      className="text-xs px-4 py-3 rounded-xl border border-border bg-muted/50 hover:bg-muted transition-colors text-left disabled:opacity-50">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeId !== null && loadingMsgs && (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            )}

            {msgList.map((msg, i) => {
              const isUser   = msg.role === "user";
              const isLastAI = !isUser && i === msgList.length - 1;
              return (
                <div key={msg.id}>
                  <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? "bg-primary text-primary-foreground" : "bg-secondary border border-border"}`}>
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border border-border text-foreground rounded-tl-sm shadow-sm"}`}>
                      {isUser ? <p className="text-sm">{msg.content}</p> : <MessageContent content={msg.content} />}
                    </div>
                  </div>
                  {isLastAI && localSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 pl-11">
                      {localSuggestions.map((s) => (
                        <button key={s} disabled={isSending} onClick={() => handleSend(s)}
                          className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary transition-colors disabled:opacity-50 text-left">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {isSending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-secondary border border-border"><Bot className="w-4 h-4" /></div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border bg-card shrink-0">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative flex items-center">
              <Input value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your crops, soil, irrigation..."
                className="pr-12 py-6 rounded-xl border-border bg-background shadow-sm" disabled={isSending} />
              <Button type="submit" size="icon" className="absolute right-2 h-10 w-10 rounded-lg" disabled={!input.trim() || isSending}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
            <p className="text-xs text-center text-muted-foreground mt-2">Conversations are saved to this farm only.</p>
          </div>
        </div>
      </div>
    </FarmLayout>
  );
}
