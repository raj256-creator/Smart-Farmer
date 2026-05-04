import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { FarmLayout } from "@/components/farm-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetFarm } from "@workspace/api-client-react";
import {
  Bot, User, Send, Loader2, Plus, Trash2, MessageSquare,
  ChevronLeft, ChevronRight, Mic, MicOff, Volume2, VolumeX,
  Paperclip, X, FlaskConical, BarChart3, Leaf, Languages, ImageIcon,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatMode = "general" | "agro-technical" | "analyst";
type Conversation = { id: number; title: string; farmId: number | null; createdAt: string; lastMessage?: string | null };
type Message = { id: number; conversationId: number; role: string; content: string; createdAt: string };

// ── Language list ─────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "auto",  label: "Auto-detect",        speech: "en-IN" },
  { code: "en-IN", label: "English",             speech: "en-IN" },
  { code: "hi-IN", label: "हिंदी (Hindi)",        speech: "hi-IN" },
  { code: "mr-IN", label: "मराठी (Marathi)",      speech: "mr-IN" },
  { code: "te-IN", label: "తెలుగు (Telugu)",      speech: "te-IN" },
  { code: "ta-IN", label: "தமிழ் (Tamil)",        speech: "ta-IN" },
  { code: "kn-IN", label: "ಕನ್ನಡ (Kannada)",      speech: "kn-IN" },
  { code: "ml-IN", label: "മലയാളം (Malayalam)",   speech: "ml-IN" },
  { code: "bn-IN", label: "বাংলা (Bengali)",       speech: "bn-IN" },
  { code: "gu-IN", label: "ગુજરાતી (Gujarati)",   speech: "gu-IN" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ (Punjabi)",     speech: "pa-IN" },
  { code: "or-IN", label: "ଓଡ଼ିଆ (Odia)",          speech: "or-IN" },
  { code: "ur-IN", label: "اردو (Urdu)",           speech: "ur-IN" },
];

// ── Mode config ───────────────────────────────────────────────────────────────

const MODES: { id: ChatMode; label: string; icon: React.ReactNode; badge: string; description: string }[] = [
  {
    id: "general",
    label: "General",
    icon: <Leaf className="w-3.5 h-3.5" />,
    badge: "bg-green-100 text-green-800 border-green-200",
    description: "Practical farming guidance",
  },
  {
    id: "agro-technical",
    label: "Agro-Technical",
    icon: <FlaskConical className="w-3.5 h-3.5" />,
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    description: "Scientific & technical analysis",
  },
  {
    id: "analyst",
    label: "Analyst",
    icon: <BarChart3 className="w-3.5 h-3.5" />,
    badge: "bg-purple-100 text-purple-800 border-purple-200",
    description: "Market & economic insights",
  },
];

// ── Web Speech API types ──────────────────────────────────────────────────────

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}
interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

// ── Mode-aware section headings ───────────────────────────────────────────────

const SECTION_SETS: Record<ChatMode, string[]> = {
  "general": ["Understanding the Problem", "Key Insights", "Solution", "Prevention Tips", "Extra Advice"],
  "agro-technical": ["Technical Diagnosis", "Scientific Analysis", "Treatment Protocol", "Preventive Management", "Field Monitoring Parameters"],
  "analyst": ["Market Overview", "Economic Analysis", "Yield & Revenue Projections", "Risk Assessment", "Strategic Recommendations"],
};

// ── MessageContent ────────────────────────────────────────────────────────────

