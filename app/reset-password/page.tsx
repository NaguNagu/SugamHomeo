"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && (event === "PASSWORD_RECOVERY" || Boolean(session))) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setReady(true);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase || !ready) {
      setError("This reset link is invalid or has expired. Request a new one.");
      return;
    }
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError("We couldn’t update your password. Request a new reset link and try again.");
      return;
    }
    await supabase.auth.signOut();
    setMessage("Your password has been updated. You can now sign in securely.");
    setTimeout(() => router.replace("/login"), 1200);
  }

  return <main className="login-shell"><div className="login-art"><div className="login-art-inner"><span className="art-kicker">Secure access</span><h1>Back to<br /><em>care.</em></h1><p>Choose a new password for your Sugam Homeo account.</p><div className="art-line" /></div></div><section className="login-panel"><div className="login-brand"><div className="login-logo"><Image src="/sugam-logo.png" alt="Sugam Homeo" width={112} height={39} priority /></div><div><strong>Sugam Homeo</strong><span>Practice companion</span></div></div><div className="login-copy"><span className="eyebrow">Account recovery</span><h2>Create a new password</h2><p>Use at least 8 characters and keep it private.</p></div><form onSubmit={handleSubmit} className="login-form"><label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter a new password" required minLength={8} autoComplete="new-password" /></label><label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat the new password" required minLength={8} autoComplete="new-password" /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="primary-button login-button" disabled={loading || Boolean(message)}>{loading ? "Updating…" : "Update password"}<span>→</span></button></form><a className="login-back-link" href="/login">← Back to sign in</a></section></main>;
}
