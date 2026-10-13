import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PRM · Utilization Tracker", template: "%s · PRM" },
  description: "Project Resource Management & Utilization Tracker",
};

export const viewport: Viewport = { themeColor: "#0a0b10", width: "device-width", initialScale: 1 };

// Applies the saved theme before paint to avoid a flash. Dark is the default.
const themeScript = `try{var t=localStorage.getItem('prm-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
