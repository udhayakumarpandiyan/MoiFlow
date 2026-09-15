// postinstall.js - patches for incompatible node_modules
const fs = require('fs');
const path = require('path');

console.log('[postinstall] Running post-install patches...');

// @react-native-ml-kit/text-recognition uses mavenCentral() and google() — no patches needed.

// ---------------------------------------------------------------------------
// react-native-iap@12.16.2 — RN 0.86 Kotlin compatibility patch
// ---------------------------------------------------------------------------
// In React Native >= 0.80, ReactContextBaseJavaModule.getCurrentActivity() was
// deprecated and its Kotlin property `currentActivity` is `protected`, so the
// v12 module's `val activity = currentActivity` no longer resolves and fails to
// compile ("Unresolved reference 'currentActivity'"). The official replacement
// (per RN's @Deprecated ReplaceWith) is `reactApplicationContext.currentActivity`.
// In this module the ReactApplicationContext is the `reactContext` field.
function patchReactNativeIapCurrentActivity() {
  const target = path.join(
    __dirname,
    '..',
    'node_modules',
    'react-native-iap',
    'android',
    'src',
    'play',
    'java',
    'com',
    'dooboolab',
    'rniap',
    'RNIapModule.kt',
  );

  if (!fs.existsSync(target)) {
    console.log('[postinstall] react-native-iap RNIapModule.kt not found — skipping patch.');
    return;
  }

  let src = fs.readFileSync(target, 'utf8');
  const broken = 'val activity = currentActivity';
  const fixed = 'val activity = reactContext.currentActivity';

  if (src.includes(fixed)) {
    console.log('[postinstall] react-native-iap already patched.');
    return;
  }

  if (src.includes(broken)) {
    src = src.split(broken).join(fixed);
    fs.writeFileSync(target, src, 'utf8');
    console.log('[postinstall] Patched react-native-iap currentActivity for RN 0.86.');
  } else {
    console.log('[postinstall] react-native-iap pattern not found — package version may have changed.');
  }
}

try {
  patchReactNativeIapCurrentActivity();
} catch (err) {
  console.warn('[postinstall] react-native-iap patch failed:', err.message);
}

console.log('[postinstall] Done.');
