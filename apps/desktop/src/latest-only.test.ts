import { describe, expect, it } from "vitest";
import { latestOnly } from "./latest-only";

function deferredSends() {
  const sent: number[] = [];
  const pending: (() => void)[] = [];
  const send = (value: number) => {
    sent.push(value);
    return new Promise<void>((resolve) => pending.push(resolve));
  };
  const settle = async () => {
    pending.shift()?.();
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { sent, send, settle };
}

describe("latestOnly", () => {
  it("sends at once when nothing is in flight", () => {
    const { sent, send } = deferredSends();
    latestOnly(send)(1);
    expect(sent).toEqual([1]);
  });

  it("while one is in flight, sends only the latest value once it lands", async () => {
    const { sent, send, settle } = deferredSends();
    const push = latestOnly(send);
    push(1);
    push(2);
    push(3);
    expect(sent).toEqual([1]);

    await settle();
    expect(sent).toEqual([1, 3]);
    await settle();
    expect(sent).toEqual([1, 3]);
  });

  it("goes on after a failed send", async () => {
    const sent: number[] = [];
    const push = latestOnly((value: number) => {
      sent.push(value);
      return Promise.reject(new Error("refused"));
    });
    push(1);
    push(2);
    await new Promise((resolve) => setTimeout(resolve));
    expect(sent).toEqual([1, 2]);
  });
});
