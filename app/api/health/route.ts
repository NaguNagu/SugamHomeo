import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "sugam-homeo", supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), sarvamConfigured: Boolean(process.env.SARVAM_API_KEY) }, { headers: { "Cache-Control": "no-store" } });
}
