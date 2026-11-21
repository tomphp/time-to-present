import { beforeEach, describe, expectTypeOf, it } from "vitest";
import { connect } from "../src";
import { fakeBrowser } from "./fake-browser";

type Events = { slide: { index: number }; flash: null };

beforeEach(() => {
  fakeBrowser();
});

describe("the Events map", () => {
  it("types onNamedEvent by name", () => {
    const client = connect<Events>();

    client.onNamedEvent("slide", (event) => expectTypeOf(event.data).toEqualTypeOf<{ index: number }>());
    client.onNamedEvent((event) => {
      if (event.name === "flash") expectTypeOf(event.data).toEqualTypeOf<null>();
    });
    // @ts-expect-error not a Named Event of the map
    client.onNamedEvent("fade", () => {});
  });

  it("types Fold reducers and the script", () => {
    const client = connect<Events>();

    client.fold(0, {
      slide: (_, event) => event.data.index,
      // @ts-expect-error a flash carries no index
      flash: (_, event) => event.data.index,
    });
    type ScriptEvent = NonNullable<ReturnType<typeof client.script.get>>["namedEvents"][number];
    expectTypeOf<ScriptEvent["name"]>().toEqualTypeOf<"slide" | "flash">();
  });

  it("leaves names as string and data as unknown without a map", () => {
    const client = connect();

    client.onNamedEvent((event) => {
      expectTypeOf(event.name).toEqualTypeOf<string>();
      expectTypeOf(event.data).toEqualTypeOf<unknown>();
    });
    client.fold(0, { anything: (count) => count + 1 });
  });
});
