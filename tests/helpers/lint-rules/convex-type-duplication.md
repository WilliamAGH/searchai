Convex type duplication lint rule (plan)

- Goal: Flag manual type definitions for Convex DB entities and generated types.
- Strategy: Add a lightweight script to scan for forbidden patterns in `convex/http/**` and `src/**`:
  - `interface\s+([A-Z][A-Za-z0-9]+)\s*\{` combined with fields like `_id`, `_creationTime`.
  - Imports from `convex/_generated/dataModel` re-exported from non-generated files.
  - Re-export files like `convex/lib/convexTypes.ts`.
- Implementation: Node script under `scripts/check-convex-imports.cjs` (already exists) to be extended with additional regex checks.
- CI: Ensure script runs in `npm run validate`.
