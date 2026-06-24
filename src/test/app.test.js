/**
 * LabtraceApp Unit Tests
 * Tests for UI logic, event handling, and user interactions
 */

const fs = require('fs');
const path = require('path');

// Read the source files
const dbSourcePath = path.join(__dirname, '../main/assets/js/database.js');
const appSourcePath = path.join(__dirname, '../main/assets/js/app.js');

const dbSource = fs.readFileSync(dbSourcePath, 'utf8');
const appSource = fs.readFileSync(appSourcePath, 'utf8');

// Create a function that will define both classes and set up global labtraceDB
const setupApp = () => {
    // Create mocks for sql.js
    const mockStmt = {
        step: jest.fn(),
        getAsObject: jest.fn(),
        free: jest.fn(),
        bind: jest.fn(),
    };

    const mockDb = {
        run: jest.fn(),
        prepare: jest.fn(() => mockStmt),
        export: jest.fn(() => new Uint8Array([1, 2, 3])),
    };

    const mockSQL = jest.fn(() => mockDb);
    mockSQL.Database = mockSQL;

    // Setup mock DOM elements
    const mockElements = {};
    const elementIds = [
        'filter-subject', 'filter-hospital', 'filter-category',
        'trend-subject', 'trend-item', 'trend-chart-container', 'trend-data',
        'search-input', 'search-date-from', 'search-date-to', 'search-results',
        'stats-subject', 'stats-overview', 'stats-abnormal',
        'reports-list', 'report-title', 'report-detail',
        'pdf-viewer', 'pdf-title', 'img-viewer', 'file-viewer-container',
        'import-modal', 'import-status', 'import-db', 'import-pdfs', 'import-backup',
        'report-modal', 'pdf-modal',
        'btn-import', 'btn-confirm-import', 'btn-export-backup', 'btn-search', 'btn-settings',
        'trend-chart',
    ];

    elementIds.forEach(id => {
        mockElements[id] = {
            id,
            value: '',
            innerHTML: '',
            textContent: '',
            classList: {
                add: jest.fn(),
                remove: jest.fn(),
                toggle: jest.fn(),
                contains: jest.fn(),
            },
            addEventListener: jest.fn(),
            closest: jest.fn(() => null),
            src: '',
            files: [],
            dataset: {},
            style: {},
            getContext: jest.fn(() => ({})),
            querySelectorAll: jest.fn(() => []),
        };
    });

    // Mock document
    const mockDocument = {
        querySelector: jest.fn(() => null),
        querySelectorAll: jest.fn((selector) => {
            if (selector === '.tab-btn') {
                return [
                    { dataset: { tab: 'reports' }, classList: { toggle: jest.fn() } },
                    { dataset: { tab: 'trends' }, classList: { toggle: jest.fn() } },
                    { dataset: { tab: 'search' }, classList: { toggle: jest.fn() } },
                    { dataset: { tab: 'stats' }, classList: { toggle: jest.fn() } },
                ];
            }
            if (selector === '.tab-content') {
                return [
                    { id: 'tab-reports', classList: { toggle: jest.fn() } },
                    { id: 'tab-trends', classList: { toggle: jest.fn() } },
                    { id: 'tab-search', classList: { toggle: jest.fn() } },
                    { id: 'tab-stats', classList: { toggle: jest.fn() } },
                ];
            }
            if (selector === '.close-btn') return [];
            return [];
        }),
        getElementById: jest.fn((id) => mockElements[id] || {
            value: '', innerHTML: '', textContent: '', addEventListener: jest.fn(),
            classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
            style: {}, dataset: {}, files: [],
        }),
        addEventListener: jest.fn(),
    };

    // Mock Chart
    const mockChart = jest.fn(() => ({
        destroy: jest.fn(),
    }));

    // Mock URL
    const mockURL = {
        createObjectURL: jest.fn(() => 'blob:test-url'),
    };

    // Mock window
    const mockWindow = {
        app: null,
        addEventListener: jest.fn(),
    };

    // Define classes with all mocked dependencies
    const classes = new Function(
        'initSqlJs', 'indexedDB', 'Chart', 'document', 'window', 'URL',
        dbSource + '\n' + appSource + '; return { LabtraceDB, LabtraceApp, labtraceDB };'
    )(
        jest.fn(() => Promise.resolve(mockSQL)),
        {
            open: jest.fn(() => ({
                onerror: null,
                onsuccess: null,
                onupgradeneeded: null,
                result: {
                    transaction: jest.fn(() => ({
                        objectStore: jest.fn(() => ({
                            get: jest.fn(() => ({
                                onsuccess: null,
                                onerror: null,
                                result: null,
                            })),
                            put: jest.fn(() => ({
                                onsuccess: null,
                                onerror: null,
                            })),
                        })),
                        oncomplete: null,
                        onerror: null,
                    })),
                    createObjectStore: jest.fn(),
                },
            })),
        },
        mockChart,
        mockDocument,
        mockWindow,
        mockURL
    );

    // Initialize labtraceDB with mock database
    classes.labtraceDB.SQL = mockSQL;
    classes.labtraceDB.db = mockDb;
    classes.labtraceDB.initialized = true;

    // Create app
    const app = new classes.LabtraceApp();

    return { app, db: classes.labtraceDB, mockStmt, mockDb, mockElements, mockDocument };
};

