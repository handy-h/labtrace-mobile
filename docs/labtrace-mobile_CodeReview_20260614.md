# Labtrace Mobile - Code Review 2026-06-14

> 审查范围：`labtrace-mobile` Android + WebView 混合应用（检验报告数据管理工具）
> 代码行数：Java ~270 行 / JS ~1300 行 / CSS ~370 行 / HTML ~150 行

---

## 一、严重问题 🔴

### 1.1 XSS 安全漏洞（app.js）

**所有报告数据通过模板字符串直接拼入 HTML，未做任何转义。**

```js
// app.js L188 - 高危：数据库内容直接注入 DOM
html += `<div class="card-title">${category}</div>`;
html += `<div>👤 ${subject} | 🏥 ${hospital}</div>`;
```

**影响**：如果导入的 `labtrace.db` 中包含恶意数据（如受检者名称为 `<script>alert(1)</script>`），它会被浏览器执行。这在医疗数据场景中尤其危险。

**修复**：
```js
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
// 对所有用户数据使用 escapeHtml()
```

### 1.2 WebView 调试模式未受版本控制（MainActivity.java:51）

```java
// 始终开启，包括 Release 构建
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
    WebView.setWebContentsDebuggingEnabled(true);
}
```

**影响**：任何人通过 USB 连接即可使用 Chrome DevTools 调试 WebView，获取所有数据和 JavaScript Interface 的访问权限。

**修复**：
```java
if (BuildConfig.DEBUG && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
    WebView.setWebContentsDebuggingEnabled(true);
}
```

### 1.3 缺失 `proguard-rules.pro` 导致 Release 构建失败（build.gradle:21）

```gradle
release {
    minifyEnabled false
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
}
```

当前仓库没有 `proguard-rules.pro` 文件。虽然 `minifyEnabled false`，但指定了不存在的文件路径，Gradle 会报错。

**修复**：创建空的 `proguard-rules.pro` 或删除该行。

---

## 二、高危问题 🟠

### 2.1 明文流量许可（AndroidManifest.xml:18）

```xml
android:usesCleartextTraffic="true"
```

允许所有 HTTP 明文流量，包括 CDN 脚本加载。如果中间人攻击替换了 jsdelivr 返回的 JS 文件，攻击者可完全控制应用。

**修复**：使用 Network Security Config 精确控制：
```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">cdn.jsdelivr.net</domain>
    </domain-config>
</network-security-config>
```
或在 `index.html` 中使用 HTTPS（jsdelivr 已默认支持）。

### 2.2 大数据文件读取 OOM（MainActivity.java:140-153）

```java
public String readFileAsBase64(String uriString) {
    InputStream inputStream = getContentResolver().openInputStream(uri);
    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
    byte[] buffer = new byte[4096];
    while ((bytesRead = inputStream.read(buffer)) != -1) {
        outputStream.write(buffer, 0, bytesRead);
    }
    // 整个文件读入内存，然后 Base64 编码（膨胀 33%）
    return Base64.encodeToString(outputStream.toByteArray(), Base64.DEFAULT);
}
```

**影响**：选择大文件（如多页 PDF >50MB）时直接 OOM 崩溃。Base64 编码还会额外增加 33% 内存。

**修复**：对大文件使用分块读取 + 流式传递，或限制最大文件大小。

### 2.3 无 WebView 生命周期管理（MainActivity.java）

缺失：
- `onDestroy()` 中未调用 `webView.destroy()`
- 缺失 `onSaveInstanceState()` / `onRestoreInstanceState()` 保存 WebView 状态
- 缺失 `onPause()`/`onResume()` 中暂停/恢复 WebView

**修复**：
```java
@Override
protected void onDestroy() {
    if (webView != null) {
        webView.loadUrl("about:blank");
        webView.stopLoading();
        webView.setWebChromeClient(null);
        webView.setWebViewClient(null);
        webView.destroy();
        webView = null;
    }
    super.onDestroy();
}
```

### 2.4 医疗敏感数据备份风险（AndroidManifest.xml:13）

```xml
android:allowBackup="true"
```

允许自动备份应用到 Google 云端。医疗检验数据属于高度敏感个人信息。

**修复**：`android:allowBackup="false"` 或配置 `<full-backup-content>` 排除数据库。

---

## 三、中等问题 🟡

### 3.1 文件重复 / 死代码

| 文件 | 行数 | 问题 |
|------|------|------|
| `AndroidWebView.java` | 6760 字节 | 与 `src/main/java/.../MainActivity.java` 完全重复 |
| `src/main/assets/js/index.js` | 1275 字节 | Cordova 样板代码，`cordova` 未定义会静默失败 |
| `index.html` (根目录) | 5606 字节 | 与 `src/main/assets/index.html` 重复 |

### 3.2 存储权限在 API 33+ 已废弃（MainActivity.java:85-100）

```java
Manifest.permission.READ_EXTERNAL_STORAGE,
Manifest.permission.WRITE_EXTERNAL_STORAGE
```

在 Android 13 (API 33) 以上完全无效。而且应用使用的 `ACTION_GET_CONTENT` (SAF) 不需要这些权限。

**修复**：移除存储权限请求。`ACTION_GET_CONTENT` 通过 SAF 无需存储权限。

### 3.3 未使用的依赖（build.gradle:27-29）

```gradle
implementation 'androidx.appcompat:appcompat:1.6.1'    // 未使用
implementation 'com.google.android.material:material:1.11.0'  // 未使用
implementation 'androidx.constraintlayout:constraintlayout:2.1.4'  // 未使用
```

`MainActivity` 继承自 `Activity` 而非 `AppCompatActivity`，不使用 Material 组件或 ConstraintLayout。

**修复**：删除这三个依赖，减小 APK 体积。

