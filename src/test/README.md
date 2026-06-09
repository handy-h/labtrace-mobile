# Labtrace Mobile 单元测试文档

## 测试结构

```
src/test/
├── setup.js                    # 测试环境配置和全局 Mock
├── database.test.js            # Database 模块单元测试
├── app.test.js                 # App 模块单元测试
├── integration.test.js         # 集成测试
├── __mocks__/
│   └── sql-js.js               # sql.js 模块 Mock
└── README.md                   # 本文件
```

## 测试覆盖范围

### database.test.js - 数据库模块测试

| 测试组 | 描述 |
|--------|------|
| `constructor` | 构造函数初始化测试 |
| `init` | 数据库初始化流程测试 |
| `createSchema` | 数据库 Schema 创建测试 |
| `query` | SQL 查询执行测试 |
| `run` | SQL 执行测试 |
| `importDatabase` | 数据库导入测试 |
| `exportDatabase` | 数据库导出测试 |
| `getSubjects` | 受检者查询测试 |
| `getHospitals` | 医院查询测试 |
| `getCategories` | 类别查询测试 |
| `getLabReports` | 检验报告查询测试（含各种过滤条件） |
| `getReportItems` | 报告明细查询测试 |
| `getImagingReports` | 影像报告查询测试 |
| `getTrendData` | 趋势数据查询测试 |
| `searchReports` | 报告搜索测试 |
| `getStatistics` | 统计信息查询测试 |
| `checkAbnormal` | 异常值判断逻辑测试 |
| `saveToStorage` | IndexedDB 保存测试 |
| `loadFromStorage` | IndexedDB 加载测试 |

### app.test.js - 应用模块测试

| 测试组 | 描述 |
|--------|------|
| `constructor` | 应用初始化测试 |
| `init` | 应用启动流程测试 |
| `switchTab` | 标签页切换测试 |
| `openModal` | 弹窗打开测试 |
| `loadFilterOptions` | 筛选选项加载测试 |
| `loadReports` | 报告列表加载测试 |
| `createReportCard` | 报告卡片生成测试 |
| `createImagingCard` | 影像卡片生成测试 |
| `showReportDetail` | 报告详情展示测试 |
| `showImagingDetail` | 影像详情展示测试 |
| `viewPDF` | PDF 查看测试 |
| `loadTrendOptions` | 趋势选项加载测试 |
| `loadTrendChart` | 趋势图表加载测试 |
| `performSearch` | 搜索执行测试 |
| `loadStats` | 统计加载测试 |
| `handleImport` | 数据导入处理测试 |
| `setupEventListeners` | 事件监听设置测试 |

### integration.test.js - 集成测试

| 测试组 | 描述 |
|--------|------|
| `Complete User Workflow` | 完整用户工作流程测试 |
| `Data Filtering Workflow` | 数据过滤流程测试 |
| `Report Detail Workflow` | 报告详情流程测试 |
| `Trend Analysis Workflow` | 趋势分析流程测试 |
| `Search Workflow` | 搜索流程测试 |
| `Statistics Workflow` | 统计流程测试 |
| `Data Import/Export Workflow` | 数据导入导出流程测试 |
| `Edge Cases and Error Handling` | 边界情况和错误处理测试 |
| `Performance Tests` | 性能测试 |
| `Data Consistency Tests` | 数据一致性测试 |

## 运行测试

### 安装依赖

```bash
npm install
```

### 运行所有测试

```bash
npm test
```

### 运行特定测试文件

```bash
# 仅运行数据库测试
npm run test:database

# 仅运行应用测试
npm run test:app

# 仅运行集成测试
npm run test:integration
```

### 监视模式（开发时使用）

```bash
npm run test:watch
```

### 生成覆盖率报告

```bash
npm run test:coverage
```

覆盖率报告将生成在 `coverage/` 目录下。

## Mock 说明

### sql.js Mock (`__mocks__/sql-js.js`)

模拟 sql.js 的核心功能：
- `MockDatabase`: 模拟 SQLite 数据库
- `MockStatement`: 模拟 SQL 语句执行
- `initSqlJs`: 模拟初始化函数

### 全局 Mock (`setup.js`)

提供以下全局 Mock：
- `console`: 静默控制台输出
- `Blob`/`File`/`FileReader`: 文件操作
- `HTMLCanvasElement`: Canvas 2D 上下文
- `requestAnimationFrame`/`cancelAnimationFrame`: 动画帧
- `localStorage`/`sessionStorage`: 本地存储
- `Chart.js`: 图表库

## 测试数据

集成测试使用模拟数据集：
- 2 位受检者
- 2 家医院
- 3 份检验报告
- 4 条报告明细
- 1 份影像报告
- 2 条检项标准

## 编写新测试

参考现有测试文件的结构，遵循以下原则：

1. 每个测试文件对应一个源文件
2. 使用 `describe` 组织测试组
3. 使用 `beforeEach` 重置状态
4. 测试名称应清晰描述测试内容
5. 一个测试只验证一个概念

### 示例

```javascript
describe('Feature Name', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should do something specific', () => {
        // Arrange
        const input = 'test';
        
        // Act
        const result = functionUnderTest(input);
        
        // Assert
        expect(result).toBe('expected');
    });
});
```

## 注意事项

1. 测试环境使用 `jsdom` 模拟浏览器环境
2. 数据库操作使用 Mock 对象，不涉及真实 SQLite
3. 文件导入操作使用 Mock FileReader
4. 图表渲染使用 Mock Chart.js
5. 所有异步操作应使用 `async/await` 或返回 Promise
