# AGENTS.md

## Project Overview

Labtrace Mobile is a **hybrid Android application** for managing medical examination (checklist) data. It uses a **WebView + HTML5 + SQLite (sql.js WASM)** architecture — the Android layer is a thin WebView wrapper; all business logic lives in vanilla JavaScript running in the browser context.

**Primary language**: Chinese (zh-CN) UI and data. All source comments, UI text, variable names for domain concepts, and documentation are in Chinese.

**Package**: `com.labtrace.app` | **minSdk**: 24 | **targetSdk**: 34 | **Java**: 11

---

## Essential Commands

```bash
# Install JS dependencies (required before tests)
npm install

# Run all tests
npm test

# Run specific test suites
npm run test:database     # Database module tests
npm run test:app          # App/UI logic tests
npm run test:integration  # Integration tests

# Development server (browser testing)
python -m http.server 8080
# Then open http://localhost:8080

# Coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

**Android build** requires Android Studio or manual Gradle setup (see `BUILD_GUIDE.md`). There is no `npm run build` for the Android APK — it's either Android Studio or Cordova CLI:
```bash
# Cordova path (in labtrace-android/ directory)
cordova platform add android
cordova build android
```

---

## Architecture

### Layer Structure

```
┌──────────────────────────────────┐
│  Android WebView (Java)          │  Thin wrapper — file picker, JS bridge, permissions
│  src/main/java/.../MainActivity  │  Exposes "Android" JS interface (readFileAsBase64, showToast)
│  AndroidWebView.java (root)      │  Duplicate/alternate of MainActivity (same content)
├──────────────────────────────────┤
│  Web App (HTML/CSS/JS)           │  All business logic lives here
│  src/main/assets/                │  Loaded via file:///android_asset/index.html
│  ├── index.html                  │  Single-page app with tab navigation
│  ├── css/style.css               │  Mobile-first CSS with CSS custom properties
│  ├── js/database.js              │  LabtraceDB class — SQLite via sql.js WASM
│  ├── js/app.js                   │  LabtraceApp class — UI logic, event handling
│  └── js/index.js                 │  Cordova bootstrap (unused in WebView path)
├──────────────────────────────────┤
│  sql.js (WASM)                   │  SQLite compiled to WebAssembly, loaded from CDN
│  Chart.js                        │  Charting library, loaded from CDN
└──────────────────────────────────┘
```

### Data Flow

1. **App init**: `DOMContentLoaded` → `LabtraceApp.init()` → `labtraceDB.init()` → loads sql.js WASM → loads DB from IndexedDB (or creates empty schema) → loads UI
2. **Data import**: User selects `.db` file → `FileReader.readAsArrayBuffer` → `new SQL.Database(uint8Array)` replaces in-memory DB → `saveToStorage()` persists to IndexedDB
3. **Query path**: `LabtraceApp` methods call `labtraceDB.query(sql, params)` → `db.prepare(sql)` → iterate with `stmt.step()` / `stmt.getAsObject()` → returns plain objects array
4. **Persistence**: After every import, `db.export()` → Uint8Array stored in IndexedDB object store `LabtraceDB` / `database` / `labtrace`

### Key Global Instances

- `labtraceDB` — global `LabtraceDB` instance (defined at bottom of `database.js:471`)
- `window.app` — global `LabtraceApp` instance (defined at bottom of `app.js:679`)
- Both are instantiated at module load time; `app.init()` is called on DOMContentLoaded

---

## Database Schema

6 tables with foreign keys (defined in `database.js:44-138`):

| Table | Purpose |
|---|---|
| `subjects` | Patients/subjects (name, gender, birth_date) |
| `hospitals` | Medical facilities |
| `test_items` | Standardized test item definitions (code, name, category, unit) |
| `lab_reports` | Lab report headers (subject, hospital, date, file_path, OCR status) |
| `report_items` | Individual test results within a lab report (value, unit, flag, ref range) |
| `imaging_reports` | Imaging/radiology reports (exam description, diagnosis) |

**Important**: `report_items.test_item_name` is the denormalized name used for queries and trend matching — it does NOT always join to `test_items.standard_name`.

---

## Code Patterns

### JavaScript Style

- **No modules/bundler** — plain ES5-style classes loaded via `<script>` tags in order
- Classes are defined in the global scope; no `import`/`export`
- SQL queries use parameterized queries (`?` placeholders) via `stmt.bind(params)`
- HTML is generated via template literals and `innerHTML` assignment
- Event listeners are attached imperatively in `setupEventListeners()` (not inline handlers, except for dynamically generated card buttons which use inline `onclick`)

### Testing Pattern

Tests use a **non-standard but consistent approach** for mocking browser globals:

```javascript
// Source files are read as strings and evaluated via new Function()
const dbSource = fs.readFileSync(dbSourcePath, 'utf8');
const defineLabtraceDB = new Function('initSqlJs', 'indexedDB', dbSource + '; return { LabtraceDB };');
```

This is because the source files are not ES modules — they rely on browser globals. Tests inject mock dependencies as function parameters. **When modifying source files, be aware that any global reference not passed as a parameter will break tests.**

The `src/test/__mocks__/sql-js.js` mock provides `MockDatabase` and `MockStatement` that parse SQL strings to route to appropriate data sets. `setup.js` provides mocks for `console`, `Blob`, `File`, `FileReader`, `HTMLCanvasElement`, `localStorage`, `sessionStorage`, `requestAnimationFrame`.

### CSS Pattern

- Mobile-first responsive design using CSS custom properties (defined in `:root` in `style.css:8-20`)
- Key variables: `--primary`, `--success`, `--warning`, `--danger`, `--bg`, `--text`, `--border`, `--shadow`
- Modals use bottom-sheet pattern (`align-items: flex-end` + slide-up animation)
- Tab content visibility toggled via `.active` class + `display: none/block`

---

## Gotchas and Non-Obvious Patterns

1. **CDN dependencies**: `sql.js` and `Chart.js` are loaded from CDN in `index.html:8-9` and `database.js:20`. The app requires internet for first load (WASM file). Tests mock these.

2. **sql.js WASM locateFile**: The `locateFile` callback in `database.js:20` points to a specific CDN version (`sql.js@1.10.3`). Changing the CDN version requires updating both this and `package.json`.

3. **`WHERE 1=1` pattern**: All dynamic filter queries use `WHERE 1=1` as a base to simplify appending AND conditions (`database.js:271`, `database.js:316`).

4. **Import overwrites entirely**: `importDatabase()` in `database.js:194` creates a completely new `SQL.Database` from the file — it replaces, not merges. The old database is lost.

5. **PDF files are in-memory only**: Imported PDFs are stored in `app.pdfFiles` (a `Map`) and never persisted to IndexedDB. They're lost on page reload. Only the database blob is persisted.

6. **Test mock pattern is fragile**: The `new Function(...)` evaluation pattern in tests means any top-level code that references undefined browser globals (like `document`, `window`, `indexedDB`) will fail unless those globals are passed as parameters. When adding new browser API usage, verify it's available in the test mock chain.

7. **`labtraceDB` global is used directly**: Many `app.js` methods call `labtraceDB.query()` directly (not through `LabtraceDB` methods) — e.g., `app.js:261`, `app.js:306`, `app.js:364`. New database queries added as methods on `LabtraceDB` are preferred over inline queries in `app.js`.

8. **`index.js` is Cordova-only**: `src/main/assets/js/index.js` is the Cordova `deviceready` bootstrap. It is **excluded from test coverage** (`package.json:46`) and is **not used** in the Android WebView path. Don't confuse it with app initialization.

9. **`labtrace-android/` is a separate Cordova project**: It has its own `package.json`, `config.xml`, and `www/` directory. The `www/` files are a separate copy of the web assets, not symlinks to `src/main/assets/`.

---

## File Organization

```
labtrace-mobile/
├── src/
│   ├── main/
│   │   ├── assets/              # THE canonical web app source
│   │   │   ├── index.html       # Single-page app entry point
│   │   │   ├── css/style.css    # All styles
│   │   │   ├── js/database.js   # LabtraceDB class (471 lines)
│   │   │   ├── js/app.js        # LabtraceApp class (680 lines)
│   │   │   ├── js/index.js      # Cordova bootstrap (unused in WebView)
│   │   │   └── img/logo.png
│   │   ├── java/com/labtrace/app/MainActivity.java  # WebView Activity
│   │   ├── res/                 # Android resources (strings, launcher icons)
│   │   └── AndroidManifest.xml
│   └── test/                    # Jest test suite
│       ├── setup.js             # Global mocks
│       ├── database.test.js     # DB unit tests
│       ├── app.test.js          # App unit tests
│       ├── integration.test.js  # Integration tests
│       └── __mocks__/sql-js.js  # sql.js mock
├── docs/
│   ├── usage/                   # PRD (产品需求文档)
│   ├── guides/                  # 构建指南等
│   └── logs/                    # 任务执行日志
├── labtrace-android/            # Cordova project (separate copy of web assets in www/)
├── build.gradle                 # Gradle build config
├── settings.gradle              # Gradle settings (uses Aliyun mirrors)
└── package.json                 # Node/Jest config
```

**When editing the web app, always edit files under `src/main/assets/`** — this is the source of truth. The `labtrace-android/www/` contains stale copies.
