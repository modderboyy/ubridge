import { currentUser } from "../lib/supabase/server";
import Messenger from "../components/Messenger";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  if (!user) {
    return <main className="app"><div className="top"><div className="brand"><div className="logo">U</div>UBridge Messenger</div></div><div className="hint"><h1>Sign in required</h1><p>Connect this app to UFlow ID / Supabase Auth to start a P2P realtime session.</p></div></main>;
  }
  return <Messenger initialUser={{ id: user.id, name: (user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "UBridge User") as string }} />;
}
