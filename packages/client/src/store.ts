/** Stops a subscription or hook. */
export type Unsubscribe = () => void;

/**
 * A value you can read at any time and subscribe to for changes.
 *
 * `subscribe` calls `fn` at once with the current value and again on every change. Both
 * methods are bound, so `useSyncExternalStore(store.subscribe, store.get)` works as is,
 * and `get()` returns the same object until the value changes.
 */
export interface Store<T> {
  subscribe(fn: (value: T) => void): Unsubscribe;
  get(): T;
}

export interface Writable<T> extends Store<T> {
  set(value: T): void;
}

export function writable<T>(initial: T, onFirstSubscribe?: () => void): Writable<T> {
  let value = initial;
  const subscribers = new Set<(value: T) => void>();
  return {
    subscribe(fn) {
      const subscriber = (next: T) => fn(next);
      subscribers.add(subscriber);
      if (subscribers.size === 1) onFirstSubscribe?.();
      subscriber(value);
      return () => subscribers.delete(subscriber);
    },
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const subscriber of [...subscribers]) subscriber(value);
    },
  };
}

export const readonly = <T>({ subscribe, get }: Store<T>): Store<T> => ({ subscribe, get });
