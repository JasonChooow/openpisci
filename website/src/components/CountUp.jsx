import React, { useEffect, useRef, useState } from 'react';

export default function CountUp({ value = 0, duration = 1400, suffix = '' }) {
  const ref = useRef(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setN(value);
          return;
        }
        let start;
        const tick = (t) => {
          if (start == null) start = t;
          const p = Math.min(1, (t - start) / duration);
          setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="num">
      {n.toLocaleString()}
      {suffix}
    </span>
  );
}
