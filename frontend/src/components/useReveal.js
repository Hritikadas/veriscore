import { useEffect, useRef } from "react";

const SAFETY_MS = 700;

export default function useReveal() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || !("IntersectionObserver" in window)) {
      el.classList.add("revealed");
      return;
    }

    // Hidden only while pending AND would otherwise never show:
    // a safety timer guarantees content can never sit invisible.
    el.classList.add("reveal-pending");

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove("reveal-pending");
            entry.target.classList.add("revealed");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );

    io.observe(el);

    const timer = setTimeout(() => {
      el.classList.remove("reveal-pending");
      el.classList.add("revealed");
    }, SAFETY_MS);

    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, []);

  return ref;
}