"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type DispatchRow = { id: string; patient: string; patientId: string; visit: string; medicine: string; amount: string; status: string; method: string };
export default function PharmacyPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [stats, setStats] = useState({ pending: 0, dispatched: 0, payments: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [role, setRole] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DispatchRow | null>(null);
  const [dispatchMethod, setDispatchMethod] = useState("c_pickup");
  const [courier, setCourier] = useState("");
  const [awb, setAwb] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!supabase) return;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.session.user.id).single();
      if (mounted) setRole(profile?.role ?? null);
      const { data } = await supabase.from("medication_dispatches").select("id,status,dispatch_method,visits!inner(visit_number,patients!inner(name,patient_number),payments(amount)),prescriptions!inner(medication_text,medicine_value)").order("updated_at", { ascending: false }).limit(25);
      if (!mounted || !data) return;
      const mapped = data.map((item: any) => ({ id: item.id, patient: item.visits.patients.name, patientId: item.visits.patients.patient_number, visit: `Visit #${item.visits.visit_number}`, medicine: item.prescriptions.medication_text || "Prescription", amount: `₹${item.prescriptions.medicine_value}`, status: item.status.charAt(0).toUpperCase() + item.status.slice(1), method: item.dispatch_method || "—" }));
      setRows(mapped);
      const payments = data.reduce((total: number, item: any) => total + (item.visits.payments || []).reduce((sum: number, payment: { amount: number }) => sum + Number(payment.amount || 0), 0), 0);
      setStats({ pending: mapped.filter((item) => item.status !== "Dispatched").length, dispatched: mapped.filter((item) => item.status === "Dispatched").length, payments });
    }
    load();
    if (supabase) {
      const channel = supabase.channel("pharmacy-dispatch-live").on("postgres_changes", { event: "UPDATE", schema: "public", table: "medication_dispatches" }, (payload) => {
        const next = payload.new as { id: string; status: string; dispatch_method: string | null };
        setRows((current) => current.map((item) => item.id === next.id ? { ...item, status: next.status, method: next.dispatch_method || item.method } : item));
      }).subscribe();
      return () => { mounted = false; supabase?.removeChannel(channel); };
    }
    return () => { mounted = false; };
  }, [router, refreshKey]);
  async function signOut() { await supabase?.auth.signOut(); router.push("/login"); }
  function openProcess(row: DispatchRow) {
    setSelected(row); setDispatchMethod(row.method === "Courier" ? "courier" : "c_pickup"); setCourier(""); setAwb(""); setAmountReceived("");
  }
  async function process() {
    if (!selected) return;
    setSaving(true);
    const method = dispatchMethod;
    if (!supabase) { setNotice("Supabase is not configured. Dispatch was not changed."); setSaving(false); return; }
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { setNotice("Your session expired. Sign in again before dispatching."); setSaving(false); return; }
    const { error: dispatchError } = await supabase.rpc("complete_dispatch", { p_dispatch_id: selected.id, p_method: method, p_courier_name: method === "courier" ? courier : null, p_awb_number: method === "courier" ? awb || null : null, p_amount_received: Number(amountReceived || 0) });
    if (dispatchError) { setNotice(dispatchError.message.includes("function") ? "Run the production database migration before dispatching." : "Dispatch could not be updated. Please try again."); setSaving(false); return; }
    setRows((current) => current.map((item) => item.id === selected.id ? { ...item, status: "Dispatched", method: method === "courier" ? "Courier" : method === "pickup_service" ? "Pickup Service" : "C-Pickup" } : item));
    setStats((current) => ({ ...current, pending: Math.max(0, current.pending - 1), dispatched: current.dispatched + 1, payments: current.payments + Number(amountReceived || 0) }));
    setSelected(null); setSaving(false); setNotice(`${selected.patient}'s dispatch marked as dispatched.`); window.setTimeout(() => setNotice(""), 2500);
  }
  const filteredRows = useMemo(() => { const value = query.trim().toLowerCase(); return value ? rows.filter((row) => `${row.patient} ${row.patientId} ${row.medicine}`.toLowerCase().includes(value)) : rows; }, [rows, query]);
  return <main className="pharmacy-shell"><header className="pharmacy-topbar"><div className="mobile-brand"><span className="mobile-mark">S</span><strong>Sugam Homeo</strong></div><div className="pharmacy-top-title"><span className="eyebrow">Operations</span><h1>Pharmacy desk</h1></div><div className="top-actions"><span className="role-chip">{role === "pharmacist" ? "Pharmacist" : "Preview mode"}</span><button className="icon-button" onClick={() => document.documentElement.classList.toggle("dark")} aria-label="Toggle dark mode">☾</button><button className="signout-button" onClick={signOut}>Sign out</button></div></header><div className="pharmacy-content"><div className="pharmacy-intro"><p className="subheading">Prepare, collect, and dispatch medication for today&apos;s visits.</p><label className="search-box" style={{ margin: 0, maxWidth: 280 }}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or medicine..." aria-label="Search pharmacy queue" /></label><button className="secondary-button" onClick={() => setRefreshKey((current) => current + 1)}>↻ Refresh queue</button></div><div className="pharmacy-stats"><Stat label="Pending dispatches" value={String(stats.pending)} tone="blue" /><Stat label="Dispatched in queue" value={String(stats.dispatched)} tone="green" /><Stat label="Payments recorded" value={`₹${stats.payments.toLocaleString("en-IN")}`} tone="gold" /></div><section className="panel dispatch-panel"><div className="panel-heading"><div><h2>Dispatch queue & history</h2><p>Prescriptions waiting for pharmacy action and completed dispatches</p></div><span className="queue-badge">{stats.pending} active</span></div><div className="dispatch-table"><div className="dispatch-head"><span>Patient & visit</span><span>Medication</span><span>Value</span><span>Status</span><span /></div>{filteredRows.map((row) => <div className="dispatch-row" key={row.id}><div><strong>{row.patient}</strong><span>{row.patientId} · {row.visit}</span></div><span className="medicine-cell">{row.medicine}</span><strong>{row.amount}</strong><span className={`pill ${row.status.toLowerCase()}`}>{row.status}</span>{row.status !== "Dispatched" ? <button className="process-button" onClick={() => openProcess(row)}>Process →</button> : <span className="complete-mark">✓</span>}</div>)}{!filteredRows.length && <div className="empty-state">{query ? "No dispatches match your search." : "No medication dispatches are waiting."}</div>}</div></section><button className="back-link" onClick={() => router.push("/")}>← Back to doctor workspace</button></div>{selected && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button><span className="eyebrow">Dispatch</span><h2>{selected.patient}</h2><p>{selected.patientId} · {selected.medicine} · {selected.amount}</p><form className="patient-form" onSubmit={(event) => { event.preventDefault(); process(); }}><label>Dispatch method<select value={dispatchMethod} onChange={(event) => setDispatchMethod(event.target.value)}><option value="courier">Courier</option><option value="c_pickup">C-Pickup</option><option value="pickup_service">Pickup Service</option></select></label>{dispatchMethod === "courier" && <><label>Courier name<input value={courier} onChange={(event) => setCourier(event.target.value)} required /></label><label>AWB number <span className="optional">Optional</span><input value={awb} onChange={(event) => setAwb(event.target.value)} /></label></>}<label>Amount received<input type="number" min="0" step="0.01" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} placeholder="₹ 0.00" required /></label><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Mark as dispatched"}</button></form></section></div>}{notice && <div className="toast" role="status">{notice}</div>}</main>;
}
function Stat({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="pharmacy-stat"><span className={`stat-icon ${tone}`}>✣</span><div><p>{label}</p><strong>{value}</strong></div></div>; }
