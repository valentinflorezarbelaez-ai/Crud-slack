/**
 * CELEBRATION CONFETTI ENGINE (Pure Layer-0 Canvas 2D)
 * Triggers when board completion hits 100%.
 * Zero npm dependencies, self-cleans animation frame after 2.5s.
 */

export function fireConfettiCelebration() {
  if (typeof window === "undefined") return;
  const isReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (isReduced) return;

  const canvas = document.createElement("canvas");
  canvas.className = "confetti-overlay-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const colors = ["#4A154B", "#36C5F0", "#2EB67D", "#ECB22E", "#E01E5A", "#611f69"];
  const particleCount = 70;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: width * 0.5 + (Math.random() - 0.5) * 200,
      y: height * 0.4,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 10 - 4,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      opacity: 1
    });
  }

  const startTime = Date.now();
  const durationMs = 2400;

  function render() {
    const elapsed = Date.now() - startTime;
    if (elapsed >= durationMs) {
      canvas.remove();
      return;
    }

    ctx.clearRect(0, 0, width, height);
    const progress = elapsed / durationMs;
    const globalFade = 1 - progress;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.rotation += p.rotSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, globalFade * p.opacity);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}
