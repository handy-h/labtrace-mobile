/**
 * Labtrace Mobile Application
 * Main application logic
 */

// 常量定义，消除魔法数字
const MODAL_AUTO_CLOSE_DELAY = 1500;
const PDF_CACHE_MAX_SIZE = 50;

class LabtraceApp {
    constructor() {
        this.currentTab = 'reports';
        this.chartInstance = null;
        this.pdfFiles = new Map(); // Store imported PDF files
        this._tabSwitching = false; // Tab 切换防抖锁
        this._loadingCount = 0; // 加载状态计数器
        this._currentBlobUrl = null; // 当前 blob URL，用于释放内存
    }

    async init() {
        // Initialize database
        await labtraceDB.init();

        // Setup event listeners
        this.setupEventListeners();

        // Load initial data
        await this.loadFilterOptions();
        await this.loadReports();

        console.log('Labtrace App initialized');
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Import modal
        document.getElementById('btn-import').addEventListener('click', () => {
            this.openModal('import-modal');
        });

        document.getElementById('btn-confirm-import').addEventListener('click', () => {
            this.handleImport();
        });

        // Export backup
        document.getElementById('btn-export-backup').addEventListener('click', () => {
            this.handleExportBackup();
        });

        // Close modals
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.classList.remove('active');
            });
        });

        // Filter changes
        document.getElementById('filter-subject').addEventListener('change', () => this.loadReports());
        document.getElementById('filter-hospital').addEventListener('change', () => this.loadReports());
        document.getElementById('filter-category').addEventListener('change', () => this.loadReports());

        // Trend filters
        document.getElementById('trend-subject').addEventListener('change', () => this.loadTrendOptions());
        document.getElementById('trend-item').addEventListener('change', () => this.loadTrendChart());

        // Search
        document.getElementById('btn-search').addEventListener('click', () => this.performSearch());
        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Stats filter
        document.getElementById('stats-subject').addEventListener('change', () => this.loadStats());
    }

    // --- XSS 防护工具 ---

    /** 转义 HTML 内容，防止 XSS */
    escapeHtml(text) {
        if (!text) return '';
        // 优先使用 DOM API（最可靠的转义方式）
        if (typeof document !== 'undefined' && document.createElement) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        // 非浏览器环境回退到字符串替换
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // --- Tab 切换（带防抖） ---

    switchTab(tab) {
        if (this._tabSwitching) return;
        this._tabSwitching = true;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tab}`);
        });

        this.currentTab = tab;

        // Load tab-specific data
        switch (tab) {
            case 'reports':
                this.loadReports();
                break;
            case 'trends':
                this.loadTrendOptions();
                break;
            case 'search':
                // Search is on-demand
                break;
            case 'stats':
                this.loadStats();
                break;
        }

        setTimeout(() => { this._tabSwitching = false; }, 300);
    }

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    // --- 加载状态管理 ---

    showLoading(container, text) {
        this._loadingCount++;
        container.innerHTML = `<div class="loading">${this.escapeHtml(text || '加载中...')}</div>`;
    }

    hideLoading(container) {
        this._loadingCount = Math.max(0, this._loadingCount - 1);
    }

    async loadFilterOptions() {
        try {
            // Load subjects
            const subjects = labtraceDB.getSubjects();
            const subjectSelects = ['filter-subject', 'trend-subject', 'stats-subject'];
            subjectSelects.forEach(id => {
                const select = document.getElementById(id);
                if (!select) return;
                const currentValue = select.value;
                select.innerHTML = '<option value="">全部受检者</option>' +
                    subjects.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)} (${this.escapeHtml(s.gender) || '未知'}, ${this.escapeHtml(s.birth_date) || '未知'})</option>`).join('');
                select.value = currentValue;
            });

            // Load hospitals
            const hospitals = labtraceDB.getHospitals();
            const hospitalSelect = document.getElementById('filter-hospital');
            if (hospitalSelect) {
                const currentValue = hospitalSelect.value;
                hospitalSelect.innerHTML = '<option value="">全部医院</option>' +
                    hospitals.map(h => `<option value="${h.id}">${this.escapeHtml(h.name)}</option>`).join('');
                hospitalSelect.value = currentValue;
            }

            // Load categories
            const categories = labtraceDB.getCategories();
            const categorySelect = document.getElementById('filter-category');
            if (categorySelect) {
                const currentValue = categorySelect.value;
                categorySelect.innerHTML = '<option value="">全部类别</option>' +
                    categories.map(c => `<option value="${this.escapeHtml(c.name)}">${this.escapeHtml(c.name)}</option>`).join('');
                categorySelect.value = currentValue;
            }
        } catch (error) {
            console.error('Error loading filter options:', error);
        }
    }

    async loadReports() {
        const container = document.getElementById('reports-list');
        this.showLoading(container, '加载中...');

        const filters = {
            subject_id: document.getElementById('filter-subject').value,
            hospital_id: document.getElementById('filter-hospital').value,
            category: document.getElementById('filter-category').value
        };

        try {
            const reports = labtraceDB.getLabReports(filters);
            const imaging = labtraceDB.getImagingReports(filters);

            if (reports.length === 0 && imaging.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <p>暂无报告数据</p>
                        <p class="hint">点击右上角 📥 导入数据</p>
                    </div>
                `;
                return;
            }

            let html = '';

            // Lab reports
            if (reports.length > 0) {
                html += '<div class="section-title">检验报告</div>';
                reports.forEach(report => {
                    html += this.createReportCard(report);
                });
            }

            // Imaging reports
            if (imaging.length > 0) {
                html += '<div class="section-title" style="margin-top:16px">影像报告</div>';
                imaging.forEach(report => {
                    html += this.createImagingCard(report);
                });
            }

            container.innerHTML = html;

            // Add click handlers
            container.querySelectorAll('.card').forEach(card => {
                card.addEventListener('click', () => {
                    const reportId = card.dataset.id;
                    const type = card.dataset.type;
                    if (type === 'lab') {
                        this.showReportDetail(reportId);
                    } else {
                        this.showImagingDetail(reportId);
                    }
                });
            });

            // Bind file view buttons via data attribute (avoids XSS from inline onclick)
            container.querySelectorAll('.btn-file-view').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.viewPDF(btn.dataset.file);
                });
            });

        } catch (error) {
            console.error('Error loading reports:', error);
            container.innerHTML = '<div class="empty-state">加载失败</div>';
        } finally {
            this.hideLoading(container);
        }
    }

    createReportCard(report) {
        const date = this.escapeHtml(report.sample_date || '未知日期');
        const category = this.escapeHtml(report.categories || '未分类');
        const hospital = this.escapeHtml(report.hospital_name || '未知医院');
        const subject = this.escapeHtml(report.subject_name || '未知受检者');
        const itemCount = report.item_count || 0;
        const reportId = parseInt(report.id, 10);
        const filePath = report.file_path ? this.escapeHtml(report.file_path) : '';

        return `
            <div class="card" data-id="${reportId}" data-type="lab">
                <div class="card-header">
                    <div class="card-title">${category}</div>
                    <div class="card-date">${date}</div>
                </div>
                <div class="card-body">
                    <div>👤 ${subject} | 🏥 ${hospital}</div>
                    <div style="margin-top:4px">📊 ${itemCount} 项检测指标</div>
                </div>
                <div class="card-footer">
                    <div class="card-meta">报告 #${reportId}</div>
                    <div class="card-actions">
                        <button class="btn-sm btn-view" onclick="event.stopPropagation(); app.showReportDetail(${reportId})">查看</button>
                        ${filePath ? `<button class="btn-sm btn-pdf btn-file-view" data-file="${filePath}">${this.isImageFile(filePath) ? '图片' : 'PDF'}</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    createImagingCard(report) {
        const date = this.escapeHtml(report.sample_date || '未知日期');
        const name = this.escapeHtml(report.exam_item_name || '影像检查');
        const site = this.escapeHtml(report.exam_site || '');
        const hospital = this.escapeHtml(report.hospital_name || '未知医院');
        const subject = this.escapeHtml(report.subject_name || '未知受检者');
        const reportId = parseInt(report.id, 10);
        const filePath = report.file_path ? this.escapeHtml(report.file_path) : '';

        return `
            <div class="card" data-id="${reportId}" data-type="imaging">
                <div class="card-header">
                    <div class="card-title">${name}</div>
                    <div class="card-date">${date}</div>
                </div>
                <div class="card-body">
                    <div>👤 ${subject} | 🏥 ${hospital}</div>
                    <div style="margin-top:4px">📍 ${site || '部位未指定'}</div>
                </div>
                <div class="card-footer">
                    <div class="card-meta">影像 #${reportId}</div>
                    <div class="card-actions">
                        <button class="btn-sm btn-view" onclick="event.stopPropagation(); app.showImagingDetail(${reportId})">查看</button>
                        ${filePath ? `<button class="btn-sm btn-pdf btn-file-view" data-file="${filePath}">${this.isImageFile(filePath) ? '图片' : 'PDF'}</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    showReportDetail(reportId) {
        const report = labtraceDB.query('SELECT r.*, s.name as subject_name, h.name as hospital_name FROM lab_reports r LEFT JOIN subjects s ON r.subject_id = s.id LEFT JOIN hospitals h ON r.hospital_id = h.id WHERE r.id = ?', [reportId])[0];
        if (!report) return;

        const items = labtraceDB.getReportItems(reportId);
        const filePath = report.file_path ? this.escapeHtml(report.file_path) : '';

        let html = `
            <div class="report-section">
                <h4>基本信息</h4>
                <div class="report-info">
                    <div class="report-info-row"><span>受检者</span><span>${this.escapeHtml(report.subject_name) || '未知'}</span></div>
                    <div class="report-info-row"><span>医院</span><span>${this.escapeHtml(report.hospital_name) || '未知'}</span></div>
                    <div class="report-info-row"><span>采样日期</span><span>${this.escapeHtml(report.sample_date) || '未知'}</span></div>
                    <div class="report-info-row"><span>类别</span><span>${this.escapeHtml(report.categories) || '未分类'}</span></div>
                    ${filePath ? `<div class="report-info-row"><span>原始文件</span><span><button class="btn-sm btn-pdf btn-file-view" data-file="${filePath}">查看${this.isImageFile(report.file_path) ? '图片' : 'PDF'}</button></span></div>` : ''}
                </div>
            </div>
            <div class="report-section">
                <h4>检测项目 (${items.length}项)</h4>
                <div class="item-list">
        `;

        items.forEach(item => {
            const flag = item.flag || labtraceDB.checkAbnormal(item.original_value, item.ref_interval_text);
            const badgeClass = flag === 'high' ? 'badge-high' : flag === 'low' ? 'badge-low' : 'badge-normal';
            const badgeText = flag === 'high' ? '偏高' : flag === 'low' ? '偏低' : '正常';

            html += `
                <div class="item-row">
                    <div class="item-name">${this.escapeHtml(item.test_item_name) || '未知项目'}</div>
                    <div style="text-align:right">
                        <span class="item-value">${this.escapeHtml(item.original_value) || '-'} ${this.escapeHtml(item.original_unit) || ''}</span>
                        <div class="item-ref">参考: ${this.escapeHtml(item.ref_interval_text) || '无'}</div>
                    </div>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </div>
            `;
        });

        html += '</div></div>';

        document.getElementById('report-title').textContent = `${report.categories || '报告'} - ${report.sample_date || '未知日期'}`;
        document.getElementById('report-detail').innerHTML = html;
        // Bind file view buttons via data attribute (avoids XSS from inline onclick)
        document.getElementById('report-detail').querySelectorAll('.btn-file-view').forEach(btn => {
            btn.addEventListener('click', () => this.viewPDF(btn.dataset.file));
        });
        this.openModal('report-modal');
    }

    showImagingDetail(reportId) {
        const report = labtraceDB.query('SELECT ir.*, s.name as subject_name, h.name as hospital_name FROM imaging_reports ir LEFT JOIN subjects s ON ir.subject_id = s.id LEFT JOIN hospitals h ON ir.hospital_id = h.id WHERE ir.id = ?', [reportId])[0];
        if (!report) return;

        const filePath = report.file_path ? this.escapeHtml(report.file_path) : '';

        let html = `
            <div class="report-section">
                <h4>基本信息</h4>
                <div class="report-info">
                    <div class="report-info-row"><span>受检者</span><span>${this.escapeHtml(report.subject_name) || '未知'}</span></div>
                    <div class="report-info-row"><span>医院</span><span>${this.escapeHtml(report.hospital_name) || '未知'}</span></div>
                    <div class="report-info-row"><span>检查日期</span><span>${this.escapeHtml(report.sample_date) || '未知'}</span></div>
                    <div class="report-info-row"><span>检查项目</span><span>${this.escapeHtml(report.exam_item_name) || '未知'}</span></div>
                    <div class="report-info-row"><span>检查部位</span><span>${this.escapeHtml(report.exam_site) || '未指定'}</span></div>
                    <div class="report-info-row"><span>检查号</span><span>${this.escapeHtml(report.inspect_no) || '无'}</span></div>
                    ${filePath ? `<div class="report-info-row"><span>原始文件</span><span><button class="btn-sm btn-pdf btn-file-view" data-file="${filePath}">查看${this.isImageFile(report.file_path) ? '图片' : 'PDF'}</button></span></div>` : ''}
                </div>
            </div>
            <div class="report-section">
                <h4>检查描述</h4>
                <div class="report-info" style="white-space:pre-wrap">${this.escapeHtml(report.exam_description) || '无描述'}</div>
            </div>
            <div class="report-section">
                <h4>诊断结果</h4>
                <div class="report-info" style="white-space:pre-wrap;color:var(--danger);font-weight:500">${this.escapeHtml(report.diagnosis_result) || '无诊断结果'}</div>
            </div>
        `;

        document.getElementById('report-title').textContent = `${report.exam_item_name || '影像报告'} - ${report.sample_date || '未知日期'}`;
        document.getElementById('report-detail').innerHTML = html;
        // Bind file view buttons via data attribute (avoids XSS from inline onclick)
        document.getElementById('report-detail').querySelectorAll('.btn-file-view').forEach(btn => {
            btn.addEventListener('click', () => this.viewPDF(btn.dataset.file));
        });
        this.openModal('report-modal');
    }

    /** 判断文件是否为图片 */
    isImageFile(filePath) {
        if (!filePath) return false;
        const ext = filePath.split('.').pop().toLowerCase();
        return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext);
    }

    /** 根据文件扩展名返回正确的 MIME 类型 */
    getMimeType(filePath) {
        if (!filePath) return 'application/octet-stream';
        const ext = filePath.split('.').pop().toLowerCase();
        const mimeMap = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'webp': 'image/webp',
        };
        return mimeMap[ext] || 'application/octet-stream';
    }

    async viewPDF(filePath) {
        const fileName = labtraceDB.extractFileName(filePath);
        const isImage = this.isImageFile(filePath);
        const pdfViewer = document.getElementById('pdf-viewer');
        const imgViewer = document.getElementById('img-viewer');

        // 释放上一次的 blob URL，防止内存泄漏
        if (this._currentBlobUrl) {
            URL.revokeObjectURL(this._currentBlobUrl);
            this._currentBlobUrl = null;
        }

        // 重置显示状态
        pdfViewer.style.display = 'none';
        pdfViewer.src = '';
        imgViewer.style.display = 'none';
        imgViewer.src = '';

        document.getElementById('pdf-title').textContent = fileName;
        this.openModal('pdf-modal');

        // 将二进制数据渲染到查看器（使用正确的 MIME 类型，并跟踪 blob URL）
        const showFile = (data) => {
            const mime = this.getMimeType(filePath);
            const blob = new Blob([data], { type: mime });
            this._currentBlobUrl = URL.createObjectURL(blob);

            if (isImage) {
                imgViewer.src = this._currentBlobUrl;
                imgViewer.style.display = 'block';
            } else {
                pdfViewer.src = this._currentBlobUrl;
                pdfViewer.style.display = 'block';
            }
        };

        // 1. 先从 IndexedDB 持久化存储查找
        try {
            const storedData = await labtraceDB.getFile(fileName);
            if (storedData) {
                showFile(storedData);
                return;
            }
        } catch (e) {
            // IndexedDB 不可用，继续尝试其他方式
        }

        // 2. 从内存缓存查找
        const cachedFile = this.pdfFiles.get(fileName);
        if (cachedFile) {
            showFile(cachedFile);
            return;
        }

        // 3. 回退到直接 URL（开发服务器场景）
        if (isImage) {
            imgViewer.src = filePath;
            imgViewer.style.display = 'block';
        } else {
            pdfViewer.src = filePath;
            pdfViewer.style.display = 'block';
        }
    }

    async loadTrendOptions() {
        try {
            const subjectSelect = document.getElementById('trend-subject');
            const itemSelect = document.getElementById('trend-item');

            const subjectId = subjectSelect.value;
            if (!subjectId) {
                itemSelect.innerHTML = '<option value="">选择指标</option>';
                return;
            }

            // Get available test items for this subject
            const items = labtraceDB.query(`
                SELECT DISTINCT ri.test_item_name as name
                FROM report_items ri
                JOIN lab_reports r ON ri.report_id = r.id
                WHERE r.subject_id = ? AND ri.test_item_name IS NOT NULL
                ORDER BY ri.test_item_name
            `, [subjectId]);

            itemSelect.innerHTML = '<option value="">选择指标</option>' +
                items.map(i => `<option value="${this.escapeHtml(i.name)}">${this.escapeHtml(i.name)}</option>`).join('');
        } catch (error) {
            console.error('Error loading trend options:', error);
        }
    }

    async loadTrendChart() {
        try {
            const subjectId = document.getElementById('trend-subject').value;
            const itemName = document.getElementById('trend-item').value;

            if (!subjectId || !itemName) {
                document.getElementById('trend-chart-container').innerHTML = '<canvas id="trend-chart"></canvas>';
                document.getElementById('trend-data').innerHTML = '';
                return;
            }

            const data = labtraceDB.getTrendData(subjectId, itemName);

            if (data.length === 0) {
                document.getElementById('trend-chart-container').innerHTML = '<div class="empty-state">暂无数据</div>';
                return;
            }

            // Prepare chart data
            const labels = data.map(d => d.sample_date);
            const values = data.map(d => parseFloat(d.original_value) || 0);

            // Parse reference range for line
            let refMin = null, refMax = null;
            if (data[0]?.ref_interval_text) {
                const match = data[0].ref_interval_text.match(/([\d.]+)\s*-\s*([\d.]+)/);
                if (match) {
                    refMin = parseFloat(match[1]);
                    refMax = parseFloat(match[2]);
                }
            }

            // Destroy existing chart
            if (this.chartInstance) {
                this.chartInstance.destroy();
            }

            // Create new chart
            const ctx = document.getElementById('trend-chart').getContext('2d');
            this.chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: itemName,
                        data: values,
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        borderWidth: 2,
                        pointRadius: 5,
                        pointBackgroundColor: '#2196F3',
                        fill: true,
                        tension: 0.3
                    },
                    ...(refMin !== null ? [{
                        label: '参考下限',
                        data: labels.map(() => refMin),
                        borderColor: '#4CAF50',
                        borderWidth: 1,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false
                    }] : []),
                    ...(refMax !== null ? [{
                        label: '参考上限',
                        data: labels.map(() => refMax),
                        borderColor: '#f44336',
                        borderWidth: 1,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false
                    }] : [])]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            title: {
                                display: true,
                                text: data[0]?.original_unit || ''
                            }
                        }
                    }
                }
            });

            // Create data table
            let tableHtml = `
                <table>
                    <thead>
                        <tr>
                            <th>日期</th>
                            <th>数值</th>
                            <th>单位</th>
                            <th>参考区间</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            data.forEach(d => {
                const flag = d.flag || labtraceDB.checkAbnormal(d.original_value, d.ref_interval_text);
                const badgeClass = flag === 'high' ? 'badge-high' : flag === 'low' ? 'badge-low' : 'badge-normal';
                const badgeText = flag === 'high' ? '偏高' : flag === 'low' ? '偏低' : '正常';

                tableHtml += `
                    <tr>
                        <td>${this.escapeHtml(d.sample_date)}</td>
                        <td><strong>${this.escapeHtml(d.original_value)}</strong></td>
                        <td>${this.escapeHtml(d.original_unit) || '-'}</td>
                        <td>${this.escapeHtml(d.ref_interval_text) || '-'}</td>
                        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                    </tr>
                `;
            });

            tableHtml += '</tbody></table>';
            document.getElementById('trend-data').innerHTML = tableHtml;
        } catch (error) {
            console.error('Error loading trend chart:', error);
        }
    }

    async performSearch() {
        const keyword = document.getElementById('search-input').value.trim();
        const dateFrom = document.getElementById('search-date-from').value;
        const dateTo = document.getElementById('search-date-to').value;
        const container = document.getElementById('search-results');

        this.showLoading(container, '搜索中...');

        try {
            const results = labtraceDB.searchReports(keyword, dateFrom, dateTo);

            if (results.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <p>未找到匹配的报告</p>
                    </div>
                `;
                return;
            }

            let html = `<div style="margin-bottom:12px;color:var(--text-secondary)">找到 ${results.length} 条结果</div>`;
            results.forEach(report => {
                html += this.createReportCard(report);
            });

            container.innerHTML = html;

            // Add click handlers
            container.querySelectorAll('.card').forEach(card => {
                card.addEventListener('click', () => {
                    const reportId = card.dataset.id;
                    this.showReportDetail(reportId);
                });
            });

            // Bind file view buttons via data attribute
            container.querySelectorAll('.btn-file-view').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.viewPDF(btn.dataset.file);
                });
            });

        } catch (error) {
            console.error('Search error:', error);
            container.innerHTML = '<div class="empty-state">搜索失败</div>';
        } finally {
            this.hideLoading(container);
        }
    }

    async loadStats() {
        try {
            const subjectId = document.getElementById('stats-subject').value;
            const container = document.getElementById('stats-overview');
            const abnormalContainer = document.getElementById('stats-abnormal');

            if (!subjectId) {
                container.innerHTML = '<div class="empty-state" style="grid-column:1/-1">请选择受检者</div>';
                abnormalContainer.innerHTML = '';
                return;
            }

            const stats = labtraceDB.getStatistics(subjectId);

            // Overview cards
            container.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${stats.reportCount}</div>
                    <div class="stat-label">检验报告</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.imagingCount}</div>
                    <div class="stat-label">影像报告</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.itemCount}</div>
                    <div class="stat-label">检测项目</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color:var(--danger)">${stats.abnormalCount}</div>
                    <div class="stat-label">异常指标</div>
                </div>
            `;

            // Date range info
            if (stats.dateRange?.min_date) {
                container.innerHTML += `
                    <div style="grid-column:1/-1;text-align:center;color:var(--text-secondary);font-size:13px;margin-top:8px">
                        数据时间: ${this.escapeHtml(stats.dateRange.min_date)} 至 ${this.escapeHtml(stats.dateRange.max_date)}
                    </div>
                `;
            }

            // Recent abnormal items
            if (stats.recentAbnormal.length > 0) {
                let html = '<div style="margin-top:16px"><h4 style="margin-bottom:12px">近期异常指标</h4>';
                stats.recentAbnormal.forEach(item => {
                    const flagText = item.flag === 'high' ? '↑ 偏高' : '↓ 偏低';
                    const flagColor = item.flag === 'high' ? 'var(--danger)' : 'var(--warning)';
                    html += `
                        <div class="card" style="margin-bottom:8px">
                            <div class="card-header">
                                <div class="card-title">${this.escapeHtml(item.test_item_name)}</div>
                                <div class="card-date">${this.escapeHtml(item.sample_date)}</div>
                            </div>
                            <div class="card-body">
                                <span style="font-size:18px;font-weight:600;color:${flagColor}">${this.escapeHtml(item.original_value)} ${this.escapeHtml(item.original_unit) || ''}</span>
                                <span style="margin-left:8px;color:var(--text-secondary)">参考: ${this.escapeHtml(item.ref_interval_text) || ''}</span>
                                <span style="margin-left:8px;font-weight:600;color:${flagColor}">${flagText}</span>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                abnormalContainer.innerHTML = html;
            } else {
                abnormalContainer.innerHTML = `
                    <div class="empty-state" style="margin-top:20px">
                        <div class="empty-state-icon">✅</div>
                        <p>未发现异常指标</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async handleImport() {
        const backupFile = document.getElementById('import-backup').files[0];
        const dbFile = document.getElementById('import-db').files[0];
        const pdfFiles = document.getElementById('import-pdfs').files;
        const statusDiv = document.getElementById('import-status');

        if (!backupFile && !dbFile && pdfFiles.length === 0) {
            statusDiv.className = 'error';
            statusDiv.textContent = '请选择要导入的文件';
            return;
        }

        statusDiv.className = '';
        statusDiv.style.display = 'block';
        statusDiv.textContent = '正在导入...';

        // 禁用导入按钮防止重复点击
        const btnImport = document.getElementById('btn-confirm-import');
        btnImport.disabled = true;

        try {
            if (backupFile) {
                // ===== 备份 zip 导入 =====
                statusDiv.textContent = '正在解析备份文件...';

                const result = await labtraceDB.importFromBackup(backupFile, (stage, current, total) => {
                    switch (stage) {
                        case 'parsing':
                            statusDiv.textContent = '正在解压备份文件...';
                            break;
                        case 'db':
                            statusDiv.textContent = '正在恢复数据库...';
                            break;
                        case 'files':
                            statusDiv.textContent = `正在恢复附件文件 (${current}/${total})...`;
                            break;
                        case 'done':
                            statusDiv.textContent = `导入完成！已恢复数据库和 ${total} 个附件文件`;
                            break;
                    }
                });

                statusDiv.className = 'success';
                statusDiv.textContent = `备份恢复成功！数据库已导入，${result.fileCount} 个关联文件（PDF/图片）已保存`;
            } else {
                // ===== 传统单独导入 =====
                if (dbFile) {
                    await labtraceDB.importDatabase(dbFile);
                    // 清理旧 IndexedDB文件（它们属于旧数据库，与新数据库的file_path不匹配）
                    await labtraceDB.deleteAllFiles();
                    statusDiv.textContent = '数据库导入成功！';
                }

                // Store PDF/image files — 同时持久化到 IndexedDB
                if (pdfFiles.length > 0) {
                    statusDiv.textContent += ' 正在保存附件文件...';
                    const fileMap = new Map();
                    for (const file of pdfFiles) {
                        // 内存缓存（兼容旧方式）
                        if (this.pdfFiles.size >= PDF_CACHE_MAX_SIZE) {
                            const firstKey = this.pdfFiles.keys().next().value;
                            this.pdfFiles.delete(firstKey);
                        }
                        this.pdfFiles.set(file.name, file);

                        // 读取为 Uint8Array 以持久化到 IndexedDB
                        const data = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(new Uint8Array(reader.result));
                            reader.onerror = reject;
                            reader.readAsArrayBuffer(file);
                        });
                        fileMap.set(file.name, data);
                    }
                    await labtraceDB.saveFilesBatch(fileMap);
                    statusDiv.textContent += ` ${pdfFiles.length}个文件已保存`;
                }

                await labtraceDB.saveToStorage();
                statusDiv.className = 'success';
                statusDiv.textContent += ' 所有数据已保存到本地存储';
            }

            // Refresh UI
            await this.loadFilterOptions();
            await this.loadReports();

            // Close modal after delay
            setTimeout(() => {
                document.getElementById('import-modal').classList.remove('active');
                statusDiv.className = '';
                statusDiv.style.display = 'none';
                // Clear file inputs
                document.getElementById('import-db').value = '';
                document.getElementById('import-pdfs').value = '';
                document.getElementById('import-backup').value = '';
            }, MODAL_AUTO_CLOSE_DELAY);

        } catch (error) {
            console.error('Import error:', error);
            statusDiv.className = 'error';
            statusDiv.textContent = '导入失败: ' + error.message;
        } finally {
            btnImport.disabled = false;
        }
    }

    /**
     * 导出备份 zip（数据库 + 所有关联的 PDF/图片文件）
     */
    async handleExportBackup() {
        const statusDiv = document.getElementById('import-status');
        const btnExport = document.getElementById('btn-export-backup');

        statusDiv.className = '';
        statusDiv.style.display = 'block';
        statusDiv.textContent = '正在生成备份...';
        btnExport.disabled = true;

        try {
            const blob = await labtraceDB.exportBackup((current, total) => {
                statusDiv.textContent = `正在打包文件 (${current}/${total})...`;
            });

            // 触发下载
            const now = new Date();
            const timestamp = now.getFullYear().toString() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');
            const fileName = `labtrace_backup_${timestamp}.zip`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            statusDiv.className = 'success';
            const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
            statusDiv.textContent = `备份已导出：${fileName}（${sizeMB} MB）`;
        } catch (error) {
            console.error('Export error:', error);
            statusDiv.className = 'error';
            statusDiv.textContent = '导出失败: ' + error.message;
        } finally {
            btnExport.disabled = false;
        }
    }
}

// Initialize app
window.app = new LabtraceApp();
document.addEventListener('DOMContentLoaded', () => app.init());
