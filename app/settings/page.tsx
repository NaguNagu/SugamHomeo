"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const router = useRouter();
  const [connections, setConnections] = useState({ supabase: false, sarvam: false });

  useEffect(() => {
    async function checkAccess() {
      if (!supabase) return;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.session.user.id).maybeSingle();
      if (profile?.role !== "doctor") { router.replace("/pharmacy"); return; }
      const response = await fetch("/api/health");
      if (response.ok) {
        const health = await response.json();
        setConnections({ supabase: Boolean(health.supabaseConfigured), sarvam: Boolean(health.sarvamConfigured) });
      }
    }
    checkAccess();
  }, [router]);

  return (
    <main className="reports-shell">
      <header className="topbar"><div className="mobile-brand"><span className="mobile-mark">S</span><strong>Sugam Homeo</strong></div><div className="breadcrumb"><span>Manage</span><b>/</b><strong>Settings</strong></div><div className="top-actions"><button className="icon-button" aria-label="Toggle theme" onClick={() => document.documentElement.classList.toggle("dark")}>☾</button><div className="top-avatar">DS</div></div></header>
      <div className="page-content">
        <button className="back-link" onClick={() => router.push("/")}>← Back to overview</button>
        <div className="welcome-row"><div><p className="eyebrow">Practice setup</p><h1>Settings</h1><p className="subheading">Your clinic details and service connections.</p></div></div>
        <div className="settings-grid">
          <section className="panel settings-card"><div className="panel-heading"><div><h2>Clinic profile</h2><p>Shown on patient-facing and operational records.</p></div></div><div className="settings-body"><div><span>Clinic</span><strong>Sugam Homeo</strong></div><div><span>Address</span><strong>176, Trichy Main Rd, next to Swarnam General Store, Sendarapatti, Gugai, Salem (M.Corp.), Tamil Nadu 636006</strong></div><div><span>Phone</span><strong>9343711359 · 7204744400</strong></div><div><span>Timezone</span><strong>Asia/Kolkata</strong></div></div></section>
          <section className="panel settings-card"><div className="panel-heading"><div><h2>Connections</h2><p>Service status for this deployment.</p></div></div><div className="settings-body"><Connection name="Supabase" connected={connections.supabase} fallback="Not configured" /><Connection name="Sarvam AI" connected={connections.sarvam} fallback="API key required" /><div className="connection-row"><span className="status-dot" /><strong>Authentication</strong><span className="connected">Configured</span></div></div></section>
        </div>
      </div>
    </main>
  );
}

function Connection({ name, connected, fallback }: { name: string; connected: boolean; fallback: string }) {
  return <div className="connection-row"><span className={`status-dot ${connected ? "" : "muted-dot"}`} /><strong>{name}</strong><span className={connected ? "connected" : "pending"}>{connected ? "Connected" : fallback}</span></div>;
}
