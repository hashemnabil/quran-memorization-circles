# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Capacitor 6 discovers plugin metadata and callbacks through reflection.
# Its consumer rules keep plugin implementations; retain the annotation types
# too, so R8 full mode cannot erase runtime permission/activity metadata.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keepattributes SourceFile,LineNumberTable,InnerClasses,EnclosingMethod,Signature
-keep @interface com.getcapacitor.annotation.**
-keep @interface com.getcapacitor.PluginMethod
-keepclassmembers class com.getcapacitor.** {
    @android.webkit.JavascriptInterface <methods>;
}
# Firebase/AndroidX and secure storage retain their dependency consumer rules.
# Do not disable optimization or keep every Firebase/Android class globally.

# The release instrumentation runner shares this tiny dependency with the app.
# R8 otherwise removes it as unused by production code while Android's test APK
# dependency deduplication omits its copy, crashing the runner before any test.
-keep class androidx.tracing.** { *; }
# Preserve only the public bridge inspection API used to validate the release.
-keepclassmembers class com.getcapacitor.BridgeActivity {
    public com.getcapacitor.Bridge getBridge();
}
-keepclassmembers class com.getcapacitor.Bridge {
    public com.getcapacitor.PluginHandle getPlugin(java.lang.String);
    public android.webkit.WebView getWebView();
}
-keepclassmembers class com.getcapacitor.PluginHandle {
    public java.lang.Class getPluginClass();
    public java.util.Collection getMethods();
}
