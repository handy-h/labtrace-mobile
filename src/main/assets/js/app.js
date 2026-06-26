/**
 * Labtrace Mobile App
 *
 * v2 changes:
 * - Removed all inline onclick handlers → event delegation
 * - Global error boundary with user-visible error toast
 * - Search input debouncing
 * - File type/size validation before import
 * - Chart resize on window resize
 * - Storage error notification
 * - Backup reminder
 */

class LabtraceApp {
    constructor() {
        this.currentTab = 'reports';
        this.chartInstance = null;
        this.pdfFiles = new Map(); // In-memory cache: fileName → File/Blob
        this._searchDebounceTimer = null;
        this._resizeTimer = null;
        this._eventListenersBound = false;

        // Bind all event listeners via delegation (no inline onclick)
        this._bindEvents();
    }

    // ========== Event Binding (Delegation) ==========

    _bindEvents() {
        if (this._eventListenersBound) return;
        this._eventListenersBound = true;

        // Tab switching via delegation
        document.addEventListener('click', (e) => {
            // Tab button
            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn) {
                e.preventDefault();
                this.switchTab(tabBtn.dataset.tab);
                return;
            }

            // Close button (modals)
            if (e.target.classList.contains('close-btn') || e.target.closest('.close-btn')) {
                this.closeAllModals();
                return;
            }

            // Modal backdrop click
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
                return;
            }

            // Report card click
            const card = e.target.closest('.card');
            if (card) {
                const id = parseInt(card.dataset.id, 10);
                const type = card.dataset.type;
                if (type === 'lab') {
                    this.showReportDetail(id);
                } else if (type === 'imaging') {
                    this.showImagingDetail(id);
                }
                return;
            }

            // View PDF button
            const viewBtn = e.target.closest('[data-action="view-pdf"]');
            if (viewBtn) {
                e.preventDefault();
                this.viewPDF(viewBtn.dataset.path);
                return;
            }

            // Button actions via data-action
            const actionEl = e.target.closest('[data-action]');
            if (actionEl) {
                const action = actionEl.dataset.action;
                switch (action) {
                    case 'import':
                        this.openModal('import-modal');
                        break;
                    case 'confirm-import':
                        this.handleImport();
                        break;
                    case 'export-backup':
                        this.handleExportBackup();
                        break;
                    case 'search':
                        this.performSearch();
                        break;
                    case 'settings':
                        this.openModal('settings-modal');
                        break;
                }
            }
        });

        // Change events (selects)
        document.addEventListener('change', (e) => {
            const id = e.target.id;
            switch (id) {
                case 'filter-subject':
                case 'filter-hospital':
                case 'filter-category':
                    this.loadReports();
                    break;
                case 'trend-subject':
                    this.loadTrendOptions();
                    break;
                case 'trend-item':
                    this.loadTrendChart();
                    break;
                case 'stats-subject':
                    this.loadStats();
                    break;
            }
        });

        // Search input with debouncing
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this._debouncedSearch();
            });
        }

        // Date filters for search
        ['search-date-from', 'search-date-to'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    this._debouncedSearch();
                });
            }
        });

        // Window resize → resize chart
        window.addEventListener('resize', () => {
            this._debouncedResize();
        });

        // Global error handler — catches unhandled errors
        window.addEventListener('error', (e) => {
            this._handleGlobalError(e.error || new Error(e.message));
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (e) => {
            this._handleGlobalError(e.reason);
        });
    }

    // ========== Global Error Boundary ==========

    _handleGlobalError(error) {
        console.error('Global error caught:', error);

        // Show user-visible error toast
        this._showErrorToast('发生错误：' + (error.message || '未知错误'));

        // In debug mode, log full stack
        if (typeof DEBUG !== 'undefined' && DEBUG) {
            console.error(error.stack);
        }
    }

    _showErrorToast(message) {
        let toast = document.getElementById('error-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'error-toast';
            toast.className = 'error-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 5000);
    }

    _showSuccessToast(message) {
        let toast = document.getElementById('success-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'success-toast';
            toast.className = 'success-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 5000);
    }

    /** Called by database layer when storage save fails */
    _onStorageError(error) {
        if (error && error.name === 'QuotaExceededError') {
            this._showErrorToast('存储空间不足，请导出备份后清理旧数据');
        } else {
            this._showErrorToast('数据保存失败，请稍后重试');
        }
    }

    // ========== Debounced Search ==========

    _debouncedSearch() {
        if (this._searchDebounceTimer) {
            clearTimeout(this._searchDebounceTimer);
        }
        this._searchDebounceTimer = setTimeout(() => {
            this.performSearch();
            this._searchDebounceTimer = null;
        }, 300);
    }

    // ========== Debounced Resize ==========

    _debouncedResize() {
        if (this._resizeTimer) clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
            if (this.chartInstance) {
                this.chartInstance.resize();
            }
            this._resizeTimer = null;
        }, 200);
    }

    // ========== Tab Management ==========

    switchTab(tabName) {
        this.currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });

        // Load data for the active tab
        switch (tabName) {
            case 'reports':
                this.loadReports();
                break;
            case 'trends':
                this.loadTrendOptions();
                break;
            case 'search':
                // Search is triggered by input, no need to load on tab switch
                break;
            case 'stats':
                this.loadStats();
                break;
        }
    }

    // ========== Modal Management ==========

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    // ========== Reports Tab ==========

    async loadFilterOptions() {
        try {
            // Load subjects
            const subjects = labtraceDB.getSubjects();
            const subjectOptions = ['<option value="">全部受检者</option>'];
            for (const s of subjects) {
                const label = this._formatSubjectLabel(s);
                subjectOptions.push(`<option value="${s.id}">${this._escapeHtml(label)}</option>`);
            }

            // Load hospitals
            const hospitals = labtraceDB.getHospitals();
            const hospitalOptions = ['<option value="">全部医院</option>'];
            for (const h of hospitals) {
                hospitalOptions.push(`<option value="${h.id}">${this._escapeHtml(h.name)}</option>`);
            }

            // Load categories
            const categories = labtraceDB.getCategories();
            const categoryOptions = ['<option value="">全部类别</option>'];
            for (const c of categories) {
                categoryOptions.push(`<option value="${this._escapeHtml(c.name)}">${this._escapeHtml(c.name)}</option>`);
            }

            // Populate selects
            this._setSelectOptions('filter-subject', subjectOptions);
            this._setSelectOptions('filter-hospital', hospitalOptions);
            this._setSelectOptions('filter-category', categoryOptions);
            this._setSelectOptions('trend-subject', subjectOptions);
            this._setSelectOptions('stats-subject', subjectOptions);
        } catch (error) {
            this._handleGlobalError(error);
            this._showErrorToast('加载筛选选项失败');
        }
    }

    _formatSubjectLabel(s) {
        let label = s.name || '未知';
        const parts = [];
        if (s.gender) parts.push(s.gender);
        if (s.birth_date) {
            const age = this._calculateAge(s.birth_date);
            if (age !== null) parts.push(`${age}岁`);
        }
        if (parts.length > 0) {
            label += ` (${parts.join(', ')})`;
        }
        return label;
    }

    _calculateAge(birthDate) {
        if (!birthDate) return null;
        const birth = new Date(birthDate);
        if (isNaN(birth.getTime())) return null;
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
            age--;
        }
        return age >= 0 ? age : null;
    }

    _setSelectOptions(id, options) {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = options.join('');
        }
    }

    async loadReports() {
        const listEl = document.getElementById('reports-list');
        if (!listEl) return;

        try {
            const filters = {
                subject_id: this._getSelectValue('filter-subject'),
                hospital_id: this._getSelectValue('filter-hospital'),
                category: this._getSelectValue('filter-category')
            };

            // Load lab reports
            const reports = labtraceDB.getLabReports(filters);
            const imaging = labtraceDB.getImagingReports(filters);

            if (reports.length === 0 && imaging.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><p>暂无报告数据</p><p class="hint">点击"导入"按钮添加数据</p></div>';
                return;
            }

            let html = '';
            for (const report of reports) {
                html += this.createReportCard(report);
            }
            for (const report of imaging) {
                html += this.createImagingCard(report);
            }
            listEl.innerHTML = html;
        } catch (error) {
            this._handleGlobalError(error);
            listEl.innerHTML = '<div class="empty-state error"><p>加载失败</p><p class="hint">' + this._escapeHtml(error.message) + '</p></div>';
        }
    }

    _getSelectValue(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    createReportCard(report) {
        const date = report.sample_date || '未知日期';
        const category = report.categories || '未分类';
        const hospital = report.hospital_name || '未知医院';
        const subject = report.subject_name || '未知受检者';
        const itemCount = report.item_count || 0;
        const hasFile = report.file_path && report.file_path.trim() !== '';

        let fileBadge = '';
        if (hasFile) {
            const ext = report.file_path.split('.').pop().toUpperCase();
            fileBadge = `<span class="badge badge-file" data-action="view-pdf" data-path="${this._escapeHtml(report.file_path)}">${this._escapeHtml(ext)}</span>`;
        }

        return `
            <div class="card" data-id="${report.id}" data-type="lab">
                <div class="card-header">
                    <span class="card-date">${this._escapeHtml(date)}</span>
                    ${fileBadge}
                </div>
                <div class="card-body">
                    <h3 class="card-title">${this._escapeHtml(category)}</h3>
                    <p class="card-info">${this._escapeHtml(subject)} · ${this._escapeHtml(hospital)}</p>
                    <p class="card-meta">${this._escapeHtml(itemCount.toString())} 项检测指标</p>
                </div>
                <div class="card-footer">
                    <span class="card-link">查看详情 →</span>
                </div>
            </div>
        `;
    }

    createImagingCard(report) {
        const date = report.sample_date || '未知日期';
        const examItem = report.exam_item_name || '影像检查';
        const examSite = report.exam_site || '部位未指定';
        const hospital = report.hospital_name || '未知医院';
        const subject = report.subject_name || '未知受检者';
        const hasFile = report.file_path && report.file_path.trim() !== '';

        let fileBadge = '';
        if (hasFile) {
            const ext = report.file_path.split('.').pop().toUpperCase();
            fileBadge = `<span class="badge badge-file" data-action="view-pdf" data-path="${this._escapeHtml(report.file_path)}">${this._escapeHtml(ext)}</span>`;
        }

        return `
            <div class="card" data-id="${report.id}" data-type="imaging">
                <div class="card-header">
                    <span class="card-date">${this._escapeHtml(date)}</span>
                    ${fileBadge}
                </div>
                <div class="card-body">
                    <h3 class="card-title">${this._escapeHtml(examItem)} - ${this._escapeHtml(examSite)}</h3>
                    <p class="card-info">${this._escapeHtml(subject)} · ${this._escapeHtml(hospital)}</p>
                </div>
                <div class="card-footer">
                    <span class="card-link">查看详情 →</span>
                </div>
            </div>
        `;
    }

    // ========== Report Detail ==========

    showReportDetail(reportId) {
        try {
            const reports = labtraceDB.query('SELECT * FROM lab_reports WHERE id = ?', [reportId]);
            if (reports.length === 0) {
                this._showErrorToast('报告不存在');
                return;
            }
            const report = reports[0];

            const items = labtraceDB.getReportItems(reportId);

            const titleEl = document.getElementById('report-title');
            const detailEl = document.getElementById('report-detail');

            if (titleEl) {
                titleEl.textContent = report.categories || '检验报告';
            }

            if (detailEl) {
                let html = '<div class="report-info">';
                html += `<p><strong>受检者:</strong> ${this._escapeHtml(report.subject_name || '未知')}</p>`;
                html += `<p><strong>医院:</strong> ${this._escapeHtml(report.hospital_name || '未知')}</p>`;
                html += `<p><strong>采样日期:</strong> ${this._escapeHtml(report.sample_date || '未知')}</p>`;
                html += '</div>';

                if (report.file_path) {
                    html += `<button class="btn btn-primary" data-action="view-pdf" data-path="${this._escapeHtml(report.file_path)}">查看原报告</button>`;
                }

                if (items.length > 0) {
                    html += '<table class="data-table"><thead><tr>';
                    html += '<th>项目</th><th>结果</th><th>单位</th><th>参考范围</th><th>标记</th>';
                    html += '</tr></thead><tbody>';
                    for (const item of items) {
                        const flag = item.flag || labtraceDB.checkAbnormal(item.original_value, item.ref_interval_text);
                        const flagClass = flag === 'high' ? 'flag-high' : (flag === 'low' ? 'flag-low' : '');
                        const flagText = flag === 'high' ? '↑' : (flag === 'low' ? '↓' : '');
                        html += `<tr class="${flagClass}">`;
                        html += `<td>${this._escapeHtml(item.test_item_name || item.original_name || '')}</td>`;
                        html += `<td>${this._escapeHtml(item.original_value || '')}</td>`;
                        html += `<td>${this._escapeHtml(item.original_unit || '')}</td>`;
                        html += `<td>${this._escapeHtml(item.ref_interval_text || '')}</td>`;
                        html += `<td>${flagText}</td>`;
                        html += '</tr>';
                    }
                    html += '</tbody></table>';
                }

                detailEl.innerHTML = html;
            }

            this.openModal('report-modal');
        } catch (error) {
            this._handleGlobalError(error);
            this._showErrorToast('加载报告详情失败');
        }
    }

    showImagingDetail(reportId) {
        try {
            const reports = labtraceDB.query('SELECT * FROM imaging_reports WHERE id = ?', [reportId]);
            if (reports.length === 0) {
                this._showErrorToast('报告不存在');
                return;
            }
            const report = reports[0];

            const titleEl = document.getElementById('report-title');
            const detailEl = document.getElementById('report-detail');

            if (titleEl) {
                titleEl.textContent = `${report.exam_item_name || '影像检查'} - ${report.exam_site || ''}`;
            }

            if (detailEl) {
                let html = '<div class="report-info">';
                html += `<p><strong>受检者:</strong> ${this._escapeHtml(report.subject_name || '未知')}</p>`;
                html += `<p><strong>医院:</strong> ${this._escapeHtml(report.hospital_name || '未知')}</p>`;
                html += `<p><strong>检查日期:</strong> ${this._escapeHtml(report.sample_date || '未知')}</p>`;
                html += `<p><strong>检查号:</strong> ${this._escapeHtml(report.inspect_no || '无')}</p>`;
                html += '</div>';

                if (report.exam_description) {
                    html += `<div class="report-section"><h4>检查描述</h4><p>${this._escapeHtml(report.exam_description)}</p></div>`;
                }
                if (report.diagnosis_result) {
                    html += `<div class="report-section"><h4>诊断结果</h4><p>${this._escapeHtml(report.diagnosis_result)}</p></div>`;
                }
                if (report.file_path) {
                    html += `<button class="btn btn-primary" data-action="view-pdf" data-path="${this._escapeHtml(report.file_path)}">查看原报告</button>`;
                }

                detailEl.innerHTML = html;
            }

            this.openModal('report-modal');
        } catch (error) {
            this._handleGlobalError(error);
            this._showErrorToast('加载影像报告详情失败');
        }
    }

    // ========== PDF / Image Viewer ==========

    async viewPDF(filePath) {
        if (!filePath) {
            this._showErrorToast('文件路径无效');
            return;
        }

        const fileName = labtraceDB.extractFileName(filePath);
        const ext = fileName.split('.').pop().toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);

        try {
            // 1. Check in-memory cache first
            if (this.pdfFiles.has(fileName)) {
                const file = this.pdfFiles.get(fileName);
                const blobUrl = URL.createObjectURL(file);
                this._showViewer(blobUrl, isImage);
                return;
            }

            // 2. Check IndexedDB
            const storedData = await labtraceDB.getFile(fileName);
            if (storedData) {
                const blob = new Blob([storedData], { type: this._getMimeType(ext) });
                const blobUrl = URL.createObjectURL(blob);
                this._showViewer(blobUrl, isImage);
                return;
            }

            // 3. Fallback to file path (only works for local files in WebView)
            // Check if native viewer is available (Android)
            if (typeof Android !== 'undefined' && Android.isViewFileAvailable && Android.isViewFileAvailable() === 'true') {
                // Try to load file from file path and pass to native viewer
                const response = await fetch(filePath);
                const blob = await response.blob();
                const base64Data = await this._blobToBase64(blob);
                const result = Android.viewFile(base64Data, fileName, this._getMimeType(ext));
                if (result === 'ok') return;
            }

            // 4. Last resort: use file path directly in iframe/img
            this._showViewer(filePath, isImage);
        } catch (error) {
            this._handleGlobalError(error);
            this._showErrorToast('无法打开文件: ' + fileName);
        }
    }

    _showViewer(url, isImage) {
        const pdfViewer = document.getElementById('pdf-viewer');
        const imgViewer = document.getElementById('img-viewer');
        const pdfTitle = document.getElementById('pdf-title');

        if (isImage) {
            if (pdfViewer) pdfViewer.style.display = 'none';
            if (imgViewer) {
                imgViewer.src = url;
                imgViewer.style.display = 'block';
            }
        } else {
            if (imgViewer) imgViewer.style.display = 'none';
            if (pdfViewer) {
                pdfViewer.src = url;
                pdfViewer.style.display = 'block';
            }
        }

        this.openModal('pdf-modal');
    }

    _getMimeType(ext) {
        const types = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp'
        };
        return types[ext] || 'application/octet-stream';
    }

    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove data URL prefix: "data:...;base64,"
                const result = reader.result;
                const base64 = result.includes(',') ? result.split(',')[1] : result;
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ========== Trends Tab ==========

    async loadTrendOptions() {
        const subjectSelect = document.getElementById('trend-subject');
        const itemSelect = document.getElementById('trend-item');

        if (!subjectSelect || !itemSelect) return;

        const subjectId = subjectSelect.value;
        if (!subjectId) {
            itemSelect.innerHTML = '<option value="">选择指标</option>';
            return;
        }

        try {
            const items = labtraceDB.query(`
                SELECT DISTINCT ri.test_item_name as name
                FROM report_items ri
                JOIN lab_reports r ON ri.report_id = r.id
                WHERE r.subject_id = ? AND ri.test_item_name IS NOT NULL AND ri.test_item_name != ''
                ORDER BY ri.test_item_name
            `, [subjectId]);

            const options = ['<option value="">选择指标</option>'];
            for (const item of items) {
                options.push(`<option value="${this._escapeHtml(item.name)}">${this._escapeHtml(item.name)}</option>`);
            }
            itemSelect.innerHTML = options.join('');
        } catch (error) {
            this._handleGlobalError(error);
        }
    }

    async loadTrendChart() {
        const subjectId = this._getSelectValue('trend-subject');
        const itemName = this._getSelectValue('trend-item');
        const container = document.getElementById('trend-chart-container');
        const dataEl = document.getElementById('trend-data');

        if (!subjectId || !itemName) {
            if (container) {
                container.innerHTML = '<div class="empty-state"><p>请选择受检者和指标</p></div>';
            }
            return;
        }

        try {
            const data = labtraceDB.getTrendData(subjectId, itemName);

            if (data.length === 0) {
                if (container) {
                    container.innerHTML = '<div class="empty-state"><p>暂无数据</p></div>';
                }
                if (dataEl) dataEl.innerHTML = '';
                return;
            }

            // Prepare chart data
            const labels = data.map(d => d.sample_date);
            const values = data.map(d => parseFloat(d.original_value));

            // Extract reference range from first data point
            let refMin = null, refMax = null;
            if (data[0].ref_interval_text) {
                const match = data[0].ref_interval_text.match(/([\d.]+)\s*[-~–—]\s*([\d.]+)/);
                if (match) {
                    refMin = parseFloat(match[1]);
                    refMax = parseFloat(match[2]);
                }
            }

            // Destroy previous chart
            if (this.chartInstance) {
                this.chartInstance.destroy();
            }

            // Create canvas
            if (container) {
                container.innerHTML = '<canvas id="trend-chart"></canvas>';
            }

            const canvas = document.getElementById('trend-chart');
            if (!canvas) return;

            const datasets = [{
                label: itemName,
                data: values,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.3
            }];

            // Add reference range band
            if (refMin !== null && refMax !== null) {
                datasets.push({
                    label: '参考范围',
                    data: labels.map(() => refMin),
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                    borderDash: [5, 5],
                    pointRadius: 0
                });
                datasets.push({
                    label: '参考范围上限',
                    data: labels.map(() => refMax),
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                    borderDash: [5, 5],
                    pointRadius: 0
                });
            }

            if (typeof Chart === 'undefined') {
                if (container) {
                    container.innerHTML = '<div class="empty-state"><p>图表库加载中...</p></div>';
                }
                // Retry after Chart.js loads (defer scripts finish before DOMContentLoaded,
                // but on slow networks it may take a moment)
                let retries = 0;
                const retryTimer = setInterval(() => {
                    retries++;
                    if (typeof Chart !== 'undefined') {
                        clearInterval(retryTimer);
                        this.renderTrendChart();
                    } else if (retries >= 50) { // 5s max
                        clearInterval(retryTimer);
                        if (container) {
                            container.innerHTML = '<div class="empty-state"><p>图表库加载失败，请检查网络后刷新页面</p></div>';
                        }
                    }
                }, 100);
                return;
            }

            this.chartInstance = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: false
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });

            // Show data table
            if (dataEl) {
                let html = '<table class="data-table"><thead><tr>';
                html += '<th>日期</th><th>值</th><th>单位</th><th>参考范围</th><th>标记</th>';
                html += '</tr></thead><tbody>';
                for (const d of data) {
                    const flag = d.flag || labtraceDB.checkAbnormal(d.original_value, d.ref_interval_text);
                    const flagClass = flag === 'high' ? 'flag-high' : (flag === 'low' ? 'flag-low' : '');
                    const flagText = flag === 'high' ? '↑' : (flag === 'low' ? '↓' : '');
                    html += `<tr class="${flagClass}">`;
                    html += `<td>${this._escapeHtml(d.sample_date || '')}</td>`;
                    html += `<td>${this._escapeHtml(d.original_value || '')}</td>`;
                    html += `<td>${this._escapeHtml(d.original_unit || '')}</td>`;
                    html += `<td>${this._escapeHtml(d.ref_interval_text || '')}</td>`;
                    html += `<td>${flagText}</td>`;
                    html += '</tr>';
                }
                html += '</tbody></table>';
                dataEl.innerHTML = html;
            }
        } catch (error) {
            this._handleGlobalError(error);
            if (container) {
                container.innerHTML = '<div class="empty-state error"><p>加载趋势数据失败</p></div>';
            }
        }
    }

    // ========== Search Tab ==========

    async performSearch() {
        const keyword = this._getSelectValue('search-input');
        const dateFrom = this._getSelectValue('search-date-from');
        const dateTo = this._getSelectValue('search-date-to');
        const resultsEl = document.getElementById('search-results');

        if (!resultsEl) return;

        try {
            const results = labtraceDB.searchReports(keyword, dateFrom, dateTo);

            if (results.length === 0) {
                resultsEl.innerHTML = '<div class="empty-state"><p>未找到匹配的报告</p></div>';
                return;
            }

            let html = `<div class="search-summary">找到 ${results.length} 条结果</div>`;
            html += '<div class="search-list">';
            for (const r of results) {
                html += `
                    <div class="card" data-id="${r.id}" data-type="lab">
                        <div class="card-header">
                            <span class="card-date">${this._escapeHtml(r.sample_date || '未知日期')}</span>
                        </div>
                        <div class="card-body">
                            <h3 class="card-title">${this._escapeHtml(r.categories || '未分类')}</h3>
                            <p class="card-info">${this._escapeHtml(r.subject_name || '未知')} · ${this._escapeHtml(r.hospital_name || '未知')}</p>
                        </div>
                    </div>
                `;
            }
            html += '</div>';
            resultsEl.innerHTML = html;
        } catch (error) {
            this._handleGlobalError(error);
            resultsEl.innerHTML = '<div class="empty-state error"><p>搜索失败</p></div>';
        }
    }

    // ========== Statistics Tab ==========

    async loadStats() {
        const subjectId = this._getSelectValue('stats-subject');
        const overviewEl = document.getElementById('stats-overview');
        const abnormalEl = document.getElementById('stats-abnormal');

        if (!subjectId) {
            if (overviewEl) overviewEl.innerHTML = '<div class="empty-state"><p>请选择受检者</p></div>';
            if (abnormalEl) abnormalEl.innerHTML = '';
            return;
        }

        try {
            const stats = labtraceDB.getStatistics(subjectId);

            // Overview
            if (overviewEl) {
                let html = '<div class="stats-grid">';
                html += `<div class="stat-card"><div class="stat-value">${stats.reportCount}</div><div class="stat-label">检验报告</div></div>`;
                html += `<div class="stat-card"><div class="stat-value">${stats.imagingCount}</div><div class="stat-label">影像报告</div></div>`;
                html += `<div class="stat-card"><div class="stat-value">${stats.itemCount}</div><div class="stat-label">检测指标</div></div>`;
                html += `<div class="stat-card"><div class="stat-value">${stats.abnormalCount}</div><div class="stat-label">异常指标</div></div>`;
                html += '</div>';

                if (stats.dateRange && stats.dateRange.min_date && stats.dateRange.max_date) {
                    html += `<p class="stats-range">数据范围: ${this._escapeHtml(stats.dateRange.min_date)} ~ ${this._escapeHtml(stats.dateRange.max_date)}</p>`;
                }

                overviewEl.innerHTML = html;
            }

            // Abnormal items
            if (abnormalEl) {
                if (stats.recentAbnormal && stats.recentAbnormal.length > 0) {
                    let html = '<table class="data-table"><thead><tr>';
                    html += '<th>项目</th><th>值</th><th>单位</th><th>参考范围</th><th>标记</th><th>日期</th>';
                    html += '</tr></thead><tbody>';
                    for (const item of stats.recentAbnormal) {
                        const flagClass = item.flag === 'high' ? 'flag-high' : 'flag-low';
                        const flagText = item.flag === 'high' ? '↑ 偏高' : '↓ 偏低';
                        html += `<tr class="${flagClass}">`;
                        html += `<td>${this._escapeHtml(item.test_item_name || '')}</td>`;
                        html += `<td>${this._escapeHtml(item.original_value || '')}</td>`;
                        html += `<td>${this._escapeHtml(item.original_unit || '')}</td>`;
                        html += `<td>${this._escapeHtml(item.ref_interval_text || '')}</td>`;
                        html += `<td>${flagText}</td>`;
                        html += `<td>${this._escapeHtml(item.sample_date || '')}</td>`;
                        html += '</tr>';
                    }
                    html += '</tbody></table>';
                    abnormalEl.innerHTML = html;
                } else {
                    abnormalEl.innerHTML = '<div class="empty-state success"><p>✓ 未发现异常指标</p></div>';
                }
            }
        } catch (error) {
            this._handleGlobalError(error);
            if (overviewEl) overviewEl.innerHTML = '<div class="empty-state error"><p>加载统计失败</p></div>';
        }
    }

    // ========== Import / Export ==========

    /** Validate file before import: check type and size */
    _validateImportFile(file, type) {
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_SIZE) {
            throw new Error(`文件 ${file.name} 超过 50MB 限制`);
        }

        const name = file.name.toLowerCase();
        switch (type) {
            case 'db':
                if (!name.endsWith('.db') && !name.endsWith('.sqlite')) {
                    throw new Error(`数据库文件必须是 .db 或 .sqlite 格式，当前: ${file.name}`);
                }
                break;
            case 'pdf':
                if (!name.endsWith('.pdf')) {
                    throw new Error(`文件 ${file.name} 不是 PDF 格式`);
                }
                break;
            case 'image':
                if (!name.endsWith('.png') && !name.endsWith('.jpg') && !name.endsWith('.jpeg')) {
                    throw new Error(`文件 ${file.name} 不是支持的图片格式 (PNG/JPG)`);
                }
                break;
            case 'backup':
                if (!name.endsWith('.zip')) {
                    throw new Error(`备份文件必须是 .zip 格式，当前: ${file.name}`);
                }
                break;
        }
    }

    async handleImport() {
        const statusEl = document.getElementById('import-status');
        const dbInput = document.getElementById('import-db');
        const pdfInput = document.getElementById('import-pdfs');
        const backupInput = document.getElementById('import-backup');

        const dbFiles = dbInput ? dbInput.files : [];
        const pdfFiles = pdfInput ? pdfInput.files : [];
        const backupFiles = backupInput ? backupInput.files : [];

        if (dbFiles.length === 0 && pdfFiles.length === 0 && backupFiles.length === 0) {
            if (statusEl) {
                statusEl.textContent = '请选择要导入的文件';
                statusEl.className = 'error';
            }
            return;
        }

        try {
            if (statusEl) {
                statusEl.textContent = '正在导入...';
                statusEl.className = 'loading';
            }

            // Import backup zip
            if (backupFiles.length > 0) {
                this._validateImportFile(backupFiles[0], 'backup');
                const result = await labtraceDB.importFromBackup(backupFiles[0], (stage, current, total) => {
                    if (statusEl) {
                        const stageText = {
                            'parsing': '解析备份文件...',
                            'db': '导入数据库...',
                            'files': `导入文件 ${current}/${total}`,
                            'done': '完成'
                        };
                        statusEl.textContent = stageText[stage] || stage;
                    }
                });

                // Clear file inputs
                if (backupInput) backupInput.value = '';

                // Close modal and show toast notification (statusEl no longer visible after close)
                this.closeAllModals();
                this._showSuccessToast(`导入成功：${result.fileCount} 个文件已导入`);

                // Reload data
                await this.loadFilterOptions();
                this.loadReports();
                return;
            }

            // Import database file
            if (dbFiles.length > 0) {
                this._validateImportFile(dbFiles[0], 'db');
                await labtraceDB.importDatabase(dbFiles[0]);
            }

            // Import PDF/image files
            if (pdfFiles.length > 0) {
                // Validate all files first
                for (const file of pdfFiles) {
                    const name = file.name.toLowerCase();
                    if (name.endsWith('.pdf')) {
                        this._validateImportFile(file, 'pdf');
                    } else if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
                        this._validateImportFile(file, 'image');
                    } else {
                        throw new Error(`不支持的文件格式: ${file.name}`);
                    }
                }

                // Delete old files if a new database was also imported
                if (dbFiles.length > 0) {
                    await labtraceDB.deleteAllFiles();
                }

                // Save files to IndexedDB and cache in memory
                const fileMap = new Map();
                for (const file of pdfFiles) {
                    this.pdfFiles.set(file.name, file);
                    const buffer = await file.arrayBuffer();
                    fileMap.set(file.name, new Uint8Array(buffer));
                }

                if (fileMap.size > 0) {
                    await labtraceDB.saveFilesBatch(fileMap);
                }
            }

            // Save database
            await labtraceDB.saveToStorage();

            // Clear file inputs
            if (dbInput) dbInput.value = '';
            if (pdfInput) pdfInput.value = '';

            let msg = '导入成功';
            if (dbFiles.length > 0) msg += '：数据库已更新';
            if (pdfFiles.length > 0) msg += `，${pdfFiles.length} 个文件已导入`;

            // Close modal and show toast notification (statusEl no longer visible after close)
            this.closeAllModals();
            this._showSuccessToast(msg);

            // Reload data
            await this.loadFilterOptions();
            this.loadReports();
        } catch (error) {
            this._handleGlobalError(error);
            if (statusEl) {
                statusEl.textContent = '导入失败: ' + error.message;
                statusEl.className = 'error';
            }
        }
    }

    async handleExportBackup() {
        try {
            const blob = await labtraceDB.exportBackup((current, total) => {
                // Could show progress in UI
                console.log(`Exporting: ${current}/${total} files`);
            });

            // Trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `labtrace_backup_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this._showSuccessToast('备份已导出'); // Success message for backup export
        } catch (error) {
            this._handleGlobalError(error);
            this._showErrorToast('导出失败: ' + error.message);
        }
    }

    // ========== Backup Reminder ==========

    /** Check if user should be reminded to back up, and show a gentle reminder */
    checkBackupReminder() {
        if (labtraceDB.shouldRemindBackup && labtraceDB.shouldRemindBackup()) {
            const lastBackup = labtraceDB.getLastBackupTime();
            const lastText = lastBackup
                ? `上次备份：${new Date(lastBackup).toLocaleDateString()}`
                : '尚未进行过备份';
            this._showSuccessToast(`💡 建议定期备份数据。${lastText}`);
        }
    }

    // ========== Utility ==========

    /**
     * Escape HTML to prevent XSS.
     * Escapes: & < > " '
     */
    _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    /** Cleanup resources */
    destroy() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
        if (this._searchDebounceTimer) {
            clearTimeout(this._searchDebounceTimer);
        }
        if (this._resizeTimer) {
            clearTimeout(this._resizeTimer);
        }
        // Revoke any object URLs
        if (this.pdfFiles.size > 0) {
            // Object URLs created from blob should be revoked,
            // but since they may still be displayed, we skip this
            // in case the user is still viewing them.
        }
    }
}

