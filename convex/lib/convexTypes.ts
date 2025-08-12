// CRITICAL: This is the ONLY place we reference generated types
// All other files import from here, NEVER directly from _generated

// Re-export Convex generated types - NEVER redefine
export type { Doc, Id } from "../_generated/dataModel";
export { api, internal } from "../_generated/api";

// DO NOT create any custom types that duplicate Convex types
// DO NOT define _id, _creationTime or any system fields

// IMPORTANT: Any file that needs Convex types should import from this file:
// import { Doc, Id } from "./lib/convexTypes";
// import { api } from "./lib/convexTypes";

// This ensures we have a single source of truth and can easily
// track/update type imports if the Convex structure changes
