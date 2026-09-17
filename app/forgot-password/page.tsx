"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) {
      setError("Password recovery is not configured in this environment.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError("We couldn’t send the reset email. Please try again or contact the clinic administrator.");
      return;
    }
    setMessage("If an account exists for this email, a password reset link is on its way.");
  }

  return <main className="login-shell"><div className="login-art"><div className="login-art-inner"><span className="art-kicker">Secure access</span><h1>A fresh<br /><em>start.</em></h1><p>Recover your Sugam Homeo clinic account securely.</p><div className="art-line" /></div></div><section className="login-panel"><div className="login-brand"><div className="login-logo"><Image src="/sugam-logo.png" alt="Sugam Homeo" width={112} height={39} priority /></div><div><strong>Sugam Homeo</strong><span>Practice companion</span></div></div><div className="login-copy"><span className="eyebrow">Account recovery</span><h2>Reset your password</h2><p>Enter your clinic email and we’ll send a secure reset link.</p></div><form onSubmit={handleSubmit} className="login-form"><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@sugam.com" required autoComplete="email" /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="primary-button login-button" disabled={loading}>{loading ? "Sending…" : "Send reset link"}<span>→</span></button></form><a className="login-back-link" href="/login">← Back to sign in</a></section></main>;
}