### 3.4 IndexedDB 连接泄漏（database.js:89,118）

```js
const request = indexedDB.open('LabtraceDB', 1);
// 使用完后未关闭连接
```

每次 `loadFromStorage()` 和 `saveToStorage()` 都创建新连接但不关闭。频繁操作会累积未关闭的连接。

**修复**：
```js
async saveToStorage() {
    const data = this.db.export();
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('LabtraceDB', 1);
        request.onsuccess = (event) => {
            const db = event.target.result;
            const tx = db.transaction(['database'], 'readwrite');
            const store = tx.objectStore('database');
            store.put({ data: data }, 'labtrace');
            tx.oncomplete = () => {
                db.close();  // 关闭连接
                resolve(true);
            };
            tx.onerror = () => reject(tx.error);
        };
        // ...
    });
}
```

### 3.5 `checkAbnormal` 参考区间解析不完整（database.js:330-375）

当前仅处理以下格式：
- `65.0-85.0` ✅
- `<5.0` ✅
- `>10.0` ✅

未处理的常见格式：
- `0-4.0`（含零前缀）❌ → regex `^([\d.]+)-([\d.]+)$` 不匹配
- `阴性` / `阳性`（定性结果）❌
- `≤1.0` / `≥200` ❌
- `3.5~5.5`（波浪号分隔）❌
- `3.5 – 5.5`（全角破折号）❌
- 带单位：`< 1.0 mg/L` ❌

**修复**：扩展正则，增加定性判断，增加容错处理。

### 3.6 每次保存导出整个数据库（database.js:115）

```js
const data = this.db.export();
```

即使只有一个单元格变化，也会导出整个 SQLite 数据库二进制到 IndexedDB。数据库越大越慢。

**改进**：采用增量变更追踪，或延迟批量保存（debounce）。

### 3.7 PDF Map 无限增长（app.js:7,476）

```js
this.pdfFiles = new Map();
// ...
this.pdfFiles.set(file.name, file);
```

导入的 PDF 作为 File/Blob 对象存储在内存中，从不清理。多次导入会累积。

**修复**：使用 IndexedDB 存储 PDF（像数据库一样），或设置 LRU 缓存上限。

### 3.8 CDN 完全依赖，无离线能力

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js"></script>
```

**影响**：无网络连接时应用白屏。且每次加载从 CDN 下载约 1MB+ 资源。

**修复**：将 Chart.js 和 sql.js/wasm 打包到 assets 中。

---

## 四、代码质量建议 🔵

### 4.1 全局变量污染

```js
// app.js L554
window.app = new LabtraceApp();

// database.js L380
const labtraceDB = new LabtraceDB();
```

两个全局变量。建议使用模块化（ES Modules）或至少放在命名空间下。

### 4.2 异常处理不一致

- `loadReports()` 中有 try-catch ✅
- `loadTrendOptions()` 无 try-catch ❌
- `switchTab()` 无 try-catch ❌
- `loadFilterOptions()` 无 try-catch ❌

### 4.3 魔法数字

```js
setTimeout(() => { ... }, 1500);  // 为什么是 1500ms？
```

建议提取为常量：
```js
const MODAL_AUTO_CLOSE_DELAY = 1500;
```

### 4.4 缺少加载状态管理

多个异步操作同时进行时，loading 状态互相覆盖。建议添加加载计数器或状态机。

### 4.5 时间格式假设

```sql
r.sample_date >= ?
```
`sample_date` 存储为 TEXT，日期比较依赖字符串格式一致性。如果混入不同格式（`2024-01-01` vs `2024/01/01`），SQLite 字符串比较会出错。

### 4.6 硬编码版本号

```java
return "1.0.0";  // 硬编码后备
```

应与 `build.gradle` 中的 `versionName` 保持一致。更好的方式是从 `BuildConfig.VERSION_NAME` 读取。

### 4.7 Tab 切换无防抖

快速连续点击 tab 按钮会触发多次数据加载。建议加防抖或状态锁。

---

## 五、架构建议 🏗️

### 5.1 当前架构

```
┌──────────────────────────┐
│   Android WebView        │
│  ┌────────────────────┐  │
│  │  index.html         │  │
│  │  ├── app.js (UI)    │  │
│  │  ├── database.js    │  │
│  │  ├── sql.js (WASM)   │  │
│  │  ├── Chart.js        │  │
│  │  └── style.css       │  │
│  └────────────────────┘  │
│  MainActivity.java       │
│  (file picker + JS API)  │
└──────────────────────────┘
```

### 5.2 改进建议

1. **分离 UI 层和数据层**：将 `app.js` 拆分为 `ui.js` + `controller.js`
2. **引入简单的状态管理**：用一个 plain object 管理全局状态，避免 DOM 查询散落各处
3. **离线优先**：将 CDN 依赖打包到 assets，添加 Service Worker
4. **数据导出**：添加数据导出功能（生成 SQLite 或 JSON），形成导入/导出闭环
5. **自动化测试**：至少为 `checkAbnormal()` 和 `searchReports()` 添加单元测试

---

## 六、总结

| 等级 | 数量 | 说明 |
|------|------|------|
| 🔴 严重 | 3 | XSS、WebView 调试暴露、构建文件缺失 |
| 🟠 高危 | 4 | 明文流量、OOM、内存泄漏、医疗数据备份 |
| 🟡 中等 | 8 | 重复代码、无效权限、未使用依赖、CDN 依赖等 |
| 🔵 建议 | 7 | 代码风格、异常处理、架构优化 |

**整体评价**：项目结构清晰，数据库设计合理，UI 交互完整。主要问题集中在 **安全性**（XSS + WebView 配置）和 **工程化**（重复文件、构建配置、离线能力）。建议优先修复 🔴 严重和 🟠 高危问题后再发布。
