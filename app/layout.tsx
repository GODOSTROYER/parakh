import type { Metadata } from "next";
import {
  Instrument_Serif,
  Instrument_Sans,
  Geist_Mono,
  Tiro_Devanagari_Hindi,
} from "next/font/google";
import "./globals.css";

const instrument = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
});

// sibling of Instrument Serif — same optical DNA, modern humanist sans
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

// elegant Devanagari serif with true italics, drawn to sit beside Latin serifs
const tiro = Tiro_Devanagari_Hindi({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["devanagari", "latin"],
  variable: "--font-tiro",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Parakh — AI Exam Assessment",
  description:
    "परख · Upload a question paper and a student's answer sheet — Parakh extracts every question, finds and highlights each answer on the sheet, and grades it with AI feedback.",
  alternates: { canonical: "https://www.arnavbule.in/parakh" },
};

// canonical home is www.arnavbule.in/parakh; direct hits on the vercel.app or
// subdomain URLs bounce there (client-side — server host checks would loop
// through the portfolio's proxy)
const CANONICAL_SCRIPT = `if (!["www.arnavbule.in","localhost","127.0.0.1"].includes(location.hostname)) location.replace("https://www.arnavbule.in/parakh");`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: CANONICAL_SCRIPT }} />
      </head>
      <body
        className={`${instrument.variable} ${instrumentSans.variable} ${geistMono.variable} ${tiro.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
