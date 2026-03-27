const fs = require('fs');
const emdCode = fs.readFileSync('emd.js', 'utf8');
const featuresCode = fs.readFileSync('features.js', 'utf8');
const classifierCode = fs.readFileSync('classifier.js', 'utf8');

global.EMDEngine = eval(emdCode.replace('const EMDEngine = ', ''));
global.FeatureExtractor = eval(featuresCode.replace('const FeatureExtractor = ', ''));
global.Classifier = eval(classifierCode.replace('const Classifier = ', ''));

for (let i = 0; i < 4; i++) {
    const signal = global.Classifier.generateSignal(i, 100, 1)[0];
    const imfs = global.EMDEngine.ceemdanDecompose(signal, 0.2, 15, 5);
    const features = global.FeatureExtractor.extractAll([imfs], 5);
    const result = global.Classifier.classify(features, 'ceemdan');
    console.log("======== Condition " + i + " ========");
    console.log("Expected: " + global.Classifier.CONDITIONS[i].name);
    console.log("Predicted: " + result.condition.name + " (" + result.confidence + "%)");
}
