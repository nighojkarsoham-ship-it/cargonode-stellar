import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "CargoNode - Smart Escrow Payments for Freight",
  description:
    "Decentralized logistics payment platform using Stellar and Soroban Smart Contracts. Lock shipments in secure escrow, get paid instantly on delivery.",
  keywords: ["Stellar", "Soroban", "escrow", "freight", "logistics", "USDC", "blockchain"],
  openGraph: {
    title: "CargoNode - Smart Escrow Payments for Freight",
    description: "Decentralized logistics payment platform on Stellar",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <a href="/" className="flex items-center gap-2 shrink-0">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">CN</span>
                  </div>
                  <span className="text-xl font-bold text-secondary hidden sm:block">
                    CargoNode
                  </span>
                </a>
                <nav className="flex items-center gap-3 sm:gap-6">
                  <a
                    href="/shipments"
                    className="text-gray-600 hover:text-primary font-medium text-sm sm:text-base"
                  >
                    Shipments
                  </a>
                  <a
                    href="/analytics"
                    className="text-gray-600 hover:text-primary font-medium text-sm sm:text-base flex items-center gap-1"
                  >
                    <span>📊</span>
                    <span className="hidden sm:inline">Monitoring</span>
                  </a>
                  <a
                    href="/shipments/new"
                    className="btn-primary text-sm !px-3 !py-2 sm:!px-4"
                  >
                    <span className="hidden sm:inline">New Shipment</span>
                    <span className="sm:hidden">+ New</span>
                  </a>
                </nav>
              </div>
            </div>
          </header>

          {/* Main */}
          <main className="flex-1">{children}</main>

          {/* Footer */}
          <footer className="bg-white border-t border-gray-100 py-6">
            <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
              CargoNode &copy; {new Date().getFullYear()} &mdash; Powered by
              Stellar &amp; Soroban
            </div>
          </footer>
        </div>

        {/* Vercel Cloud Analytics */}
        <Analytics />

        {/* Feedback Widget */}
        <FeedbackWidget />

        {/* Analytics Script */}
        {process.env.NEXT_PUBLIC_ANALYTICS_URL && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_ANALYTICS_URL}
            src="https://plausible.io/js/script.js"
          />
        )}
      </body>
    </html>
  );
}
