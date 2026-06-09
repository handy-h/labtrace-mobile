# Labtrace Mobile - 检查单数据管理应用

## 项目概述

基于混合方案（Hybrid）的 Android 应用，使用 WebView + HTML5 + SQLite (sql.js) 技术栈，支持：

- ✅ 多用户、多医院数据管理
- ✅ 检验报告 & 影像报告检索
- ✅ 指标趋势分析（图表）
- ✅ 异常指标统计
- ✅ 数据导入（覆盖更新）
- ✅ PDF 查看

## 技术架构

```
┌─────────────────────────────────────┐
│         Android WebView              │
│  ┌─────────────────────────────┐    │
│  │      HTML5 / CSS3 / JS      │    │
│  │  ┌─────────────────────┐    │    │
│  │  │    sql.js (WASM)     │    │    │
│  │  │  SQLite in Browser   │    │    │
│  │  └─────────────────────┘    │    │
│  │  ┌─────────────────────┐    │    │
│  │  │   Chart.js 图表      │    │    │
│  │  └─────────────────────┘    │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## 文件结构

```
labtrace-mobile/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式文件
├── js/
│   ├── database.js     # 数据库管理类
│   └── app.js          # 应用逻辑
├── assets/             # 静态资源（数据库模板等）
└── README.md           # 本文件
```

## 快速开始

### 1. 直接浏览器运行（开发测试）

```bash
# 使用 Python 简单 HTTP 服务器
cd labtrace-mobile
python -m http.server 8080

# 浏览器访问 http://localhost:8080
```

### 2. 打包为 Android 应用

#### 方式 A: 使用 Cordova

```bash
# 安装 Cordova
npm install -g cordova

# 创建项目
cordova create labtrace-android com.labtrace.app Labtrace
cd labtrace-android

# 复制 web 文件到 www 目录
cp -r ../labtrace-mobile/* www/

# 添加 Android 平台
cordova platform add android

# 构建 APK
cordova build android

# 安装到设备
cordova run android
```

#### 方式 B: 使用 Android Studio (WebView)

1. 创建新的 Android 项目
2. 在 `assets/` 目录放入所有 web 文件
3. 使用 WebView 加载 `file:///android_asset/index.html`
4. 添加文件读写权限用于导入数据

```kotlin
// MainActivity.kt 示例
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        val webView = findViewById<WebView>(R.id.webview)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.loadUrl("file:///android_asset/index.html")
    }
}
```

### 3. 数据导入

应用支持从 OCR 录入系统导入数据：

1. **导出原系统数据**：
   - 复制 `labtrace.db` 数据库文件
   - 复制 `uploads/` 目录下的 PDF 文件

2. **导入到手机应用**：
   - 点击右上角 📥 导入按钮
   - 选择数据库文件（必选）
   - 选择 PDF 文件（可选，可多选）
   - 确认导入，数据将覆盖本地存储

## 功能说明

### 报告列表（📋 报告）
- 按受检者、医院、类别筛选
- 检验报告和影像报告分类展示
- 点击卡片查看详情
- 支持查看原始 PDF

### 趋势分析（📈 趋势）
- 选择受检者和检测指标
- 显示历史变化趋势图
- 标注参考区间上下限
- 数据表格展示

### 数据检索（🔍 检索）
- 关键词搜索（指标名、医院、类别）
- 日期范围筛选
- 实时显示结果

### 统计分析（📊 统计）
- 报告数量统计
- 异常指标汇总
- 数据时间跨度

## 数据存储

- 使用 IndexedDB 持久化 SQLite 数据库
- PDF 文件缓存在内存中（File API）
- 支持离线使用

## 浏览器兼容性

- Chrome 80+ ✅
- Firefox 75+ ✅
- Safari 14+ ✅
- Android WebView 80+ ✅

## 注意事项

1. **首次使用**：需要导入数据库文件才能查看数据
2. **数据覆盖**：导入新数据库会完全覆盖旧数据
3. **PDF 查看**：需要同时导入 PDF 文件才能查看原始检查单
4. **中文显示**：确保使用 UTF-8 编码

## 开发计划

- [ ] 添加数据导出功能
- [ ] 支持多数据库切换
- [ ] 添加数据同步（云端备份）
- [ ] 支持拍照上传新检查单
- [ ] 添加更多统计图表

## License

MIT
