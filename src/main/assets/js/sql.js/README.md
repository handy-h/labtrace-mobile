# sql.js Local Assets

This directory should contain the sql.js WebAssembly files for offline support.

## Required Files

Download from the [sql.js release page](https://github.com/sql-js/sql.js/releases) or copy from `node_modules/sql.js/dist/`:

1. `sql-wasm.js` — JavaScript loader
2. `sql-wasm.wasm` — WebAssembly binary

## Setup

```bash
# From project root, copy files:
cp node_modules/sql.js/dist/sql-wasm.js src/main/assets/js/sql.js/
cp node_modules/sql.js/dist/sql-wasm.wasm src/main/assets/js/sql.js/
```

## Fallback Behavior

If local files are not found, the app falls back to the CDN:
`https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/`

The CDN fallback requires network connectivity, so local assets are recommended
for production/offline use.
