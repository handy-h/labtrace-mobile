/**
 * Jest Test Setup
 * Global mocks and test utilities
 */

// Mock console methods to reduce noise during tests
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock window object
global.window = {
    ...global.window,
    addEventListener: jest.fn(),
    location: { href: '' },
    app: null,
};

// Mock Blob
global.Blob = class Blob {
    constructor(parts, options) {
        this.parts = parts;
        this.options = options;
        this.size = parts.reduce((acc, part) => acc + part.length, 0);
    }
};

// Mock File
global.File = class File extends Blob {
    constructor(parts, name, options) {
        super(parts, options);
        this.name = name;
        this.lastModified = Date.now();
    }
};

// Mock FileReader
global.FileReader = class FileReader {
    constructor() {
        this.readyState = 0;
        this.result = null;
    }

    readAsArrayBuffer(blob) {
        this.readyState = 1;
        setTimeout(() => {
            this.result = new ArrayBuffer(blob.size || 0);
            this.readyState = 2;
            if (this.onload) {
                this.onload({ target: this });
            }
        }, 0);
    }

    readAsText(blob) {
        this.readyState = 1;
        setTimeout(() => {
            this.result = blob.parts ? blob.parts.join('') : '';
            this.readyState = 2;
            if (this.onload) {
                this.onload({ target: this });
            }
        }, 0);
    }
};

// Mock Canvas
global.HTMLCanvasElement = class HTMLCanvasElement {
    getContext(type) {
        if (type === '2d') {
            return {
                fillRect: jest.fn(),
                clearRect: jest.fn(),
                getImageData: jest.fn(() => ({ data: [] })),
                putImageData: jest.fn(),
                createImageData: jest.fn(() => ({ data: [] })),
                setTransform: jest.fn(),
                drawImage: jest.fn(),
                save: jest.fn(),
                fillText: jest.fn(),
                restore: jest.fn(),
                beginPath: jest.fn(),
                moveTo: jest.fn(),
                lineTo: jest.fn(),
                closePath: jest.fn(),
                stroke: jest.fn(),
                translate: jest.fn(),
                scale: jest.fn(),
                rotate: jest.fn(),
                arc: jest.fn(),
                fill: jest.fn(),
                measureText: jest.fn(() => ({ width: 0 })),
                transform: jest.fn(),
                rect: jest.fn(),
                clip: jest.fn(),
            };
        }
        return null;
    }
};

// Mock requestAnimationFrame
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock localStorage
global.localStorage = {
    data: {},
    getItem(key) {
        return this.data[key] || null;
    },
    setItem(key, value) {
        this.data[key] = String(value);
    },
    removeItem(key) {
        delete this.data[key];
    },
    clear() {
        this.data = {};
    },
};

// Mock sessionStorage
global.sessionStorage = {
    data: {},
    getItem(key) {
        return this.data[key] || null;
    },
    setItem(key, value) {
        this.data[key] = String(value);
    },
    removeItem(key) {
        delete this.data[key];
    },
    clear() {
        this.data = {};
    },
};

// Reset all mocks after each test
afterEach(() => {
    jest.clearAllMocks();
    global.localStorage.clear();
    global.sessionStorage.clear();
});
