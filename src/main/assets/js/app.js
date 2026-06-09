/**
 * Labtrace Mobile Application
 * Main application logic
 */

class LabtraceApp {
    constructor() {
        this.currentTab = 'reports';
        this.chartInstance = null;
        this.pdfFiles = new Map(); // Store imported PDF files
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

    switchTab(tab) {
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
    }

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    async loadFilterOptions() {
        // Load subjects
        const subjects = labtraceDB.getSubjects();
        const subjectSelects = ['filter-subject', 'trend-subject', 'stats-subject'];
        subjectSelects.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const currentValue = select.value;
            select.innerHTML = '<option value="">全部受检者</option>' +
                subjects.map(s => `<option value="${s.id}">${s.name} (${s.gender || '未知'}, ${s.birth_date || '未知'})</option>`).join('');
            select.value = currentValue;
        });

        // Load hospitals
        const hospitals = labtraceDB.getHospitals();
        const hospitalSelect = document.getElementById('filter-hospital');
        if (hospitalSelect) {
            const currentValue = hospitalSelect.value;
            hospitalSelect.innerHTML = '<option value="">全部医院</option>' +
                hospitals.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
            hospitalSelect.value = currentValue;
        }

        // Load categories
        const categories = labtraceDB.getCategories();
        const categorySelect = document.getElementById('filter-category');
        if (categorySelect) {
            const currentValue = categorySelect.value;
            categorySelect.innerHTML = '<option value="">全部类别</option>' +
                categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
            categorySelect.value = currentValue;
        }
    }

    async loadReports() {
        const container = document.getElementById('reports-list');
        container.innerHTML = '<div class="loading">加载中...</div>';

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

        } catch (error) {
            console.error('Error loading reports:', error);
            container.innerHTML = '<div class="empty-state">加载失败</div>';
        }
    }

    createReportCard(report) {
        const date = report.sample_date || '未知日期';
        const category = report.categories || '未分类';
        const hospital = report.hospital_name || '未知医院';
        const subject = report.subject_name || '未知受检者';
        const itemCount = report.item_count || 0;

        return `
            <div class="card" data-id="${report.id}" data-type="lab">
                <div class="card-header">
                    <div class="card-title">${category}</div>
                    <div class="card-date">${date}</div>
                </div>
                <div class="card-body">
                    <div>👤 ${subject} | 🏥 ${hospital}</div>
                    <div style="margin-top:4px">📊 ${itemCount} 项检测指标</div>
                </div>
                <div class="card-footer">
                    <div class="card-meta">报告 #${report.id}</div>
                    <div class="card-actions">
                        <button class="btn-sm btn-view" onclick="event.stopPropagation(); app.showReportDetail(${report.id})">查看</button>
                        ${report.file_path ? `<button class="btn-sm btn-pdf" onclick="event.stopPropagation(); app.viewPDF('${report.file_path}')">PDF</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    createImagingCard(report) {
        const date = report.sample_date || '未知日期';
        const name = report.exam_item_name || '影像检查';
        const site = report.exam_site || '';
        const hospital = report.hospital_name || '未知医院';
        const subject = report.subject_name || '未知受检者';

        return `
            <div class="card" data-id="${report.id}" data-type="imaging">
                <div class="card-header">
                    <div class="card-title">${name}</div>
                    <div class="card-date">${date}</div>
                </div>
                <div class="card-body">
                    <div>👤 ${subject} | 🏥 ${hospital}</div>
                    <div style="margin-top:4px">📍 ${site || '部位未指定'}</div>
                </div>
                <div class="card-footer">
                    <div class="card-meta">影像 #${report.id}</div>
                    <div class="card-actions">
                        <button class="btn-sm btn-view" onclick="event.stopPropagation(); app.showImagingDetail(${report.id})">查看</button>
                        ${report.file_path ? `<button class="btn-sm btn-pdf" onclick="event.stopPropagation(); app.viewPDF('${report.file_path}')">PDF</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    showReportDetail(reportId) {
        const report = labtraceDB.query('SELECT r.*, s.name as subject_name, h.name as hospital_name FROM lab_reports r LEFT JOIN subjects s ON r.subject_id = s.id LEFT JOIN hospitals h ON r.hospital_id = h.id WHERE r.id = ?', [reportId])[0];
        if (!report) return;

        const items = labtraceDB.getReportItems(reportId);

        let html = `
            <div class="report-section">
                <h4>基本信息</h4>
                <div class="report-info">
                    <div class="report-info-row"><span>受检者</span><span>${report.subject_name || '未知'}</span></div>
                    <div class="report-info-row"><span>医院</span><span>${report.hospital_name || '未知'}</span></div>
                    <div class="report-info-row"><span>采样日期</span><span>${report.sample_date || '未知'}</span></div>
                    <div class="report-info-row"><span>类别</span><span>${report.categories || '未分类'}</span></div>
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
                    <div class="item-name">${item.test_item_name || '未知项目'}</div>
                    <div style="text-align:right">
                        <span class="item-value">${item.original_value || '-'} ${item.original_unit || ''}</span>
                        <div class="item-ref">参考: ${item.ref_interval_text || '无'}</div>
                    </div>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </div>
            `;
        });

        html += '</div></div>';

        document.getElementById('report-title').textContent = `${report.categories || '报告'} - ${report.sample_date || '未知日期'}`;
        document.getElementById('report-detail').innerHTML = html;
        this.openModal('report-modal');
    }

    showImagingDetail(reportId) {
        const report = labtraceDB.query('SELECT ir.*, s.name as subject_name, h.name as hospital_name FROM imaging_reports ir LEFT JOIN subjects s ON ir.subject_id = s.id LEFT JOIN hospitals h ON ir.hospital_id = h.id WHERE ir.id = ?', [reportId])[0];
        if (!report) return;

        let html = `
            <div class="report-section">
                <h4>基本信息</h4>
                <div class="report-info">
                    <div class="report-info-row"><span>受检者</span><span>${report.subject_name || '未知'}</span></div>
                    <div class="report-info-row"><span>医院</span><span>${report.hospital_name || '未知'}</span></div>
                    <div class="report-info-row"><span>检查日期</span><span>${report.sample_date || '未知'}</span></div>
                    <div class="report-info-row"><span>检查项目</span><span>${report.exam_item_name || '未知'}</span></div>
                    <div class="report-info-row"><span>检查部位</span><span>${report.exam_site || '未指定'}</span></div>
                    <div class="report-info-row"><span>检查号</span><span>${report.inspect_no || '无'}</span></div>
                </div>
            </div>
            <div class="report-section">
                <h4>检查描述</h4>
                <div class="report-info" style="white-space:pre-wrap">${report.exam_description || '无描述'}</div>
            </div>
            <div class="report-section">
                <h4>诊断结果</h4>
                <div class="report-info" style="white-space:pre-wrap;color:var(--danger);font-weight:500">${report.diagnosis_result || '无诊断结果'}</div>
            </div>
        `;

        document.getElementById('report-title').textContent = `${report.exam_item_name || '影像报告'} - ${report.sample_date || '未知日期'}`;
        document.getElementById('report-detail').innerHTML = html;
        this.openModal('report-modal');
    }

    viewPDF(filePath) {
        // Check if we have this PDF imported
        const fileName = filePath.split('/').pop();
        const pdfFile = this.pdfFiles.get(fileName);

        if (pdfFile) {
            const url = URL.createObjectURL(pdfFile);
            document.getElementById('pdf-viewer').src = url;
        } else {
            // Try to fetch from server (if hosted)
            document.getElementById('pdf-viewer').src = filePath;
        }

        document.getElementById('pdf-title').textContent = fileName;
        this.openModal('pdf-modal');
    }

    async loadTrendOptions() {
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
            items.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
    }

    async loadTrendChart() {
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
                    <td>${d.sample_date}</td>
                    <td><strong>${d.original_value}</strong></td>
                    <td>${d.original_unit || '-'}</td>
                    <td>${d.ref_interval_text || '-'}</td>
                    <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                </tr>
            `;
        });

        tableHtml += '</tbody></table>';
        document.getElementById('trend-data').innerHTML = tableHtml;
    }

    async performSearch() {
        const keyword = document.getElementById('search-input').value.trim();
        const dateFrom = document.getElementById('search-date-from').value;
        const dateTo = document.getElementById('search-date-to').value;
        const container = document.getElementById('search-results');

        container.innerHTML = '<div class="loading">搜索中...</div>';

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

        } catch (error) {
            console.error('Search error:', error);
            container.innerHTML = '<div class="empty-state">搜索失败</div>';
        }
    }

    async loadStats() {
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
                    数据时间: ${stats.dateRange.min_date} 至 ${stats.dateRange.max_date}
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
                            <div class="card-title">${item.test_item_name}</div>
                            <div class="card-date">${item.sample_date}</div>
                        </div>
                        <div class="card-body">
                            <span style="font-size:18px;font-weight:600;color:${flagColor}">${item.original_value} ${item.original_unit}</span>
                            <span style="margin-left:8px;color:var(--text-secondary)">参考: ${item.ref_interval_text}</span>
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
    }

    async handleImport() {
        const dbFile = document.getElementById('import-db').files[0];
        const pdfFiles = document.getElementById('import-pdfs').files;
        const statusDiv = document.getElementById('import-status');

        if (!dbFile && pdfFiles.length === 0) {
            statusDiv.className = 'error';
            statusDiv.textContent = '请选择要导入的文件';
            return;
        }

        statusDiv.className = '';
        statusDiv.style.display = 'block';
        statusDiv.textContent = '正在导入...';

        try {
            // Import database
            if (dbFile) {
                await labtraceDB.importDatabase(dbFile);
                statusDiv.textContent = '数据库导入成功！';
            }

            // Store PDF files
            if (pdfFiles.length > 0) {
                for (const file of pdfFiles) {
                    this.pdfFiles.set(file.name, file);
                }
                statusDiv.textContent += ` ${pdfFiles.length}个PDF文件已缓存`;
            }

            // Save to storage
            await labtraceDB.saveToStorage();

            statusDiv.className = 'success';
            statusDiv.textContent += ' 所有数据已保存到本地存储';

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
            }, 1500);

        } catch (error) {
            console.error('Import error:', error);
            statusDiv.className = 'error';
            statusDiv.textContent = '导入失败: ' + error.message;
        }
    }
}

// Initialize app
window.app = new LabtraceApp();
document.addEventListener('DOMContentLoaded', () => app.init());