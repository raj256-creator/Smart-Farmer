import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListConversations,
  useCreateConversation,
  useDeleteConversation,
  useGetConversationMessages,
  useSendConversationMessage,
  getListConversationsQueryKey,
  getGetConversationMessagesQueryKey,
} from "@workspace/api-client-react";
import {
  Bot,
  User,
  Send,
  Loader2,
  Plus,
  Trash2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

function MessageContent({ content }: { content: string }) {
  const sections = [
    "Understanding the Problem",
    "Key Insights",
    "Solution",
    "Prevention Tips",
    "Extra Advice",
  ];

  const hasSections = sections.some((s) => content.includes(s));

  if (!hasSections) {
    return <p className="leading-relaxed whitespace-pre-wrap text-sm">{content}</p>;
  }

  const parts: { heading: string; body: string }[] = [];
  const remaining = content;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const idx = remaining.indexOf(section);
    if (idx === -1) continue;
    const nextIdx = sections.slice(i + 1).reduce<number>((min, s) => {
      const p = remaining.indexOf(s, idx + section.length);
      return p !== -1 && p < min ? p : min;
    }, remaining.length);
    const body = remaining
      .slice(idx + section.length, nextIdx)
      .replace(/^[\s:*#-]+/, "")
      .trim();
    parts.push({ heading: section, body });
  }

  if (parts.length === 0) {
    return <p className="leading-relaxed whitespace-pre-wrap text-sm">{content}</p>;
  }

  return (
    <div className="space-y-3">
      {parts.map(({ heading, body }) => (
        <div key={heading}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary/80 mb-1">
            {heading}
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
        </div>
      ))}
    </div>
  );
}

function SuggestionChips({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: string[];
  onSelect: (s: string) => void;
  disabled: boolean;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2 pl-11">
      {suggestions.map((s) => (
        <button
          key={s}
          disabled={disabled}
          onClick={() => onSelect(s)}
          className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export default function Chat() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [localSuggestions, setLocalSuggestions] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: convList = [], isLoading: loadingConvs } = useListConversations();
  const { data: msgList = [], isLoading: loadingMsgs } = useGetConversationMessages(
    activeId ?? 0,
    { query: { enabled: activeId !== null } }
  );

  const createConv = useCreateConversation({
    mutation: {
      onSuccess: (conv) => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setActiveId(conv.id);
        setLocalSuggestions([]);
      },
    },
  });

  const deleteConv = useDeleteConversation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setActiveId(null);
        setLocalSuggestions([]);
      },
    },
  });

  const sendMsg = useSendConversationMessage({
    mutation: {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({
          queryKey: getGetConversationMessagesQueryKey(variables.id),
        });
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setLocalSuggestions(data.suggestions ?? []);
      },
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgList, sendMsg.isPending]);

  const handleNewConversation = useCallback(async () => {
    const title = `Session ${new Date().toLocaleString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    await createConv.mutateAsync({ data: { title } });
  }, [createConv]);

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg) return;
      setInput("");
      setLocalSuggestions([]);

      let convId = activeId;
      if (!convId) {
        const title = msg.slice(0, 60);
        const conv = await createConv.mutateAsync({ data: { title } });
        convId = conv.id;
      }

      await sendMsg.mutateAsync({ id: convId, data: { message: msg } });
    },
    [input, activeId, createConv, sendMsg]
  );

  const isBusy = sendMsg.isPending || createConv.isPending;

  return (
    <Layout>
      <div className="flex h-[100dvh] md:h-screen overflow-hidden w-full max-w-6xl mx-auto border-x border-border bg-card/50">

        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? "w-64 min-w-[16rem]" : "w-0 min-w-0"
          } transition-all duration-200 overflow-hidden border-r border-border flex flex-col bg-muted/30 shrink-0`}
        >
          <div className="p-3 border-b border-border shrink-0">
            <Button
              size="sm"
              className="w-full gap-2"
              onClick={handleNewConversation}
              disabled={createConv.isPending}
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loadingConvs && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loadingConvs && convList.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6 px-2">
                  No conversations yet.
                </p>
              )}
              {convList.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                    activeId === conv.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground"
                  }`}
                  onClick={() => {
                    setActiveId(conv.id);
                    setLocalSuggestions([]);
                  }}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{conv.title}</p>
                    {conv.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConv.mutate({ id: conv.id });
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive"
                  >
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
          <div className="p-4 border-b border-border bg-card shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground shrink-0"
              title={sidebarOpen ? "Hide history" : "Show history"}
            >
              {sidebarOpen ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <Bot className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-bold">AI Agriculture Assistant</h1>
              <p className="text-xs text-muted-foreground">
                Crop guidance, disease detection, and smart farming recommendations
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {/* Welcome */}
            {activeId === null && (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">How can I help you today?</h2>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Ask about crop care, diseases, irrigation, soil health, or seasonal
                    recommendations.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                  {[
                    "My mango leaves are yellowing — what's wrong?",
                    "Best irrigation schedule for pomegranate in summer?",
                    "How to identify dragon fruit disease early?",
                    "Recommend crop rotation for my farm in Maharashtra",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      disabled={isBusy}
                      className="text-xs px-4 py-3 rounded-xl border border-border bg-muted/50 hover:bg-muted transition-colors text-left disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {activeId !== null && loadingMsgs && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Messages */}
            {msgList.map((msg, i) => {
              const isUser = msg.role === "user";
              const isLastAI = !isUser && i === msgList.length - 1;
              return (
                <div key={msg.id}>
                  <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary border border-border"
                      }`}
                    >
                      {isUser ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-card border border-border text-foreground rounded-tl-sm shadow-sm"
                      }`}
                    >
                      {isUser ? (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      ) : (
                        <MessageContent content={msg.content} />
                      )}
                    </div>
                  </div>
                  {isLastAI && localSuggestions.length > 0 && (
                    <SuggestionChips
                      suggestions={localSuggestions}
                      onSelect={handleSend}
                      disabled={isBusy}
                    />
                  )}
                </div>
              );
            })}

            {/* Thinking */}
            {isBusy && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-secondary border border-border">
                  <Bot className="w-4 h-4" />
                </div>
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="relative flex items-center"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about farming, crops, or diseases..."
                className="pr-12 py-6 rounded-xl border-border bg-background shadow-sm"
                disabled={isBusy}
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-2 h-10 w-10 rounded-lg"
                disabled={!input.trim() || isBusy}
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
            <p className="text-xs text-center text-muted-foreground mt-2">
              AI can make mistakes. Verify important agricultural decisions with a local expert.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