describe('LabtraceApp', () => {
    let app;
    let db;
    let mockStmt;
    let mockDb;
    let mockElements;
    let mockDocument;

    beforeEach(() => {
        jest.clearAllMocks();
        const setup = setupApp();
        app = setup.app;
        db = setup.db;
        mockStmt = setup.mockStmt;
        mockDb = setup.mockDb;
        mockElements = setup.mockElements;
        mockDocument = setup.mockDocument;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should initialize with default values', () => {
            expect(app.currentTab).toBe('reports');
            expect(app.chartInstance).toBeNull();
            expect(app.pdfFiles).toBeInstanceOf(Map);
            expect(app.pdfFiles.size).toBe(0);
        });
    });

    describe('switchTab', () => {
        test('should switch to reports tab', () => {
            app.switchTab('reports');
            expect(app.currentTab).toBe('reports');
        });

        test('should switch to trends tab and load options', () => {
            mockStmt.step.mockReturnValue(false);
            app.switchTab('trends');
            expect(app.currentTab).toBe('trends');
        });

        test('should switch to stats tab and load stats', () => {
            mockStmt.step
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce({ count: 0 })
                .mockReturnValueOnce({ count: 0 })
                .mockReturnValueOnce({ count: 0 })
                .mockReturnValueOnce({ count: 0 })
                .mockReturnValueOnce({ min_date: null, max_date: null });

            app.switchTab('stats');
            expect(app.currentTab).toBe('stats');
        });

        test('should switch to search tab', () => {
            app.switchTab('search');
            expect(app.currentTab).toBe('search');
        });
    });

    describe('openModal', () => {
        test('should add active class to modal', () => {
            const mockModal = { classList: { add: jest.fn() } };
            
            // Override getElementById for this test
            const originalGetElementById = mockDocument.getElementById;
            mockDocument.getElementById = jest.fn((id) => {
                if (id === 'test-modal') return mockModal;
                return mockElements[id] || {
                    value: '', innerHTML: '', textContent: '', addEventListener: jest.fn(),
                    classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
                    style: {}, dataset: {}, files: [],
                };
            });
            
            app.openModal('test-modal');
            
            expect(mockModal.classList.add).toHaveBeenCalledWith('active');
            mockDocument.getElementById = originalGetElementById;
        });
    });

    describe('loadFilterOptions', () => {
        test('should populate subject selects', async () => {
            const subjects = [
                { id: 1, name: '张三', gender: '男', birth_date: '1990-01-01' },
                { id: 2, name: '李四', gender: '女', birth_date: '1992-05-15' },
            ];
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce(subjects[0])
                .mockReturnValueOnce(subjects[1]);

            await app.loadFilterOptions();

            expect(mockElements['filter-subject'].innerHTML).toContain('张三');
            expect(mockElements['filter-subject'].innerHTML).toContain('李四');
        });

        test('should populate hospital select', async () => {
            const hospitals = [
                { id: 1, name: '第一人民医院' },
                { id: 2, name: '中心医院' },
            ];
            mockStmt.step
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce(hospitals[0])
                .mockReturnValueOnce(hospitals[1]);

            await app.loadFilterOptions();

            expect(mockElements['filter-hospital'].innerHTML).toContain('第一人民医院');
        });

        test('should populate category select', async () => {
            const categories = [
                { name: '生化全套' },
                { name: '血常规' },
            ];
            mockStmt.step
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce(categories[0])
                .mockReturnValueOnce(categories[1]);

            await app.loadFilterOptions();

            expect(mockElements['filter-category'].innerHTML).toContain('生化全套');
        });
    });

    describe('loadReports', () => {
        test('should show empty state when no reports', async () => {
            mockStmt.step.mockReturnValue(false);

            await app.loadReports();

            expect(mockElements['reports-list'].innerHTML).toContain('暂无报告数据');
        });

        test('should render lab reports', async () => {
            const reports = [
                { 
                    id: 1, 
                    sample_date: '2024-01-15', 
                    categories: '生化全套',
                    hospital_name: '第一人民医院',
                    subject_name: '张三',
                    item_count: 10,
                    file_path: 'test.pdf'
                },
            ];
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject.mockReturnValueOnce(reports[0]);

            await app.loadReports();

            expect(mockElements['reports-list'].innerHTML).toContain('生化全套');
            expect(mockElements['reports-list'].innerHTML).toContain('张三');
            expect(mockElements['reports-list'].innerHTML).toContain('10 项检测指标');
        });

        test('should render imaging reports', async () => {
            const imaging = [
                {
                    id: 1,
                    sample_date: '2024-01-15',
                    exam_item_name: 'CT',
                    exam_site: '胸部',
                    hospital_name: '第一人民医院',
                    subject_name: '张三',
                    file_path: 'ct.pdf'
                },
            ];
            mockStmt.step
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject.mockReturnValueOnce(imaging[0]);

            await app.loadReports();

            expect(mockElements['reports-list'].innerHTML).toContain('CT');
            expect(mockElements['reports-list'].innerHTML).toContain('胸部');
        });

        test('should handle error gracefully', async () => {
            mockDb.prepare.mockImplementation(() => {
                throw new Error('Database error');
            });

            await app.loadReports();

            expect(mockElements['reports-list'].innerHTML).toContain('加载失败');
        });
    });

    describe('createReportCard', () => {
        test('should create report card HTML', () => {
            const report = {
                id: 1,
                sample_date: '2024-01-15',
                categories: '生化全套',
                hospital_name: '第一人民医院',
                subject_name: '张三',
                item_count: 10,
                file_path: 'test.pdf'
            };

            const html = app.createReportCard(report);

            expect(html).toContain('data-id="1"');
            expect(html).toContain('data-type="lab"');
            expect(html).toContain('生化全套');
            expect(html).toContain('2024-01-15');
            expect(html).toContain('张三');
            expect(html).toContain('第一人民医院');
            expect(html).toContain('10 项检测指标');
            expect(html).toContain('PDF');
        });

        test('should handle missing optional fields', () => {
            const report = {
                id: 2,
                sample_date: null,
                categories: null,
                hospital_name: null,
                subject_name: null,
                item_count: 0,
                file_path: null
            };

            const html = app.createReportCard(report);

            expect(html).toContain('未知日期');
            expect(html).toContain('未分类');
            expect(html).toContain('未知医院');
            expect(html).toContain('未知受检者');
            expect(html).not.toContain('PDF');
        });
    });

    describe('createImagingCard', () => {
        test('should create imaging card HTML', () => {
            const report = {
                id: 1,
                sample_date: '2024-01-15',
                exam_item_name: 'CT',
                exam_site: '胸部',
                hospital_name: '第一人民医院',
                subject_name: '张三',
                file_path: 'ct.pdf'
            };

            const html = app.createImagingCard(report);

            expect(html).toContain('data-id="1"');
            expect(html).toContain('data-type="imaging"');
            expect(html).toContain('CT');
            expect(html).toContain('胸部');
            expect(html).toContain('PDF');
        });

        test('should handle missing fields', () => {
            const report = {
                id: 1,
                sample_date: null,
                exam_item_name: null,
                exam_site: null,
                hospital_name: null,
                subject_name: null,
                file_path: null
            };

            const html = app.createImagingCard(report);

            expect(html).toContain('影像检查');
            expect(html).toContain('部位未指定');
        });
    });

    describe('showReportDetail', () => {
        test('should show report details with items', () => {
            const report = {
                id: 1,
                subject_name: '张三',
                hospital_name: '第一人民医院',
                sample_date: '2024-01-15',
                categories: '生化全套'
            };
            const items = [
                { test_item_name: '血糖', original_value: '5.5', original_unit: 'mmol/L', ref_interval_text: '3.9-6.1', flag: 'normal' },
                { test_item_name: '胆固醇', original_value: '6.2', original_unit: 'mmol/L', ref_interval_text: '3.0-5.7', flag: 'high' },
            ];

            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce(report)
                .mockReturnValueOnce(items[0])
                .mockReturnValueOnce(items[1]);

            app.showReportDetail(1);

            expect(mockElements['report-title'].textContent).toContain('生化全套');
            expect(mockElements['report-detail'].innerHTML).toContain('血糖');
            expect(mockElements['report-detail'].innerHTML).toContain('胆固醇');
        });

        test('should return early if report not found', () => {
            mockStmt.step.mockReturnValueOnce(false);

            app.showReportDetail(999);

            expect(mockElements['report-title'].textContent).toBe('');
        });
    });

    describe('showImagingDetail', () => {
        test('should show imaging report details', () => {
            const report = {
                id: 1,
                subject_name: '张三',
                hospital_name: '第一人民医院',
                sample_date: '2024-01-15',
                exam_item_name: 'CT',
                exam_site: '胸部',
                inspect_no: 'CT20240115',
                exam_description: '肺部CT平扫',
                diagnosis_result: '未见明显异常'
            };

            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject.mockReturnValueOnce(report);

            app.showImagingDetail(1);

            expect(mockElements['report-title'].textContent).toContain('CT');
            expect(mockElements['report-detail'].innerHTML).toContain('肺部CT平扫');
            expect(mockElements['report-detail'].innerHTML).toContain('未见明显异常');
        });
    });

    describe('viewPDF', () => {
        test('should use cached PDF file', async () => {
            const mockFile = { name: 'test.pdf', size: 1024 };
            app.pdfFiles.set('test.pdf', mockFile);
            db.getFile = jest.fn(() => Promise.resolve(null));

            await app.viewPDF('/path/to/test.pdf');

            expect(mockElements['pdf-viewer'].src).toBe('blob:test-url');
        });

        test('should fallback to file path when not cached', async () => {
            db.getFile = jest.fn(() => Promise.resolve(null));
            await app.viewPDF('/path/to/remote.pdf');

            expect(mockElements['pdf-viewer'].src).toBe('/path/to/remote.pdf');
        });

        test('should use IndexedDB stored file when available', async () => {
            const storedData = new Uint8Array([1, 2, 3]);
            db.getFile = jest.fn(() => Promise.resolve(storedData));

            await app.viewPDF('/path/to/stored.pdf');

            // Should have called getFile with the filename
            expect(db.getFile).toHaveBeenCalledWith('stored.pdf');
            // pdf-viewer src should be set (blob URL)
            expect(mockElements['pdf-viewer'].src).toBeTruthy();
        });

        test('should display image file correctly', async () => {
            const storedData = new Uint8Array([1, 2, 3]);
            db.getFile = jest.fn(() => Promise.resolve(storedData));

            await app.viewPDF('/path/to/image.png');

            expect(db.getFile).toHaveBeenCalledWith('image.png');
            expect(mockElements['img-viewer'].src).toBeTruthy();
            expect(mockElements['img-viewer'].style.display).toBe('block');
            expect(mockElements['pdf-viewer'].style.display).toBe('none');
        });
    });

    describe('loadTrendOptions', () => {
        test('should clear item select when no subject selected', async () => {
            mockElements['trend-subject'].value = '';

            await app.loadTrendOptions();

            expect(mockElements['trend-item'].innerHTML).toBe('<option value="">选择指标</option>');
        });

        test('should load test items for selected subject', async () => {
            mockElements['trend-subject'].value = '1';
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce({ name: '血糖' })
                .mockReturnValueOnce({ name: '胆固醇' });

            await app.loadTrendOptions();

            expect(mockElements['trend-item'].innerHTML).toContain('血糖');
            expect(mockElements['trend-item'].innerHTML).toContain('胆固醇');
        });
    });

    describe('loadTrendChart', () => {
        test('should clear chart when no selections', async () => {
            mockElements['trend-subject'].value = '';
            mockElements['trend-item'].value = '';

            await app.loadTrendChart();

            // When no selections, app shows an empty-state prompt (not a canvas)
            expect(mockElements['trend-chart-container'].innerHTML).toContain('请选择受检者和指标');
        });

        test('should show empty state when no data', async () => {
            mockElements['trend-subject'].value = '1';
            mockElements['trend-item'].value = '血糖';
            mockStmt.step.mockReturnValueOnce(false);

            await app.loadTrendChart();

            expect(mockElements['trend-chart-container'].innerHTML).toContain('暂无数据');
        });

        test('should create chart with data', async () => {
            mockElements['trend-subject'].value = '1';
            mockElements['trend-item'].value = '血糖';
            const trendData = [
                { sample_date: '2024-01-01', original_value: '5.5', original_unit: 'mmol/L', ref_interval_text: '3.9-6.1', flag: 'normal' },
                { sample_date: '2024-02-01', original_value: '6.0', original_unit: 'mmol/L', ref_interval_text: '3.9-6.1', flag: 'normal' },
            ];
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce(trendData[0])
                .mockReturnValueOnce(trendData[1]);

            await app.loadTrendChart();

            expect(mockElements['trend-data'].innerHTML).toContain('2024-01-01');
            expect(mockElements['trend-data'].innerHTML).toContain('5.5');
        });
    });

    describe('performSearch', () => {
        test('should show empty state when no results', async () => {
            mockElements['search-input'].value = 'nonexistent';
            mockStmt.step.mockReturnValueOnce(false);

            await app.performSearch();

            expect(mockElements['search-results'].innerHTML).toContain('未找到匹配的报告');
        });

        test('should render search results', async () => {
            mockElements['search-input'].value = '血糖';
            const results = [
                { id: 1, sample_date: '2024-01-15', categories: '生化全套', hospital_name: '医院A', subject_name: '张三', item_count: 5 },
            ];
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject.mockReturnValueOnce(results[0]);

            await app.performSearch();

            expect(mockElements['search-results'].innerHTML).toContain('找到 1 条结果');
            expect(mockElements['search-results'].innerHTML).toContain('生化全套');
        });

        test('should handle search error', async () => {
            mockElements['search-input'].value = 'test';
            mockDb.prepare.mockImplementation(() => {
                throw new Error('Search failed');
            });

            await app.performSearch();

            expect(mockElements['search-results'].innerHTML).toContain('搜索失败');
        });
    });

    describe('loadStats', () => {
        test('should show empty state when no subject selected', async () => {
            mockElements['stats-subject'].value = '';

            await app.loadStats();

            expect(mockElements['stats-overview'].innerHTML).toContain('请选择受检者');
        });

        test('should render statistics overview', async () => {
            mockElements['stats-subject'].value = '1';
            mockStmt.step
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce({ count: 5 })
                .mockReturnValueOnce({ count: 2 })
                .mockReturnValueOnce({ count: 30 })
                .mockReturnValueOnce({ count: 3 })
                .mockReturnValueOnce({ min_date: '2024-01-01', max_date: '2024-12-31' });

            await app.loadStats();

            expect(mockElements['stats-overview'].innerHTML).toContain('5');
            expect(mockElements['stats-overview'].innerHTML).toContain('检验报告');
        });

        test('should render abnormal items', async () => {
            mockElements['stats-subject'].value = '1';
            mockStmt.step
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce({ count: 1 })
                .mockReturnValueOnce({ count: 0 })
                .mockReturnValueOnce({ count: 5 })
                .mockReturnValueOnce({ count: 1 })
                .mockReturnValueOnce({ min_date: '2024-01-01', max_date: '2024-06-01' })
                .mockReturnValueOnce({ test_item_name: '血糖', original_value: '7.2', original_unit: 'mmol/L', ref_interval_text: '3.9-6.1', flag: 'high', sample_date: '2024-06-01' })
                .mockReturnValueOnce({ test_item_name: '白细胞', original_value: '3.5', original_unit: '10^9/L', ref_interval_text: '4.0-10.0', flag: 'low', sample_date: '2024-05-01' });

            await app.loadStats();

            expect(mockElements['stats-abnormal'].innerHTML).toContain('血糖');
            expect(mockElements['stats-abnormal'].innerHTML).toContain('↑ 偏高');
        });

        test('should show no abnormal state', async () => {
            mockElements['stats-subject'].value = '1';
            mockStmt.step
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce({ count: 1 })
                .mockReturnValueOnce({ count: 0 })
                .mockReturnValueOnce({ count: 5 })
                .mockReturnValueOnce({ count: 0 })
                .mockReturnValueOnce({ min_date: '2024-01-01', max_date: '2024-06-01' });

            await app.loadStats();

            expect(mockElements['stats-abnormal'].innerHTML).toContain('未发现异常指标');
        });
    });

    describe('handleImport', () => {
        test('should show error when no files selected', async () => {
            mockElements['import-db'].files = [];
            mockElements['import-pdfs'].files = [];
            mockElements['import-backup'].files = [];

            await app.handleImport();

            expect(mockElements['import-status'].className).toBe('error');
            expect(mockElements['import-status'].textContent).toBe('请选择要导入的文件');
        });

        test('should import database and PDFs successfully', async () => {
            const dbFile = { name: 'labtrace.db', size: 1024 };
            const pdfFile = {
                name: 'test.pdf',
                size: 2048,
                arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
            };
            mockElements['import-db'].files = [dbFile];
            mockElements['import-pdfs'].files = [pdfFile];
            mockElements['import-backup'].files = [];

            // Mock the importDatabase method on db
            db.importDatabase = jest.fn(() => Promise.resolve(true));
            db.deleteAllFiles = jest.fn(() => Promise.resolve(true));
            db.saveToStorage = jest.fn(() => Promise.resolve());
            db.saveFilesBatch = jest.fn(() => Promise.resolve(1));

            await app.handleImport();

            expect(db.importDatabase).toHaveBeenCalledWith(dbFile);
            expect(db.deleteAllFiles).toHaveBeenCalled();
            expect(app.pdfFiles.has('test.pdf')).toBe(true);
            expect(db.saveToStorage).toHaveBeenCalled();
            expect(mockElements['import-status'].className).toBe('success');
        });

        test('should import backup zip file', async () => {
            const zipFile = { name: 'backup.zip', size: 50000 };
            mockElements['import-backup'].files = [zipFile];
            mockElements['import-db'].files = [];
            mockElements['import-pdfs'].files = [];

            db.importFromBackup = jest.fn(() => Promise.resolve({ dbImported: true, fileCount: 10 }));
            db.saveToStorage = jest.fn(() => Promise.resolve());

            await app.handleImport();

            expect(db.importFromBackup).toHaveBeenCalledWith(zipFile, expect.any(Function));
            expect(mockElements['import-status'].className).toBe('success');
            expect(mockElements['import-status'].textContent).toContain('10');
        });

        test('should handle import error', async () => {
            const dbFile = { name: 'labtrace.db', size: 1024 };
            mockElements['import-db'].files = [dbFile];
            mockElements['import-pdfs'].files = [];
            mockElements['import-backup'].files = [];
            
            db.importDatabase = jest.fn(() => Promise.reject(new Error('Invalid database')));

            await app.handleImport();

            expect(mockElements['import-status'].className).toBe('error');
            expect(mockElements['import-status'].textContent).toContain('导入失败');
        });
    });
});
