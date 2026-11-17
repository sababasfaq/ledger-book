import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bot, Expand, MessageCircle, Minus } from "lucide-react";
import { useAssistant } from "../state/AssistantContext";
import AssistantChat from "./AssistantChat";

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { busy } = useAssistant();
  const launcher = useRef(null);
  const panel = useRef(null);
  const visible = open && pathname !== "/ai-assistant";
  const close = () => { setOpen(false); launcher.current?.focus(); };

  useEffect(() => {
    if (visible) panel.current?.querySelector("textarea")?.focus();
  }, [visible]);

  if (pathname === "/ai-assistant") return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6 print:hidden">
      {visible && (
        <div ref={panel} id="assistant-chat-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-chat-title"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}
          className="mb-3 flex h-[min(640px,calc(100dvh-112px))] w-[calc(100vw-2rem)] max-w-[410px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex shrink-0 items-center gap-3 bg-slate-900 px-4 py-3 text-white">
            <div className="rounded-xl bg-white/10 p-2"><Bot size={21} /></div>
            <div className="min-w-0 flex-1"><h2 id="assistant-chat-title" className="text-sm font-semibold">AI Chat</h2><p className="text-xs text-slate-300">Your everyday assistant</p></div>
            <Link to="/ai-assistant" aria-label="Open full AI assistant" title="Open full assistant" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/10"><Expand size={17} /></Link>
            <button type="button" aria-label="Minimize AI chat" title="Minimize" onClick={close} className="rounded-lg p-2 hover:bg-white/10"><Minus size={19} /></button>
          </header>
          <AssistantChat compact />
        </div>
      )}
      <div className="flex justify-end">
        <button ref={launcher} type="button" aria-label={visible ? "Close AI chat" : "Open AI chat"}
          aria-expanded={visible} aria-controls="assistant-chat-panel" onClick={() => visible ? close() : setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200">
          {busy ? <span className="h-3 w-3 animate-pulse rounded-full bg-white" /> : <MessageCircle size={21} />}
          {visible ? "Close chat" : "AI Chat"}
        </button>
      </div>
    </div>
  );
}
