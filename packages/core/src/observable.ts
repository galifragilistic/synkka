import type { Observable } from './types';

/** Holds a value and notifies subscribers (emits current value on subscribe). */
export class Store<T> implements Observable<T> {
  private listeners = new Set<(value: T) => void>();

  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    for (const l of [...this.listeners]) l(value);
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    listener(this.value);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** Derived observable: maps a source store, recomputing on every change. */
export function map<A, B>(source: Observable<A>, fn: (a: A) => B): Observable<B> {
  return {
    subscribe(listener) {
      return source.subscribe((a) => listener(fn(a)));
    },
  };
}
