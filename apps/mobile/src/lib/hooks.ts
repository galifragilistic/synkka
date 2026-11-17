import { tokens } from '@synkka/core';
import { useEffect, useRef, useState } from 'react';

export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Animates a number towards `target` with ease-out (works on native and web). */
export function useTween(target: number, duration: number = tokens.motion.durationMs): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  useEffect(() => {
    const from = valueRef.current;
    if (from === target) return;
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      valueRef.current = from + (target - from) * eased;
      setValue(valueRef.current);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
