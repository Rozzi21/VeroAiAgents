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
      <body className={`${inter.className} h-screen overflow-hidden antialiased bg-white`}>
        <Sidebar />
        <main className="relative h-full w-full overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
