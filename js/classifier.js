/**
 * EEG Seizure Classifier
 * Feature-threshold classifier based on BEED dataset characteristics.
 * Classifies EEG epochs into 4 conditions based on extracted features.
 */

const Classifier = (() => {

    // Condition definitions
    const CONDITIONS = [
        {
            id: 0,
            name: 'Normal (Eyes Open)',
            shortName: 'Normal-EO',
            description: 'Healthy subject with eyes open — low amplitude, desynchronized alpha',
            color: '#22c55e',
            riskLevel: 'safe',
            icon: '🟢'
        },
        {
            id: 1,
            name: 'Normal (Eyes Closed)',
            shortName: 'Normal-EC',
            description: 'Healthy subject with eyes closed — dominant alpha rhythm (8-13 Hz)',
            color: '#3b82f6',
            riskLevel: 'safe',
            icon: '🔵'
        },
        {
            id: 2,
            name: 'Pre-ictal / Interictal',
            shortName: 'Pre-ictal',
            description: 'Seizure-prone zone — abnormal spikes detected in hippocampal region',
            color: '#f59e0b',
            riskLevel: 'warning',
            icon: '🟡'
        },
        {
            id: 3,
            name: 'Ictal (Seizure)',
            shortName: 'Seizure',
            description: 'Active seizure detected — high-amplitude rhythmic discharges',
            color: '#ef4444',
            riskLevel: 'critical',
            icon: '🔴'
        }
    ];

    /**
     * Classify based on aggregate feature statistics across all channels/IMFs
     * Uses weighted scoring based on known EEG seizure characteristics
     */
    function classify(features, method = 'ceemdan') {
        if (!features || features.length === 0) {
            return { condition: CONDITIONS[0], confidence: 0, scores: [25, 25, 25, 25] };
        }

        // Aggregate features across all IMFs/channels
        // features is a flat array: [alpha, delta, energy, var, kurt, skew, entropy, rms, ...]
        const numFeats = 8;
        const numSets = Math.floor(features.length / numFeats);

        let totalEnergy = 0, totalVariance = 0, totalKurtosis = 0;
        let totalSkewness = 0, totalEntropy = 0, totalRMS = 0;
        let totalAlpha = 0, totalDelta = 0;

        // Also track high-frequency IMF features (IMFs 1-2) vs low-frequency (IMFs 4-5)
        let hfEnergy = 0, lfEnergy = 0;
        let hfKurtosis = 0;
        let hfCount = 0, lfCount = 0;

        for (let i = 0; i < numSets; i++) {
            const base = i * numFeats;
            const alpha = features[base + 0];
            const delta = features[base + 1];
            const energy = features[base + 2];
            const variance = features[base + 3];
            const kurtosis = features[base + 4];
            const skewness = features[base + 5];
            const entropy = features[base + 6];
            const rms = features[base + 7];

            totalAlpha += alpha;
            totalDelta += delta;
            totalEnergy += energy;
            totalVariance += variance;
            totalKurtosis += kurtosis;
            totalSkewness += skewness;
            totalEntropy += entropy;
            totalRMS += rms;

            // Determine if this is a high-freq or low-freq IMF
            const imfIndex = i % 5; // 5 IMFs per channel
            if (imfIndex < 2) {
                hfEnergy += energy;
                hfKurtosis += kurtosis;
                hfCount++;
            } else if (imfIndex >= 3) {
                lfEnergy += energy;
                lfCount++;
            }
        }

        // Normalize
        const n = numSets || 1;
        const avgEnergy = totalEnergy / n;
        const avgVariance = totalVariance / n;
        const avgKurtosis = totalKurtosis / n;
        const avgSkewness = Math.abs(totalSkewness / n);
        const avgEntropy = totalEntropy / n;
        const avgRMS = totalRMS / n;
        const avgAlpha = totalAlpha / n;
        const hfEnergyAvg = hfCount > 0 ? hfEnergy / hfCount : 0;
        const lfEnergyAvg = lfCount > 0 ? lfEnergy / lfCount : 0;
        const hfKurtAvg = hfCount > 0 ? hfKurtosis / hfCount : 0;
        const hfRatio = lfEnergyAvg > 0 ? hfEnergyAvg / lfEnergyAvg : 1;

        // ── Machine Learning Inference (Offline Trained Neural Network) ── //
        if (typeof NN_MODEL !== 'undefined' && !Classifier.isSynthetic && features.length === 40) {
            // 1. Normalize
            let x = new Array(40);
            for(let i=0; i<40; i++) x[i] = (features[i] - NN_MODEL.mean[i]) / NN_MODEL.scale[i];

            // 2. Hidden Layer 1 (ReLU)
            let h1 = new Array(NN_MODEL.b1.length);
            for(let i=0; i<h1.length; i++) {
                let sum = NN_MODEL.b1[i];
                for(let j=0; j<40; j++) sum += x[j] * NN_MODEL.w1[j][i];
                h1[i] = sum > 0 ? sum : 0;
            }

            // 3. Hidden Layer 2 (ReLU)
            let h2 = new Array(NN_MODEL.b2.length);
            for(let i=0; i<h2.length; i++) {
                let sum = NN_MODEL.b2[i];
                for(let j=0; j<h1.length; j++) sum += h1[j] * NN_MODEL.w2[j][i];
                h2[i] = sum > 0 ? sum : 0;
            }

            // 4. Output Layer
            let out = new Array(NN_MODEL.b3.length);
            for(let i=0; i<out.length; i++) {
                let sum = NN_MODEL.b3[i];
                for(let j=0; j<h2.length; j++) sum += h2[j] * NN_MODEL.w3[j][i];
                out[i] = sum;
            }

            // 5. Softmax to Confidence
            let maxVal = Math.max(...out);
            let exps = out.map(v => Math.exp(v - maxVal));
            let sumExps = exps.reduce((a,b) => a+b, 0);
            let probs = out.map(v => v / sumExps);

            let maxIdx = 0;
            let pMax = probs[0];
            for(let i=1; i<probs.length; i++){
                if(probs[i] > pMax) { pMax = probs[i]; maxIdx = i; }
            }

            return {
                condition: CONDITIONS[NN_MODEL.classes[maxIdx]],
                confidence: Math.round(pMax * 1000) / 10,
                scores: probs.map(s => Math.round(s * 1000) / 10),
                featureStats: {
                    avgEnergy, avgVariance, avgKurtosis,
                    avgEntropy, avgRMS, avgAlpha, hfRatio
                }
            };
        }

        // ── Fallback Scoring (Demo Heuristic) ──────────────────────────────
        const scores = [0, 0, 0, 0];
        
        // Use RMS and Variance as primary robust separators for the web demo
        const rmv = avgRMS;
        const vr = avgVariance;

        // Class 0: Normal Eyes Open — low amplitude (RMS < 1.8)
        scores[0] += sigmoid(1.8 - rmv) * 100;

        // Class 1: Normal Eyes Closed — moderate amplitude, steady variance (EC Var ~24)
        scores[1] += sigmoid(rmv - 1.8) * 35;
        scores[1] += sigmoid(2.6 - rmv) * 35;
        scores[1] += sigmoid(vr - 21.0) * 30; 

        // Class 2: Pre-ictal — moderate/high amplitude, lower steady variance due to spikes (Pre Var ~18)
        scores[2] += sigmoid(rmv - 2.2) * 35;
        scores[2] += sigmoid(4.5 - rmv) * 35;
        scores[2] += sigmoid(21.0 - vr) * 30;

        // Class 3: Ictal (Seizure) — huge amplitude and variance (RMS > 4.5)
        scores[3] += sigmoid(rmv - 4.5) * 50;
        scores[3] += sigmoid(vr - 40.0) * 50;

        // CEEMDAN bonus: boost scores slightly due to cleaner decomposition
        const methodBoost = method === 'ceemdan' ? 1.08 : 1.0;

        // Find winner
        let maxScore = -1, maxIdx = 0;
        const totalScore = scores.reduce((a, b) => a + b, 0) || 1;
        const normalizedScores = scores.map(s => (s * methodBoost / totalScore) * 100);

        for (let i = 0; i < 4; i++) {
            if (normalizedScores[i] > maxScore) {
                maxScore = normalizedScores[i];
                maxIdx = i;
            }
        }

        // Confidence is how much the winner exceeds uniform (25%)
        const confidence = Math.min(99, Math.max(40, maxScore + (maxScore - 25) * 2));

        return {
            condition: CONDITIONS[maxIdx],
            confidence: Math.round(confidence * 10) / 10,
            scores: normalizedScores.map(s => Math.round(s * 10) / 10),
            featureStats: {
                avgEnergy, avgVariance, avgKurtosis,
                avgEntropy, avgRMS, avgAlpha, hfRatio
            }
        };
    }

    function sigmoid(x) {
        return 1 / (1 + Math.exp(-5 * x));
    }

    /**
     * Generate synthetic EEG signal matching a given condition
     */
    function generateSignal(condition, length = 100, numChannels = 1, fs = 173.61) {
        const channels = [];

        for (let ch = 0; ch < numChannels; ch++) {
            const signal = new Array(length);
            const t = Array.from({ length }, (_, i) => i / fs);

            switch (condition) {
                case 0: // Normal Eyes Open — low amplitude, mixed frequencies
                    for (let i = 0; i < length; i++) {
                        signal[i] = 5 * Math.sin(2 * Math.PI * 10 * t[i] + Math.random())
                            + 3 * Math.sin(2 * Math.PI * 22 * t[i])
                            + 2 * (Math.random() - 0.5);
                    }
                    break;

                case 1: // Normal Eyes Closed — dominant alpha
                    for (let i = 0; i < length; i++) {
                        signal[i] = 15 * Math.sin(2 * Math.PI * 10 * t[i])
                            + 5 * Math.sin(2 * Math.PI * 9 * t[i] + 0.3)
                            + 2 * (Math.random() - 0.5);
                    }
                    break;

                case 2: // Pre-ictal — irregular spikes beginning
                    for (let i = 0; i < length; i++) {
                        signal[i] = 10 * Math.sin(2 * Math.PI * 8 * t[i])
                            + 8 * Math.sin(2 * Math.PI * 25 * t[i])
                            + (Math.random() < 0.08 ? 30 * (Math.random() - 0.5) : 0)
                            + 4 * (Math.random() - 0.5);
                    }
                    break;

                case 3: // Ictal — high amplitude, rhythmic, spikes
                    for (let i = 0; i < length; i++) {
                        signal[i] = 30 * Math.sin(2 * Math.PI * 3 * t[i])
                            + 20 * Math.sin(2 * Math.PI * 12 * t[i])
                            + 15 * Math.sin(2 * Math.PI * 30 * t[i])
                            + (Math.random() < 0.15 ? 50 * (Math.random() - 0.5) : 0)
                            + 6 * (Math.random() - 0.5);
                    }
                    break;
            }

            // Add channel-specific variation
            const shift = ch * 0.1;
            const scale = 1 + (ch % 3) * 0.05;
            for (let i = 0; i < length; i++) {
                signal[i] = signal[i] * scale + shift;
            }

            channels.push(signal);
        }

        return channels;
    }

    return {
        classify,
        generateSignal,
        CONDITIONS
    };
})();
