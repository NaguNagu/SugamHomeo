"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Patient = { id: string; patient_number: string; name: string; phone: string; dob: string | null; gender: string | null; address: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null; notes: string | null };
type Visit = { id: string; visit_number: number; started_at: string; status: string; consultation: string; prescription: string; value: number; paid: number; dispatch: string };

export default function PatientProfilePage() {
  const params = useParams<{ patientNumber: string }>();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isDoctor, setIsDoctor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", dob: "", gender: "", address: "", emergency_contact_name: "", emergency_contact_phone: "", notes: "" });
  useEffect(() => {
    async function load() {
      if (!supabase) return;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.session.user.id).maybeSingle();
      const doctorAccess = profile?.role === "doctor";
      setIsDoctor(doctorAccess);
      const { data: patientData } = await supabase.from("patients").select("id,patient_number,name,phone,dob,gender,address,emergency_contact_name,emergency_contact_phone,notes").eq("patient_number", params.patientNumber).single();
      if (!patientData) { setLoading(false); return; }
      setPatient(patientData);
      setEditForm({ name: patientData.name || "", phone: patientData.phone || "", dob: patientData.dob || "", gender: patientData.gender || "", address: patientData.address || "", emergency_contact_name: patientData.emergency_contact_name || "", emergency_contact_phone: patientData.emergency_contact_phone || "", notes: patientData.notes || "" });
      const visitSelect = doctorAccess ? "id,visit_number,started_at,status,consultations(consultation_text),prescriptions(medication_text,medicine_value),payments(amount),medication_dispatches(status)" : "id,visit_number,started_at,status,prescriptions(medication_text,medicine_value),payments(amount),medication_dispatches(status)";
      const { data: visitData } = await supabase.from("visits").select(visitSelect).eq("patient_id", patientData.id).order("visit_number", { ascending: false });
      setVisits((visitData || []).map((visit: any) => ({ id: visit.id, visit_number: visit.visit_number, started_at: visit.started_at, status: visit.status, consultation: visit.consultations?.consultation_text || "No consultation note", prescription: visit.prescriptions?.medication_text || "No prescription", value: visit.prescriptions?.medicine_value || 0, paid: (visit.payments || []).reduce((sum: number, payment: { amount: number }) => sum + Number(payment.amount || 0), 0), dispatch: visit.medication_dispatches?.[0]?.status || "pending" })));
      setLoading(false);
    }
    load();
  }, [params.patientNumber, router]);
  async function updatePatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !patient) return;
    setSaving(true);
    const { data, error } = await supabase.from("patients").update({ ...editForm, dob: editForm.dob || null, gender: editForm.gender || null, address: editForm.address || null, emergency_contact_name: editForm.emergency_contact_name || null, emergency_contact_phone: editForm.emergency_contact_phone || null, notes: editForm.notes || null }).eq("id", patient.id).select("id,patient_number,name,phone,dob,gender,address,emergency_contact_name,emergency_contact_phone,notes").single();
    if (error || !data) { setSaving(false); return; }
    setPatient(data);
    setEditOpen(false);
    setSaving(false);
  }
  if (loading) return <main className="profile-shell"><div className="loading-state">Loading patient history…</div></main>;
  if (!patient) return <main className="profile-shell"><div className="loading-state"><h2>Patient not found</h2><button className="back-link" onClick={() => router.push("/")}>← Back to overview</button></div></main>;
  return <main className="profile-shell"><header className="topbar"><div className="mobile-brand"><span className="mobile-mark">S</span><strong>Sugam Homeo</strong></div><div className="breadcrumb"><span>Patients</span><b>/</b><strong>{patient.patient_number}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Toggle theme" onClick={() => document.documentElement.classList.toggle("dark")}>☾</button><div className="top-avatar">DS</div></div></header><div className="profile-content"><button className="back-link" onClick={() => router.push("/")}>← Back to patients</button><div className="profile-hero"><div className="patient-avatar blue large-avatar">{patient.name.split(" ").map((part) => part[0]).join("")}</div><div><p className="eyebrow">Patient profile</p><h1>{patient.name}</h1><p className="subheading">{patient.patient_number} · {patient.phone} · {patient.gender || "Gender not recorded"}</p></div>{isDoctor && <div className="profile-actions"><button className="secondary-button" onClick={() => setEditOpen(true)}>Edit patient</button><button className="primary-button profile-action" onClick={() => router.push(`/visits/new?patient=${patient.patient_number}`)}>＋ Start new visit</button></div>}</div><div className="profile-details"><div><span>Phone</span><strong>{patient.phone}</strong></div><div><span>Date of birth</span><strong>{patient.dob ? new Date(patient.dob).toLocaleDateString("en-IN") : "Not recorded"}</strong></div><div><span>Address</span><strong>{patient.address || "Not recorded"}</strong></div></div><section className="panel history-stack"><div className="panel-heading"><div><h2>{isDoctor ? "Clinical history" : "Visit history"}</h2><p>{isDoctor ? "Newest visits appear first. Records stay connected to the visit that created them." : "Prescription and pharmacy information for this patient."}</p></div><span className="queue-badge">{visits.length} visits</span></div>{visits.length === 0 && <div className="empty-state">No visits recorded yet.</div>}{visits.map((visit) => <article className="history-visit" key={visit.id}><div className="visit-marker"><strong>#{visit.visit_number}</strong><span>{new Date(visit.started_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span></div><div className="history-visit-body"><div className="history-grid">{isDoctor && <div><span className="history-label">Consultation</span><p>{visit.consultation}</p></div>}<div><span className="history-label">Prescription</span><p>{visit.prescription}</p><span className="history-value">Medicine ₹{visit.value} · Paid ₹{visit.paid} · Balance ₹{Math.max(0, visit.value - visit.paid)}</span></div></div><div className="history-footer"><span className={`pill ${visit.status}`}>{visit.status}</span><span className={`pill ${visit.dispatch}`}>Pharmacy · {visit.dispatch}</span></div></div></article>)}</section></div>{editOpen && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-patient-title"><button className="modal-close" onClick={() => setEditOpen(false)} aria-label="Close">×</button><span className="eyebrow">Patient records</span><h2 id="edit-patient-title">Edit patient</h2><form className="patient-form" onSubmit={updatePatient}><label>Full name<input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required /></label><label>Phone number<input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} required inputMode="tel" /></label><label>Date of birth<input type="date" value={editForm.dob} onChange={(event) => setEditForm({ ...editForm, dob: event.target.value })} /></label><label>Gender<select value={editForm.gender} onChange={(event) => setEditForm({ ...editForm, gender: event.target.value })}><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option></select></label><label>Address<input value={editForm.address} onChange={(event) => setEditForm({ ...editForm, address: event.target.value })} /></label><label>Emergency contact<input value={editForm.emergency_contact_name} onChange={(event) => setEditForm({ ...editForm, emergency_contact_name: event.target.value })} /></label><label>Emergency phone<input value={editForm.emergency_contact_phone} onChange={(event) => setEditForm({ ...editForm, emergency_contact_phone: event.target.value })} inputMode="tel" /></label><label>Notes<textarea value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} rows={3} /></label><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></form></section></div>}</main>;
}
