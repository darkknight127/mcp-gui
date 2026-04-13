import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

/** App shell / theme bootstrap (project: https://github.com/darkknight127/mcp-gui) */
export const metadata: Metadata = {
  title: "MCP GUI",
  description: "Visual browser and executor for MCP servers",
};

const themeInitScript = `(function(){try{var k="mcp-gui-theme";var t=localStorage.getItem(k);var d=document.documentElement;if(t==="dark")d.classList.add("dark");else if(t==="light")d.classList.remove("dark");else if(window.matchMedia("(prefers-color-scheme:dark)").matches)d.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Script id="mcp-gui-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
