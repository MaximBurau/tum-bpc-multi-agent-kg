/**
 * Root layout component
 * 
 * Defines the application-wide layout with navigation and styling.
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/layout/Navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Multi-Agent Knowledge Graph Dashboard",
  description: "Research dashboard for multi-agent knowledge graph construction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
