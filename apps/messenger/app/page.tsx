import { currentUser } from "../lib/supabase/server";
import Messenger from "../components/Messenger";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  
  if (!user) {
    try {
      const headersList = await headers();
      const host = headersList.get("host") || "localhost:3000";
      const proto = headersList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      const currentPath = headersList.get("x-invoke-path") || "/";
      const currentUrl = `${proto}://${host}${currentPath}`;
      
      // Redirect to UFlow ID with next param - instant auth
      const authUrl = `https://id.uflow.uz/auth?next=${encodeURIComponent(currentUrl)}&app=ubridge`;
      redirect(authUrl);
    } catch (e: any) {
      // If redirect fails (during build), show fallback that auto-redirects client side
      if (e?.digest?.startsWith("NEXT_REDIRECT")) throw e;
      return (
        <main className="auth-redirect">
          <div className="auth-card">
            <img src="/ubridge-logo.svg" alt="UBridge" width={80} height={80} style={{ borderRadius: 20, background: "#050505", padding: 16 }} />
            <h1>UBridge ga kirish</h1>
            <p>UFlow ID orqali avtomatik kirish...</p>
            <script dangerouslySetInnerHTML={{ __html: `
              (function(){
                var next = encodeURIComponent(window.location.href);
                window.location.href = "https://id.uflow.uz/auth?next=" + next + "&app=ubridge";
              })();
            `}} />
            <a href="https://id.uflow.uz/auth?next=&app=ubridge" className="auth-btn">UFlow ID bilan kirish</a>
          </div>
          <style>{`
            .auth-redirect { min-height:100dvh; display:grid; place-items:center; background:#fcfcfd; font-family:Inter,system-ui; }
            .auth-card { text-align:center; max-width:360px; padding:32px; background:white; border-radius:28px; box-shadow:0 16px 48px rgba(0,0,0,0.08); border:1px solid rgba(0,0,0,0.06); }
            .auth-card h1 { margin:20px 0 8px; font-size:22px; font-weight:800; letter-spacing:-0.02em; }
            .auth-card p { color:#6b7280; font-size:14px; line-height:1.5; }
            .auth-btn { display:inline-block; margin-top:20px; padding:12px 24px; background:#050505; color:white; border-radius:999px; font-weight:700; text-decoration:none; }
          `}</style>
        </main>
      );
    }
  }
  
  return <Messenger initialUser={{ id: user.id, name: (user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "UBridge User") as string, email: user.email }} />;
}
