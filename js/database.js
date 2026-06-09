/**
 * Labtrace Database Manager
 * Uses sql.js (SQLite compiled to WebAssembly) for in-browser database operations
 */

class LabtraceDB {
    constructor() {
        this.db = null;
        this.SQL = null;
        this.initialized = false;
        this.dbName = 'labtrace.db';
    }

    async init() {
        if (this.initialized) return;
        
        try {
            // Load sql.js
            this.SQL = await initSqlJs({
                locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`
            });
            
            // Try to load existing database from localStorage or IndexedDB
            const savedDb = await this.loadFromStorage();
            if (savedDb) {
                this.db = new this.SQL.Database(savedDb);
                console.log('Database loaded from storage');
            } else {
                // Create empty database with schema
                this.db = new this.SQL.Database();
                this.createSchema();
                console.log('New empty database created');
            }
            
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    createSchema() {
        const schema = `
            CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                gender TEXT,
                birth_date TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS hospitals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                level TEXT
            );
            
            CREATE TABLE IF NOT EXISTS test_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT,
                standard_name TEXT NOT NULL,
                category TEXT,
                default_unit TEXT,
                value_type TEXT DEFAULT 'numeric',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS lab_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id INTEGER,
                hospital_id INTEGER,
                sample_date TEXT,
                file_path TEXT,
                file_md5 TEXT,
                ocr_status TEXT DEFAULT 'pending',
                ocr_raw_json TEXT,
                whole_report_notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                column_mapping_json TEXT,
                ocr_table_json TEXT,
                categories TEXT,
                FOREIGN KEY (subject_id) REFERENCES subjects(id),
                FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
            );
            
            CREATE TABLE IF NOT EXISTS report_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER,
                test_item_id INTEGER,
                original_value TEXT,
                normalized_value REAL,
                original_unit TEXT,
                normalized_unit TEXT,
                confidence INTEGER DEFAULT 100,
                ref_interval_id INTEGER,
                flag TEXT,
                row_notes TEXT,
                ocr_bbox TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                test_item_name TEXT,
                ref_interval_text TEXT,
                category TEXT,
                FOREIGN KEY (report_id) REFERENCES lab_reports(id),
                FOREIGN KEY (test_item_id) REFERENCES test_items(id)
            );
            
            CREATE TABLE IF NOT EXISTS imaging_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id INTEGER,
                hospital_id INTEGER,
                report_type TEXT,
                exam_item_name TEXT,
                inspect_no TEXT,
                sample_date TEXT,
                exam_site TEXT,
                exam_description TEXT,
                diagnosis_result TEXT,
                file_path TEXT,
                file_md5 TEXT,
                ocr_raw_json TEXT,
                ocr_status TEXT DEFAULT 'pending',
                thumbnail_path TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                mapping_config_json TEXT,
                FOREIGN KEY (subject_id) REFERENCES subjects(id),
                FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_reports_subject ON lab_reports(subject_id);
            CREATE INDEX IF NOT EXISTS idx_reports_date ON lab_reports(sample_date);
            CREATE INDEX IF NOT EXISTS idx_report_items_report ON report_items(report_id);
            CREATE INDEX IF NOT EXISTS idx_report_items_name ON report_items(test_item_name);
            CREATE INDEX IF NOT EXISTS idx_imaging_subject ON imaging_reports(subject_id);
        `;
        
        this.db.run(schema);
    }

    async loadFromStorage() {
        // Try IndexedDB first
        try {
            const request = indexedDB.open('LabtraceDB', 1);
            return new Promise((resolve, reject) => {
                request.onerror = () => resolve(null);
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    const tx = db.transaction(['database'], 'readonly');
                    const store = tx.objectStore('database');
                    const getReq = store.get('labtrace');
                    getReq.onsuccess = () => resolve(getReq.result ? getReq.result.data : null);
                    getReq.onerror = () => resolve(null);
                };
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    db.createObjectStore('database');
                };
            });
        } catch (e) {
            return null;
        }
    }

    async saveToStorage() {
        if (!this.db) return;
        
        const data = this.db.export();
        
        try {
            const request = indexedDB.open('LabtraceDB', 1);
            return new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    const tx = db.transaction(['database'], 'readwrite');
                    const store = tx.objectStore('database');
                    store.put({ data: data }, 'labtrace');
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(tx.error);
                };
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    db.createObjectStore('database');
                };
            });
        } catch (e) {
            console.error('Failed to save to storage:', e);
        }
    }

    // Import database from file
    async importDatabase(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const uint8Array = new Uint8Array(e.target.result);
                    this.db = new this.SQL.Database(uint8Array);
                    this.saveToStorage();
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // Export database
    exportDatabase() {
        if (!this.db) return null;
        return this.db.export();
    }

    // Query methods
    query(sql, params = []) {
        if (!this.db) throw new Error('Database not initialized');
        try {
            const stmt = this.db.prepare(sql);
            const result = [];
            while (stmt.step()) {
                result.push(stmt.getAsObject());
            }
            stmt.free();
            return result;
        } catch (error) {
            console.error('Query error:', sql, error);
            throw error;
        }
    }

    run(sql, params = []) {
        if (!this.db) throw new Error('Database not initialized');
        this.db.run(sql, params);
    }

    // Data retrieval methods
    getSubjects() {
        return this.query('SELECT * FROM subjects ORDER BY name');
    }

    getHospitals() {
        return this.query('SELECT * FROM hospitals ORDER BY name');
    }

    getCategories() {
        return this.query(`
            SELECT DISTINCT categories as name 
            FROM lab_reports 
            WHERE categories IS NOT NULL AND categories != ''
            ORDER BY categories
        `);
    }

    getTestItems() {
        return this.query('SELECT * FROM test_items ORDER BY category, standard_name');
    }

    getLabReports(filters = {}) {
        let sql = `
            SELECT r.*, s.name as subject_name, h.name as hospital_name,
                   COUNT(ri.id) as item_count
            FROM lab_reports r
            LEFT JOIN subjects s ON r.subject_id = s.id
            LEFT JOIN hospitals h ON r.hospital_id = h.id
            LEFT JOIN report_items ri ON r.id = ri.report_id
            WHERE 1=1
        `;
        const params = [];
        
        if (filters.subject_id) {
            sql += ' AND r.subject_id = ?';
            params.push(filters.subject_id);
        }
        if (filters.hospital_id) {
            sql += ' AND r.hospital_id = ?';
            params.push(filters.hospital_id);
        }
        if (filters.category) {
            sql += ' AND r.categories = ?';
            params.push(filters.category);
        }
        if (filters.date_from) {
            sql += ' AND r.sample_date >= ?';
            params.push(filters.date_from);
        }
        if (filters.date_to) {
            sql += ' AND r.sample_date <= ?';
            params.push(filters.date_to);
        }
        
        sql += ' GROUP BY r.id ORDER BY r.sample_date DESC';
        return this.query(sql, params);
    }

    getReportItems(reportId) {
        return this.query(`
            SELECT ri.*, ti.standard_name, ti.default_unit, ti.value_type
            FROM report_items ri
            LEFT JOIN test_items ti ON ri.test_item_id = ti.id
            WHERE ri.report_id = ?
            ORDER BY ri.id
        `, [reportId]);
    }

    getImagingReports(filters = {}) {
        let sql = `
            SELECT ir.*, s.name as subject_name, h.name as hospital_name
            FROM imaging_reports ir
            LEFT JOIN subjects s ON ir.subject_id = s.id
            LEFT JOIN hospitals h ON ir.hospital_id = h.id
            WHERE 1=1
        `;
        const params = [];
        
        if (filters.subject_id) {
            sql += ' AND ir.subject_id = ?';
            params.push(filters.subject_id);
        }
        if (filters.hospital_id) {
            sql += ' AND ir.hospital_id = ?';
            params.push(filters.hospital_id);
        }
        
        sql += ' ORDER BY ir.sample_date DESC';
        return this.query(sql, params);
    }

    getTrendData(subjectId, itemName) {
        return this.query(`
            SELECT r.sample_date, ri.original_value, ri.normalized_value,
                   ri.original_unit, ri.ref_interval_text, ri.flag
            FROM report_items ri
            JOIN lab_reports r ON ri.report_id = r.id
            WHERE r.subject_id = ? AND ri.test_item_name = ?
            AND r.sample_date IS NOT NULL AND r.sample_date != ''
            ORDER BY r.sample_date
        `, [subjectId, itemName]);
    }

    searchReports(keyword, dateFrom, dateTo) {
        let sql = `
            SELECT DISTINCT r.*, s.name as subject_name, h.name as hospital_name
            FROM lab_reports r
            LEFT JOIN subjects s ON r.subject_id = s.id
            LEFT JOIN hospitals h ON r.hospital_id = h.id
            LEFT JOIN report_items ri ON r.id = ri.report_id
            WHERE 1=1
        `;
        const params = [];
        
        if (keyword) {
            sql += ` AND (
                r.categories LIKE ? OR 
                ri.test_item_name LIKE ? OR 
                s.name LIKE ? OR 
                h.name LIKE ?
            )`;
            const like = `%${keyword}%`;
            params.push(like, like, like, like);
        }
        
        if (dateFrom) {
            sql += ' AND r.sample_date >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            sql += ' AND r.sample_date <= ?';
            params.push(dateTo);
        }
        
        sql += ' ORDER BY r.sample_date DESC';
        return this.query(sql, params);
    }

    getStatistics(subjectId) {
        const stats = {};
        
        // Total reports
        const reportCount = this.query(`
            SELECT COUNT(*) as count FROM lab_reports WHERE subject_id = ?
        `, [subjectId]);
        stats.reportCount = reportCount[0]?.count || 0;
        
        // Total imaging reports
        const imagingCount = this.query(`
            SELECT COUNT(*) as count FROM imaging_reports WHERE subject_id = ?
        `, [subjectId]);
        stats.imagingCount = imagingCount[0]?.count || 0;
        
        // Total items
        const itemCount = this.query(`
            SELECT COUNT(*) as count FROM report_items ri
            JOIN lab_reports r ON ri.report_id = r.id
            WHERE r.subject_id = ?
        `, [subjectId]);
        stats.itemCount = itemCount[0]?.count || 0;
        
        // Abnormal items
        const abnormalCount = this.query(`
            SELECT COUNT(*) as count FROM report_items ri
            JOIN lab_reports r ON ri.report_id = r.id
            WHERE r.subject_id = ? AND (ri.flag = 'high' OR ri.flag = 'low')
        `, [subjectId]);
        stats.abnormalCount = abnormalCount[0]?.count || 0;
        
        // Date range
        const dateRange = this.query(`
            SELECT MIN(sample_date) as min_date, MAX(sample_date) as max_date
            FROM lab_reports WHERE subject_id = ?
        `, [subjectId]);
        stats.dateRange = dateRange[0];
        
        // Recent abnormal items
        stats.recentAbnormal = this.query(`
            SELECT ri.test_item_name, ri.original_value, ri.original_unit,
                   ri.ref_interval_text, ri.flag, r.sample_date
            FROM report_items ri
            JOIN lab_reports r ON ri.report_id = r.id
            WHERE r.subject_id = ? AND (ri.flag = 'high' OR ri.flag = 'low')
            ORDER BY r.sample_date DESC
            LIMIT 10
        `, [subjectId]);
        
        return stats;
    }

    // Check if value is abnormal
    checkAbnormal(value, refText) {
        if (!refText || !value) return 'normal';
        
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return 'normal';
        
        // Parse reference interval (e.g., "65.0-85.0" or "<5.0" or ">10.0")
        const range = refText.trim();
        
        // Range format: "min-max"
        const rangeMatch = range.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
        if (rangeMatch) {
            const min = parseFloat(rangeMatch[1]);
            const max = parseFloat(rangeMatch[2]);
            if (numValue < min) return 'low';
            if (numValue > max) return 'high';
            return 'normal';
        }
        
        // Less than: "<max"
        const ltMatch = range.match(/^<\s*([\d.]+)$/);
        if (ltMatch) {
            const max = parseFloat(ltMatch[1]);
            return numValue >= max ? 'high' : 'normal';
        }
        
        // Greater than: ">min"
        const gtMatch = range.match(/^>\s*([\d.]+)$/);
        if (gtMatch) {
            const min = parseFloat(gtMatch[1]);
            return numValue <= min ? 'low' : 'normal';
        }
        
        return 'normal';
    }
}

// Global database instance
const labtraceDB = new LabtraceDB();
