# ID Generation Strategy

## Overview

This document describes the ID generation strategy used throughout the SearchAI.io application, including the recent migration to UUID v7 for improved performance and standardization.

## ID Types in the Application

### 1. Convex Native IDs (Primary Keys)

- **Format**: Auto-generated strings containing `|` character (e.g., `jh7zmn5hf9p5n4mk67p4q6sc6d6x8fak|`)
- **Usage**: Primary keys for all Convex database documents
- **Type Safety**: `Id<TableName>` types from `convex/_generated/dataModel`
- **Generation**: Automatic by Convex when inserting documents
- **Benefits**:
  - Globally unique across the entire database
  - Type-safe with compile-time checking
  - Automatic indexing and optimization by Convex

### 2. Share IDs (UUID v7)

- **Format**: RFC 9562 UUID v7 (e.g., `0198a740-2c7a-7283-b2f8-a5c0cc94fc51`)
- **Usage**: Public shareable links for chats
- **Generation**: `generateShareId()` from `convex/lib/uuid.ts`
- **Benefits**:
  - Time-sortable for chronological ordering
  - URL-safe and universally recognized format
  - Can be generated client-side if needed

### 3. Public IDs (UUID v7)

- **Format**: RFC 9562 UUID v7
- **Usage**: Public-facing chat identifiers
- **Generation**: `generatePublicId()` from `convex/lib/uuid.ts`
- **Benefits**: Same as Share IDs

### 4. Session IDs (UUID v7)

- **Format**: RFC 9562 UUID v7
- **Usage**: Anonymous user session tracking
- **Generation**: Direct `uuidv7()` or `generateSessionId()`
- **Storage**: localStorage with key `searchai:anonymousSessionId`
- **Benefits**:
  - Allows reconnection to chats for unauthenticated users
  - Time-based for session analytics

## UUID v7 Implementation Details

### Why UUID v7?

1. **Time-Sortable**: First 48 bits contain millisecond timestamp
2. **Better Indexing**: Sequential IDs improve B-tree index locality
3. **Collision Resistant**: 74 bits of cryptographic randomness
4. **Standard Compliant**: RFC 9562 (May 2024)
5. **Monotonic**: Even with clock skew, maintains ordering

### Package Selection

We use the `uuidv7` npm package instead of the generic `uuid` package:

- **Size**: 6KB vs 20KB (3x smaller)
- **Purpose-Built**: Optimized specifically for UUID v7
- **Performance**: Faster generation with less overhead

### Implementation Locations

#### Backend (Convex)

```typescript
// convex/lib/uuid.ts
import { uuidv7 } from "uuidv7";

export function generateShareId(): string {
  return uuidv7();
}

export function generatePublicId(): string {
  return uuidv7();
}

export function generateSessionId(): string {
  return uuidv7();
}

export function generateOpaqueId(): string {
  return uuidv7();
}
```

#### Frontend

```typescript
// src/lib/utils/uuid.ts
import { uuidv7 } from "uuidv7";

export function generateUuidV7(): string {
  return uuidv7();
}

export function isValidUuidV7(id: string): boolean {
  const uuidV7Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV7Pattern.test(id);
}

export function getTimestampFromUuidV7(id: string): Date | null {
  // Extract timestamp from first 48 bits
  // ...
}
```

## Migration Strategy

### Backward Compatibility

- **Existing IDs**: All legacy IDs remain unchanged
- **Dual Support**: System handles both old format and UUID v7
- **No Forced Migration**: No need to update existing data

### New ID Generation

- All new share IDs use UUID v7
- All new public IDs use UUID v7
- All new session IDs use UUID v7
- Convex native IDs remain unchanged (managed by Convex)

### Conflict Resolution

When importing or migrating chats:

1. Attempt to preserve existing IDs if valid
2. Generate new UUID v7 if conflict detected
3. Maintain mapping of old ID to new ID

## Usage Guidelines

### When to Use Each ID Type

1. **Convex Native IDs (`Id<T>`)**

   - Database relations and foreign keys
   - Internal API calls between Convex functions
   - Type-safe operations requiring compile-time checking

2. **UUID v7 (Share/Public/Session)**
   - External-facing identifiers
   - URLs and shareable links
   - Client-side generated identifiers
   - Session tracking for anonymous users

### Best Practices

1. **Never manually create Convex IDs** - Let Convex generate them
2. **Use type-safe `Id<T>` types** - Never use plain strings for Convex IDs
3. **Validate UUID v7 format** - Use `isValidUuidV7()` when accepting external IDs
4. **Preserve IDs during migration** - Only regenerate if conflicts occur

## Performance Considerations

### UUID v7 Benefits

- **Index Performance**: Time-sortable IDs cluster related data in B-tree indexes
- **Cache Locality**: Sequential IDs improve cache hit rates
- **Query Performance**: Chronological ordering without additional timestamp index

### Storage Impact

- UUID v7: 36 characters (with hyphens)
- Convex IDs: Variable length (typically 32-40 characters)
- Both stored as strings in Convex database

## Security Considerations

1. **UUID v7 includes timestamp**: Be aware that creation time can be extracted
2. **Not suitable for secrets**: UUIDs are designed to be shared
3. **Cryptographic randomness**: 74 bits prevents prediction of future IDs
4. **No user data encoding**: IDs contain no personal information

## Future Enhancements

1. **ID Compression**: Consider base62 encoding for shorter URLs
2. **Vanity IDs**: Support custom prefixes for branded links
3. **ID Analytics**: Track ID usage patterns for optimization
4. **Migration Tools**: Automated tools for bulk ID updates

## References

- [RFC 9562 - Universally Unique IDentifiers (UUID)](https://datatracker.ietf.org/doc/html/rfc9562)
- [UUID v7 Specification](https://datatracker.ietf.org/doc/html/rfc9562#name-uuid-version-7)
- [uuidv7 npm package](https://www.npmjs.com/package/uuidv7)
- [Convex Document IDs](https://docs.convex.dev/database/document-ids)
