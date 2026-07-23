// ===== ANIMATED PARTICLES BACKGROUND =====
(function() {
  const canvas = document.createElement('canvas');
  canvas.id = 'dltv-particles';
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const COLORS = ['#818cf8','#a5b4fc','#93c5fd','#c4b5fd','#86efac','#fca5a5','#fcd34d'];
  const particles = Array.from({length: 22}, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: 3 + Math.random() * 5,
    dx: (Math.random() - 0.5) * 0.5,
    dy: (Math.random() - 0.5) * 0.5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: 0.12 + Math.random() * 0.18,
  }));

  // Also add large soft blobs
  const blobs = Array.from({length: 5}, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: 120 + Math.random() * 180,
    dx: (Math.random() - 0.5) * 0.25,
    dy: (Math.random() - 0.5) * 0.25,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw blobs
    blobs.forEach(b => {
      b.x += b.dx; b.y += b.dy;
      if (b.x < -b.r) b.x = canvas.width + b.r;
      if (b.x > canvas.width + b.r) b.x = -b.r;
      if (b.y < -b.r) b.y = canvas.height + b.r;
      if (b.y > canvas.height + b.r) b.y = -b.r;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.color + '22');
      g.addColorStop(1, b.color + '00');
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    });

    // Draw particles
    particles.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.alpha * 255).toString(16).padStart(2,'0');
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
})();

