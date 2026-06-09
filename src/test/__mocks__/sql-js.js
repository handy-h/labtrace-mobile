/**
 * Mock for sql.js module
 */

class MockStatement {
    constructor(results = []) {
        this.results = results;
        this.index = 0;
    }

    step() {
        return this.index < this.results.length;
    }

    getAsObject() {
        return this.results[this.index++];
    }

    free() {
        // Cleanup
    }

    bind(values) {
        // Mock bind
    }
}

class MockDatabase {
    constructor(data) {
        this.tables = {};
        this.data = data || {};
    }

    run(sql, params = []) {
        // Parse CREATE TABLE
        const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
        if (createMatch) {
            const tableName = createMatch[1];
            if (!this.tables[tableName]) {
                this.tables[tableName] = [];
            }
        }

        // Parse INSERT
        const insertMatch = sql.match(/INSERT INTO (\w+)/i);
        if (insertMatch) {
            const tableName = insertMatch[1];
            if (!this.tables[tableName]) {
                this.tables[tableName] = [];
            }
        }
    }

    prepare(sql) {
        // Return mock statement with sample data based on query
        const lowerSql = sql.toLowerCase();
        let results = [];

        if (lowerSql.includes('from subjects')) {
            results = this.data.subjects || [];
        } else if (lowerSql.includes('from hospitals')) {
            results = this.data.hospitals || [];
        } else if (lowerSql.includes('from lab_reports')) {
            results = this.data.labReports || [];
        } else if (lowerSql.includes('from report_items')) {
            results = this.data.reportItems || [];
        } else if (lowerSql.includes('from imaging_reports')) {
            results = this.data.imagingReports || [];
        } else if (lowerSql.includes('from test_items')) {
            results = this.data.testItems || [];
        }

        return new MockStatement(results);
    }

    export() {
        return new Uint8Array([1, 2, 3, 4, 5]);
    }
}

const initSqlJs = jest.fn(() => Promise.resolve({
    Database: MockDatabase,
}));

module.exports = {
    initSqlJs,
    Database: MockDatabase,
    Statement: MockStatement,
};
