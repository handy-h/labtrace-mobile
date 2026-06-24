/**
 * LabtraceDB Unit Tests
 * Tests for database operations, queries, and business logic
 */

// Read the source file and extract the LabtraceDB class
const fs = require('fs');
const path = require('path');

const dbSourcePath = path.join(__dirname, '../main/assets/js/database.js');
const dbSource = fs.readFileSync(dbSourcePath, 'utf8');

// Create a function that will define the class in our scope
const defineLabtraceDB = new Function('initSqlJs', 'indexedDB', dbSource + '; return { LabtraceDB, labtraceDB };');

describe('LabtraceDB', () => {
    let db;
    let mockDb;
    let mockStmt;
    let mockSQL;

    beforeEach(() => {
        // Create fresh mocks for each test
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
            exec: jest.fn(() => [{ values: [[2]] }]),  // PRAGMA user_version returns 2 (current version)
        };

        mockSQL = jest.fn(() => mockDb);
        mockSQL.Database = mockSQL;

        // Define the class with mocked dependencies
        const { LabtraceDB: LabtraceDBClass } = defineLabtraceDB(
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
                                    result: { data: new Uint8Array([1, 2, 3]) }
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
            }
        );

        db = new LabtraceDBClass();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should initialize with default values', () => {
            expect(db.db).toBeNull();
            expect(db.SQL).toBeNull();
            expect(db.initialized).toBe(false);
            expect(db.dbName).toBe('labtrace.db');
        });
    });

    describe('init', () => {
        test('should skip initialization if already initialized', async () => {
            db.initialized = true;
            const result = await db.init();
            expect(result).toBeUndefined();
        });

        test('should initialize sql.js and create new database when no saved data', async () => {
            const mockRequest = {
                onerror: null,
                onsuccess: null,
                onupgradeneeded: null,
            };
            
            const mockIndexedDB = {
                open: jest.fn(() => mockRequest),
            };

            // Recreate db with custom indexedDB mock
            const { LabtraceDB: LabtraceDBClass } = defineLabtraceDB(
                jest.fn(() => Promise.resolve(mockSQL)),
                mockIndexedDB
            );
            db = new LabtraceDBClass();

            const initPromise = db.init();
            
            // Trigger error (no saved data)
            setTimeout(() => {
                if (mockRequest.onerror) mockRequest.onerror();
            }, 0);

            await initPromise;
            expect(db.initialized).toBe(true);
        });

        test('should throw error when sql.js fails to load', async () => {
            const mockRequest = {
                onerror: null,
                onsuccess: null,
            };
            
            const { LabtraceDB: LabtraceDBClass } = defineLabtraceDB(
                jest.fn(() => Promise.reject(new Error('WASM load failed'))),
                { open: jest.fn(() => mockRequest) }
            );
            db = new LabtraceDBClass();

            await expect(db.init()).rejects.toThrow('WASM load failed');
        });
    });

    describe('createSchema', () => {
        test('should create all required tables', () => {
            db.db = mockDb;
            db.createSchema();

            expect(mockDb.run).toHaveBeenCalledTimes(1);
            const schema = mockDb.run.mock.calls[0][0];
            
            expect(schema).toContain('CREATE TABLE IF NOT EXISTS subjects');
            expect(schema).toContain('CREATE TABLE IF NOT EXISTS hospitals');
            expect(schema).toContain('CREATE TABLE IF NOT EXISTS test_items');
            expect(schema).toContain('CREATE TABLE IF NOT EXISTS lab_reports');
            expect(schema).toContain('CREATE TABLE IF NOT EXISTS report_items');
            expect(schema).toContain('CREATE TABLE IF NOT EXISTS imaging_reports');
        });

        test('should create all required indexes', () => {
            db.db = mockDb;
            db.createSchema();

            const schema = mockDb.run.mock.calls[0][0];
            
            expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_reports_subject');
            expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_reports_date');
            expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_report_items_report');
            expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_report_items_name');
            expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_imaging_subject');
        });
    });

    describe('query', () => {
        test('should throw error if database not initialized', () => {
            expect(() => db.query('SELECT 1')).toThrow('Database not initialized');
        });

        test('should execute query and return results', () => {
            db.db = mockDb;
            const mockResults = [
                { id: 1, name: 'Test' },
                { id: 2, name: 'Test2' }
            ];
            
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce(mockResults[0])
                .mockReturnValueOnce(mockResults[1]);

            const result = db.query('SELECT * FROM test');

            expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test');
            expect(mockStmt.bind).toHaveBeenCalledWith([]);
            expect(mockStmt.step).toHaveBeenCalledTimes(3);
            expect(mockStmt.free).toHaveBeenCalled();
            expect(result).toEqual(mockResults);
        });

        test('should handle query with parameters', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.query('SELECT * FROM test WHERE id = ?', [1]);

            expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test WHERE id = ?');
            expect(mockStmt.bind).toHaveBeenCalledWith([1]);
        });

        test('should throw error on query failure', () => {
            db.db = mockDb;
            mockDb.prepare.mockImplementation(() => {
                throw new Error('SQL syntax error');
            });

            // Use a valid SQL prefix so _validateSql passes, but prepare() fails
            expect(() => db.query('SELECT * FROM nonexistent')).toThrow('SQL syntax error');
        });
    });

    describe('run', () => {
        test('should throw error if database not initialized', () => {
            expect(() => db.run('INSERT INTO test VALUES (1)')).toThrow('Database not initialized');
        });

        test('should execute SQL statement', () => {
            db.db = mockDb;
            db.run('INSERT INTO test VALUES (?)', [1]);
            expect(mockDb.run).toHaveBeenCalledWith('INSERT INTO test VALUES (?)', [1]);
        });
    });

    describe('importDatabase', () => {
        test('should import database from file', async () => {
            db.SQL = mockSQL;
            const mockFile = { name: 'test.db' };
            
            const mockFileReader = {
                readAsArrayBuffer: jest.fn(),
                onload: null,
                onerror: null,
                result: new ArrayBuffer(4),
            };
            global.FileReader = jest.fn(() => mockFileReader);

            const importPromise = db.importDatabase(mockFile);

            setTimeout(() => {
                if (mockFileReader.onload) {
                    mockFileReader.onload({ target: { result: new ArrayBuffer(4) } });
                }
            }, 0);

            await importPromise;
            expect(mockSQL).toHaveBeenCalled();
            // migrateSchema should have been called on imported db
            expect(mockDb.exec).toHaveBeenCalledWith('PRAGMA user_version');
        });
    });

    describe('exportDatabase', () => {
        test('should return null if database not initialized', () => {
            expect(db.exportDatabase()).toBeNull();
        });

        test('should export database as Uint8Array', () => {
            db.db = mockDb;
            const result = db.exportDatabase();
            expect(mockDb.export).toHaveBeenCalled();
            expect(result).toEqual(new Uint8Array([1, 2, 3]));
        });
    });

    describe('getSubjects', () => {
        test('should return subjects ordered by name', () => {
            db.db = mockDb;
            const subjects = [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' }
            ];
            mockStmt.step
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockStmt.getAsObject
                .mockReturnValueOnce(subjects[0])
                .mockReturnValueOnce(subjects[1]);

            const result = db.getSubjects();
            
            expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM subjects ORDER BY name');
            expect(result).toEqual(subjects);
        });
    });

    describe('getHospitals', () => {
        test('should return hospitals ordered by name', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getHospitals();
            
            expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM hospitals ORDER BY name');
        });
    });

    describe('getCategories', () => {
        test('should return distinct non-empty categories', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getCategories();
            
            const call = mockDb.prepare.mock.calls[0][0];
            expect(call).toContain('SELECT DISTINCT categories as name');
            expect(call).toContain("WHERE categories IS NOT NULL AND categories != ''");
        });
    });

    describe('getLabReports', () => {
        test('should return all reports when no filters', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getLabReports();
            
            expect(mockDb.prepare).toHaveBeenCalled();
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('FROM lab_reports r');
            expect(sql).toContain('ORDER BY r.sample_date DESC');
        });

        test('should apply subject filter', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getLabReports({ subject_id: 1 });
            
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('AND r.subject_id = ?');
        });

        test('should apply hospital filter', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getLabReports({ hospital_id: 2 });
            
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('AND r.hospital_id = ?');
        });

        test('should apply category filter', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getLabReports({ category: '生化全套' });
            
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('AND r.categories = ?');
        });

        test('should apply date range filters', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getLabReports({ date_from: '2024-01-01', date_to: '2024-12-31' });
            
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('AND r.sample_date >= ?');
            expect(sql).toContain('AND r.sample_date <= ?');
        });
    });

    describe('getReportItems', () => {
        test('should return items for given report ID', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getReportItems(1);
            
            expect(mockDb.prepare).toHaveBeenCalledWith(
                expect.stringContaining('WHERE ri.report_id = ?')
            );
        });
    });

    describe('getImagingReports', () => {
        test('should return imaging reports with filters', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getImagingReports({ subject_id: 1 });
            
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('FROM imaging_reports ir');
            expect(sql).toContain('AND ir.subject_id = ?');
        });
    });

    describe('getTrendData', () => {
        test('should return trend data for subject and item', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.getTrendData(1, '血糖');
            
            expect(mockDb.prepare).toHaveBeenCalledWith(
                expect.stringContaining('WHERE r.subject_id = ? AND ri.test_item_name = ?')
            );
        });
    });

    describe('searchReports', () => {
        test('should search with keyword across multiple fields', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.searchReports('血糖', null, null);
            
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('r.categories LIKE ?');
            expect(sql).toContain('ri.test_item_name LIKE ?');
            expect(sql).toContain('s.name LIKE ?');
            expect(sql).toContain('h.name LIKE ?');
        });

        test('should apply date filters', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.searchReports('', '2024-01-01', '2024-12-31');
            
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('AND r.sample_date >= ?');
            expect(sql).toContain('AND r.sample_date <= ?');
        });

        test('should use DISTINCT to avoid duplicates', () => {
            db.db = mockDb;
            mockStmt.step.mockReturnValueOnce(false);

            db.searchReports('test');
            
            const sql = mockDb.prepare.mock.calls[0][0];
            expect(sql).toContain('SELECT DISTINCT');
        });
    });

    describe('getStatistics', () => {
        test('should return complete statistics object', () => {
            db.db = mockDb;
            
            mockStmt.step
                .mockReturnValueOnce(true).mockReturnValueOnce(false)  // reportCount
                .mockReturnValueOnce(true).mockReturnValueOnce(false)  // imagingCount
                .mockReturnValueOnce(true).mockReturnValueOnce(false)  // itemCount
                .mockReturnValueOnce(true).mockReturnValueOnce(false)  // abnormalCount
                .mockReturnValueOnce(true).mockReturnValueOnce(false)  // dateRange
                .mockReturnValueOnce(false);  // recentAbnormal
                
            mockStmt.getAsObject
                .mockReturnValueOnce({ count: 5 })
                .mockReturnValueOnce({ count: 3 })
                .mockReturnValueOnce({ count: 25 })
                .mockReturnValueOnce({ count: 2 })
                .mockReturnValueOnce({ min_date: '2024-01-01', max_date: '2024-12-31' });

            const result = db.getStatistics(1);

            expect(result).toHaveProperty('reportCount', 5);
            expect(result).toHaveProperty('imagingCount', 3);
            expect(result).toHaveProperty('itemCount', 25);
            expect(result).toHaveProperty('abnormalCount', 2);
            expect(result).toHaveProperty('dateRange');
            expect(result).toHaveProperty('recentAbnormal');
        });
    });

    describe('checkAbnormal', () => {
        test('should return normal for null values', () => {
            expect(db.checkAbnormal(null, '10-20')).toBe('normal');
            expect(db.checkAbnormal(15, null)).toBe('normal');
            expect(db.checkAbnormal(null, null)).toBe('normal');
        });

        test('should return normal for non-numeric values', () => {
            expect(db.checkAbnormal('abc', '10-20')).toBe('normal');
        });

        test('should detect low value in range format', () => {
            expect(db.checkAbnormal(5, '10-20')).toBe('low');
        });

        test('should detect high value in range format', () => {
            expect(db.checkAbnormal(25, '10-20')).toBe('high');
        });

        test('should return normal for value within range', () => {
            expect(db.checkAbnormal(15, '10-20')).toBe('normal');
            expect(db.checkAbnormal(10, '10-20')).toBe('normal');
            expect(db.checkAbnormal(20, '10-20')).toBe('normal');
        });

        test('should handle range with spaces', () => {
            expect(db.checkAbnormal(5, '10 - 20')).toBe('low');
            expect(db.checkAbnormal(25, '10 - 20')).toBe('high');
        });

        test('should detect high value in less-than format', () => {
            expect(db.checkAbnormal(10, '<5')).toBe('high');
            expect(db.checkAbnormal(5, '<5')).toBe('high');
        });

        test('should return normal for value below max in less-than format', () => {
            expect(db.checkAbnormal(3, '<5')).toBe('normal');
        });

        test('should detect low value in greater-than format', () => {
            expect(db.checkAbnormal(5, '>10')).toBe('low');
            expect(db.checkAbnormal(10, '>10')).toBe('low');
        });

        test('should return normal for value above min in greater-than format', () => {
            expect(db.checkAbnormal(15, '>10')).toBe('normal');
        });

        test('should handle less-than with space', () => {
            expect(db.checkAbnormal(10, '< 5')).toBe('high');
        });

        test('should handle greater-than with space', () => {
            expect(db.checkAbnormal(5, '> 10')).toBe('low');
        });

        test('should return normal for unparseable reference text', () => {
            expect(db.checkAbnormal(15, 'unknown')).toBe('normal');
            expect(db.checkAbnormal(15, '')).toBe('normal');
        });

        test('should handle decimal values', () => {
            expect(db.checkAbnormal(3.5, '3.9-6.1')).toBe('low');
            expect(db.checkAbnormal(7.0, '3.9-6.1')).toBe('high');
            expect(db.checkAbnormal(5.0, '3.9-6.1')).toBe('normal');
        });
    });

    describe('saveToStorage', () => {
        test('should return early if no database', async () => {
            const result = await db.saveToStorage();
            expect(result).toBeUndefined();
        });

        test('should save database to IndexedDB', async () => {
            db.db = mockDb;
            
            const mockPutReq = {
                onsuccess: null,
                onerror: null,
            };
            const mockStore = {
                put: jest.fn(() => mockPutReq),
            };
            const mockTx = {
                objectStore: jest.fn(() => mockStore),
                oncomplete: null,
                onerror: null,
            };
            const mockIdbDb = {
                transaction: jest.fn(() => mockTx),
                close: jest.fn(),
            };
            const mockRequest = {
                onerror: null,
                onsuccess: null,
                onupgradeneeded: null,
                result: mockIdbDb,
            };

            const mockIndexedDB = {
                open: jest.fn(() => mockRequest),
            };

            const { LabtraceDB: LabtraceDBClass } = defineLabtraceDB(
                jest.fn(() => Promise.resolve(mockSQL)),
                mockIndexedDB
            );
            db = new LabtraceDBClass();
            db.db = mockDb;

            const savePromise = db.saveToStorage();

            setTimeout(() => {
                if (mockRequest.onsuccess) mockRequest.onsuccess({ target: { result: mockIdbDb } });
                setTimeout(() => {
                    if (mockTx.oncomplete) mockTx.oncomplete();
                }, 0);
            }, 0);

            const result = await savePromise;
            expect(result).toBeUndefined();
        });
    });

    describe('loadFromStorage', () => {
        test('should return null on IndexedDB error', async () => {
            const mockRequest = {
                onerror: null,
                onsuccess: null,
            };
            
            const mockIndexedDB = {
                open: jest.fn(() => mockRequest),
            };

            const { LabtraceDB: LabtraceDBClass } = defineLabtraceDB(
                jest.fn(() => Promise.resolve(mockSQL)),
                mockIndexedDB
            );
            db = new LabtraceDBClass();

            const loadPromise = db.loadFromStorage();

            setTimeout(() => {
                if (mockRequest.onerror) mockRequest.onerror();
            }, 0);

            const result = await loadPromise;
            expect(result).toBeNull();
        });
    });
});
