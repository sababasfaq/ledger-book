import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { defaultPeriod } from "../components/FinanceUI";
import { useAuth } from "./AuthContext";

const AssistantContext = createContext(null);

export function AssistantProvider({ children }) {
  const { user } = useAuth();
  return (
    <AssistantSession key={user?.id || "signed-out"} enabled={!!user}>
      {children}
    </AssistantSession>
  );
}

function AssistantSession({ children, enabled }) {
  const [status, setStatus] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [ledgerType, setLedgerType] = useState("all");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const controller = useRef(null);
  const preparation = useRef(null);

  const prepare = useCallback(() => {
    if (!enabled) return Promise.resolve();
    if (!preparation.current) {
      preparation.current = Promise.allSettled([api.getAiStatus(), api.getPeriods()])
        .then(([health, list]) => {
          if (health.status === "fulfilled") setStatus(health.value);
          if (list.status === "fulfilled") {
            setPeriods(list.value);
            setPeriodId((current) => current || defaultPeriod(list.value));
          }
          const failed = [health, list].find((result) => result.status === "rejected");
          setError(failed ? failed.reason.message : "");
          if (failed) preparation.current = null;
        });
    }
    return preparation.current;
  }, [enabled]);

  const refresh = async () => {
    try {
      setStatus(await api.getAiStatus());
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  };

  useEffect(() => () => controller.current?.abort(), []);

  const ask = async (message, quickAction = null, options = {}) => {
    const text = message.trim();
    if (!enabled || !text || controller.current) return;
    const request = new AbortController();
    controller.current = request;
    const replyId = crypto.randomUUID();
    const lastDocument = [...messages].reverse().find((item) => item.result?.document)?.result.document;
    const history = messages.filter((item) => !item.error && !item.cancelled)
      .slice(-6).map((item) => ({
        role: item.role,
        content: (item.text + (item.result?.metrics?.length
          ? "\nReport context: " + JSON.stringify({ scope: item.result.scope, metrics: item.result.metrics })
          : "")).slice(0, 1000),
      }));
    setBusy(true);
    setStage("Understanding your request…");
    setError("");
    setDraft("");
    setMessages((current) => [...current.slice(-78), { role: "user", text }, { role: "assistant", text: "", id: replyId, streaming: true }]);
    try {
      const result = await api.askAssistant({
        message: text,
        quickAction,
        ...(periodId ? { periodId: Number(periodId) } : {}),
        ledgerType,
        history,
        ...(options.document ? { document: options.document } : {}),
        ...(!options.document && lastDocument ? { documentContext: { ...lastDocument, previousDraft: lastDocument.content } } : {}),
      }, request.signal, (event) => {
        if (request.signal.aborted) return;
        if (event.type === "status") setStage(event.message);
        if (event.type === "token") setMessages((current) => current.map((item) => item.id === replyId ? { ...item, text: item.text + event.text } : item));
      });
      if (!request.signal.aborted) {
        setMessages((current) => current.map((item) => item.id === replyId ? { role: "assistant", id: replyId, text: result.answer, result } : item));
      }
    } catch (failure) {
      if (!request.signal.aborted) {
        setMessages((current) => current.map((item) => item.id === replyId ? { ...item, streaming: false, text: item.text ? item.text + "\n\n" + failure.message : failure.message, error: true } : item));
      }
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
        setStage("");
        if (!request.signal.aborted) refresh();
      }
    }
  };

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setStage("");
    setMessages((current) => current.map((item) => item.streaming ? { ...item, text: item.text ? item.text + "\n\nRequest stopped." : "Request stopped.", cancelled: true, streaming: false } : item));
  };

  const clear = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setStage("");
    setMessages([]);
    setDraft("");
    setError("");
  };
  const editDocument = (index, content) => setMessages((current) => current.map((item, i) => i === index && item.result?.document
    ? { ...item, text: content, result: { ...item.result, answer: content, document: { ...item.result.document, content } } } : item));

  return (
    <AssistantContext.Provider value={{ status, periods, periodId, setPeriodId, ledgerType, setLedgerType,
      messages, draft, setDraft, busy, stage, error, prepare, refresh, ask, cancel, clear, editDocument }}>
      {children}
    </AssistantContext.Provider>
  );
}

export const useAssistant = () => useContext(AssistantContext);
