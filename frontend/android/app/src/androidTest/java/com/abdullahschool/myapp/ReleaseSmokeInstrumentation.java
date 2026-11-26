package com.abdullahschool.myapp;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import java.io.PrintWriter;
import java.io.StringWriter;

/** Platform-only runner: do not keep unused Kotlin/AndroidX code in production
 * solely to satisfy a separately packaged AndroidJUnitRunner's shared ABI. */
public class ReleaseSmokeInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    @Override public void onStart() {
        int failures = 0;
        ReleaseBridgeTest tests = new ReleaseBridgeTest();
        for (int current = 1; current <= 2; current++) {
            String name = current == 1 ? "offlineAssetsAndNotificationResources" : "nativeBridgeAndDurableStorage";
            Bundle result = new Bundle();
            result.putString("id", "ReleaseSmokeInstrumentation");
            result.putString("class", ReleaseBridgeTest.class.getName());
            result.putString("test", name);
            result.putInt("numtests", 2);
            result.putInt("current", current);
            sendStatus(1, result);
            try {
                if (current == 1) tests.releaseRetainsOfflineQuranAndDynamicNotificationResources(this);
                else tests.optimizedReleaseRegistersPluginsAndPersistsThroughNativeBridgeOffline(this);
                result.putString("stream", ".");
                sendStatus(0, result);
            } catch (Throwable error) {
                failures++;
                StringWriter stack = new StringWriter(); error.printStackTrace(new PrintWriter(stack));
                result.putString("stack", stack.toString());
                result.putString("stream", stack.toString());
                sendStatus(-2, result);
            }
        }
        Bundle summary = new Bundle();
        summary.putString("stream", "Tests run: 2, Failures: " + failures + "\n");
        finish(failures == 0 ? Activity.RESULT_OK : Activity.RESULT_CANCELED, summary);
    }
}
