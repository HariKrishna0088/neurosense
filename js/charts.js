/**
 * Chart Manager
 * Handles all Chart.js visualizations for the seizure detection dashboard
 */

const ChartManager = (() => {
    let signalChart = null;
    let imfEmdCharts = [];
    let imfCeemdanCharts = [];
    let confidenceChart = null;
    let comparisonChart = null;

    const CHART_COLORS = {
        signal: '#a78bfa',
        emd: ['#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#f87171'],
        ceemdan: ['#818cf8', '#2dd4bf', '#facc15', '#f97316', '#ef4444'],
        conditions: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444']
    };

    function initSignalChart(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (signalChart) signalChart.destroy();

        signalChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'EEG Signal (Ch1)',
                    data: [],
                    borderColor: CHART_COLORS.signal,
                    backgroundColor: 'rgba(167,139,250,0.1)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: 'Sample', color: '#94a3b8' },
                        ticks: { color: '#64748b', maxTicksLimit: 10 },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    },
                    y: {
                        title: { display: true, text: 'Amplitude (µV)', color: '#94a3b8' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#e2e8f0' } }
                }
            }
        });
    }

    function updateSignalChart(signal) {
        if (!signalChart) return;
        signalChart.data.labels = signal.map((_, i) => i);
        signalChart.data.datasets[0].data = signal;
        signalChart.update('none');
    }

    function initIMFCharts(emdContainerId, ceemdanContainerId, numIMFs = 5) {
        imfEmdCharts.forEach(c => c.destroy());
        imfCeemdanCharts.forEach(c => c.destroy());
        imfEmdCharts = [];
        imfCeemdanCharts = [];

        const emdContainer = document.getElementById(emdContainerId);
        const ceemdanContainer = document.getElementById(ceemdanContainerId);
        if (!emdContainer || !ceemdanContainer) return;

        emdContainer.innerHTML = '';
        ceemdanContainer.innerHTML = '';

        for (let i = 0; i < numIMFs; i++) {
            const emdCanvas = document.createElement('canvas');
            emdCanvas.id = `imf-emd-${i}`;
            emdCanvas.height = 60;
            emdContainer.appendChild(emdCanvas);
            imfEmdCharts.push(createIMFChart(emdCanvas, `IMF ${i + 1}`, CHART_COLORS.emd[i]));

            const ceemCanvas = document.createElement('canvas');
            ceemCanvas.id = `imf-ceem-${i}`;
            ceemCanvas.height = 60;
            ceemdanContainer.appendChild(ceemCanvas);
            imfCeemdanCharts.push(createIMFChart(ceemCanvas, `IMF ${i + 1}`, CHART_COLORS.ceemdan[i]));
        }
    }

    function createIMFChart(canvas, label, color) {
        return new Chart(canvas, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label,
                    data: [],
                    borderColor: color,
                    borderWidth: 1.2,
                    pointRadius: 0,
                    tension: 0.2,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: { display: false },
                    y: {
                        ticks: { color: '#64748b', font: { size: 9 } },
                        grid: { color: 'rgba(148,163,184,0.05)' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10 }
                    }
                }
            }
        });
    }

    function updateIMFCharts(emdIMFs, ceemdanIMFs) {
        for (let i = 0; i < emdIMFs.length && i < imfEmdCharts.length; i++) {
            const labels = emdIMFs[i].map((_, j) => j);
            imfEmdCharts[i].data.labels = labels;
            imfEmdCharts[i].data.datasets[0].data = emdIMFs[i];
            imfEmdCharts[i].update('none');
        }
        for (let i = 0; i < ceemdanIMFs.length && i < imfCeemdanCharts.length; i++) {
            const labels = ceemdanIMFs[i].map((_, j) => j);
            imfCeemdanCharts[i].data.labels = labels;
            imfCeemdanCharts[i].data.datasets[0].data = ceemdanIMFs[i];
            imfCeemdanCharts[i].update('none');
        }
    }

    function initConfidenceChart(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (confidenceChart) confidenceChart.destroy();

        confidenceChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Normal-EO', 'Normal-EC', 'Pre-ictal', 'Seizure'],
                datasets: [{
                    data: [25, 25, 25, 25],
                    backgroundColor: CHART_COLORS.conditions.map(c => c + '99'),
                    borderColor: CHART_COLORS.conditions,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#e2e8f0', padding: 12, font: { size: 11 } }
                    }
                }
            }
        });
    }

    function updateConfidenceChart(scores) {
        if (!confidenceChart) return;
        confidenceChart.data.datasets[0].data = scores;
        confidenceChart.update();
    }

    function initComparisonChart(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (comparisonChart) comparisonChart.destroy();

        comparisonChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Accuracy', 'Sensitivity', 'Specificity', 'Speed', 'IMF Clarity'],
                datasets: [
                    {
                        label: 'EMD',
                        data: [0, 0, 0, 0, 0],
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56,189,248,0.15)',
                        borderWidth: 2,
                        pointBackgroundColor: '#38bdf8'
                    },
                    {
                        label: 'CEEMDAN',
                        data: [0, 0, 0, 0, 0],
                        borderColor: '#818cf8',
                        backgroundColor: 'rgba(129,140,248,0.15)',
                        borderWidth: 2,
                        pointBackgroundColor: '#818cf8'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(148,163,184,0.15)' },
                        grid: { color: 'rgba(148,163,184,0.1)' },
                        pointLabels: { color: '#cbd5e1', font: { size: 11 } },
                        ticks: { display: false },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#e2e8f0', font: { size: 11 } }
                    }
                }
            }
        });
    }

    function updateComparisonChart(emdScores, ceemdanScores) {
        if (!comparisonChart) return;
        comparisonChart.data.datasets[0].data = emdScores;
        comparisonChart.data.datasets[1].data = ceemdanScores;
        comparisonChart.update();
    }

    return {
        initSignalChart,
        updateSignalChart,
        initIMFCharts,
        updateIMFCharts,
        initConfidenceChart,
        updateConfidenceChart,
        initComparisonChart,
        updateComparisonChart
    };
})();
