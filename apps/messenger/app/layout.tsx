import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "UBridge Messenger — P2P Realtime Chat",
  description: "UFlow-style messenger powered by UBridge WebRTC P2P and Supabase presence/signaling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
