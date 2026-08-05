import { currentUser, createClient } from "../lib/supabase/server";
import Messenger from "../components/Messenger";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams?: { [key: string]: string | string[] | undefined } }) {
  // Check for auth code from UFlow ID redirect
  const supabase = await createClient();
  
  // Try to handle code exchange if present (for SSO)
  const code = searchParams?.code as string | undefined;
  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
    } catch {}
  }

  const user = await currentUser();
  
  if (!user) {
    try {
      const headersList = await headers();
      const host = headersList.get("host") || "localhost:3000";
      const proto = headersList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      const currentPath = headersList.get("x-invoke-path") || "/";
      // Avoid loop: check if we already attempted auth
      const attempt = (searchParams?.ubridge_auth_attempt as string) || "0";
      const attemptNum = parseInt(attempt, 10) || 0;
      
      if (attemptNum >= 2) {
        // Show error instead of infinite loop
        return (
          <main className="auth-redirect">
            <div className="auth-card">
              <img src="/ubridge-logo.svg" alt="UBridge" width={80} height={80} style={{ borderRadius: 20, background: "#050505", padding: 16 }} />
              <h1>Kirishda xatolik</h1>
              <p>UFlow ID orqali kirishda muammo. Iltimos qaytadan urinib ko'ring yoki to'g'ridan-to'g'ri kiring.</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
                <a href={`https://id.uflow.uz/signin?next=${encodeURIComponent(`${proto}://${host}/`)}&app=ubridge`} className="auth-btn">Qayta kirish</a>
                <a href="/" className="auth-btn" style={{ background: "#f0f2f5", color: "#050505" }}>Bosh sahifa</a>
              </div>
            </div>
            <style>{`
              .auth-redirect { min-height:100dvh; display:grid; place-items:center; background:#fcfcfd; font-family:Inter,system-ui; padding:20px; }
              .auth-card { text-align:center; max-width:400px; width:100%; padding:32px; background:white; border-radius:28px; box-shadow:0 16px 48px rgba(0,0,0,0.08); border:1px solid rgba(0,0,0,0.06); }
              .auth-card h1 { margin:20px 0 8px; font-size:22px; font-weight:800; letter-spacing:-0.02em; }
              .auth-card p { color:#6b7280; font-size:14px; line-height:1.5; }
              .auth-btn { display:inline-block; padding:12px 24px; background:#050505; color:white; border-radius:999px; font-weight:700; text-decoration:none; font-size:14px; }
            `}</style>
          </main>
        );
      }

      const currentUrl = `${proto}://${host}${currentPath}`;
      // Use /signin as requested, with attempt counter to prevent loop
      const nextUrl = `${currentUrl}${currentUrl.includes("?") ? "&" : "?"}ubridge_auth_attempt=${attemptNum + 1}`;
      const authUrl = `https://id.uflow.uz/signin?next=${encodeURIComponent(nextUrl)}&app=ubridge&source=messenger`;
      
      redirect(authUrl);
    } catch (e: any) {
      if (e?.digest?.startsWith("NEXT_REDIRECT")) throw e;
      return (
        <main className="auth-redirect">
          <div className="auth-card">
            <img src="/ubridge-logo.svg" alt="UBridge" width={80} height={80} style={{ borderRadius: 20, background: "#050505", padding: 16 }} />
            <h1>UBridge ga kirish</h1>
            <p>UFlow ID orqali avtomatik kirish...</p>
            <div id="loading">Yuklanmoqda...</div>
            <script dangerouslySetInnerHTML={{ __html: `
              (function(){
                try {
                  var attempt = localStorage.getItem('ubridge_auth_attempt') || '0';
                  var num = parseInt(attempt, 10) || 0;
                  if (num >= 2) {
                    document.getElementById('loading').innerText = 'Kirishda muammo, iltimos qayta urinib ko\\'ring';
                    return;
                  }
                  localStorage.setItem('ubridge_auth_attempt', String(num+1));
                  var next = encodeURIComponent(window.location.href.split('?')[0] + '?ubridge_auth_attempt=' + (num+1));
                  setTimeout(function(){
                    window.location.href = "https://id.uflow.uz/signin?next=" + next + "&app=ubridge&source=messenger";
                  }, 800);
                } catch(e) {
                  var next = encodeURIComponent(window.location.href);
                  window.location.href = "https://id.uflow.uz/signin?next=" + next + "&app=ubridge";
                }
              })();
            `}} />
            <a id="manual-link" href="https://id.uflow.uz/signin?app=ubridge" className="auth-btn" style={{ marginTop: 20 }}>UFlow ID bilan kirish</a>
            <script dangerouslySetInnerHTML={{ __html: `
              (function(){
                var link = document.getElementById('manual-link');
                if(link) {
                  var next = encodeURIComponent(window.location.href);
                  link.href = "https://id.uflow.uz/signin?next=" + next + "&app=ubridge&source=messenger";
                }
              })();
            `}} />
          </div>
          <style>{`
            .auth-redirect { min-height:100dvh; display:grid; place-items:center; background:#fcfcfd; font-family:Inter,system-ui; padding:20px; }
            .auth-card { text-align:center; max-width:360px; width:100%; padding:32px; background:white; border-radius:28px; box-shadow:0 16px 48px rgba(0,0,0,0.08); border:1px solid rgba(0,0,0,0.06); }
            .auth-card h1 { margin:20px 0 8px; font-size:22px; font-weight:800; letter-spacing:-0.02em; }
            .auth-card p { color:#6b7280; font-size:14px; line-height:1.5; }
            .auth-btn { display:inline-block; margin-top:20px; padding:12px 24px; background:#050505; color:white; border-radius:999px; font-weight:700; text-decoration:none; }
          `}</style>
        </main>
      );
    }
  }

  // Clear auth attempt on successful login
  // Client side will clear localStorage
  
  return <Messenger initialUser={{ id: user.id, name: (user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "UBridge User") as string, email: user.email }} />;
}
