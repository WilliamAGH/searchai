---
title: "Data Model Contract"
usage: "Reference when creating new data types, schemas, or props"
description: "Rules for defining data shapes, enforcing SRP, and separating core domain objects from UI state"
---

# Data Model Contract

See `AGENTS.md` ([DM1]).

## Core Principles

1.  **Single Source of Truth**: Data shapes crossing system boundaries (API, DB, shared logic) must be defined exactly once.
2.  **Explicit Validation**: All shared data objects must have runtime validation (Zod).
3.  **Strict Separation**: Domain entities are distinct from UI props.

## [DM1] Data Declaration Rules

### [DM1a] Core Data Objects (DTOs/Entities)

- **Location**: `convex/schemas/<domain>.ts`
- **Format**: Defined as Zod schemas (`z.object(...)`).
- **Export**: Must export the inferred type via `z.infer`.
- **Prohibited**: Do NOT manually define `interface` or `type` that duplicates the schema.
- **Reason**: Ensures the runtime validator and compile-time type never drift.

```typescript
// CORRECT: convex/schemas/user.ts
import { z } from "zod/v4";

export const UserSchema = z.object({
  username: z.string(),
  role: z.enum(["admin", "user"]),
});

export type User = z.infer<typeof UserSchema>;
```

```typescript
// WRONG: convex/lib/types/user.ts
export interface User {
  username: string;
  role: "admin" | "user";
}
```

### [DM1b] Constants & Enums

- **Location**: `convex/lib/constants/<domain>.ts`
- **Usage**: Import these constants into schemas and validators to ensure they share the same values.

```typescript
// convex/lib/constants/roles.ts
export const USER_ROLES = ["admin", "user"] as const;
```

### [DM1c] Component Props & UI State

- **Location**: Co-located in the component file (`.tsx` or `.ts`).
- **Format**: `interface Props { ... }` or `type Props = { ... }`.
- **Prohibited**: Do not export props from a central `types/` folder.
- **Reason**: UI props are coupled to the component's implementation (SRP).

```typescript
// CORRECT: src/components/UserCard.tsx
import { User } from "convex/schemas/user";

interface UserCardProps {
  user: User;
  onEdit: () => void;
}

export function UserCard({ user, onEdit }: UserCardProps) { ... }
```

### [DM1d] Convex Database Schema

- **Location**: `convex/schema.ts`
- **Format**: Convex `defineSchema` / `defineTable`.
- **Helpers**: May use validators from `convex/lib/validators.ts` (which should mirror Zod schemas where applicable).

### [DM1e] No "Types" Barrels

- **Rule**: Directories named `types/` that contain manual interfaces for core domain objects are **forbidden**.
- **Exception**: `src/lib/types/` is allowed ONLY for truly frontend-specific mapped types (e.g., UI state unions) that do not exist in the backend. If it mirrors a backend object, use the schema.
