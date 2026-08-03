import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient, createClient } from "../../../../lib/supabase/server";

function configured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@uflow.uz", pub, priv);
  return true;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  if (!configured()) return NextResponse.json({ ok: true, skipped: "vapid_not_configured" });
  const body = await request.json();
  const to = body?.to;
  const title = String(body?.title || "UBridge");
  const text = String(body?.body || "New activity");
  if (!to) return NextResponse.json({ ok: false, error: "missing_to" }, { status: 400 });
  const admin = createAdminClient() as any;
  const { data: subs, error } = await admin.schema("ubridge").from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", to).is("failed_at", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any, JSON.stringify({ title, body: text, url: "/", tag: `ubridge:${to}` }));
      sent++;
    } catch {}
  }
  return NextResponse.json({ ok: true, sent });
}
