/**
 * Sends values one at a time; while a send is in flight only the latest value waits to go.
 * For values that each carry the whole state so far, like the steps of a drag. A failed send
 * is the sender's to report: the next value goes regardless.
 */
export function latestOnly<T>(send: (value: T) => Promise<unknown>) {
  let inFlight = false;
  let waiting: { value: T } | null = null;

  function sendNext(value: T) {
    inFlight = true;
    const next = () => {
      inFlight = false;
      const queued = waiting;
      waiting = null;
      if (queued) sendNext(queued.value);
    };
    send(value).then(next, next);
  }

  return (value: T) => {
    if (inFlight) waiting = { value };
    else sendNext(value);
  };
}
