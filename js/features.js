/**
 * Feature Extraction Module
 * Extracts 8 features from each IMF: NIG α, NIG δ, Energy, Variance,
 * Kurtosis, Skewness, Shannon Entropy, RMS
 */

const FeatureExtractor = (() => {

    /**
     * Extract 8 features from a single IMF signal
     */
    function extractFromIMF(imf) {
        const N = imf.length;
        if (N === 0) return new Array(8).fill(0);

        const mean = imf.reduce((s, v) => s + v, 0) / N;
        const centered = imf.map(v => v - mean);

        // Variance (K2) and Excess Kurtosis component (K4)
        let K2 = 0, m4 = 0, m3 = 0;
        for (let i = 0; i < N; i++) {
            const c = centered[i];
            K2 += c * c;
            m3 += c * c * c;
            m4 += c * c * c * c;
        }
        K2 /= N;
        m3 /= N;
        m4 /= N;

        const K4 = m4 - 3 * K2 * K2;

        if (K2 <= 0) K2 = 1e-12;
        const absK4 = Math.abs(K4) < 1e-12 ? 1e-12 : Math.abs(K4);

        // 1. NIG alpha
        let alpha = Math.sqrt(3 * K2 / absK4);
        if (!isFinite(alpha) || alpha <= 0) alpha = 1e-3;
        alpha = Math.max(Math.min(alpha, 100), 0.001);

        // 2. NIG delta
        let delta = alpha * K2;
        if (!isFinite(delta) || delta <= 0) delta = 1e-3;
        delta = Math.max(Math.min(delta, 1000), 0.001);

        // 3. Energy
        let energy = 0;
        for (let i = 0; i < N; i++) energy += imf[i] * imf[i];

        // 4. Variance
        const variance = K2;

        // 5. Kurtosis
        const kurtosis = m4 / (K2 * K2 + 1e-12);

        // 6. Skewness
        const skewness = m3 / (Math.pow(K2, 1.5) + 1e-12);

        // 7. Shannon Entropy (10-bin histogram)
        let minVal = Infinity, maxVal = -Infinity;
        for (let i = 0; i < N; i++) {
            if (imf[i] < minVal) minVal = imf[i];
            if (imf[i] > maxVal) maxVal = imf[i];
        }
        const range = maxVal - minVal || 1e-12;
        const bins = new Array(10).fill(0);
        for (let i = 0; i < N; i++) {
            let bin = Math.floor(((imf[i] - minVal) / range) * 9.999);
            bin = Math.max(0, Math.min(9, bin));
            bins[bin]++;
        }
        let shannon = 0;
        for (let b = 0; b < 10; b++) {
            const p = bins[b] / N;
            if (p > 0) shannon -= p * Math.log2(p + 1e-12);
        }

        // 8. RMS
        const rms = Math.sqrt(energy / N);

        return [alpha, delta, energy, variance, kurtosis, skewness, shannon, rms];
    }

    /**
     * Extract features from all IMFs of all channels
     * Returns a flat feature vector
     */
    function extractAll(imfsPerChannel, numIMFs = 5) {
        const features = [];
        for (const imfs of imfsPerChannel) {
            for (let k = 0; k < numIMFs; k++) {
                const imf = k < imfs.length ? imfs[k] : new Array(imfs[0]?.length || 100).fill(0);
                features.push(...extractFromIMF(imf));
            }
        }
        return features;
    }

    /**
     * Feature names for display
     */
    const FEATURE_NAMES = [
        'NIG α', 'NIG δ', 'Energy', 'Variance',
        'Kurtosis', 'Skewness', 'Shannon Entropy', 'RMS'
    ];

    return {
        extractFromIMF,
        extractAll,
        FEATURE_NAMES
    };
})();
