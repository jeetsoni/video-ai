/**
 * One-time script to generate the SFX asset library using ElevenLabs Sound Effects API.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=your-key npx tsx scripts/generate-sfx-library.ts
 *
 * This generates 18 sound effects (~18 of your 183 monthly generations on Creator plan).
 * Run once, commit the .mp3 files, and reuse them across all videos forever.
 *
 * Files are written to: packages/shared/src/sfx/assets/
 *
 * Options:
 *   --dry-run     Print what would be generated without calling the API
 *   --only=NAME   Generate only the asset with this filename (e.g. --only=ambience-hook.mp3)
 */
import "dotenv/config";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_SFX_ASSETS } from "../packages/shared/src/sfx/sfx-library.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASSETS_DIR = path.resolve(
  __dirname,
  "../packages/shared/src/sfx/assets",
);

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyFlag = args.find((a) => a.startsWith("--only="));
  const onlyFilename = onlyFlag?.split("=")[1];

  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey && !dryRun) {
    console.error("Error: ELEVENLABS_API_KEY environment variable is required.");
    console.error("Set it in your .env file or pass it inline:");
    console.error("  ELEVENLABS_API_KEY=your-key npx tsx scripts/generate-sfx-library.ts");
    process.exit(1);
  }

  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const assets = onlyFilename
    ? ALL_SFX_ASSETS.filter((a) => a.filename === onlyFilename)
    : ALL_SFX_ASSETS;

  if (onlyFilename && assets.length === 0) {
    console.error(`No asset found with filename: ${onlyFilename}`);
    console.error("Available:", ALL_SFX_ASSETS.map((a) => a.filename).join(", "));
    process.exit(1);
  }

  console.log(`\nSFX Library Generator`);
  console.log(`=====================`);
  console.log(`Assets to generate: ${assets.length}`);
  console.log(`Output directory:   ${ASSETS_DIR}`);
  console.log(`Mode:               ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const client = dryRun ? null : new ElevenLabsClient({ apiKey });

  let generated = 0;
  let skipped = 0;

  for (const asset of assets) {
    const outputPath = path.join(ASSETS_DIR, asset.filename);

    if (fs.existsSync(outputPath)) {
      console.log(`  SKIP  ${asset.filename} (already exists)`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  WOULD GENERATE  ${asset.filename}`);
      console.log(`    Prompt:    "${asset.prompt}"`);
      console.log(`    Duration:  ${asset.durationSeconds}s`);
      console.log(`    Influence: ${asset.promptInfluence}`);
      continue;
    }

    console.log(`  GENERATING  ${asset.name} → ${asset.filename} ...`);

    try {
      const audioStream = await client!.textToSoundEffects.convert({
        text: asset.prompt,
        duration_seconds: asset.durationSeconds,
        prompt_influence: asset.promptInfluence,
      });

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }

      fs.writeFileSync(outputPath, Buffer.concat(chunks));
      generated++;
      console.log(`    ✓ Saved (${(Buffer.concat(chunks).length / 1024).toFixed(1)} KB)`);

      // Small delay between API calls to be respectful
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`    ✗ Failed: ${message}`);
      console.error(`    You can retry this one with: --only=${asset.filename}`);
    }
  }

  console.log(`\nDone! Generated: ${generated}, Skipped: ${skipped}, Total: ${assets.length}`);

  if (generated > 0) {
    console.log(`\nNext steps:`);
    console.log(`  1. Listen to the generated files in ${ASSETS_DIR}`);
    console.log(`  2. Re-generate any that don't sound right with --only=filename.mp3`);
    console.log(`  3. Commit the .mp3 files to the repo`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
