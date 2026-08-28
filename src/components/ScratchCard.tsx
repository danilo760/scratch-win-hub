import { useEffect, useRef, useState } from "react";
import { Sparkles, Frown, RotateCcw, Volume2, VolumeX, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/hooks/useProfile";

export type ScratchRarity = "bronze" | "prata" | "ouro" | "diamante";

type Props = {
  prize: number;
  pointsEarned: number;
  onReset: () => void;
  rarity: ScratchRarity;
  resetLabel?: string;
};

export function ScratchCard({
  prize,
  pointsEarned,
  onReset,
  rarity,
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

  const theme = {
    bronze: "from-amber-800 via-orange-700 to-amber-900",
    prata: "from-slate-400 via-zinc-500 to-slate-700",
    ouro: "from-amber-300 via-yellow-500 to-amber-700",
    diamante: "from-cyan-300 via-sky-500 to-indigo-700",
  }[rarity];

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        className={`relative h-[150px] w-full max-w-[300px] overflow-hidden rounded-xl border border-border bg-gradient-to-br ${theme} shadow-lg`}
      >
        {revealed && won && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
          >
            {[...Array(rarity === "diamante" ? 16 : 8)].map((_, i) => (
              <span
                key={i}
                className="absolute size-2 rounded-full bg-white/80 motion-safe:animate-ping"
                style={{
                  left: `${(i * 17) % 100}%`,
                  top: `${(i * 29) % 85}%`,
                  animationDelay: `${i * 90}ms`,
                }}
              />
            ))}
          </div>
        )}
        <div
          aria-hidden={!revealed}
          aria-live={revealed ? "polite" : undefined}
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 ${
            won
              ? "bg-success text-success-foreground"
              : "bg-destructive text-destructive-foreground"
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
