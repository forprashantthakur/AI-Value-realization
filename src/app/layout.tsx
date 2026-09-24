import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AI Value Realization Platform", template: "%s · AI Value Realization" },
  description: "Quantify, validate and track the business value of AI, GenAI and Agentic AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
