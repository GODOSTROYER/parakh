import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: "Parakh — AI Exam Assessment",
  description:
    "परख · Upload a question paper and a student's answer sheet — Parakh extracts every question, finds and highlights each answer on the sheet, and grades it with AI feedback.",
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
