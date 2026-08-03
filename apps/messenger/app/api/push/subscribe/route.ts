import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const body = await request.json();
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ ok: false, error: "bad_subscription" }, { status: 400 });
  const { error } = await supabase.rpc("ubridge_push_save", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_user_agent: request.headers.get("user-agent") || "" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
