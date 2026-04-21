import { Heart } from "lucide-react";

export function AppFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-8">
      <p className="text-center text-sm text-white/30 flex items-center justify-center gap-1.5">
        Made with <Heart className="size-3.5 fill-red-500 text-red-500" /> using
        <span className="text-white/50 font-medium">Kiro</span>
        <span className="text-white/20">×</span>
        <span className="text-white/50 font-medium">ElevenLabs</span>
      </p>
    </footer>
  );
}
