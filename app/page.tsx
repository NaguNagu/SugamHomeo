"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabase";

type Patient = {
  name: string;
  id: string;
  appointmentId?: string;
  age: number;
  gender: string;
  phone: string;
  time: string;
  status: string;
  tone: string;
};

const patients: Patient[] = [];

const navItems = ["Overview", "Patients", "Appointments", "Pharmacy", "Payments"];
type DashboardStats = { appointments: number; waiting: number; completed: number; pharmacy: number; pendingAmount: number };
type ActivityItem = { title: string; detail: string; time: string; icon: string; tone: string };

export default function Home() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("Overview");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [displayName, setDisplayName] = useState("Doctor");
  const [livePatients, setLivePatients] = useState<Patient[] | null>(null);
  const [liveAppointments, setLiveAppointments] = useState<Patient[] | null>(null);
  const [stats, setStats] = useState<DashboardStats>({ appointments: 0, waiting: 0, completed: 0, pharmacy: 0, pendingAmount: 0 });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientGender, setNewPatientGender] = useState("");
  const [savingPatient, setSavingPatient] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    let mounted = true;
    async function loadPatients() {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role,full_name").eq("id", sessionData.session.user.id).maybeSingle();
      if (profile?.role === "pharmacist") { router.replace("/pharmacy"); return; }
      if (profile?.full_name?.trim()) setDisplayName(profile.full_name.trim());
      const { data } = await supabase
        .from("patients")
        .select("patient_number,name,phone,dob,gender")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (!mounted || !data) return;
      setLivePatients(data.map((patient, index) => ({
        name: patient.name,
        id: patient.patient_number,
        age: patient.dob ? Math.max(0, new Date().getFullYear() - new Date(patient.dob).getFullYear()) : 0,
        gender: patient.gender || "Not specified",
        phone: patient.phone,
        time: index === 0 ? "Latest record" : "On file",
        status: "Active",
        tone: ["blue", "maroon", "green", "gold"][index % 4],
      })));
      const today = new Date().toLocaleDateString("en-CA");
      const [appointmentResult, completedResult, dispatchResult, billingResult, activityResult] = await Promise.all([
        supabase.from("appointments").select("id,appointment_date,appointment_time,status,patients!inner(name,patient_number,phone,dob,gender)").eq("appointment_date", today).order("appointment_time", { ascending: true }),
        supabase.from("visits").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("medication_dispatches").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
        supabase.from("visits").select("prescriptions(medicine_value),payments(amount)"),
        supabase.from("audit_logs").select("action,entity_type,created_at").order("created_at", { ascending: false }).limit(4)
      ]);
      if (mounted) {
        const appointmentRows = (appointmentResult.data || []) as any[];
        setLiveAppointments(appointmentRows.map((item, index) => {
          const patient = item.patients;
          return { name: patient.name, id: patient.patient_number, appointmentId: item.id, age: patient.dob ? Math.max(0, new Date().getFullYear() - new Date(patient.dob).getFullYear()) : 0, gender: patient.gender || "Not specified", phone: patient.phone, time: item.appointment_time.slice(0, 5), status: item.status.charAt(0).toUpperCase() + item.status.slice(1), tone: ["blue", "maroon", "green", "gold"][index % 4] };
        }));
        const pendingAmount = ((billingResult.data || []) as any[]).reduce((total, visit) => {
          const prescription = Array.isArray(visit.prescriptions) ? visit.prescriptions[0] : visit.prescriptions;
          const paid = (visit.payments || []).reduce((sum: number, payment: { amount: number }) => sum + Number(payment.amount || 0), 0);
          return total + Math.max(0, Number(prescription?.medicine_value || 0) - paid);
        }, 0);
        setStats({ appointments: appointmentRows.length, waiting: appointmentRows.filter((item) => ["waiting", "consulting"].includes(item.status)).length, completed: completedResult.count || 0, pharmacy: dispatchResult.count || 0, pendingAmount });
        setActivity(((activityResult.data || []) as { action: string; entity_type: string; created_at: string }[]).map((item, index) => ({ title: `${item.entity_type.replaceAll("_", " ")} ${item.action}`, detail: "Recorded in the clinic audit trail", time: new Date(item.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), icon: item.action === "insert" ? "+" : item.action === "update" ? "↻" : "•", tone: ["green", "blue", "maroon", "gold"][index % 4] })));
      }
    }
    loadPatients();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("newPatient") === "1") {
      setShowNewPatient(true);
    }
  }, []);

  const directoryPatients = livePatients ?? patients;
  const dashboardAppointments = liveAppointments ?? patients;

  const filteredPatients = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return directoryPatients;
    return directoryPatients.filter((patient) => `${patient.name} ${patient.id} ${patient.phone}`.toLowerCase().includes(value));
  }, [directoryPatients, query]);

  const showNotice = (message: string) => {
    if (message.startsWith("Opening ")) {
      const patientName = message.replace("Opening ", "").replace("'s patient profile.", "");
      const target = directoryPatients.find((patient) => patient.name === patientName);
      if (target) { router.push(`/patients/${target.id}`); return; }
    }
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  async function signOut() { await supabase?.auth.signOut(); router.replace("/login"); }

  async function createPatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSavingPatient(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { setNotice("Sign in to create a patient record."); setSavingPatient(false); return; }
    const { data: createdPatient, error } = await supabase.from("patients").insert({ name: newPatientName, phone: newPatientPhone, gender: newPatientGender || null, created_by: sessionData.session.user.id }).select("patient_number").single();
    const patientNumber = createdPatient?.patient_number || "new record";
    if (error) setNotice("Could not create the patient record yet.");
    else { setShowNewPatient(false); setLivePatients((current) => [{ name: newPatientName, id: patientNumber, age: 0, gender: newPatientGender || "Not specified", phone: newPatientPhone, time: "Latest record", status: "Active", tone: "blue" }, ...(current || [])]); setNotice(`${newPatientName} added as ${patientNumber}.`); setNewPatientName(""); setNewPatientPhone(""); setNewPatientGender(""); }
    setSavingPatient(false); window.setTimeout(() => setNotice(""), 3000);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="logo-wrap"><Image src="/sugam-logo.png" alt="Sugam Homeo" width={104} height={36} priority /></div>
          <div><p className="brand-name">Sugam Homeo</p><p className="brand-caption">Practice companion</p></div>
        </div>
        <div className="practice-card"><span className="status-dot" /> Clinic is open <span className="practice-hours">08:00 — 20:00</span></div>
        <nav className="side-nav" aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item, index) => (
            <button className={`nav-item ${activeNav === item ? "active" : ""}`} key={item} onClick={() => item === "Pharmacy" ? router.push("/pharmacy") : item === "Appointments" ? router.push("/appointments") : item === "Patients" ? router.push("/patients") : item === "Payments" ? router.push("/payments") : setActiveNav(item)}>
              <span className="nav-icon">{["⌂", "♙", "▣", "✣", "₹"][index]}</span>{item}
            </button>
          ))}
          <p className="nav-label nav-label-lower">Manage</p>
          <button className="nav-item" onClick={() => router.push("/reports")}><span className="nav-icon">◫</span>Reports</button>
          <button className="nav-item" onClick={() => router.push("/settings")}><span className="nav-icon">⚙</span>Settings</button>
        </nav>
        <div className="sidebar-footer"><div className="doctor-avatar">{displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div><strong>{displayName}</strong><span>Doctor account</span></div><button className="more-button" onClick={signOut} aria-label="Sign out">↗</button></div>
      </aside>

      <section className="content-area">
        <header className="topbar"><div className="mobile-brand"><span className="mobile-mark">S</span><strong>Sugam Homeo</strong></div><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Toggle dark mode" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? "☼" : "☾"}</button><button className="notification-button" aria-label="Notifications">♧<i /></button><div className="top-avatar">{displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div></div></header>
        <div className="page-content">
          <div className="welcome-row"><div><p className="eyebrow">Wednesday, 16 September 2026</p><h1>Good morning, {displayName} <span>✦</span></h1><p className="subheading">Here&apos;s what&apos;s happening at your clinic today.</p></div><button className="primary-button" onClick={() => setShowNewPatient(true)}><span>＋</span> New patient</button></div>

          <div className="stats-grid">
            <Stat label="Today&apos;s appointments" value={String(stats.appointments || 0)} detail="Scheduled for today" icon="▣" tone="blue" />
            <Stat label="Waiting now" value={String(stats.waiting || 0)} detail="Waiting or consulting" icon="◷" tone="maroon" />
            <Stat label="Consultations completed" value={String(stats.completed || 0)} detail="All recorded visits" icon="✓" tone="green" />
            <Stat label="Pending pharmacy" value={String(stats.pharmacy || 0)} detail={`Payments due ₹${stats.pendingAmount.toLocaleString("en-IN")}`} icon="✣" tone="gold" />
          </div>

          <div className="workspace-grid">
            <section className="panel appointments-panel"><div className="panel-heading"><div><h2>Today&apos;s appointments</h2><p>{dashboardAppointments.length ? "Live clinic schedule" : "No appointments scheduled"}</p></div><button className="text-button" onClick={() => router.push("/appointments")}>View calendar <span>→</span></button></div><div className="appointment-list">{dashboardAppointments.map((patient) => <Appointment patient={patient} key={`${patient.id}-${patient.time}`} onAction={() => router.push(`/visits/new?patient=${encodeURIComponent(patient.id)}${patient.appointmentId ? `&appointment=${encodeURIComponent(patient.appointmentId)}` : ""}`)} />)}{dashboardAppointments.length === 0 && <div className="empty-state">No appointments for today.</div>}</div><button className="panel-footer-button" onClick={() => router.push("/appointments")}>View all appointments <span>→</span></button></section>
            <section className="panel history-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Your clinic timeline</p></div><button className="quiet-icon" aria-label="More activity options">•••</button></div><div className="timeline">{activity.map((item) => <Activity key={`${item.time}-${item.title}`} time={item.time} title={item.title} detail={item.detail} icon={item.icon} tone={item.tone} />)}{!activity.length && <div className="empty-state">Your clinic activity will appear here as visits, payments, and dispatches are recorded.</div>}</div><button className="panel-footer-button" onClick={() => router.push("/reports")}>Open reports <span>→</span></button></section>
          </div>

          <section className="panel patients-panel"><div className="panel-heading patients-heading"><div><h2>Patient directory</h2><p>Find a patient by name, ID, or phone number.</p></div><button className="secondary-button" onClick={() => setShowNewPatient(true)}>＋ Add patient</button></div><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patients..." aria-label="Search patients" /></label><div className="patient-table"><div className="table-row table-head"><span>Patient</span><span>Contact</span><span>Last appointment</span><span>Status</span><span /></div>{filteredPatients.map((patient) => <div className="table-row" key={patient.id}><div className="patient-cell"><div className={`patient-avatar ${patient.tone}`}>{patient.name.split(" ").map((part) => part[0]).join("")}</div><div><strong>{patient.name}</strong><span>{patient.id} · {patient.age} yrs · {patient.gender}</span></div></div><span className="contact-cell">{patient.phone}</span><span className="visit-cell">Today, {patient.time}</span><span><span className={`pill ${patient.status.toLowerCase()}`}>{patient.status}</span></span><button className="row-arrow" onClick={() => showNotice(`Opening ${patient.name}'s patient profile.`)} aria-label={`Open ${patient.name}`}>→</button></div>)}{filteredPatients.length === 0 && <div className="empty-state">No patients match “{query}”.</div>}</div></section>
          <footer className="clinic-footer"><span>176, Trichy Main Rd · Salem, Tamil Nadu 636006</span><span>9343711359 &nbsp;·&nbsp; 7204744400</span></footer>
        </div>
      </section>
      {notice && <div className="toast" role="status">{notice}</div>}
      {showNewPatient && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowNewPatient(false)}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-patient-title"><button className="modal-close" onClick={() => setShowNewPatient(false)} aria-label="Close">×</button><span className="eyebrow">Patient records</span><h2 id="new-patient-title">Add a new patient</h2><p>Start the patient&apos;s longitudinal record with their basic details.</p><form onSubmit={createPatient} className="patient-form"><label>Full name<input value={newPatientName} onChange={(event) => setNewPatientName(event.target.value)} required autoFocus /></label><label>Phone number<input value={newPatientPhone} onChange={(event) => setNewPatientPhone(event.target.value)} required inputMode="tel" /></label><label>Gender <span className="optional">Optional</span><select value={newPatientGender} onChange={(event) => setNewPatientGender(event.target.value)}><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option></select></label><button className="primary-button" disabled={savingPatient}>{savingPatient ? "Saving…" : "Save patient"}</button></form></section></div>}
    </main>
  );
}

function Stat({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: string; tone: string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div></article>;
}

function Appointment({ patient, onAction }: { patient: Patient; onAction: () => void }) {
  return <div className="appointment-row"><span className="appointment-time">{patient.time}</span><div className={`patient-avatar small ${patient.tone}`}>{patient.name.split(" ").map((part) => part[0]).join("")}</div><div className="appointment-person"><strong>{patient.name}</strong><span>{patient.id} · Follow-up</span></div><span className={`pill ${patient.status.toLowerCase()}`}>{patient.status}</span><button className="row-arrow" onClick={onAction} aria-label={`Open ${patient.name}`}>→</button></div>;
}

function Activity({ time, title, detail, icon, tone }: { time: string; title: string; detail: string; icon: string; tone: string }) {
  return <div className="activity-row"><span className={`activity-icon ${tone}`}>{icon}</span><div><strong>{title}</strong><span>{detail}</span></div><time>{time}</time></div>;
}
