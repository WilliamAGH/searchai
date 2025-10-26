import { describe, it, expect } from "vitest";
import { setupConvexReactMock } from "../utils/convexReactMock";

describe("convex/react mock harness", () => {
  it("mocks useQuery and useAction with provided implementations", async () => {
    setupConvexReactMock({
      queryImpl: (name, args) => ({ name, args }),
      actionImpl: async (name, args) => ({ ok: true, name, args }),
    });

    // Import after mocking so that the mock takes effect
    const convexReact = await import("convex/react");
    const { useQuery, useAction } = convexReact as any;

    const q = useQuery("api.test.query", { foo: 1 });
    expect(q).toMatchObject({ name: "api.test.query", args: { foo: 1 } });

    const act = useAction("api.test.action");
    const res = await act({ bar: 2 });
    expect(res).toMatchObject({
      ok: true,
      name: "api.test.action",
      args: { bar: 2 },
    });
  });
});
