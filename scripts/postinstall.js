// postinstall.js - patches for incompatible node_modules
const fs = require('fs');
const path = require('path');

// No patches currently needed.
// @react-native-ml-kit/text-recognition was removed due to Gradle incompatibility.
// OCR functionality gracefully handles its absence.
console.log('[postinstall] No patches needed.');