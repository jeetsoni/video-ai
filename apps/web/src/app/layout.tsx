import type { Metadata } from "next";
import { AppDependenciesProvider } from "@/shared/providers/app-dependencies-context";
import "./globals.css";

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
      <body>
        <AppDependenciesProvider>{children}</AppDependenciesProvider>
      </body>
    </html>
  );
}
