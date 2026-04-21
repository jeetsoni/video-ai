import { createHash } from "node:crypto";

export function computeCodeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
