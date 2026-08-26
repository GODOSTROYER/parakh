import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: "VedaAI — Exam Answer Mapping",
  description:
    "Upload a question paper and a student answer sheet; extract questions, map answers, and grade with AI.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bricolage.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
