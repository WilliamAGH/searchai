---
title: "SDK Integration Patterns"
description: "Patterns for OpenAI Agents SDK and similar third-party library integration"
usage: "Reference when working in convex/agents/**/*.ts files"
---

# SDK Integration Patterns

See `AGENTS.md` for rule definitions. This document explains HOW and WHY to follow the rules.

## OpenAI Agents SDK Tool Type Annotations

### Rationale

The OpenAI Agents SDK has specific type constraints that make the standard `unknown` type incompatible:

1. **TParameters constraint**: `FunctionTool` has `TParameters extends ToolInputParameters` where `ToolInputParameters = undefined | ZodObject<any> | JsonObjectSchema<any>`. The type `unknown` does NOT satisfy this constraint.

2. **Context contravariance**: The `invoke()` function parameter creates contravariance on the Context type. `FunctionTool<SpecificContext, ...>` is not assignable to `FunctionTool<unknown, ...>`.

3. **Circular type inference**: Complex `execute` functions with async/conditional returns create circular type inference (TS7022), requiring explicit annotations.

### Why `any` Is Required (Exception to [TY1a])

The `any` type is bivariant in TypeScript — assignable to and from any type. This is the only way to satisfy the SDK's generic constraints while maintaining compatibility with `Agent.create()`.

This is **documented SDK behavior**, not a workaround. The SDK's own `Tool` type uses `any`:

```typescript
// From @openai/agents-core/dist/tool.d.ts
export type Tool<Context = unknown> = FunctionTool<Context, any, any> | ComputerTool | HostedTool;
```

### Correct Pattern

```typescript
import { tool } from "@openai/agents";
import type { FunctionTool, Tool } from "@openai/agents";

// Individual tool — use FunctionTool<any, any, unknown>
// prettier-ignore
export const myTool: FunctionTool<any, any, unknown> = tool({ // eslint-disable-line @typescript-eslint/no-explicit-any
  name: "my_tool",
  description: "...",
  parameters: z.object({ /* ... */ }),
  execute: async (input, ctx) => { /* ... */ },
});

// Tool array — use Tool[] for Agent.create() compatibility
export const toolsList: Tool[] = [myTool, otherTool];
```

### Incorrect Patterns

```typescript
// WRONG: unknown violates TParameters constraint
export const myTool: FunctionTool<unknown, unknown, unknown> = tool({...});

// WRONG: Circular inference without annotation
export const myTool = tool({...}); // TS7022 error

// WRONG: Tool<SpecificContext> not assignable to Tool[]
export const toolsList: Tool<MyContext>[] = [...]; // Won't satisfy Agent.create()
```

### References

- [OpenAI Agents JS Tools Guide](https://openai.github.io/openai-agents-js/guides/tools)
- [Tool Type Definition](https://openai.github.io/openai-agents-js/openai/agents-core/type-aliases/tool)
- Canonical implementation: `convex/agents/tools.ts`

## Zod Version Boundary

### Rationale

The `@openai/agents` package has a peer dependency on Zod v3. Tool parameter schemas passed to `tool()` must use v3 Zod objects. The v4 compatibility layer (`zod/v4`) uses different internal types that may not serialize correctly for the SDK.

### Pattern

```typescript
// convex/agents/tools.ts
import { z } from "zod"; // v3 - required by @openai/agents

// All other files
import { z } from "zod/v4"; // v4 - project standard per [TY1c]
```
