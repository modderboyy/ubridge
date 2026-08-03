import type { Metadata, Viewport } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "UBridge Messenger — P2P Secure Chat",
  description: "End-to-end encrypted P2P messenger. Local-first, no server history. File transfer, voice & video calls powered by WebRTC. Super fast & private.",
  applicationName: "UBridge",
  authors: [{ name: "UBridge", url: "https://ubridge.app" }],
  generator: "UBridge P2P",
  keywords: ["messenger", "P2P", "encrypted", "WebRTC", "chat", "UBridge", "secure", "local-first"],
  referrer: "origin-when-cross-origin",
  creator: "UBridge Team",
  publisher: "UBridge",
  formatDetection: { email: false, address: false, telephone: false },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/ubridge-logo.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  appleWebApp: {
    capable: true,
    title: "UBridge",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    title: "UBridge Messenger — P2P Secure Chat",
    description: "Private P2P messenger with E2E encryption, file sharing, voice & video calls. No server storage.",
    siteName: "UBridge",
  },
  twitter: {
    card: "summary",
    title: "UBridge Messenger",
    description: "P2P Encrypted Messenger - Local First",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="UBridge" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script dangerouslySetInnerHTML={{
          __html: `
            (function(){
              try {
                var t = localStorage.getItem('ubridge_theme');
                var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                // DEFAULT LIGHT - only dark if explicitly set
                var theme = t || 'light';
                if(theme === 'dark') document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
                var lang = localStorage.getItem('ubridge_lang') || (navigator.language || 'en').slice(0,2);
                if(['uz','ru','en'].indexOf(lang)===-1) lang='en';
                document.documentElement.lang = lang;
              } catch(e){}
            })();
          `
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
