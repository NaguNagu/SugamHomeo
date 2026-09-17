"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured in this environment.");
      return;
    }
    setLoading(true);
    setError("");
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("We couldn’t sign you in. Check the email and password, then try again.");
      setLoading(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", signInData.user.id).maybeSingle();
    if (profileError || !profile?.role) {
      await supabase.auth.signOut();
      setError("This account is not provisioned for Sugam Homeo. Contact the clinic administrator.");
      setLoading(false);
      return;
    }
    router.replace(profile.role === "pharmacist" ? "/pharmacy" : "/");
  }

  return <main className="login-shell"><div className="login-art"><div className="login-art-inner"><span className="art-kicker">A calmer way to care</span><h1>Every visit,<br /><em>remembered.</em></h1><p>Secure patient records for the Sugam Homeo practice.</p><div className="art-line" /></div></div><section className="login-panel"><div className="login-brand"><div className="login-logo"><Image src="/sugam-logo.png" alt="Sugam Homeo" width={112} height={39} priority /></div><div><strong>Sugam Homeo</strong><span>Practice companion</span></div></div><div className="login-copy"><span className="eyebrow">Welcome back</span><h2>Sign in to your workspace</h2><p>Use your clinic account to continue.</p></div><form onSubmit={handleSubmit} className="login-form"><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@sugam.com" required autoComplete="email" /></label><div className="password-label-row"><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete="current-password" /></label><a href="/forgot-password">Forgot password?</a></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button login-button" disabled={loading}>{loading ? "Signing in…" : "Sign in"}<span>→</span></button></form><p className="login-footer">Need access? Contact the clinic administrator.</p></section></main>;
}
