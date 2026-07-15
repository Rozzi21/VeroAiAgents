import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vero Travel AI",
  description: "Your autonomous AI-powered travel operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex h-screen overflow-hidden antialiased bg-white`}>
        <Sidebar />
        <main className="flex-1 h-full overflow-hidden relative">
          {children}
        </main>
      </body>
    </html>
  );
}
