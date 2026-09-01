// postinstall.js - patches for incompatible node_modules
const fs = require('fs');
const path = require('path');

console.log('[postinstall] Running post-install patches...');

// @react-native-ml-kit/text-recognition uses mavenCentral() and google() — no patches needed.
console.log('[postinstall] Done.');
