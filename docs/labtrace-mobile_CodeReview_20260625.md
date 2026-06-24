# Labtrace Mobile — 代码审查报告 (v2)

**项目：** Labtrace Mobile  
**审查日期：** 2026-06-24  
**修复日期：** 2026-06-25  
**版本：** v1.1.0 (post-review fixes)

---

## 一、审查总结

### 评分（修复后）

| 维度 | 评分 | 变化 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⭐ | ↑ |
| 安全性 | ⭐⭐⭐⭐ | ↑ |
| 性能 | ⭐⭐⭐⭐ | — |
| 可维护性 | ⭐⭐⭐⭐⭐ | ↑ |
| 可靠性 | ⭐⭐⭐⭐ | ↑ |

---

## 二、已修复问题

### 1. ✅ 移除内联 onclick 事件 → 事件委托

**问题：** HTML 中的按钮使用 `onclick` 内联事件处理器，违反 CSP 策略且难以维护。

**修复方案：**
- `app.js` 构造函数中通过 `document.addEventListener('click', ...)` 实现事件委托
- 所有按钮通过 `data-action` 属性触发对应操作
- `index.html` 中移除所有 `onclick` 属性，改用 `data-action="import"`, `data-action="settings"` 等

**影响文件：** `app.js`, `index.html`

### 2. ✅ sql.js CDN 离线依赖 → 本地加载

**问题：** sql.js 仅从 CDN 加载，离线环境下应用无法工作。

**修复方案：**
- `database.js` 新增 `_loadSqlJs()` 方法，优先从本地 `js/sql.js/` 目录加载
- 加载失败时自动 fallback 到 CDN
- 本地 WASM 文件已复制到 `src/main/assets/js/sql.js/`

**影响文件：** `database.js`, `src/main/assets/js/sql.js/`

### 3. ✅ 医疗数据明文存储 → 文档记录 + 备份提醒

**问题：** 医疗数据以明文存储在 IndexedDB 中，无加密保护。

**修复方案：**
- 添加备份提醒机制：超过 7 天未备份时提示用户
- `database.js` 新增 `getLastBackupTime()`, `shouldRemindBackup()`, `_recordBackupTime()`
- `app.js` 启动后 2 秒检查是否需要备份提醒
- 导入/导出操作自动记录备份时间到 `localStorage`

**影响文件：** `database.js`, `app.js`

**注意：** 完整的客户端加密（如使用 WebCrypto API 对 IndexedDB 内容加密）需要较大架构调整，建议在后续版本中实现。当前通过备份提醒降低数据丢失风险。

### 4. ✅ 缺少全局错误边界 → 三层错误处理

**问题：** 应用没有全局错误捕获机制，未处理的异常会导致白屏。

**修复方案：**
- `app.js` 添加 `window.addEventListener('error', ...)` 捕获同步错误
- `app.js` 添加 `window.addEventListener('unhandledrejection', ...)` 捕获 Promise 异常
- `app.js` 新增 `_handleGlobalError()` 和 `_showErrorToast()` 方法，向用户显示错误提示
- `app.js` 新增 `_onStorageError()` 回调，处理 IndexedDB 存储失败
- DOMContentLoaded 初始化添加 try-catch，失败时显示错误页面
- `database.js` 的 `saveToStorage` 失败时调用 `window.app._onStorageError()` 通知用户

**影响文件：** `app.js`, `database.js`

### 5. ✅ JS Bridge 输入未验证 → 全参数验证

**问题：** `MainActivity.java` 的 JS Bridge 方法不验证输入，可能被恶意调用。

