import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baby Shark — Low-Competition Federal Contract Intelligence",
  description: "Find federal contract awards with 1-2 bidders and values over $1M for industrial supply chain opportunities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
