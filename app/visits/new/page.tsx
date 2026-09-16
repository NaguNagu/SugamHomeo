"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Patient = { id: string; patient_number: string; name: string; phone: string; gender: string | null };

export default function NewVisitPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [medicine, setMedicine] = useState("");
  const [value, setValue] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [previous, setPrevious] = useState<{ visit_number: number; consultation: string; prescription: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [sarvamRecording, setSarvamRecording] = useState(false);
  const [notice, setNotice] = useState("");
  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    async function load() {
      if (!supabase) return;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.session.user.id).maybeSingle();
      if (profile?.role !== "doctor") { router.replace("/pharmacy"); return; }
      const { data } = await supabase.from("patients").select("id,patient_number,name,phone,gender").order("name");
      if (data) { setPatients(data); const requestedPatient = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("patient") : null; const requestedAppointment = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("appointment") : null; const found = data.find((item) => item.patient_number === requestedPatient); if (found) setPatientId(found.id); if (requestedAppointment) setAppointmentId(requestedAppointment); }
    }
    load();
  }, [router]);

  useEffect(() => {
    async function loadPrevious() {
      if (!supabase || !patientId) { setPrevious(null); return; }
      const { data } = await supabase.from("visits").select("visit_number,consultations(consultation_text),prescriptions(medication_text)").eq("patient_id", patientId).order("visit_number", { ascending: false }).limit(1).maybeSingle();
      setPrevious(data ? { visit_number: data.visit_number, consultation: (data as any).consultations?.consultation_text || "No consultation note saved.", prescription: (data as any).prescriptions?.medication_text || "No prescription saved." } : null);
    }
    loadPrevious();
  }, [patientId]);

  async function saveVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !patientId) return;
    setSaving(true); setNotice("");
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { setNotice("Sign in to save a visit."); setSaving(false); return; }
    const visitPayload: Record<string, string | number | null> = { p_patient_id: patientId, p_consultation_text: notes, p_medication_text: medicine, p_medicine_value: Number(value || 0), p_paid_amount: Number(paidAmount || 0), p_payment_method: Number(paidAmount || 0) > 0 ? paymentMethod : null, p_input_method: listening || sarvamRecording ? "voice" : "typed" };
    if (appointmentId) visitPayload.p_appointment_id = appointmentId;
    const { data: bundle, error } = await supabase.rpc("create_visit_bundle", visitPayload);
    if (error || !bundle) setNotice(error?.message?.includes("function") ? "Run the production database migration before saving visits." : "Could not save the complete visit. Please try again.");
    else { setNotice(`Visit #${bundle.visit_number} saved and sent to pharmacy.`); window.setTimeout(() => router.push("/"), 1200); }
    setSaving(false);
  }

  function toggleVoice() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setNotice("Voice input is not supported by this browser."); window.setTimeout(() => setNotice(""), 2800); return; }
    const recognition = new SpeechRecognition(); recognition.lang = "en-IN"; recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = (event: any) => { let transcript = ""; for (let index = event.resultIndex; index < event.results.length; index += 1) transcript += event.results[index][0].transcript; setNotes((current) => `${current}${current ? " " : ""}${transcript}`); };
    recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); setNotice("Microphone input stopped. You can continue typing."); };
    recognitionRef.current = recognition; recognition.start(); setListening(true);
  }

  async function toggleSarvam() {
    if (sarvamRecording) { recorderRef.current?.stop(); setSarvamRecording(false); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setNotice("Audio recording is not supported by this browser."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream); chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => { stream.getTracks().forEach((track) => track.stop()); const form = new FormData(); form.append("file", new Blob(chunksRef.current, { type: recorder.mimeType }), "consultation.webm"); const response = await fetch("/api/transcribe", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) setNotice(data.error || "Sarvam transcription failed."); else if (data.transcript) { setNotes((current) => `${current}${current ? " " : ""}${data.transcript}`); setNotice(`Transcribed in ${data.languageCode || "detected language"}.`); } window.setTimeout(() => setNotice(""), 3000); };
      recorderRef.current = recorder; recorder.start(); setSarvamRecording(true);
    } catch { setNotice("Microphone access was not granted."); }
  }

  const patient = patients.find((item) => item.id === patientId);
  return <main className="visit-shell"><header className="topbar"><div className="mobile-brand"><span className="mobile-mark">S</span><strong>Sugam Homeo</strong></div><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>New visit</strong></div><div className="top-actions"><button className="icon-button" aria-label="Toggle theme" onClick={() => document.documentElement.classList.toggle("dark")}>☾</button><div className="top-avatar">DS</div></div></header><div className="visit-content"><button className="back-link" onClick={() => router.back()}>← Back</button><div className="visit-heading"><div><p className="eyebrow">Clinical record</p><h1>Start a new visit</h1><p className="subheading">Every note, payment, and prescription stays attached to this patient&apos;s history.</p></div><span className="secure-badge">⌁ Secure record</span></div><form onSubmit={saveVisit} className="visit-form"><section className="panel visit-card"><div className="panel-heading"><div><h2>Patient</h2><p>Choose the patient for this consultation.</p></div></div><div className="visit-card-body"><select value={patientId} onChange={(event) => setPatientId(event.target.value)} required><option value="">Select patient</option>{patients.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.patient_number}</option>)}</select>{patient && <div className="selected-patient"><div className="patient-avatar blue">{patient.name.split(" ").map((part) => part[0]).join("")}</div><div><strong>{patient.name}</strong><span>{patient.patient_number} · {patient.phone} · {patient.gender || "Gender not recorded"}</span></div></div>}</div></section><div className="visit-columns"><section className="panel visit-card"><div className="panel-heading"><div><h2>Consultation notes</h2><p>Type or dictate the final clinical record.</p></div><div className="voice-actions"><button type="button" className={`voice-button ${listening ? "listening" : ""}`} onClick={toggleVoice}>{listening ? "● Listening" : "🎙 Voice"}</button><button type="button" className={`voice-button sarvam-button ${sarvamRecording ? "listening" : ""}`} onClick={toggleSarvam}>{sarvamRecording ? "● Sarvam" : "◎ Sarvam"}</button></div></div><div className="visit-card-body">{previous && <div className="previous-context"><span>Previous visit #{previous.visit_number}</span><p>{previous.consultation}</p><small>Previous prescription: {previous.prescription}</small></div>}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What brought the patient in today? Record symptoms, observations, and clinical notes..." required /></div></section><section className="panel visit-card prescription-card"><div className="panel-heading"><div><h2>Prescription</h2><p>Free-text medicine instructions for this visit.</p></div><span className="input-mode maroon-mode">✣ Rx</span></div><div className="visit-card-body"><textarea value={medicine} onChange={(event) => setMedicine(event.target.value)} placeholder="Medicine A – 10 drops twice daily..." required /><label className="value-label">Medicine value<input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} placeholder="₹ 0.00" required /></label></div></section></div><section className="panel payment-card"><div className="panel-heading"><div><h2>Payment received</h2><p>Optional now; the pharmacist can record a later transaction.</p></div><span className="input-mode green-mode">₹ Payment</span></div><div className="payment-fields"><label>Amount received<input type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder="₹ 0.00" /></label><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></select></label></div></section><div className="visit-actions"><p>Saving creates one linked visit, consultation, prescription, payment, and pending pharmacy record.</p><button className="primary-button" disabled={saving}>{saving ? "Saving visit…" : "Save visit & send to pharmacy →"}</button></div></form></div>{notice && <div className="toast" role="status">{notice}</div>}</main>;
}
