import { PrismaClient } from "@prisma/client";
import { ANIMATION_THEMES, DEFAULT_THEME_ID } from "@video-ai/shared";

const prisma = new PrismaClient();

async function seedThemes(): Promise<void> {
  console.log("🎨 Seeding animation themes...");

  for (let i = 0; i < ANIMATION_THEMES.length; i++) {
    const theme = ANIMATION_THEMES[i]!;
    const { id, name, description, background, surface, raised, textPrimary, textMuted, accents } = theme;

    const palette = { background, surface, raised, textPrimary, textMuted, accents };

    await prisma.animationTheme.upsert({
      where: { id },
      update: {
        name,
        description,
        palette,
        isDefault: id === DEFAULT_THEME_ID,
        sortOrder: i,
      },
      create: {
        id,
        name,
        description,
        palette,
        isDefault: id === DEFAULT_THEME_ID,
        sortOrder: i,
      },
    });

    console.log(`  ✓ ${name} (${id})${id === DEFAULT_THEME_ID ? " [default]" : ""}`);
  }

  console.log(`\n✅ Seeded ${ANIMATION_THEMES.length} animation themes.`);
}

seedThemes()
  .catch((error) => {
    console.error("❌ Failed to seed themes:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