function MessageContent({ content, mode }: { content: string; mode: ChatMode }) {
  const allSections = Object.values(SECTION_SETS).flat();
  const hasSections = allSections.some((s) => content.includes(s));

  if (!hasSections) return <p className="leading-relaxed whitespace-pre-wrap text-sm">{content}</p>;

  const modeSections = SECTION_SETS[mode];
  const usedSections = allSections.filter((s) => content.includes(s));
  const sections = modeSections.filter((s) => usedSections.includes(s)).length > 0
    ? modeSections.filter((s) => usedSections.includes(s))
    : usedSections;

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

// ── Main component ────────────────────────────────────────────────────────────

export default function FarmChat() {
  const [, params] = useRoute("/farms/:id/chat");
  const farmId = parseInt(params?.id ?? "0", 10);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });
  const queryClient = useQueryClient();

  // Chat state
  const [activeId,         setActiveId]         = useState<number | null>(null);
  const [input,            setInput]            = useState("");
  const [sidebarOpen,      setSidebarOpen]      = useState(true);
  const [localSuggestions, setLocalSuggestions] = useState<string[]>([]);
  const [isSending,        setIsSending]        = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Mode & language
  const [mode,         setMode]         = useState<ChatMode>("general");
  const [selectedLang, setSelectedLang] = useState<string>("auto");

  // Voice input
  const [isListening,  setIsListening]  = useState(false);
  const [voiceSupported] = useState(() =>
    typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // Voice output
  const [voiceOutput,  setVoiceOutput]  = useState(false);
  const [isSpeaking,   setIsSpeaking]   = useState(false);

  // Image in chat
  const [chatImagePreview, setChatImagePreview] = useState<string>("");
  const [chatImageData,    setChatImageData]    = useState<string>("");
  const chatImageInputRef = useRef<HTMLInputElement>(null);

  const convQueryKey = ["farm-conversations", farmId];
  const msgQueryKey  = ["conversation-messages", activeId];

  const cropList  = ((farm?.crops as string[]) ?? []).join(", ");
  const cropFocus = cropList.split(",")[0]?.trim() ?? null;

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: convList = [], isLoading: loadingConvs } = useQuery({
    queryKey: convQueryKey,
    queryFn: async (): Promise<Conversation[]> => {
      const r = await fetch(`${BASE}/api/conversations?farmId=${farmId}`);
      return r.json();
    },
    enabled: farmId > 0,
  });

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

  // ── Conversations ──────────────────────────────────────────────────────────

  const createConv = async (title: string): Promise<Conversation> => {
    const r = await fetch(`${BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, farmId }),
    });
    return r.json();
  };

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

  // ── Voice input ────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!voiceSupported) return;
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    const langEntry = LANGUAGES.find((l) => l.code === selectedLang);
    recognition.lang = langEntry?.speech ?? "en-IN";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [voiceSupported, selectedLang]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Voice output ───────────────────────────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!voiceOutput || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const stripped = text
      .replace(/SUGGESTIONS_JSON:[\s\S]*/g, "")
      .replace(/[*_#`]/g, "")
      .slice(0, 1000);
    const utterance = new SpeechSynthesisUtterance(stripped);
    const langEntry = LANGUAGES.find((l) => l.code === selectedLang);
    utterance.lang = langEntry?.speech ?? "en-IN";
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [voiceOutput, selectedLang]);

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  // ── Image attach ───────────────────────────────────────────────────────────

  const handleImageAttach = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setChatImagePreview(dataUrl);
      setChatImageData(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setChatImagePreview("");
    setChatImageData("");
    if (chatImageInputRef.current) chatImageInputRef.current.value = "";
  };

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isSending) return;
    setInput(""); setLocalSuggestions([]);
    setIsSending(true);

    const imageData = chatImageData;
    clearImage();

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
            farmContext: `Farm: ${farm.name}, Location: ${farm.location}${farm.acreage ? `, Area: ${farm.acreage} acres` : ""}${cropList ? `, Crops: ${cropList}` : ""}.`,
          } : {}),
          mode,
          language: selectedLang !== "auto" ? selectedLang : null,
          ...(imageData ? { imageData } : {}),
        }),
      });
      const data = await r.json() as { reply: string; suggestions?: string[] };
      setLocalSuggestions(data.suggestions ?? []);
      if (voiceOutput) speak(data.reply ?? "");
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", convId] });
      queryClient.invalidateQueries({ queryKey: convQueryKey });
    } finally {
      setIsSending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, activeId, isSending, farm, cropFocus, cropList, queryClient, BASE, mode, selectedLang, chatImageData, voiceOutput, speak]);

  const currentMode = MODES.find((m) => m.id === mode)!;

  const cropSuggestions = cropFocus
    ? [`Best irrigation for ${cropFocus}?`, `Signs of disease in ${cropFocus}?`, "How to improve soil pH?", "Fertilizer schedule this month?"]
    : ["How to improve soil health?", "Signs of nutrient deficiency?", "Best irrigation schedule?", "Crop rotation advice?"];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <FarmLayout farmId={farmId} farmName={farm?.name}>
      <div className="flex overflow-hidden w-full max-w-6xl mx-auto border-x border-border bg-card/50" style={{ height: "calc(100dvh - 105px)" }}>

        {/* ── Sidebar ── */}
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

        {/* ── Main panel ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* ── Header ── */}
          <div className="p-2.5 border-b border-border bg-card shrink-0 space-y-2">
            {/* Row 1: toggle + title + voice output */}
            <div className="flex items-center gap-2">
              <button onClick={() => setSidebarOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0">
                {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <Bot className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold leading-none">AI Farm Assistant</h2>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{cropList ? `Crops: ${cropList}` : "Ask anything about your farm"}</p>
              </div>

              {/* Language selector */}
              <Select value={selectedLang} onValueChange={setSelectedLang}>
                <SelectTrigger className="h-8 w-auto gap-1 text-xs px-2 border-border">
                  <Languages className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Voice output toggle */}
              <button
                onClick={() => { setVoiceOutput((v) => !v); if (isSpeaking) stopSpeaking(); }}
                title={voiceOutput ? "Voice output on — click to disable" : "Enable voice output"}
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${voiceOutput ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"}`}
              >
                {voiceOutput ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>

            {/* Row 2: Mode pills */}
            <div className="flex items-center gap-1.5 pl-9">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  title={m.description}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    mode === m.id
                      ? m.badge + " shadow-sm"
                      : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                  }`}
                >
                  {m.icon}{m.label}
                </button>
              ))}
              {mode !== "general" && (
                <span className="text-xs text-muted-foreground ml-1 hidden sm:block">— {currentMode.description}</span>
              )}
            </div>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {activeId === null && (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Farm-specific AI assistance</h2>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Conversations are scoped to <strong>{farm?.name ?? "this farm"}</strong>. Switch mode above for technical analysis or market insights.
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
                      {isUser
                        ? <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        : <MessageContent content={msg.content} mode={mode} />}
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
                  <span className="text-sm text-muted-foreground">
                    {mode === "agro-technical" ? "Analysing..." : mode === "analyst" ? "Computing..." : "Thinking..."}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Input area ── */}
          <div className="p-3 border-t border-border bg-card shrink-0 space-y-2">

            {/* Image preview */}
            {chatImagePreview && (
              <div className="flex items-center gap-2 px-1">
                <div className="relative inline-block">
                  <img src={chatImagePreview} alt="Field observation" className="h-16 w-16 object-cover rounded-lg border border-border" />
                  <button onClick={clearImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Field photo attached</p>
                  <p>AI will auto-analyse this image</p>
                </div>
              </div>
            )}

            {/* Speaking indicator */}
            {isSpeaking && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex gap-0.5 items-end h-4">
                  {[1,2,3,4].map((n) => (
                    <div key={n} className="w-1 bg-primary rounded-full animate-pulse" style={{ height: `${8 + n * 2}px`, animationDelay: `${n * 0.1}s` }} />
                  ))}
                </div>
                <span className="text-xs text-primary">Speaking…</span>
                <button onClick={stopSpeaking} className="text-xs text-muted-foreground underline ml-auto">Stop</button>
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative flex items-center gap-2">
              {/* Image attach */}
              <input
                ref={chatImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageAttach(f); }}
              />
              <button
                type="button"
                onClick={() => chatImageInputRef.current?.click()}
                title="Attach field photo for AI analysis"
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground shrink-0 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "agro-technical"
                    ? "Ask for technical diagnosis, dosage, protocol..."
                    : mode === "analyst"
                    ? "Ask about market prices, ROI, profitability..."
                    : selectedLang !== "auto" && selectedLang !== "en-IN"
                    ? `${LANGUAGES.find((l) => l.code === selectedLang)?.label?.split(" ")[0] ?? ""} में पूछें...`
                    : "Ask about crops, soil, irrigation, disease..."
                }
                className="flex-1 py-5 rounded-xl border-border bg-background shadow-sm text-sm"
                disabled={isSending || isListening}
              />

              {/* Mic button */}
              {voiceSupported && (
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  disabled={isSending}
                  title={isListening ? "Stop recording" : "Speak your question"}
                  className={`p-2 rounded-lg shrink-0 transition-colors ${isListening ? "bg-red-100 text-red-600 animate-pulse" : "hover:bg-muted text-muted-foreground"}`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}

              <Button type="submit" size="icon" className="h-10 w-10 rounded-lg shrink-0" disabled={!input.trim() || isSending}>
                <Send className="w-4 h-4" />
              </Button>
            </form>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1">
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${currentMode.badge}`}>
                  {currentMode.icon}
                  {currentMode.label}
                </span>
                {selectedLang !== "auto" && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Languages className="w-3 h-3" />
                    {LANGUAGES.find((l) => l.code === selectedLang)?.label?.split(" ")[0]}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Conversations saved to this farm.</p>
            </div>
          </div>
        </div>
      </div>
    </FarmLayout>
  );
}
