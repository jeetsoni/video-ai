"use client";

import { DraftHero } from "@/features/pipeline/components/draft-hero";
import { ShowcaseCarousel } from "@/features/pipeline/components/showcase-carousel";
import { FeaturesGrid } from "@/features/pipeline/components/features-grid";
import { AppFooter } from "@/shared/components/layout/app-footer";

export default function Home() {
  return (
    <main>
      {/* Hero — full viewport */}
      <section className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-6">
        <DraftHero />
      </section>

      {/* Showcase — below the fold */}
      <section className="px-6 pb-24">
        <ShowcaseCarousel />
      </section>

      {/* Features bento grid */}
      <FeaturesGrid />

      <AppFooter />
    </main>
  );
}
