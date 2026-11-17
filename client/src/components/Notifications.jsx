import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "../api";
import { Notice } from "./FinanceUI";

function useNotifications(includeSnoozed = false) {
  const [data, setData] = useState({ items: [], unreadCount: 0 });
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setData(await api.getNotifications(includeSnoozed)); setError(""); }
    catch (failure) { setError(failure.message); }
  }, [includeSnoozed]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    const events = ["finance-updated", "instructions-updated", "notifications-updated"];
    events.forEach((event) => window.addEventListener(event, load));
    return () => { clearInterval(timer); events.forEach((event) => window.removeEventListener(event, load)); };
  }, [load]);
  const update = async (id, body) => {
    try { await api.updateNotification(id, body); window.dispatchEvent(new Event("notifications-updated")); }
    catch (failure) { setError(failure.message); }
  };
  return { ...data, error, load, update };
}

export function NotificationBell() {
  const { items, unreadCount, error, load } = useNotifications();
  const [open, setOpen] = useState(false);
  const container = useRef(null), button = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!container.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={container} className="relative">
    <button ref={button} aria-label="Notifications" aria-expanded={open} aria-controls="notifications-panel" className="relative rounded-full p-2 hover:bg-slate-100"
      onClick={() => { setOpen(!open); if (!open) load(); }}>
      <Bell size={22} className="text-slate-600" />
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section id="notifications-panel" aria-label="Notifications panel" className="fixed left-4 right-4 top-32 z-50 overflow-hidden rounded-xl border bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
      <header className="flex items-center justify-between border-b bg-slate-50 p-3 text-sm font-semibold"><span>Reminders · {unreadCount} unread</span><Link to="/notifications" className="text-blue-700 underline" onClick={() => setOpen(false)}>View all</Link></header>
      <div className="max-h-80 overflow-auto"><Notice error message={error} />
        {items.slice(0, 6).map((item) => <Link key={item.id} to={item.href} onClick={() => setOpen(false)} className={`block border-b p-3 text-sm hover:bg-slate-50 ${item.read ? "" : "bg-indigo-50/40"}`}><strong>{item.title}</strong><p className="mt-1 text-xs text-slate-600">{item.message}</p></Link>)}
        {!items.length && !error && <p className="p-5 text-sm text-slate-500">No current reminders.</p>}
      </div>
    </section>}
  </div>;
}

export function NotificationsPage() {
  const [includeSnoozed, setIncludeSnoozed] = useState(false);
  const [kind, setKind] = useState("all");
  const { items, unreadCount, error, load, update } = useNotifications(includeSnoozed);
  return <article className="space-y-5">
    <header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Reminders</h1><p className="mt-1 text-sm text-slate-500">{unreadCount} unread. Resolved items disappear automatically. Missing-receipt reminders start after three days.</p></div><button className="finance-button-secondary" onClick={load}>Refresh reminders</button></header>
    <Notice error message={error} />
    <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-white p-4">
      <label className="flex items-center gap-2 text-sm">Show <select className="finance-input" value={kind} onChange={(event) => setKind(event.target.value)}>{[["all", "All reminders"], ["approval", "User approvals"], ["instruction", "Instructions"], ["receipt", "Missing receipts"], ["budget", "Budget alerts"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeSnoozed} onChange={(event) => setIncludeSnoozed(event.target.checked)} />Include snoozed</label>
    </div>
    <div className="space-y-3">{items.filter((item) => kind === "all" || item.kind === kind).map((item) => <section key={item.id} aria-label={item.title + ": " + item.message} className={`space-y-3 rounded-xl border p-4 ${item.read ? "bg-white" : "border-indigo-200 bg-indigo-50/50"}`}>
      <div><h2 className="font-semibold">{item.title} {item.severity === "urgent" && <span className="text-xs text-red-700">· Needs attention</span>}</h2><p className="mt-1 text-sm text-slate-600">{item.message}</p>{item.snoozedUntil && item.snoozedUntil > new Date().toISOString() && <p className="mt-1 text-xs text-amber-800">Snoozed until {new Date(item.snoozedUntil).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}</p>}</div>
      <div className="flex flex-wrap gap-2">
        <Link className="finance-button-secondary" to={item.href}>Open {item.kind === "receipt" ? "entry" : item.kind === "budget" ? "budgets" : item.kind === "instruction" ? "instructions" : "approvals"}</Link>
        {!item.read && <button className="finance-button-secondary" onClick={() => update(item.id, { read: true })}>Mark as read</button>}
        <button className="finance-button-secondary" onClick={() => update(item.id, { snoozeHours: item.snoozedUntil && item.snoozedUntil > new Date().toISOString() ? 0 : 24 })}>{item.snoozedUntil && item.snoozedUntil > new Date().toISOString() ? "Unsnooze" : "Snooze 24 hours"}</button>
      </div>
    </section>)}{!items.some((item) => kind === "all" || item.kind === kind) && <p className="rounded-xl border bg-white p-6 text-slate-500">No reminders in this view.</p>}</div>
  </article>;
}
