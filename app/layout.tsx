import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADOHub",
  description: "A GitHub-like developer interface for Azure DevOps",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
      <body>
        <Providers>
          <header className="site-header">
            <a className="brand" href="/">ADOHub</a>
            <span className="header-subtitle">Azure DevOps, without the Azure DevOps-shaped UI</span>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