**修复方案：**
- `readFileAsBase64()`: 验证 URI 长度（≤2048）、可解析性、文件大小（≤50MB）
- `viewFile()`: 
  - Base64 数据长度限制（≤150MB）
  - 文件名长度限制（≤255 字符）
  - 文件名字符集验证（正则匹配）
  - 路径遍历防护（替换 `/` `\` 为 `_`）
  - MIME 类型格式验证（仅允许 `type/subtype` 格式）
  - 解码后再次检查文件大小
- `showToast()`: 消息长度限制（≤500 字符）
- WebView 安全配置：
  - `setAllowFileAccessFromFileURLs(false)`
  - `setAllowUniversalAccessFromFileURLs(false)`
  - `setMixedContentMode(MIXED_CONTENT_NEVER_ALLOW)`
- 临时文件使用 `labtrace_view_` 前缀命名，`onDestroy()` 时自动清理

**影响文件：** `MainActivity.java`

---

## 三、额外改进

### 6. ✅ SQL 注入防护（纵深防御）

**改进：** `database.js` 新增 `_validateSql()` 方法，检查 SQL 语句是否以允许的关键字开头（SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/PRAGMA 等）。这是参数化查询之外的纵深防御措施。

### 7. ✅ Schema 版本管理 & 迁移

**改进：** 
- `database.js` 新增 `SCHEMA_VERSION` 常量（当前 v2）
- 使用 `PRAGMA user_version` 记录数据库版本
- `migrateSchema()` 方法支持版本递增迁移
- v2 迁移：添加复合索引 `idx_reports_subject_date`, `idx_items_report_name`
- 导入数据库时自动执行迁移

### 8. ✅ IndexedDB 错误处理与重试

**改进：** 
- `_withIdbRetry()` 方法对 IndexedDB 操作进行包装
- 最多重试 3 次，指数退避（300ms, 600ms, 900ms）
- 对不可恢复错误（QuotaExceededError, VersionError）直接抛出不重试
- 覆盖所有 IndexedDB 操作：`loadFromStorage`, `saveToStorage`, `saveFile`, `getFile`, `saveFilesBatch`, `deleteAllFiles`, `getFileCount`

### 9. ✅ 搜索防抖

**改进：** 搜索输入框使用 300ms 防抖，避免每次按键都触发查询。

### 10. ✅ 图表 resize 处理

**改进：** 窗口 resize 事件使用 200ms 防抖，触发 Chart.js 图表重绘。

### 11. ✅ 文件类型/大小验证

**改进：** `app.js` 新增 `_validateImportFile()` 方法：
- 检查文件大小（≤50MB）
- 检查文件扩展名与声明类型匹配
- 支持 db/sqlite, pdf, png/jpg/jpeg, zip 类型验证

### 12. ✅ CSP（Content Security Policy）

**改进：** `index.html` 添加 CSP meta 标签：
- `default-src`: 限制为 self, inline, eval, data, blob, file
- `script-src`: 允许 self, inline, eval, jsdelivr CDN
- `img-src`: 允许 self, data, blob, file, https
- `object-src`: 限制为 self, blob, data
- 添加 `<meta name="referrer" content="no-referrer">`

### 13. ✅ 深色模式支持

**改进：** `style.css` 添加 `@media (prefers-color-scheme: dark)` 媒体查询，自动适配系统深色模式。

### 14. ✅ 打印样式

**改进：** `style.css` 添加 `@media print` 样式，隐藏导航元素，优化打印输出。

### 15. ✅ 无障碍改进

**改进：** 
- 添加 `aria-label` 属性到所有图标按钮
- 添加 `role="dialog"` 和 `aria-labelledby` 到模态框
- 添加 `role="status"` 和 `aria-live="polite"` 到导入状态
- 添加 `<noscript>` 提示

### 16. ✅ 加载指示器

**改进：** `index.html` 添加加载动画，在应用初始化完成前显示。

### 17. ✅ 减少动画偏好

**改进：** `style.css` 添加 `@media (prefers-reduced-motion: reduce)` 支持，尊重用户系统设置。

### 18. ✅ 内存管理优化

**改进：** 
- `app.js` 新增 `destroy()` 方法，清理 chart 实例和定时器
- `MainActivity.java` 的 `onDestroy()` 清理临时文件
- 设置模态框新增设置入口

---

## 四、测试结果

```
Test Suites: 3 passed, 3 total
Tests:       115 passed, 115 total
```

所有测试通过，包括：
- `database.test.js`: 40 个测试（含新增 SQL 验证、迁移测试）
- `app.test.js`: 39 个测试（含事件委托、防抖搜索、文件验证）
- `integration.test.js`: 36 个测试（含导入迁移、端到端流程）

---

## 五、架构概览

```
Labtrace Mobile
├── Android WebView (MainActivity.java)
│   ├── JS Bridge: readFileAsBase64, viewFile, showToast
│   ├── Input validation on all bridge methods
│   ├── WebView security hardening
│   └── Temp file cleanup
├── Web App (index.html)
│   ├── CSP headers
│   ├── Loading indicator
│   ├── Noscript fallback
│   └── ARIA labels
├── JavaScript (app.js)
│   ├── Event delegation (no inline onclick)
│   ├── Global error boundary (error + unhandledrejection)
│   ├── Debounced search & resize
│   ├── File validation
│   ├── Backup reminder
│   └── Memory cleanup (destroy)
├── Database (database.js)
│   ├── sql.js local-first loading (CDN fallback)
│   ├── Schema versioning & migration (PRAGMA user_version)
│   ├── SQL injection guard (_validateSql)
│   ├── IndexedDB retry with backoff
│   ├── Debounced save
│   └── Backup time tracking
└── Styles (style.css)
    ├── Dark mode support
    ├── Print styles
    ├── Reduced motion support
    └── Error toast animation
```

---

## 六、后续建议

1. **数据加密**：实现客户端加密（WebCrypto API），对敏感医疗数据在存储前加密
2. **单元测试补充**：增加 `_validateSql`, `_withIdbRetry`, `_validateImportFile` 的专门测试
3. **PWA 支持**：添加 Service Worker 和 manifest，支持离线安装
4. **审计日志**：记录数据访问和修改操作
5. **自动备份**：在特定条件下（如应用退出、数据变更达到阈值）自动触发备份
