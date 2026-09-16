"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Patient = { id: string; patient_number: string; name: string; phone: string };
type Appointment = { id: string; patient: string; patientId: string; date: string; time: string; status: string; reason: string };
export default function AppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [time, setTime] = useState("10:00");
  const [reason, setReason] = useState("Follow-up consultation");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      if (!supabase) return;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.session.user.id).maybeSingle();
      if (profile?.role !== "doctor") { router.replace("/pharmacy"); return; }
      const { data: patientData } = await supabase.from("patients").select("id,patient_number,name,phone").order("name");
      if (patientData) setPatients(patientData);
      const { data } = await supabase.from("appointments").select("id,appointment_date,appointment_time,status,reason,patients!inner(name,patient_number)").order("appointment_date", { ascending: true }).order("appointment_time", { ascending: true }).limit(50);
      if (data) setAppointments(data.map((item: any) => ({ id: item.id, patient: item.patients.name, patientId: item.patients.patient_number, date: new Date(`${item.appointment_date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), time: item.appointment_time.slice(0, 5), status: item.status, reason: item.reason || "Consultation" })));
    }
    load();
  }, [router]);

  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !patientId) return;
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { setNotice("Sign in to create an appointment."); return; }
    const { error } = await supabase.from("appointments").insert({ patient_id: patientId, appointment_date: date, appointment_time: time, reason, created_by: session.session.user.id });
    if (error) setNotice("Could not save the appointment. Check that the patient profile exists.");
    else { const selected = patients.find((item) => item.id === patientId); setAppointments((current) => [...current, { id: `local-${Date.now()}`, patient: selected?.name || "Patient", patientId: selected?.patient_number || "", date, time, status: "Scheduled", reason }]); setOpen(false); setNotice("Appointment created."); }
    window.setTimeout(() => setNotice(""), 2800);
  }

  return <main className="app-shell"><aside className="sidebar"><div className="brand-lockup"><div className="logo-wrap"><span className="mobile-mark">S</span></div><div><p className="brand-name">Sugam Homeo</p><p className="brand-caption">Practice companion</p></div></div><div className="practice-card"><span className="status-dot" /> Clinic is open</div><nav className="side-nav"><p className="nav-label">Workspace</p><button className="nav-item" onClick={() => router.push("/")}>⌂ Overview</button><button className="nav-item" onClick={() => router.push("/patients")}>♙ Patients</button><button className="nav-item active">▣ Appointments</button><button className="nav-item" onClick={() => router.push("/pharmacy")}>✣ Pharmacy</button></nav><div className="sidebar-footer"><div className="doctor-avatar">DR</div><div><strong>Dr. Sugam</strong><span>Doctor account</span></div></div></aside><section className="content-area"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>Appointments</strong></div><div className="top-actions"><button className="icon-button" aria-label="Toggle theme" onClick={() => document.documentElement.classList.toggle("dark")}>☾</button><div className="top-avatar">DS</div></div></header><div className="page-content"><div className="welcome-row"><div><p className="eyebrow">Clinic calendar</p><h1>Appointments</h1><p className="subheading">Keep the day moving, one visit at a time.</p></div><button className="primary-button" onClick={() => setOpen(true)}>＋ New appointment</button></div><section className="panel appointments-page-panel"><div className="panel-heading"><div><h2>Upcoming appointments</h2><p>Today and the next scheduled visits</p></div><span className="queue-badge">{appointments.length} total</span></div>{appointments.map((item) => <div className="appointment-page-row" key={item.id}><time>{item.time}</time><div className="patient-avatar small blue">{item.patient.split(" ").map((part) => part[0]).join("")}</div><div className="appointment-person"><strong>{item.patient}</strong><span>{item.patientId} · {item.reason}</span></div><span className={`pill ${item.status.toLowerCase()}`}>{item.status}</span><button className="process-button" onClick={() => router.push(`/visits/new?patient=${encodeURIComponent(item.patientId)}&appointment=${encodeURIComponent(item.id)}`)}>Open visit →</button></div>)}</section><button className="back-link" onClick={() => router.push("/")}>← Back to overview</button></div></section>{open && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">×</button><span className="eyebrow">Schedule</span><h2>New appointment</h2><p>Book a patient for a consultation.</p><form className="patient-form" onSubmit={createAppointment}><label>Patient<select value={patientId} onChange={(event) => setPatientId(event.target.value)} required><option value="">Select patient</option>{patients.map((patient) => <option value={patient.id} key={patient.id}>{patient.name} · {patient.patient_number}</option>)}</select></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="primary-button">Save appointment</button></form></section></div>}{notice && <div className="toast" role="status">{notice}</div>}</main>;
}
