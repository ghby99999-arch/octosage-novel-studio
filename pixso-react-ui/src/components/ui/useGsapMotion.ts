import { useEffect, useRef } from "react";
import gsap from "gsap";

export const useGsapReveal = <T extends HTMLElement>(delay = 0) => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 10, scale: 0.985 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.38, delay, ease: "power3.out" },
      );
    }, element);
    return () => context.revert();
  }, [delay]);

  return ref;
};

export const useGsapPulse = <T extends HTMLElement>(trigger: unknown) => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        element,
        { scale: 0.94 },
        { scale: 1, duration: 0.28, ease: "back.out(2)" },
      );
    }, element);
    return () => context.revert();
  }, [trigger]);

  return ref;
};
