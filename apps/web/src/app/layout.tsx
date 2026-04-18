import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppDependenciesProvider } from "@/shared/providers/app-dependencies-context";
import { AppHeader } from "@/shared/components/layout/app-header";
import { AppSidebar } from "@/shared/components/layout/app-sidebar";
import { MobileNav } from "@/shared/components/layout/mobile-nav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Video AI",
  description: "AI-powered video editing platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.variable}>
        <AppDependenciesProvider>
          <AppHeader />
          <AppSidebar />
          <div className="min-h-screen pt-16 md:ml-64">{children}</div>
          <MobileNav />
        </AppDependenciesProvider>
      </body>
    </html>
  );
}