// Safety: hide loading overlay after 10s timeout even if init didn't complete
let initDone = false;
setTimeout(() => {
    if (initDone) return;
    const loadingEl = document.getElementById('app-loading');
    if (loadingEl) {
        loadingEl.style.display = 'none';
    }
    const appEl = document.getElementById('app');
    if (appEl) {
        appEl.innerHTML = '<div class="init-message timeout"><h2>加载超时</h2><p>应用初始化超时，请检查网络连接后刷新页面</p></div>';
        appEl.style.display = '';
    }
}, 10000);

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    const loadingEl = document.getElementById('app-loading');
    const appEl = document.getElementById('app');

    const hideLoading = () => {
        if (loadingEl) loadingEl.style.display = 'none';
        if (appEl) appEl.style.display = '';
    };

    try {
        await labtraceDB.init();
        const app = new LabtraceApp();
        window.app = app;

        // Load initial data
        await app.loadFilterOptions();
        app.loadReports();

        // Hide loading overlay and show the app
        hideLoading();
        initDone = true;

        // Check backup reminder (non-blocking)
        setTimeout(() => app.checkBackupReminder(), 2000);
    } catch (error) {
        // Fatal initialization error — hide loading, show error
        hideLoading();
        initDone = true;
        if (appEl) {
            appEl.innerHTML = `
                <div class="init-message error">
                    <h2>应用初始化失败</h2>
                    <p>${error.message || '未知错误'}</p>
                    <p>请刷新页面重试，或检查浏览器控制台获取详细信息</p>
                </div>
            `;
        }
    }
});
