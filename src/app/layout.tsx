import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Employee 360", template: "%s · Employee 360" },
  description: "Personal employee productivity and management platform",
};

const themeInit = `(function(){try{var t=localStorage.getItem('e360-theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable} dark`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#18181b", color: "#fafafa", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px", fontSize: "13px", boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
            },
          }}
        />
      </body>
    </html>
  );
}
