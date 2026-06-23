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
        this._saveTimer = null; // 防抖定时器
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

    /**
     * 打开 IndexedDB（v2），包含 database 和 files 两个 object store
     * @returns {Promise<IDBDatabase>}
     */
    openIDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LabtraceDB', 2);
            request.onupgradeneeded = (event) => {
                const idb = event.target.result;
                if (!idb.objectStoreNames.contains('database')) {
                    idb.createObjectStore('database');
                }
                if (!idb.objectStoreNames.contains('files')) {
                    idb.createObjectStore('files');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async loadFromStorage() {
        try {
            const idb = await this.openIDB();
            return new Promise((resolve) => {
                try {
                    const tx = idb.transaction(['database'], 'readonly');
                    const store = tx.objectStore('database');
                    const getReq = store.get('labtrace');
                    getReq.onsuccess = () => {
                        idb.close();
                        resolve(getReq.result ? getReq.result.data : null);
                    };
                    getReq.onerror = () => {
                        idb.close();
                        resolve(null);
                    };
                } catch (e) {
                    idb.close();
                    resolve(null);
                }
            });
        } catch (e) {
            return null;
        }
    }

    async saveToStorage() {
        if (!this.db) return;

        const data = this.db.export();

        try {
            const idb = await this.openIDB();
            return new Promise((resolve, reject) => {
                const tx = idb.transaction(['database'], 'readwrite');
                const store = tx.objectStore('database');
                store.put({ data: data }, 'labtrace');
                tx.oncomplete = () => {
                    idb.close();
                    resolve(true);
                };
                tx.onerror = () => {
                    idb.close();
                    reject(tx.error);
                };
            });
        } catch (e) {
            console.error('Failed to save to storage:', e);
        }
    }

    /** 防抖保存：短时间内多次调用只执行一次 */
    debouncedSave() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this.saveToStorage();
            this._saveTimer = null;
        }, 500);
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

    // ========== 文件持久化存储（IndexedDB files store） ==========

    /**
     * 保存文件到 IndexedDB files store
     * @param {string} fileName - 文件名（不含路径前缀）
     * @param {Uint8Array|Blob} data - 文件数据
     */
    async saveFile(fileName, data) {
        const idb = await this.openIDB();
        return new Promise((resolve, reject) => {
            const tx = idb.transaction(['files'], 'readwrite');
            const store = tx.objectStore('files');
            store.put(data, fileName);
            tx.oncomplete = () => { idb.close(); resolve(true); };
            tx.onerror = () => { idb.close(); reject(tx.error); };
        });
    }

    /**
     * 批量保存文件（在一个事务中）
     * @param {Map<string, Uint8Array>} fileMap - fileName -> data
     * @param {function} onProgress - 进度回调 (current, total)
     */
    async saveFilesBatch(fileMap, onProgress) {
        const idb = await this.openIDB();
        return new Promise((resolve, reject) => {
            const tx = idb.transaction(['files'], 'readwrite');
            const store = tx.objectStore('files');
            const entries = Array.from(fileMap.entries());
            let completed = 0;

            for (const [name, data] of entries) {
                const req = store.put(data, name);
                req.onsuccess = () => {
                    completed++;
                    if (onProgress) onProgress(completed, entries.length);
                };
                req.onerror = () => {
                    console.error('保存文件失败:', name, req.error);
                    completed++;
                    if (onProgress) onProgress(completed, entries.length);
                };
            }

            tx.oncomplete = () => { idb.close(); resolve(entries.length); };
            tx.onerror = () => { idb.close(); reject(tx.error); };
            tx.onabort = () => { idb.close(); reject(new Error('批量保存事务被中止')); };
        });
    }

    /**
     * 从 IndexedDB 获取文件
     * @param {string} fileName - 文件名
     * @returns {Promise<Uint8Array|null>}
     */
    async getFile(fileName) {
        const idb = await this.openIDB();
        return new Promise((resolve) => {
            const tx = idb.transaction(['files'], 'readonly');
            const store = tx.objectStore('files');
            const req = store.get(fileName);
            req.onsuccess = () => { idb.close(); resolve(req.result || null); };
            req.onerror = () => { idb.close(); resolve(null); };
        });
    }

    /**
     * 删除所有已存储的文件
     */
    async deleteAllFiles() {
        const idb = await this.openIDB();
        return new Promise((resolve, reject) => {
            const tx = idb.transaction(['files'], 'readwrite');
            const store = tx.objectStore('files');
            store.clear();
            tx.oncomplete = () => { idb.close(); resolve(true); };
            tx.onerror = () => { idb.close(); reject(tx.error); };
        });
    }

    /**
     * 获取已存储文件数量
     */
    async getFileCount() {
        const idb = await this.openIDB();
        return new Promise((resolve) => {
            const tx = idb.transaction(['files'], 'readonly');
            const store = tx.objectStore('files');
            const req = store.count();
            req.onsuccess = () => { idb.close(); resolve(req.result); };
            req.onerror = () => { idb.close(); resolve(0); };
        });
    }

    /**
     * 从 file_path 中提取文件名
     * @param {string} filePath - 如 'data/uploads/xxx_name_date.pdf'
     * @returns {string} 文件名部分
     */
    extractFileName(filePath) {
        if (!filePath) return '';
        return filePath.split('/').pop();
    }

    // ========== 备份导入/导出 ==========

    /**
     * 从 zip 备份文件导入（数据库 + 关联文件）
     * @param {File|ArrayBuffer} zipSource - zip 文件或 ArrayBuffer
     * @param {function} onProgress - 进度回调 (stage, current, total)
     *   stage: 'parsing' | 'db' | 'files' | 'done'
     */
    async importFromBackup(zipSource, onProgress) {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip 库未加载，请检查网络连接后刷新页面');
        }

        const report = (stage, current, total) => {
            if (onProgress) onProgress(stage, current, total);
        };

        // 1. 解析 zip
        report('parsing', 0, 0);
        const zip = await JSZip.loadAsync(zipSource);
        const fileNames = Object.keys(zip.files);

        // 2. 找到并导入数据库
        report('db', 0, 0);
        let dbFile = null;
        for (const name of fileNames) {
            if (name.endsWith('.db') || name.endsWith('.sqlite')) {
                dbFile = name;
                break;
            }
        }

        if (!dbFile) {
            throw new Error('备份文件中未找到数据库文件（.db / .sqlite）');
        }

        const dbData = await zip.file(dbFile).async('uint8array');
        this.db = new this.SQL.Database(dbData);
        await this.saveToStorage();
        report('db', 1, 1);

        // 3. 清理旧文件并保存新附件（PDF/图片）
        await this.deleteAllFiles();

        const attachments = fileNames.filter(name => {
            const lower = name.toLowerCase();
            return !zip.files[name].dir && (
                lower.endsWith('.pdf') || lower.endsWith('.png') ||
                lower.endsWith('.jpg') || lower.endsWith('.jpeg')
            );
        });

        if (attachments.length > 0) {
            // 分批处理，每批20个文件，避免一次性将所有文件数据加载到内存
            const BATCH_SIZE = 20;
            let totalProcessed = 0;

            for (let i = 0; i < attachments.length; i += BATCH_SIZE) {
                const batch = attachments.slice(i, i + BATCH_SIZE);
                const fileMap = new Map();

                for (const attName of batch) {
                    // 取文件名部分（去掉 files/ 前缀）
                    const baseName = attName.split('/').pop();
                    const data = await zip.file(attName).async('uint8array');
                    fileMap.set(baseName, data);
                }

                await this.saveFilesBatch(fileMap, (current, total) => {
                    report('files', totalProcessed + current, attachments.length);
                });

                totalProcessed += batch.length;
            }
        }

        report('done', attachments.length, attachments.length);

        return {
            dbImported: true,
            fileCount: attachments.length
        };
    }

    /**
     * 导出备份 zip（数据库 + 所有关联文件）
     * @param {function} onProgress - 进度回调 (current, total)
     * @returns {Promise<Blob>} zip Blob
     */
    async exportBackup(onProgress) {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip 库未加载，请检查网络连接后刷新页面');
        }

        const zip = new JSZip();

        // 1. 导出数据库
        const dbData = this.exportDatabase();
        if (dbData) {
            zip.file('labtrace.db', dbData);
        }

        // 2. 从 IndexedDB 导出所有文件
        const idb = await this.openIDB();
        const files = await new Promise((resolve) => {
            const tx = idb.transaction(['files'], 'readonly');
            const store = tx.objectStore('files');
            const cursorReq = store.openCursor();
            const result = [];
            cursorReq.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    result.push({ name: cursor.key, data: cursor.value });
                    cursor.continue();
                } else {
                    idb.close();
                    resolve(result);
                }
            };
            cursorReq.onerror = () => { idb.close(); resolve([]); };
        });

        for (let i = 0; i < files.length; i++) {
            zip.file('files/' + files[i].name, files[i].data);
            if (onProgress) onProgress(i + 1, files.length);
        }

        // 3. 生成 zip blob
        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        return blob;
    }

    // Query methods
    query(sql, params = []) {
        if (!this.db) throw new Error('Database not initialized');
        try {
            const stmt = this.db.prepare(sql);
            stmt.bind(params);
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

        const range = refText.trim();

        // Range format: "min-max" or "min~max" or "min – max"
        const rangeMatch = range.match(/^([\d.]+)\s*[-~–—]\s*([\d.]+)$/);
        if (rangeMatch) {
            const min = parseFloat(rangeMatch[1]);
            const max = parseFloat(rangeMatch[2]);
            if (numValue < min) return 'low';
            if (numValue > max) return 'high';
            return 'normal';
        }

        // Less than or equal: "≤max"
        const lteMatch = range.match(/^≤\s*([\d.]+)$/);
        if (lteMatch) {
            const max = parseFloat(lteMatch[1]);
            return numValue > max ? 'high' : 'normal';
        }

        // Greater than or equal: "≥min"
        const gteMatch = range.match(/^≥\s*([\d.]+)$/);
        if (gteMatch) {
            const min = parseFloat(gteMatch[1]);
            return numValue < min ? 'low' : 'normal';
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

        // Range with unit: "min-max unit" e.g. "3.5-9.5 x10^9/L"
        const rangeUnitMatch = range.match(/^([\d.]+)\s*[-~–]\s*([\d.]+)\s+/);
        if (rangeUnitMatch) {
            const min = parseFloat(rangeUnitMatch[1]);
            const max = parseFloat(rangeUnitMatch[2]);
            if (numValue < min) return 'low';
            if (numValue > max) return 'high';
            return 'normal';
        }

        return 'normal';
    }
}

// Global database instance
const labtraceDB = new LabtraceDB();
