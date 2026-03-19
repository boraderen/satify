import type { Metadata } from "next";
import { Source_Sans_3, Space_Grotesk } from "next/font/google";
import { SITE_ICON_PATH } from "@/lib/site";
import "./globals.css";

const headingFont = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
});

const bodyFont = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SATify",
  description:
    "Interactive reductions from graph and logic decision problems to SAT and 3-SAT.",
  icons: {
    icon: [{ url: SITE_ICON_PATH, type: "image/png" }],
    shortcut: [{ url: SITE_ICON_PATH, type: "image/png" }],
    apple: [{ url: SITE_ICON_PATH, type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
