package com.abdullahschool.myapp;

import android.app.KeyguardManager;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.biometrics.BiometricManager;
import android.os.Build;
import android.os.CancellationSignal;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import androidx.activity.result.ActivityResult;

@CapacitorPlugin(name = "DeviceSecurity")
public class DeviceSecurityPlugin extends Plugin {
    private CancellationSignal cancellation;
    @PluginMethod public void available(PluginCall call) {
        JSObject result = new JSObject(); result.put("available", getContext().getSystemService(KeyguardManager.class).isDeviceSecure()); call.resolve(result);
    }
    @PluginMethod public void authenticate(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            KeyguardManager keyguard = getContext().getSystemService(KeyguardManager.class);
            if (!keyguard.isDeviceSecure()) { call.reject("جهّز قفل الجهاز أولًا أو استخدم رمز التطبيق"); return; }
            if (cancellation != null) { call.reject("التحقق جارٍ بالفعل"); return; }
            if (Build.VERSION.SDK_INT >= 30) {
                cancellation = new CancellationSignal();
                new BiometricPrompt.Builder(getContext()).setTitle("فتح تطبيق مدرسة عبدالله بن عمر")
                    .setSubtitle("تحقق على هذا الجهاز دون إنترنت")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build().authenticate(cancellation, getActivity().getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { cancellation = null; call.resolve(); }
                        @Override public void onAuthenticationError(int code, CharSequence message) { cancellation = null; call.reject(message.toString()); }
                    });
            } else {
                android.content.Intent intent = keyguard.createConfirmDeviceCredentialIntent("فتح التطبيق", "تحقق باستخدام قفل الجهاز");
                if (intent == null) { call.reject("قفل الجهاز غير متاح"); return; }
                startActivityForResult(call, intent, "credentialResult");
            }
        });
    }
    @ActivityCallback private void credentialResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == android.app.Activity.RESULT_OK) call.resolve(); else call.reject("أُلغي التحقق");
    }
    @Override protected void handleOnDestroy() { if (cancellation != null) cancellation.cancel(); super.handleOnDestroy(); }
}
