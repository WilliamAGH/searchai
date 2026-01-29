import { vi } from "vitest";

type QueryArgs = Record<string, unknown> | "skip";

/**
 * Setup a minimal vi.mock for `convex/react` with custom query/action impls.
 * Import code-under-test after calling this to ensure the mock is applied.
 */
export function setupConvexReactMock(options?: {
  queryImpl?: (name: string, args: QueryArgs) => unknown;
  actionImpl?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}) {
  const queryImplFn =
    options?.queryImpl || ((name: string, _args: QueryArgs) => ({ mocked: name }));
  const actionImplFn =
    options?.actionImpl ||
    (async (name: string, _args: Record<string, unknown>) => ({
      mocked: name,
    }));

  // Use doMock to avoid hoisting so our closures are initialized
  vi.doMock("convex/react", () => {
    return {
      useQuery: (name: unknown, args: QueryArgs) =>
        queryImplFn(typeof name === "string" ? name : "mock.query", args),
      useAction: (name: unknown) => (args: Record<string, unknown>) =>
        actionImplFn(typeof name === "string" ? name : "mock.action", args),
    } as const;
  });
}
