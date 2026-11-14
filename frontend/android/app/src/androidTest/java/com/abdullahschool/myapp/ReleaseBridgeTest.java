package com.abdullahschool.myapp;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs against the R8 release APK on an empty disposable emulator, never user data. */
public class ReleaseBridgeTest {
    public void releaseRetainsOfflineQuranAndDynamicNotificationResources(Instrumentation instrumentation) throws Exception {
        Context context = instrumentation.getTargetContext();
        assertEquals("com.abdullahschool.myapp", context.getPackageName());
        assertEquals(0, context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE);
        for (int page = 1; page <= 604; page++) {
            try (InputStream font = context.getAssets().open("public/mushaf/fonts/" + page + ".woff2")) {
                assertEquals('w', font.read()); assertEquals('O', font.read());
                assertEquals('F', font.read()); assertEquals('2', font.read());
            }
            try (InputStream data = context.getAssets().open("public/mushaf/" + page + ".json")) {
                assertTrue(data.read() >= 0);
            }
        }
        for (String sound : new String[]{"adhan", "calm", "electronic", "clear", "school", "soft", "bright", "pulse"}) {
            assertNotEquals("Missing dynamic sound: " + sound, 0,
                context.getResources().getIdentifier("school_" + sound, "raw", context.getPackageName()));
        }
    }

    public void optimizedReleaseRegistersPluginsAndPersistsThroughNativeBridgeOffline(Instrumentation instrumentation) throws Exception {
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            instrumentation.runOnMainSync(() -> {
                for (String id : new String[]{"App", "Filesystem", "LocalNotifications", "Network", "Preferences", "PushNotifications", "Share", "SecureStorage", "SchoolNotifications", "DeviceSecurity"}) {
                    PluginHandle plugin = activity.getBridge().getPlugin(id);
                    assertNotNull("Missing plugin " + id, plugin);
                    assertNotNull("R8 removed metadata for " + id, plugin.getPluginClass().getAnnotation(CapacitorPlugin.class));
                    assertFalse("R8 removed methods for " + id, plugin.getMethods().isEmpty());
                }
            });
            String script = "window.__releaseSmoke='pending'; (async()=>{try {"
                + "const c=window.Capacitor; await c.nativePromise('Preferences','set',{key:'release-smoke',value:'saved-offline'});"
                + "const r=await c.nativePromise('Preferences','get',{key:'release-smoke'}); if(r.value!=='saved-offline')throw Error('storage');"
                + "await c.nativePromise('Preferences','remove',{key:'release-smoke'});"
                + "await c.nativePromise('SecureStorage','internalSetItem',{prefixedKey:'release-smoke',data:'test-session'});"
                + "const secure=await c.nativePromise('SecureStorage','internalGetItem',{prefixedKey:'release-smoke'});if(secure.data!=='test-session')throw Error('secure-storage');"
                + "await c.nativePromise('SecureStorage','internalRemoveItem',{prefixedKey:'release-smoke'});"
                + "await c.nativePromise('DeviceSecurity','available',{});"
                + "const request=indexedDB.open('release-smoke',1); request.onupgradeneeded=()=>request.result.createObjectStore('records');"
                + "const db=await new Promise((ok,fail)=>{request.onsuccess=()=>ok(request.result);request.onerror=fail});"
                + "await new Promise((ok,fail)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put({name:'offline-test'},'student');tx.oncomplete=ok;tx.onerror=fail});"
                + "db.close();const reopen=indexedDB.open('release-smoke',1);const saved=await new Promise((ok,fail)=>{reopen.onsuccess=()=>ok(reopen.result);reopen.onerror=fail});"
                + "const read=saved.transaction('records').objectStore('records').get('student');const record=await new Promise((ok,fail)=>{read.onsuccess=()=>ok(read.result);read.onerror=fail});"
                + "if(record.name!=='offline-test')throw Error('local-data');saved.close();window.__releaseSmoke='ok';}catch(e){window.__releaseSmoke='failed:'+e.message}})();";
            // Wait for the bundled WebView/bridge, without requiring a server login.
            for (int attempt = 0; attempt < 60; attempt++) {
                if (evaluate(instrumentation, activity, "typeof window.Capacitor?.nativePromise").equals("\"function\"")) break;
                Thread.sleep(250);
            }
            evaluate(instrumentation, activity, script);
            String result = "";
            for (int attempt = 0; attempt < 60; attempt++) {
                result = evaluate(instrumentation, activity, "window.__releaseSmoke");
                if (!result.equals("\"pending\"")) break;
                Thread.sleep(250);
            }
            assertEquals("Native bridge/local persistence failed: " + result, "\"ok\"", result);
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }

    private String evaluate(Instrumentation instrumentation, MainActivity activity, String script) throws Exception {
        CountDownLatch finished = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value); finished.countDown();
        }));
        assertTrue("WebView did not respond", finished.await(10, TimeUnit.SECONDS));
        return result.get();
    }
}
