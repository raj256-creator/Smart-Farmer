import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSendChatMessage } from "@workspace/api-client-react";
import { Bot, User, Send, Loader2 } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
};

export default function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "ai", content: "Hello! I am your AI Agronomist. How can I help you with your crops today?" }
  ]);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendMessage = useSendChatMessage();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setInput("");
    
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: userMsg }]);

    try {
      const response = await sendMessage.mutateAsync({ data: { message: userMsg } });
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "ai", content: response.reply }]);
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "ai", content: "I'm sorry, I encountered an error connecting to my knowledge base. Please try again." }]);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col h-[100dvh] md:h-screen w-full max-w-5xl mx-auto border-x border-border bg-card/50">
        <div className="p-4 border-b border-border bg-card shrink-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            AI Agronomist Chat
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Ask questions about diseases, weather patterns, or crop care.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary border border-border text-foreground"
              }`}>
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl p-4 ${
                msg.role === "user" 
                  ? "bg-primary text-primary-foreground rounded-tr-sm" 
                  : "bg-card border border-border text-foreground rounded-tl-sm shadow-sm"
              }`}>
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {sendMessage.isPending && (
            <div className="flex gap-4 flex-row">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-secondary border border-border text-foreground">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm p-4 shadow-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground text-sm">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 border-t border-border bg-card shrink-0">
          <form onSubmit={handleSend} className="relative flex items-center">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question..."
              className="pr-12 py-6 rounded-xl border-border bg-background shadow-sm"
              disabled={sendMessage.isPending}
            />
            <Button 
              type="submit" 
              size="icon" 
              className="absolute right-2 h-10 w-10 rounded-lg"
              disabled={!input.trim() || sendMessage.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="text-xs text-center text-muted-foreground mt-3">
            AI can make mistakes. Please verify important agricultural decisions.
          </div>
        </div>
      </div>
    </Layout>
  );
}
