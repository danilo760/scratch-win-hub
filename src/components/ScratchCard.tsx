import { useEffect, useRef, useState } from "react";
import { Sparkles, Frown, RotateCcw, Volume2, VolumeX, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/hooks/useProfile";

export type ScratchRarity = "bronze" | "prata" | "ouro" | "diamante";
export type ScratchVisualRarity = ScratchRarity | "misteriosa";

// Shared presentation metadata is intentionally exported alongside the component.
// eslint-disable-next-line react-refresh/only-export-components
export const scratchRarityPresentation: Record<
  ScratchVisualRarity,
  {
    surface: string;
    border: string;
    glow: string;
    winSurface: string;
    optionClass: string;
    badgeClass: string;
    iconClass: string;
    ornamentClass: string;
    desktopParticles: number;
  }
> = {
  bronze: {
    surface: "from-amber-900 via-orange-700 to-amber-950",
    border: "border-amber-700/70",
    glow: "shadow-[0_10px_28px_rgba(180,83,9,0.28)]",
    winSurface: "bg-gradient-to-br from-amber-900 via-orange-700 to-amber-950 text-amber-50",
    optionClass:
      "border-amber-800/60 bg-gradient-to-br from-amber-950/10 via-card to-orange-950/10",
    badgeClass: "border-amber-700/40 bg-amber-900/15 text-amber-700 dark:text-amber-300",
    iconClass: "text-amber-600 dark:text-amber-300",
    ornamentClass: "from-amber-200/10 via-transparent to-orange-950/20",
    desktopParticles: 0,
  },
  prata: {
    surface: "from-slate-300 via-zinc-500 to-slate-700",
    border: "border-slate-300/70",
    glow: "shadow-[0_10px_30px_rgba(148,163,184,0.28)]",
    winSurface: "bg-gradient-to-br from-slate-200 via-zinc-400 to-slate-700 text-slate-950",
    optionClass: "border-slate-400/50 bg-gradient-to-br from-slate-300/10 via-card to-zinc-700/10",
    badgeClass: "border-slate-400/50 bg-slate-400/15 text-slate-700 dark:text-slate-200",
    iconClass: "text-slate-500 dark:text-slate-200",
    ornamentClass: "from-white/25 via-transparent to-slate-900/20",
    desktopParticles: 2,
  },
  ouro: {
    surface: "from-yellow-300 via-amber-500 to-yellow-700",
    border: "border-amber-300/80 ring-1 ring-amber-300/30",
    glow: "shadow-[0_0_36px_rgba(245,158,11,0.34)]",
    winSurface: "bg-gradient-to-br from-yellow-200 via-amber-400 to-yellow-700 text-amber-950",
    optionClass:
      "border-amber-400/60 bg-gradient-to-br from-amber-300/10 via-card to-yellow-700/10 shadow-[0_10px_35px_rgba(245,158,11,0.10)]",
    badgeClass: "border-amber-400/50 bg-amber-400/15 text-amber-700 dark:text-amber-200",
    iconClass: "text-amber-500 dark:text-amber-200",
    ornamentClass: "from-yellow-100/30 via-transparent to-amber-900/20",
    desktopParticles: 4,
  },
  diamante: {
    surface: "from-cyan-200 via-sky-400 to-indigo-700",
    border: "border-cyan-200/80 ring-1 ring-cyan-200/40",
    glow: "shadow-[0_0_42px_rgba(34,211,238,0.34)]",
    winSurface: "bg-gradient-to-br from-cyan-100 via-sky-300 to-indigo-600 text-slate-950",
    optionClass:
      "border-cyan-300/60 bg-gradient-to-br from-cyan-200/10 via-card to-indigo-700/10 shadow-[0_10px_35px_rgba(34,211,238,0.12)]",
    badgeClass: "border-cyan-300/50 bg-cyan-300/15 text-cyan-700 dark:text-cyan-200",
    iconClass: "text-cyan-500 dark:text-cyan-200",
    ornamentClass: "from-white/35 via-cyan-100/10 to-indigo-950/20",
    desktopParticles: 8,
  },
  misteriosa: {
    surface: "from-violet-950 via-fuchsia-700 to-indigo-950",
    border: "border-fuchsia-400/70 ring-1 ring-violet-400/40",
    glow: "shadow-[0_0_44px_rgba(168,85,247,0.38)]",
    winSurface: "bg-gradient-to-br from-violet-950 via-fuchsia-700 to-indigo-950 text-white",
    optionClass:
      "border-fuchsia-500/50 bg-gradient-to-br from-violet-950/20 via-card to-fuchsia-950/20 shadow-[0_12px_40px_rgba(168,85,247,0.16)]",
    badgeClass: "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200",
    iconClass: "text-fuchsia-500 dark:text-fuchsia-200",
    ornamentClass: "from-fuchsia-200/25 via-transparent to-violet-950/30",
    desktopParticles: 6,
  },
};

type Props = {
  prize: number;
  pointsEarned: number;
  onReset: () => void;
  rarity: ScratchRarity;
  visualRarity?: ScratchVisualRarity;
  resetLabel?: string;
};

export function ScratchCard({
  prize,
  pointsEarned,
  onReset,
  rarity,
  visualRarity = rarity,
  resetLabel = "Jogar Novamente",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const revealedRef = useRef(false);
  const progressFrame = useRef<number | null>(null);
  const lastProgressCheck = useRef(0);
  const [revealed, setRevealed] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const won = prize > 0 || pointsEarned > 0;
  const theme = scratchRarityPresentation[visualRarity];

  const playRevealSound = () => {
    if (!soundOn || !("AudioContext" in window)) return;
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    oscillator.frequency.value = won ? 660 : 220;
    oscillator.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.08);
    oscillator.addEventListener("ended", () => void audio.close(), { once: true });
  };

  const revealResult = () => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    playRevealSound();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#9CA3AF";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#374151";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RASPE AQUI", width / 2, height / 2);

    revealedRef.current = false;
    setRevealed(false);
    lastProgressCheck.current = 0;

    return () => {
      if (progressFrame.current !== null) cancelAnimationFrame(progressFrame.current);
      progressFrame.current = null;
    };
  }, [prize, pointsEarned]);

  const checkProgress = () => {
    if (revealedRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let cleared = 0;
    for (let i = 3; i < data.length; i += 4 * 40) {
      if (data[i] === 0) cleared++;
    }
    const total = data.length / (4 * 40);
    if (total > 0 && cleared / total > 0.5) revealResult();
  };

  const scheduleProgressCheck = () => {
    if (revealedRef.current || progressFrame.current !== null) return;
    progressFrame.current = requestAnimationFrame((now) => {
      progressFrame.current = null;
      if (now - lastProgressCheck.current < 120) return;
      lastProgressCheck.current = now;
      checkProgress();
    });
  };

  const scratch = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || revealedRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 20, 0, Math.PI * 2);
    ctx.fill();
    scheduleProgressCheck();
  };

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        data-testid="scratch-result-card"
        data-visual-rarity={visualRarity}
        className={`relative h-[150px] w-full max-w-[300px] overflow-hidden rounded-xl border bg-gradient-to-br ${theme.surface} ${theme.border} ${theme.glow}`}
      >
        <div
          aria-hidden
          data-effect-tier="mobile"
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${theme.ornamentClass}`}
        />
        <div
          aria-hidden
          data-effect-tier="desktop"
          className="pointer-events-none absolute -right-10 -top-14 hidden size-32 rotate-12 rounded-[2rem] border border-white/25 bg-white/10 blur-[1px] sm:block"
        />
        <div
          aria-hidden
          data-effect-tier="desktop"
          className="pointer-events-none absolute -bottom-16 -left-8 hidden size-28 rotate-45 rounded-[2rem] border border-white/15 bg-black/10 sm:block"
        />

        {revealed && won && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden motion-reduce:hidden"
          >
            {[...Array(4)].map((_, i) => (
              <span
                key={`mobile-${i}`}
                data-effect-tier="mobile"
                className="absolute size-2 rounded-full bg-white/80 motion-safe:animate-ping"
                style={{
                  left: `${(i * 23 + 11) % 92}%`,
                  top: `${(i * 31 + 9) % 82}%`,
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
            {[...Array(theme.desktopParticles)].map((_, i) => (
              <span
                key={`desktop-${i}`}
                data-effect-tier="desktop"
                className="absolute hidden size-2 rounded-full bg-white/80 motion-safe:animate-ping sm:block"
                style={{
                  left: `${(i * 17 + 7) % 94}%`,
                  top: `${(i * 29 + 5) % 84}%`,
                  animationDelay: `${(i + 4) * 90}ms`,
                }}
              />
            ))}
          </div>
        )}
        <div
          aria-hidden={!revealed}
          aria-live={revealed ? "polite" : undefined}
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 ${
            won ? theme.winSurface : "bg-destructive text-destructive-foreground"
          }`}
        >
          {won ? (
            <>
              <Sparkles className="size-7" />
              {prize > 0 ? (
                <span className="text-3xl font-black">{formatBRL(prize)}</span>
              ) : (
                <span className="text-3xl font-black">+{pointsEarned} pontos</span>
              )}
              <span className="text-xs font-medium opacity-90">
                {prize > 0 && pointsEarned > 0
                  ? `Você ganhou também +${pointsEarned} pontos!`
                  : prize > 0
                    ? "Você ganhou créditos!"
                    : "Você ganhou pontos!"}
              </span>
            </>
          ) : (
            <>
              <Frown className="size-7" />
              <span className="text-xl font-bold">Não foi dessa vez</span>
              <span className="text-xs font-medium opacity-90">Tente novamente</span>
            </>
          )}
          {prize > 0 && pointsEarned > 0 && (
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-90">
              +{pointsEarned} pontos
            </span>
          )}
        </div>
        <canvas
          ref={canvasRef}
          aria-label="Área de raspagem. Use o dedo ou mouse para revelar o resultado, ou use o botão Revelar resultado."
          role="img"
          className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-300 motion-reduce:transition-none ${
            revealed ? "pointer-events-none opacity-0" : "cursor-grab active:cursor-grabbing"
          }`}
          onPointerDown={(event) => {
            drawing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            scratch(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (drawing.current) scratch(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            drawing.current = false;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
      </div>
      {!revealed && (
        <Button variant="secondary" onClick={revealResult} className="w-full max-w-[300px]">
          <Eye className="size-4" /> Revelar resultado
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSoundOn((value) => !value)}
        aria-pressed={soundOn}
      >
        {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} Som{" "}
        {soundOn ? "ligado" : "desligado"}
      </Button>
      <Button variant="outline" onClick={onReset} className="w-full max-w-[300px]">
        <RotateCcw className="size-4" /> {resetLabel}
      </Button>
    </div>
  );
}
