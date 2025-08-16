/**
 * Helper functions for testing Convex actions and mutations
 * Provides mock context and utilities for testing
 */

import { vi } from "vitest";

/**
 * Create a mock Convex action context
 */
export function createMockActionContext() {
  return {
    runQuery: vi.fn().mockImplementation(async () => {
      // Default to returning empty arrays for queries
      return [];
    }),
    runMutation: vi.fn(),
    runAction: vi.fn(),
    scheduler: {
      runAfter: vi.fn(),
      runAt: vi.fn(),
    },
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(null),
    },
  };
}

/**
 * Create a mock Convex mutation context
 */
export function createMockMutationContext() {
  return {
    db: {
      query: vi.fn().mockReturnThis(),
      get: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
    },
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(null),
    },
    scheduler: {
      runAfter: vi.fn(),
      runAt: vi.fn(),
    },
  };
}

/**
 * Create a mock Convex query context
 */
export function createMockQueryContext() {
  return {
    db: {
      query: vi.fn().mockReturnThis(),
      get: vi.fn(),
    },
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(null),
    },
  };
}

/**
 * Wrapper to call Convex actions in tests
 * Automatically provides a mock context as the first argument
 */
export async function callAction<T extends (...args: any[]) => any>(
  action: T,
  args: Parameters<T>[1],
  contextOverrides?: Partial<ReturnType<typeof createMockActionContext>>,
): Promise<ReturnType<T>> {
  const context = {
    ...createMockActionContext(),
    ...contextOverrides,
  };

  // Extract the handler from the action definition
  const handler = (action as any).handler;
  if (!handler) {
    throw new Error("Invalid action: missing handler");
  }

  return handler(context, args);
}

/**
 * Wrapper to call Convex mutations in tests
 */
export async function callMutation<T extends (...args: any[]) => any>(
  mutation: T,
  args: Parameters<T>[1],
  contextOverrides?: Partial<ReturnType<typeof createMockMutationContext>>,
): Promise<ReturnType<T>> {
  const context = {
    ...createMockMutationContext(),
    ...contextOverrides,
  };

  const handler = (mutation as any).handler;
  if (!handler) {
    throw new Error("Invalid mutation: missing handler");
  }

  return handler(context, args);
}

/**
 * Wrapper to call Convex queries in tests
 */
export async function callQuery<T extends (...args: any[]) => any>(
  query: T,
  args: Parameters<T>[1],
  contextOverrides?: Partial<ReturnType<typeof createMockQueryContext>>,
): Promise<ReturnType<T>> {
  const context = {
    ...createMockQueryContext(),
    ...contextOverrides,
  };

  const handler = (query as any).handler;
  if (!handler) {
    throw new Error("Invalid query: missing handler");
  }

  return handler(context, args);
}
