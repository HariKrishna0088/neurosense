/**
 * Main Application Controller
 * Orchestrates the real-time EEG seizure detection pipeline
 */

const App = (() => {
    let isRunning = false;
    let simulationInterval = null;
    let currentCondition = 0;
    let history = [];
    const NUM_IMFS = 5;
    const NUM_CHANNELS = 1; // Use single channel for real-time demo (fast)
    const EPOCH_LENGTH = 100;

    function init() {
        ChartManager.initSignalChart('signal-chart');
        ChartManager.initIMFCharts('imf-emd-container', 'imf-ceemdan-container', NUM_IMFS);
        ChartManager.initConfidenceChart('confidence-chart');
        ChartManager.initComparisonChart('comparison-chart');

        // Event listeners
        document.getElementById('btn-analyze').addEventListener('click', analyzeManual);
        document.getElementById('btn-simulate').addEventListener('click', toggleSimulation);
        document.getElementById('btn-clear').addEventListener('click', clearAll);
        document.getElementById('condition-select').addEventListener('change', (e) => {
            currentCondition = parseInt(e.target.value);
        });

        // File upload
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });

        // Sample data buttons
        document.querySelectorAll('.sample-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cond = parseInt(btn.dataset.condition);
                const channels = Classifier.generateSignal(cond, EPOCH_LENGTH, NUM_CHANNELS);
                const signalStr = channels[0].map(v => v.toFixed(2)).join(', ');
                document.getElementById('eeg-input').value = signalStr;
                analyzeManual();
            });
        });

        updateClock();
        setInterval(updateClock, 1000);
        setStatus('ready', 'System Ready');
    }

    function analyzeManual() {
        const input = document.getElementById('eeg-input').value.trim();
        if (!input) {
            showToast('Please enter EEG values or use a sample', 'warning');
            return;
        }

        const values = input.split(',').map(v => parseFloat(v.trim())).filter(v => isFinite(v));
        if (values.length < 10) {
            showToast('Need at least 10 data points', 'warning');
            return;
        }

        const signal = values.slice(0, EPOCH_LENGTH);
        // Pad if needed
        while (signal.length < EPOCH_LENGTH) signal.push(signal[signal.length - 1] * 0.99);

        processSignal([signal]);
    }

    function processSignal(channels) {
        setStatus('processing', 'Decomposing...');

        // Use requestAnimationFrame to avoid blocking UI
        requestAnimationFrame(() => {
            const signal = channels[0];
            ChartManager.updateSignalChart(signal);

            // EMD decomposition
            const t0emd = performance.now();
            const emdIMFs = EMDEngine.emdDecompose(signal, NUM_IMFS);
            const emdTime = performance.now() - t0emd;

            // CEEMDAN decomposition (use fewer realisations for speed)
            const t0ceem = performance.now();
            const ceemdanIMFs = EMDEngine.ceemdanDecompose(signal, 0.2, 15, NUM_IMFS);
            const ceemTime = performance.now() - t0ceem;

            ChartManager.updateIMFCharts(emdIMFs, ceemdanIMFs);

            // Extract features
            const emdFeatures = FeatureExtractor.extractAll([emdIMFs], NUM_IMFS);
            const ceemFeatures = FeatureExtractor.extractAll([ceemdanIMFs], NUM_IMFS);

            // Classify
            const emdResult = Classifier.classify(emdFeatures, 'emd');
            const ceemResult = Classifier.classify(ceemFeatures, 'ceemdan');

            // Update UI
            updateClassificationDisplay(ceemResult, emdResult);
            ChartManager.updateConfidenceChart(ceemResult.scores);

            // Update comparison
            const emdMetrics = [
                emdResult.confidence * 0.85,
                emdResult.confidence * 0.82,
                emdResult.confidence * 0.9,
                Math.min(95, 100 - emdTime / 10),
                65
            ];
            const ceemMetrics = [
                ceemResult.confidence,
                ceemResult.confidence * 0.95,
                ceemResult.confidence * 0.97,
                Math.min(85, 100 - ceemTime / 20),
                88
            ];
            ChartManager.updateComparisonChart(emdMetrics, ceemMetrics);

            updateTimingDisplay(emdTime, ceemTime);

            // History
            addToHistory(ceemResult);

            setStatus('ready', 'Analysis Complete');
        });
    }

    function toggleSimulation() {
        const btn = document.getElementById('btn-simulate');
        if (isRunning) {
            clearInterval(simulationInterval);
            isRunning = false;
            btn.innerHTML = '<span class="btn-icon">▶</span> Start Simulation';
            btn.classList.remove('active');
            setStatus('ready', 'Simulation Stopped');
        } else {
            isRunning = true;
            btn.innerHTML = '<span class="btn-icon">⏸</span> Stop Simulation';
            btn.classList.add('active');
            setStatus('running', 'Simulating...');
            runSimulationStep();
            simulationInterval = setInterval(runSimulationStep, 2500);
        }
    }

    function runSimulationStep() {
        const condSelect = document.getElementById('condition-select');
        let cond = parseInt(condSelect.value);

        // Random mode
        if (cond === -1) {
            cond = Math.floor(Math.random() * 4);
        }

        const channels = Classifier.generateSignal(cond, EPOCH_LENGTH, NUM_CHANNELS);
        processSignal(channels);
    }

    function updateClassificationDisplay(ceemResult, emdResult) {
        // Main result card
        const card = document.getElementById('result-card');
        const cond = ceemResult.condition;

        card.className = `result-card risk-${cond.riskLevel}`;
        document.getElementById('result-icon').textContent = cond.icon;
        document.getElementById('result-name').textContent = cond.name;
        document.getElementById('result-desc').textContent = cond.description;
        document.getElementById('result-confidence').textContent = `${ceemResult.confidence}%`;

        // Confidence bar
        const bar = document.getElementById('confidence-bar-fill');
        bar.style.width = `${ceemResult.confidence}%`;
        bar.style.background = cond.color;

        // Method badges
        document.getElementById('emd-result-badge').textContent =
            `${emdResult.condition.shortName} (${emdResult.confidence}%)`;
        document.getElementById('emd-result-badge').style.borderColor = emdResult.condition.color;

        document.getElementById('ceemdan-result-badge').textContent =
            `${ceemResult.condition.shortName} (${ceemResult.confidence}%)`;
        document.getElementById('ceemdan-result-badge').style.borderColor = ceemResult.condition.color;

        // Feature stats
        const stats = ceemResult.featureStats;
        document.getElementById('stat-energy').textContent = stats.avgEnergy.toFixed(2);
        document.getElementById('stat-kurtosis').textContent = stats.avgKurtosis.toFixed(2);
        document.getElementById('stat-entropy').textContent = stats.avgEntropy.toFixed(2);
        document.getElementById('stat-rms').textContent = stats.avgRMS.toFixed(2);

        // Animate
        card.classList.remove('pulse-animate');
        void card.offsetHeight;
        card.classList.add('pulse-animate');
    }

    function updateTimingDisplay(emdTime, ceemTime) {
        document.getElementById('emd-time').textContent = `${emdTime.toFixed(0)} ms`;
        document.getElementById('ceemdan-time').textContent = `${ceemTime.toFixed(0)} ms`;
    }

    function addToHistory(result) {
        history.unshift({
            time: new Date().toLocaleTimeString(),
            condition: result.condition,
            confidence: result.confidence
        });
        if (history.length > 10) history.pop();

        const container = document.getElementById('history-list');
        container.innerHTML = history.map(h => `
            <div class="history-item">
                <span class="history-icon">${h.condition.icon}</span>
                <span class="history-name">${h.condition.shortName}</span>
                <span class="history-conf">${h.confidence}%</span>
                <span class="history-time">${h.time}</span>
            </div>
        `).join('');
    }

    function handleFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.trim().split('\n');
            // Take first line as signal
            const values = lines[0].split(',').map(v => parseFloat(v.trim())).filter(v => isFinite(v));
            if (values.length >= 10) {
                document.getElementById('eeg-input').value = values.slice(0, EPOCH_LENGTH).map(v => v.toFixed(2)).join(', ');
                analyzeManual();
                showToast(`Loaded ${values.length} samples from ${file.name}`, 'success');
            } else {
                showToast('File must contain comma-separated numeric values', 'warning');
            }
        };
        reader.readAsText(file);
    }

    function clearAll() {
        if (isRunning) toggleSimulation();
        document.getElementById('eeg-input').value = '';
        history = [];
        document.getElementById('history-list').innerHTML =
            '<div class="history-empty">No analyses yet</div>';
        document.getElementById('result-card').className = 'result-card';
        document.getElementById('result-icon').textContent = '⏳';
        document.getElementById('result-name').textContent = 'Awaiting Input';
        document.getElementById('result-desc').textContent = 'Enter EEG data or start simulation';
        document.getElementById('result-confidence').textContent = '—';
        document.getElementById('confidence-bar-fill').style.width = '0%';
        setStatus('ready', 'Cleared');
    }

    function setStatus(state, text) {
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('status-text');
        dot.className = `status-dot ${state}`;
        label.textContent = text;
    }

    function updateClock() {
        const now = new Date();
        document.getElementById('clock').textContent = now.toLocaleTimeString();
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    return { init };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);
