import { useEffect, useRef, useState } from "react";
import { Sparkles, Frown, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/hooks/useProfile";

type Props = {
  prize: number;
  pointsEarned: number;
  onReset: () => void;
  rarity?: "bronze" | "prata" | "ouro" | "diamante";
};

export function ScratchCard({ prize, pointsEarned, onReset, rarity = "bronze" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const won = prize > 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#9CA3AF";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#374151";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RASPE AQUI", width / 2, height / 2);
    setRevealed(false);
  }, [prize, pointsEarned]);

  const scratch = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 20, 0, Math.PI * 2);
    ctx.fill();
    checkProgress();
  };

  const checkProgress = () => {
    if (revealed) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let cleared = 0;
    for (let i = 3; i < data.length; i += 4 * 40) {
      if (data[i] === 0) cleared++;
    }
    const total = data.length / (4 * 40);
    if (cleared / total > 0.5) {
      setRevealed(true);
      if (soundOn && "AudioContext" in window) {
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        oscillator.frequency.value = won ? 660 : 220;
        oscillator.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.08);
      }
    }
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
            {[...Array(rarity === "diamante" ? 16 : prize > 0 ? 8 : 0)].map((_, i) => (
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
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 ${
            won
              ? "bg-success text-success-foreground"
              : "bg-destructive text-destructive-foreground"
          }`}
        >
          {won ? (
            <>
              <Sparkles className="size-7" />
              <span className="text-3xl font-black">{formatBRL(prize)}</span>
              <span className="text-xs font-medium opacity-90">Você ganhou!</span>
            </>
          ) : (
            <>
              <Frown className="size-7" />
              <span className="text-xl font-bold">Não foi dessa vez</span>
              <span className="text-xs font-medium opacity-90">Tente novamente</span>
            </>
          )}
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-90">
            +{pointsEarned} pontos
          </span>
        </div>
        <canvas
          ref={canvasRef}
          aria-label="Área de raspagem. Use o dedo ou mouse para revelar o resultado."
          role="img"
          className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-300 ${
            revealed ? "pointer-events-none opacity-0" : "cursor-grab"
          }`}
          onMouseDown={() => (drawing.current = true)}
          onMouseUp={() => (drawing.current = false)}
          onMouseLeave={() => (drawing.current = false)}
          onMouseMove={(e) => {
            if (drawing.current) scratch(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) scratch(t.clientX, t.clientY);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (t) scratch(t.clientX, t.clientY);
          }}
        />
      </div>
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
        <RotateCcw className="size-4" /> Jogar Novamente
      </Button>
    </div>
  );
}
