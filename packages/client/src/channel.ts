import type { Unsubscribe } from "./store";

export interface Channel<T> {
  emit(value: T): void;
  on(handler: (value: T) => void): Unsubscribe;
}

export function channel<T>(): Channel<T> {
  const handlers = new Set<(value: T) => void>();
  return {
    emit(value) {
      for (const handler of [...handlers]) handler(value);
    },
    on(handler) {
      const subscription = (value: T) => handler(value);
      handlers.add(subscription);
      return () => handlers.delete(subscription);
    },
  };
}
