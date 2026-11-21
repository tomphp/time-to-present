import type { Unsubscribe } from "./store";

export interface Channel<T> {
  emit(value: T): void;
  on(handler: (value: T) => void): Unsubscribe;
  readonly size: number;
}

/** Calls `handler`, reporting what it throws so the handlers after it still run. */
export function deliver<T>(handler: (value: T) => void, value: T) {
  try {
    handler(value);
  } catch (error) {
    report(error);
  }
}

const report = (error: unknown) => {
  if (typeof reportError === "function") reportError(error);
  else
    queueMicrotask(() => {
      throw error;
    });
};

export function channel<T>(): Channel<T> {
  const handlers = new Set<(value: T) => void>();
  return {
    emit(value) {
      for (const handler of [...handlers]) deliver(handler, value);
    },
    on(handler) {
      const subscription = (value: T) => handler(value);
      handlers.add(subscription);
      return () => handlers.delete(subscription);
    },
    get size() {
      return handlers.size;
    },
  };
}
