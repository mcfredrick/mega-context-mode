# mega-context-mode Enhancements

This fork extends [context-mode](https://github.com/mksglu/claude-context-mode) with three capabilities that go beyond per-session context reduction: a result cache, semantic search, and a persistent cross-session knowledge store.

## What Was Added

### 1. LRU Result Cache (`src/store.ts`)

`ContentStore.searchWithFallback()` now maintains an in-process LRU cache (Map-based, 200-entry capacity, O(1) eviction).

**How it works:**
- Every search result set is cached under a key of `query + limit + source`.
- On a cache hit, the entry is re-inserted at the end of the Map (LRU "touch").
- Any call to `#insertChunks` (i.e., any indexing operation) clears the entire cache to prevent stale results.

**Impact:** Repeated searches — common in `ctx_batch_execute` multi-query flows — skip SQLite entirely after the first call. Visible in `ctx_stats` under the **Knowledge & Cache** section.

### 2. Semantic Search via Synonym Expansion (`src/store.ts`)

**New method:** `ContentStore.searchSemantic(query, limit, source)`

**New function:** `expandQueryTerms(query)` (module-level) — maps query terms to domain synonyms using a hardcoded table (e.g. `error → exception, failure, crash`).

**How it works:**
1. Runs `searchWithFallback` on the original query (highest precision, fills slots first).
2. If fewer than `limit` results were found, runs `searchWithFallback` on the synonym-expanded query to fill remaining slots.
3. Deduplicates by `title+source` key.
4. Returns sorted by BM25 rank.

This improves recall when indexed content uses different vocabulary than the query — a common case when indexing CLAUDE.md, README, or past session notes.

### 3. Persistent Cross-Session Knowledge Store + 3 New MCP Tools (`src/server.ts`)

A second `ContentStore` instance is created at `~/.claude/context-mode/knowledge.db`. Unlike the per-process session store, this DB persists across Claude Code restarts.

#### `ctx_remember(content, source_label)`

Indexes arbitrary markdown or plain-text content into the persistent store. Use the same `source_label` to overwrite a previous entry.

```
ctx_remember(
  content: "## Auth decision\nWe use short-lived JWTs + refresh tokens...",
  source_label: "project:auth-decisions"
)
```

Bytes stored count toward `ctx_stats` context savings — future sessions retrieve only relevant sections rather than reloading the full content.

#### `ctx_recall(queries[], limit?)`

Searches the persistent knowledge store using `searchSemantic` (BM25 + synonym expansion). Falls back to the current session store when the knowledge store has no matches.

```
ctx_recall(queries: ["auth token strategy", "refresh token"], limit: 3)
```

#### `ctx_index_project(project_root?, force?)`

Auto-discovers and indexes standard project files into the persistent knowledge store:

| File | Source label |
|------|-------------|
| `CLAUDE.md` | `project:CLAUDE.md` |
| `.claude/CLAUDE.md` | `project:.claude/CLAUDE.md` |
| `README.md` | `project:README.md` |
| `package.json` | `project:package.json` |
| `pyproject.toml` | `project:pyproject.toml` |
| `Cargo.toml` | `project:Cargo.toml` |
| `go.mod` | `project:go.mod` |
| `CONTRIBUTING.md` | `project:CONTRIBUTING.md` |
| `ARCHITECTURE.md` | `project:ARCHITECTURE.md` |

Run once per project. After indexing, use `ctx_recall` to pull only the relevant sections of CLAUDE.md into context instead of loading the whole file. Pass `force: true` to refresh an existing index.

## Tracking with ctx_stats

All three enhancements surface in `ctx_stats` under a new **Knowledge & Cache** section:

```
### Knowledge & Cache

**Session store**

| Metric              | Value |
|---------------------|------:|
| Indexed sources     | 4     |
| Indexed chunks      | 31    |
| Search cache hits   | 12    |
| Search cache misses | 5     |
| Cache hit rate      | 71%   |
| Semantic expansions | 2     |

**Persistent knowledge store** (`~/.claude/context-mode/knowledge.db`)

| Metric          | Value |
|-----------------|------:|
| Sources indexed | 3     |
| Total chunks    | 47    |
| Code chunks     | 8     |
| Cache hits      | 4     |
| Cache hit rate  | 80%   |
```

**Cache hit rate** shows how often repeated searches skip SQLite. A high rate (>50%) in a long session indicates the cache is actively reducing query overhead.

**Semantic expansions** counts how many `ctx_recall` or `searchSemantic` calls found additional results via synonym expansion that the exact-match BM25 query would have missed.

## Recommended Workflow

```
# 1. Index project docs once (re-run with force: true to refresh)
ctx_index_project()

# 2. Search selectively per task — no full file loading
ctx_recall(queries: ["coding standards", "test requirements"])

# 3. Save session findings for future reference
ctx_remember(
  content: "## Debugging notes — 2026-03-07\n...",
  source_label: "debug:auth-service-2026-03"
)

# 4. Check savings
ctx_stats
```

## Files Changed

| File | Change |
|------|--------|
| `src/store.ts` | LRU cache, `getCacheStats()`, `getSemanticStats()`, `searchSemantic()`, `expandQueryTerms()`, `QUERY_SYNONYMS` |
| `src/server.ts` | `getKnowledgeStore()`, `ctx_remember`, `ctx_recall`, `ctx_index_project`, Knowledge & Cache section in `ctx_stats` |
| `skills/context-mode/SKILL.md` | New tools documented in routing instructions |
| `tests/mega-enhancements.test.ts` | 16 tests covering cache, semantic search, counters, persistent store |
