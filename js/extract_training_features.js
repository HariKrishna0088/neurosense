const fs = require('fs');

// Load exact JS logic from dashboard
const emdCode = fs.readFileSync('emd.js', 'utf8');
const featuresCode = fs.readFileSync('features.js', 'utf8');
global.EMDEngine = eval(emdCode.replace('const EMDEngine = ', ''));
global.FeatureExtractor = eval(featuresCode.replace('const FeatureExtractor = ', ''));

console.log("Loading dataset...");
const csvData = fs.readFileSync('../../BEED/BEED_Data.csv', 'utf8');
const lines = csvData.trim().split('\n');

const X = [];
const y = [];

// Skip header (1st line)
for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(',');
    if (parts.length < 10) continue;

    const label = parseInt(parts[parts.length - 1]);
    const signal = parts.slice(0, parts.length - 1).map(Number);
    
    // The web app processes 100 samples per epoch. BEED signals are 178 samples.
    // Let's just pass the first 100 samples to exactly match web app.
    const epoch = signal.slice(0, 100);

    try {
        const imfs = global.EMDEngine.ceemdanDecompose(epoch, 0.2, 10, 5); // 10 realisations to speed up
        const features = global.FeatureExtractor.extractAll([imfs], 5);
        if (features.length === 40) {
            X.push(features);
            y.push(label);
        }
    } catch(err) {
        console.error("Epoch failed:", err.message);
    }

    if (i % 100 === 0) {
        console.log(`Processed ${i} / ${lines.length - 1} epochs...`);
    }
}

console.log(`Successfully extracted ${X.length} feature vectors!`);
fs.writeFileSync('features.json', JSON.stringify({ X, y }));
console.log("Saved to features.json.");
