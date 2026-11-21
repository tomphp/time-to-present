import { useSyncExternalStore } from "react";
import type { Client, Store } from "@time-to-present/client";
import type { Events } from "./script";

const useStore = <T,>(store: Store<T>) => useSyncExternalStore(store.subscribe, store.get);

export function Slides({ client, slides }: { client: Client<Events>; slides: string[] }) {
  const deck = useStore(client.fold(0, { slide: (_, event) => event.data.index }));
  return <h1 data-animate={deck.live}>{slides[deck.state]}</h1>;
}
