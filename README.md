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
├── src/
│   ├── main/
│   │   ├── assets/           # Web 应用源码（唯一权威目录）
│   │   │   ├── index.html    # 主页面
│   │   │   ├── css/style.css # 样式文件
│   │   │   ├── js/database.js# 数据库管理类
│   │   │   └── js/app.js     # 应用逻辑
│   │   └── java/             # Android WebView Activity
│   └── test/                 # Jest 单元测试
├── docs/
│   ├── usage/                # PRD 产品需求文档
│   ├── guides/               # 构建指南
│   └── logs/                 # 任务日志
├── labtrace-android/         # Cordova 备选构建方案
├── build.gradle              # Gradle 构建配置
├── package.json              # Node/Jest 配置
└── AGENTS.md                 # Agent 工作指南
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
cp -r ../src/main/assets/* www/

# 添加 Android 平台
cordova platform add android

# 构建 APK
cordova build android

# 安装到设备
cordova run android
```

#### 方式 B: 使用 Android Studio (WebView)

本项目已包含完整的 Android 项目结构：

1. 用 Android Studio 打开项目根目录
2. Web 文件位于 `src/main/assets/`
3. WebView Activity 位于 `src/main/java/com/labtrace/app/MainActivity.java`
4. 构建指南详见 `docs/guides/BUILD_GUIDE.md`

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

## 开发与测试

```bash
# 安装依赖
npm install

# 运行全部测试
npm test

# 运行指定测试
npm run test:database     # 数据库模块
npm run test:app          # 应用逻辑
npm run test:integration  # 集成测试

# 覆盖率报告
npm run test:coverage

# 监视模式
npm run test:watch
```

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
