/**
 * Simple ElevenLabs TTS example using the official SDK.
 *
 * Run with:  npx tsx src/examples/elevenlabs-tts-example.ts
 */
import "dotenv/config";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

async function main() {
  console.log("Generating speech...");

  const audioStream = await client.textToSpeech.convert(
    "JBFqnCBsd6RMkjVDRZzb", // "George" voice
    {
      text: "Hey there! This is a quick test of the ElevenLabs text to speech API. Pretty cool, right?",
      modelId: "eleven_flash_v2_5",
    },
  );

  const outputPath = "output.mp3";
  await pipeline(audioStream, createWriteStream(outputPath));

  console.log(`Audio saved to ${outputPath}`);
}

main().catch(console.error);
