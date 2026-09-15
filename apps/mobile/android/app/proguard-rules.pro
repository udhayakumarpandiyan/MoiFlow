# ──────────────────────────────────────────────────────────────────────────────
# MoiFlow ProGuard/R8 Rules
# ──────────────────────────────────────────────────────────────────────────────

# React Native
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }

# SQLite
-keep class org.pgsqlite.** { *; }
-keep class net.sqlcipher.** { *; }

# React Native Voice (@react-native-voice/voice)
-keep class com.wenkesj.voice.** { *; }

# React Native Vision Camera
-keep class com.mrousavy.camera.** { *; }
-keep class com.mrousavy.camera.core.** { *; }

# React Native Async Storage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# Google Sign In
-keep class com.google.android.gms.** { *; }
-keep class com.google.firebase.** { *; }

# Notifee
-keep class io.invertase.notifee.** { *; }

# React Native FS
-keep class com.rnfs.** { *; }

# Keep native module registrations
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keepclassmembers class * extends com.facebook.react.bridge.JavaScriptModule {
    <methods>;
}
-keepclassmembers class * extends com.facebook.react.bridge.NativeModule {
    <methods>;
}

# OkHttp (used by React Native networking)
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# General Android
-keep class * extends android.app.Activity
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}

# Suppress warnings for missing annotations
-dontwarn javax.annotation.**
-dontwarn sun.misc.Unsafe

# React Native Image Picker
-keep class com.imagepicker.** { *; }

# ML Kit Text Recognition
-keep class com.google.mlkit.vision.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_** { *; }

# React Native Keychain
-keep class com.oblador.keychain.** { *; }

# React Native Share
-keep class cl.json.** { *; }
