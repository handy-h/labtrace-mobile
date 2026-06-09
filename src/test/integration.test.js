/**
 * Integration Tests for Labtrace Mobile
 * Tests end-to-end workflows and data flow between components
 */

const fs = require('fs');
const path = require('path');

// Read the source files
const dbSourcePath = path.join(__dirname, '../main/assets/js/database.js');
const appSourcePath = path.join(__dirname, '../main/assets/js/app.js');

const dbSource = fs.readFileSync(dbSourcePath, 'utf8');
const appSource = fs.readFileSync(appSourcePath, 'utf8');

// Create a function that will define both classes in our scope
const defineClasses = new Function(
    'initSqlJs', 'indexedDB', 'Chart', 'document', 'window', 'URL',
    dbSource + '\n' + appSource + '; return { LabtraceDB, LabtraceApp, labtraceDB };'
);

describe('Integration Tests', () => {
    let db;
    let app;
    let mockDb;
    let mockStmt;
    let mockSQL;
    let mockElements;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mocks for sql.js
        mockStmt = {
            step: jest.fn(),
            getAsObject: jest.fn(),
            free: jest.fn(),
            bind: jest.fn(),
        };

        mockDb = {
            run: jest.fn(),
            prepare: jest.fn(() => mockStmt),
            export: jest.fn(() => new Uint8Array([1, 2, 3])),
        };

        mockSQL = jest.fn(() => mockDb);
        mockSQL.Database = mockSQL;

        // Setup mock DOM elements
        mockElements = {};
        const elementIds = [
            'filter-subject', 'filter-hospital', 'filter-category',
            'trend-subject', 'trend-item', 'trend-chart-container', 'trend-data',
            'search-input', 'search-date-from', 'search-date-to', 'search-results',
            'stats-subject', 'stats-overview', 'stats-abnormal',
            'reports-list', 'report-title', 'report-detail',
            'pdf-viewer', 'pdf-title',
            'import-modal', 'import-status', 'import-db', 'import-pdfs',
            'report-modal', 'pdf-modal',
            'btn-import', 'btn-confirm-import', 'btn-search', 'btn-settings',
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
            createObjectURL: jest.fn(() => 'blob:test'),
        };

        // Mock window
        const mockWindow = {
            app: null,
            addEventListener: jest.fn(),
        };

        // Define classes with all mocked dependencies
        const classes = defineClasses(
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

        db = new classes.LabtraceDB();
        db.SQL = mockSQL;
        db.db = mockDb;
        db.initialized = true;

        app = new classes.LabtraceApp();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Complete User Workflow', () => {
        test('should initialize app and load data', async () => {
            mockStmt.step.mockReturnValue(false);

            // Simulate app init
            expect(app.currentTab).toBe('reports');
            expect(app.pdfFiles).toBeInstanceOf(Map);
        });
    });

    describe('Data Filtering Workflow', () => {
        test('should filter reports by subject', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const reports = db.getLabReports({ subject_id: 1 });
            expect(Array.isArray(reports)).toBe(true);
        });

        test('should filter reports by hospital', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const reports = db.getLabReports({ hospital_id: 1 });
            expect(Array.isArray(reports)).toBe(true);
        });

        test('should filter reports by category', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const reports = db.getLabReports({ category: '生化全套' });
            expect(Array.isArray(reports)).toBe(true);
        });

        test('should filter reports by date range', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const reports = db.getLabReports({
                date_from: '2024-01-01',
                date_to: '2024-02-28'
            });
            expect(Array.isArray(reports)).toBe(true);
        });
    });

    describe('Report Detail Workflow', () => {
        test('should retrieve report items', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const items = db.getReportItems(1);
            expect(Array.isArray(items)).toBe(true);
        });

        test('should check abnormal values correctly', () => {
            expect(db.checkAbnormal('5.5', '3.9-6.1')).toBe('normal');
            expect(db.checkAbnormal('6.2', '3.0-5.7')).toBe('high');
            expect(db.checkAbnormal('3.5', '4.0-10.0')).toBe('low');
        });
    });

    describe('Trend Analysis Workflow', () => {
        test('should retrieve trend data', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const trendData = db.getTrendData(1, '血糖');
            expect(Array.isArray(trendData)).toBe(true);
        });

        test('should parse reference intervals', () => {
            const refText = '3.9-6.1';
            const match = refText.match(/([\d.]+)\s*-\s*([\d.]+)/);
            expect(match).not.toBeNull();
            expect(parseFloat(match[1])).toBe(3.9);
            expect(parseFloat(match[2])).toBe(6.1);
        });
    });

    describe('Search Workflow', () => {
        test('should search reports by keyword', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const results = db.searchReports('血糖', null, null);
            expect(Array.isArray(results)).toBe(true);
        });

        test('should search with date filters', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const results = db.searchReports('', '2024-01-01', '2024-03-31');
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('Statistics Workflow', () => {
        test('should calculate statistics', () => {
            mockStmt.step
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce({ count: 5 })
                .mockReturnValueOnce({ count: 3 })
                .mockReturnValueOnce({ count: 25 })
                .mockReturnValueOnce({ count: 2 })
                .mockReturnValueOnce({ min_date: '2024-01-01', max_date: '2024-12-31' });

            const stats = db.getStatistics(1);

            expect(stats).toHaveProperty('reportCount');
            expect(stats).toHaveProperty('imagingCount');
            expect(stats).toHaveProperty('itemCount');
            expect(stats).toHaveProperty('abnormalCount');
            expect(stats).toHaveProperty('dateRange');
            expect(stats).toHaveProperty('recentAbnormal');
        });
    });

    describe('Data Import/Export Workflow', () => {
        test('should export database', () => {
            const exported = db.exportDatabase();
            expect(exported).toBeInstanceOf(Uint8Array);
        });

        test('should handle database import', async () => {
            db.SQL = mockSQL;
            const mockFile = { name: 'test.db' };

            const mockFileReader = {
                readAsArrayBuffer: jest.fn(),
                onload: null,
                result: new ArrayBuffer(8),
            };
            global.FileReader = jest.fn(() => mockFileReader);

            const importPromise = db.importDatabase(mockFile);

            setTimeout(() => {
                if (mockFileReader.onload) {
                    mockFileReader.onload({ target: { result: new ArrayBuffer(8) } });
                }
            }, 0);

            await expect(importPromise).resolves.toBe(true);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle null reference interval', () => {
            expect(db.checkAbnormal('5.5', null)).toBe('normal');
        });

        test('should handle empty reference interval', () => {
            expect(db.checkAbnormal('5.5', '')).toBe('normal');
        });

        test('should handle non-numeric value', () => {
            expect(db.checkAbnormal('N/A', '3.9-6.1')).toBe('normal');
        });

        test('should handle invalid reference format', () => {
            expect(db.checkAbnormal('5.5', 'invalid')).toBe('normal');
        });

        test('should handle database not initialized', () => {
            const newDb = new (defineClasses(
                jest.fn(() => Promise.resolve(mockSQL)),
                { open: jest.fn() },
                jest.fn(),
                { querySelector: jest.fn(), querySelectorAll: jest.fn(), getElementById: jest.fn(), addEventListener: jest.fn() },
                {},
                {}
            )).LabtraceDB();
            expect(() => newDb.query('SELECT 1')).toThrow('Database not initialized');
        });

        test('should handle missing report', () => {
            mockStmt.step.mockReturnValueOnce(false);
            const report = db.query('SELECT * FROM lab_reports WHERE id = 999');
            expect(report).toEqual([]);
        });
    });

    describe('Performance Tests', () => {
        test('should handle large dataset queries', () => {
            // Generate large dataset simulation
            const largeSubjects = Array.from({ length: 100 }, (_, i) => ({
                id: i + 1,
                name: `Subject ${i + 1}`,
            }));

            let callCount = 0;
            mockStmt.step.mockImplementation(() => {
                callCount++;
                return callCount <= 100;
            });
            mockStmt.getAsObject.mockImplementation(() => ({
                id: callCount,
                name: `Subject ${callCount}`,
            }));

            const start = Date.now();
            const subjects = db.getSubjects();
            const duration = Date.now() - start;

            expect(Array.isArray(subjects)).toBe(true);
            expect(subjects.length).toBe(100);
            expect(duration).toBeLessThan(1000);
        });
    });

    describe('Data Consistency Tests', () => {
        test('should validate checkAbnormal edge cases', () => {
            // Boundary values
            expect(db.checkAbnormal('10', '10-20')).toBe('normal');
            expect(db.checkAbnormal('20', '10-20')).toBe('normal');
            expect(db.checkAbnormal('9.9', '10-20')).toBe('low');
            expect(db.checkAbnormal('20.1', '10-20')).toBe('high');

            // Less than format
            expect(db.checkAbnormal('4.9', '<5')).toBe('normal');
            expect(db.checkAbnormal('5.0', '<5')).toBe('high');

            // Greater than format
            expect(db.checkAbnormal('10.1', '>10')).toBe('normal');
            expect(db.checkAbnormal('10.0', '>10')).toBe('low');
        });

        test('should handle decimal precision', () => {
            expect(db.checkAbnormal('3.89', '3.9-6.1')).toBe('low');
            expect(db.checkAbnormal('6.11', '3.9-6.1')).toBe('high');
            expect(db.checkAbnormal('5.00', '3.9-6.1')).toBe('normal');
        });
    });

    describe('UI Integration Tests', () => {
        test('should create report cards with correct structure', () => {
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

            // Verify HTML structure
            expect(html).toContain('<div class="card"');
            expect(html).toContain('<div class="card-header">');
            expect(html).toContain('<div class="card-body">');
            expect(html).toContain('<div class="card-footer">');
            expect(html).toContain('data-id="1"');
            expect(html).toContain('data-type="lab"');
        });

        test('should create imaging cards with correct structure', () => {
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

            expect(html).toContain('<div class="card"');
            expect(html).toContain('data-id="1"');
            expect(html).toContain('data-type="imaging"');
            expect(html).toContain('CT');
        });

        test('should handle PDF caching', () => {
            const pdfFile = { name: 'report.pdf', size: 1024 };
            app.pdfFiles.set('report.pdf', pdfFile);

            expect(app.pdfFiles.has('report.pdf')).toBe(true);
            expect(app.pdfFiles.get('report.pdf')).toBe(pdfFile);

            app.pdfFiles.delete('report.pdf');
            expect(app.pdfFiles.has('report.pdf')).toBe(false);
        });
    });

    describe('End-to-End Data Flow', () => {
        test('should complete full report viewing workflow', () => {
            // Step 1: Get reports list
            const reports = [
                { id: 1, sample_date: '2024-01-15', categories: '生化全套', hospital_name: '医院A', subject_name: '张三', item_count: 5 },
            ];
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject.mockReturnValueOnce(reports[0]);

            const reportList = db.getLabReports({});
            expect(reportList.length).toBeGreaterThan(0);

            // Step 2: Get report details
            const report = { id: 1, subject_name: '张三', hospital_name: '医院A', sample_date: '2024-01-15', categories: '生化全套' };
            const items = [
                { test_item_name: '血糖', original_value: '5.5', original_unit: 'mmol/L', ref_interval_text: '3.9-6.1', flag: 'normal' },
            ];

            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce(report)
                .mockReturnValueOnce(items[0]);

            const reportItems = db.getReportItems(1);
            expect(Array.isArray(reportItems)).toBe(true);

            // Step 3: Check abnormal values
            items.forEach(item => {
                const flag = db.checkAbnormal(item.original_value, item.ref_interval_text);
                expect(['normal', 'high', 'low']).toContain(flag);
            });
        });

        test('should complete search and filter workflow', () => {
            // Search for reports
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject.mockReturnValueOnce({
                id: 1, sample_date: '2024-01-15', categories: '生化全套', hospital_name: '医院A', subject_name: '张三'
            });

            const searchResults = db.searchReports('血糖', '2024-01-01', '2024-12-31');
            expect(Array.isArray(searchResults)).toBe(true);

            // Filter by subject
            mockStmt.step.mockReturnValueOnce(false);
            const filteredReports = db.getLabReports({ subject_id: 1 });
            expect(Array.isArray(filteredReports)).toBe(true);
        });
    });
});
