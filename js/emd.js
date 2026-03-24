/**
 * EMD & CEEMDAN Decomposition Engine
 * Port of the MATLAB EMD/CEEMDAN algorithms for browser-based EEG analysis
 */

const EMDEngine = (() => {

    // ── Utility: find local extrema ──────────────────────────────────
    function findExtrema(signal) {
        const N = signal.length;
        const maxIdx = [];
        const minIdx = [];

        for (let i = 1; i < N - 1; i++) {
            if (signal[i] > signal[i - 1] && signal[i] >= signal[i + 1]) {
                maxIdx.push(i);
            }
            if (signal[i] < signal[i - 1] && signal[i] <= signal[i + 1]) {
                minIdx.push(i);
            }
        }

        // Ensure endpoints are included
        if (maxIdx.length === 0 && minIdx.length === 0) {
            return { maxIdx: [0, N - 1], minIdx: [0, N - 1] };
        }

        if (maxIdx.length > 0 && maxIdx[0] !== 0) {
            if (signal[0] > signal[1]) maxIdx.unshift(0);
        }
        if (minIdx.length > 0 && minIdx[0] !== 0) {
            if (signal[0] < signal[1]) minIdx.unshift(0);
        }
        if (maxIdx.length > 0 && maxIdx[maxIdx.length - 1] !== N - 1) {
            if (signal[N - 1] > signal[N - 2]) maxIdx.push(N - 1);
        }
        if (minIdx.length > 0 && minIdx[minIdx.length - 1] !== N - 1) {
            if (signal[N - 1] < signal[N - 2]) minIdx.push(N - 1);
        }

        if (maxIdx.length === 0) { maxIdx.push(0, N - 1); }
        if (minIdx.length === 0) { minIdx.push(0, N - 1); }

        return { maxIdx, minIdx };
    }

    // ── Cubic spline interpolation (natural spline) ──────────────────
    function cubicInterp(xPoints, yPoints, xEval) {
        const n = xPoints.length;
        if (n < 2) return xEval.map(() => yPoints[0] || 0);
        if (n === 2) {
            const slope = (yPoints[1] - yPoints[0]) / (xPoints[1] - xPoints[0]);
            return xEval.map(x => yPoints[0] + slope * (x - xPoints[0]));
        }

        // Build tridiagonal system for natural cubic spline
        const h = [];
        for (let i = 0; i < n - 1; i++) h.push(xPoints[i + 1] - xPoints[i]);

        const alpha = [0];
        for (let i = 1; i < n - 1; i++) {
            alpha.push(
                (3 / h[i]) * (yPoints[i + 1] - yPoints[i]) -
                (3 / h[i - 1]) * (yPoints[i] - yPoints[i - 1])
            );
        }

        const l = new Array(n).fill(1);
        const mu = new Array(n).fill(0);
        const z = new Array(n).fill(0);

        for (let i = 1; i < n - 1; i++) {
            l[i] = 2 * (xPoints[i + 1] - xPoints[i - 1]) - h[i - 1] * mu[i - 1];
            mu[i] = h[i] / l[i];
            z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
        }

        const c = new Array(n).fill(0);
        const b = new Array(n - 1).fill(0);
        const d = new Array(n - 1).fill(0);

        for (let j = n - 2; j >= 0; j--) {
            c[j] = z[j] - mu[j] * c[j + 1];
            b[j] = (yPoints[j + 1] - yPoints[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
            d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
        }

        // Evaluate
        return xEval.map(x => {
            // Clamp to range
            if (x <= xPoints[0]) {
                const dx = x - xPoints[0];
                return yPoints[0] + b[0] * dx + c[0] * dx * dx + d[0] * dx * dx * dx;
            }
            if (x >= xPoints[n - 1]) {
                const j = n - 2;
                const dx = x - xPoints[j];
                return yPoints[j] + b[j] * dx + c[j] * dx * dx + d[j] * dx * dx * dx;
            }

            // Binary search for interval
            let lo = 0, hi = n - 2;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (xPoints[mid + 1] < x) lo = mid + 1;
                else hi = mid;
            }
            const dx = x - xPoints[lo];
            return yPoints[lo] + b[lo] * dx + c[lo] * dx * dx + d[lo] * dx * dx * dx;
        });
    }

    // ── Check if signal is monotonic ─────────────────────────────────
    function isMonotonic(signal) {
        let allUp = true, allDown = true;
        for (let i = 1; i < signal.length; i++) {
            if (signal[i] < signal[i - 1]) allUp = false;
            if (signal[i] > signal[i - 1]) allDown = false;
            if (!allUp && !allDown) return false;
        }
        return true;
    }

    // ── Standard EMD ─────────────────────────────────────────────────
    function emdDecompose(signal, numIMFs = 5) {
        const N = signal.length;
        const imfs = [];
        let residue = [...signal];
        const xAll = Array.from({ length: N }, (_, i) => i);

        for (let k = 0; k < numIMFs; k++) {
            let h = [...residue];

            for (let iter = 0; iter < 100; iter++) {
                const { maxIdx, minIdx } = findExtrema(h);
                if (maxIdx.length < 3 || minIdx.length < 3) break;

                const maxVals = maxIdx.map(i => h[i]);
                const minVals = minIdx.map(i => h[i]);

                const upper = cubicInterp(maxIdx, maxVals, xAll);
                const lower = cubicInterp(minIdx, minVals, xAll);

                const hn = new Array(N);
                let sumDiff = 0, sumH = 0;
                for (let i = 0; i < N; i++) {
                    hn[i] = h[i] - (upper[i] + lower[i]) / 2;
                    sumDiff += (h[i] - hn[i]) ** 2;
                    sumH += h[i] ** 2;
                }

                const SD = sumDiff / (sumH + 1e-12);
                h = hn;
                if (SD < 0.2) break;
            }

            imfs.push(h);
            for (let i = 0; i < N; i++) residue[i] -= h[i];
            if (isMonotonic(residue)) break;
        }

        // Pad if fewer IMFs extracted
        while (imfs.length < numIMFs) {
            imfs.push(new Array(N).fill(0));
        }

        return imfs;
    }

    // ── Extract first EMD mode (helper for CEEMDAN) ──────────────────
    function emdMode1(signal) {
        const N = signal.length;
        let h = [...signal];
        const xAll = Array.from({ length: N }, (_, i) => i);

        for (let iter = 0; iter < 10; iter++) {
            const { maxIdx, minIdx } = findExtrema(h);
            if (maxIdx.length < 3 || minIdx.length < 3) break;

            const upper = cubicInterp(maxIdx, maxIdx.map(i => h[i]), xAll);
            const lower = cubicInterp(minIdx, minIdx.map(i => h[i]), xAll);

            const hn = new Array(N);
            let sumDiff = 0, sumH = 0;
            for (let i = 0; i < N; i++) {
                hn[i] = h[i] - (upper[i] + lower[i]) / 2;
                sumDiff += (h[i] - hn[i]) ** 2;
                sumH += h[i] ** 2;
            }

            const SD = sumDiff / (sumH + 1e-12);
            h = hn;
            if (SD < 0.2) break;
        }
        return h;
    }

    // ── CEEMDAN ──────────────────────────────────────────────────────
    function ceemdanDecompose(signal, Nstd = 0.2, NR = 30, numIMFs = 5) {
        const N = signal.length;
        const imfs = [];

        // Generate white noise
        function randn() {
            // Box-Muller transform
            const u1 = Math.random();
            const u2 = Math.random();
            return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
        }

        function randnArray(len) {
            return Array.from({ length: len }, () => randn());
        }

        // First IMF: average of EMD mode1 of (signal + noise)
        const m1 = [];
        for (let i = 0; i < NR; i++) {
            const noise = randnArray(N);
            const noisy = signal.map((s, j) => s + Nstd * noise[j]);
            m1.push(emdMode1(noisy));
        }

        const firstIMF = new Array(N).fill(0);
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < N; j++) firstIMF[j] += m1[i][j];
        }
        for (let j = 0; j < N; j++) firstIMF[j] /= NR;
        imfs.push(firstIMF);

        let residue = signal.map((s, i) => s - firstIMF[i]);

        // Subsequent IMFs
        for (let k = 1; k < numIMFs; k++) {
            const mk = [];
            for (let i = 0; i < NR; i++) {
                const noiseMode = emdMode1(randnArray(N));
                const noisy = residue.map((r, j) => r + Nstd * noiseMode[j]);
                mk.push(emdMode1(noisy));
            }

            const imf = new Array(N).fill(0);
            for (let i = 0; i < NR; i++) {
                for (let j = 0; j < N; j++) imf[j] += mk[i][j];
            }
            for (let j = 0; j < N; j++) imf[j] /= NR;
            imfs.push(imf);

            for (let j = 0; j < N; j++) residue[j] -= imf[j];
            if (isMonotonic(residue)) break;
        }

        while (imfs.length < numIMFs) {
            imfs.push(new Array(N).fill(0));
        }

        return imfs;
    }

    return {
        emdDecompose,
        ceemdanDecompose,
        findExtrema,
        isMonotonic
    };
})();
