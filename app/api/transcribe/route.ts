import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "doctor") return NextResponse.json({ error: "Only doctors can transcribe consultation notes." }, { status: 403 });
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Sarvam AI is not configured." }, { status: 503 });
  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "Audio file is empty." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Audio file must be 10 MB or smaller." }, { status: 413 });
  if (file.type && !file.type.startsWith("audio/")) return NextResponse.json({ error: "Only audio files are accepted." }, { status: 415 });
  const form = new FormData();
  form.append("file", file, file.name || "consultation.webm");
  form.append("model", "saaras:v4");
  form.append("language_code", "unknown");
  form.append("mode", "transcribe");
  form.append("keyterms", JSON.stringify(["Sugam Homeo", "homeopathy", "Salem"]));
  let response: Response;
  try {
    response = await fetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": apiKey }, body: form, signal: AbortSignal.timeout(30_000) });
  } catch {
    return NextResponse.json({ error: "Sarvam transcription timed out or could not be reached." }, { status: 504 });
  }
  let payload: { transcript?: string; language_code?: string; request_id?: string; message?: string } = {};
  try { payload = await response.json(); } catch { return NextResponse.json({ error: "Sarvam returned an invalid response." }, { status: 502 }); }
  if (!response.ok) return NextResponse.json({ error: payload?.message || "Sarvam transcription failed." }, { status: response.status });
  return NextResponse.json({ transcript: payload.transcript || "", languageCode: payload.language_code || null, requestId: payload.request_id || null }, { headers: { "Cache-Control": "no-store" } });
}
