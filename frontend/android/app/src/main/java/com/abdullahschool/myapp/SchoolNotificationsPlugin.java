package com.abdullahschool.myapp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Arrays;

@CapacitorPlugin(name = "SchoolNotifications")
public class SchoolNotificationsPlugin extends Plugin {
    private Ringtone preview;

    @PluginMethod
    public void configureChannel(PluginCall call) {
        String scope = call.getString("scope", "general");
        String sound = call.getString("sound", "default");
        if (!Arrays.asList("general", "prayer").contains(scope) || !Arrays.asList("default", "silent", "calm", "electronic", "clear", "custom").contains(sound)) {
            call.reject("Invalid notification sound"); return;
        }
        try {
            if (Build.VERSION.SDK_INT < 26 && scope.equals("general") && sound.equals("custom")) {
                call.reject("الصوت المخصص لإشعارات الخلفية يتطلب أندرويد 8 أو أحدث. اختر أحد أصوات التطبيق أو صوت الجهاز."); return;
            }
            Uri uri = null;
            if (sound.equals("default")) uri = Settings.System.DEFAULT_NOTIFICATION_URI;
            else if (sound.equals("custom")) {
                String data = call.getString("customData");
                String mime = call.getString("mime", "");
                if (data == null || data.length() > 7100000 || !mime.startsWith("audio/")) { call.reject("Invalid audio file"); return; }
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                if (bytes.length > 5 * 1024 * 1024) { call.reject("Audio file is too large"); return; }
                File directory = new File(getContext().getFilesDir(), "notification_sounds");
                if (!directory.exists() && !directory.mkdirs()) throw new java.io.IOException("Cannot create sound directory");
                // A stable, bounded URI per scope avoids creating channels for every import.
                File file = new File(directory, scope + ".audio");
                try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                getContext().grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().grantUriPermission("android", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else if (!sound.equals("silent")) {
                int resource = getContext().getResources().getIdentifier("school_" + sound, "raw", getContext().getPackageName());
                if (resource == 0) { call.reject("Sound asset is unavailable"); return; }
                uri = Uri.parse("android.resource://" + getContext().getPackageName() + "/" + resource);
            }
            String id = "school-" + scope + "-" + sound + "-v1";
            getContext().getSharedPreferences("school-notification-sounds", android.content.Context.MODE_PRIVATE).edit()
                .putString("account", call.getString("accountId", "")).putString(scope + "-channel", id)
                .putString(scope + "-uri", uri == null ? "" : uri.toString()).apply();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(id, scope.equals("prayer") ? "تذكيرات الصلاة — " + sound : "إشعارات المدرسة — " + sound, NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("اختيار الصوت من إعدادات التطبيق؛ إعدادات أندرويد لها الأولوية");
                channel.setSound(uri, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
                getContext().getSystemService(NotificationManager.class).createNotificationChannel(channel);
            }
            JSObject result = new JSObject(); result.put("channelId", id); call.resolve(result);
        } catch (Exception error) { call.reject("تعذر إعداد صوت الإشعار", error); }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            String channel = call.getString("channelId");
            Intent intent;
            if (Build.VERSION.SDK_INT >= 26) {
                intent = new Intent(channel != null ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS : Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                if (channel != null) intent.putExtra(Settings.EXTRA_CHANNEL_ID, channel);
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent); call.resolve();
        } catch (Exception error) { call.reject("تعذر فتح إعدادات الإشعارات", error); }
    }

    @PluginMethod
    public void showGeneral(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("school-notification-sounds", android.content.Context.MODE_PRIVATE);
            String account = call.getString("accountId", "");
            if (!account.equals(prefs.getString("account", ""))) { call.reject("Account changed"); return; }
            if (Build.VERSION.SDK_INT >= 33 && androidx.core.content.ContextCompat.checkSelfPermission(getContext(), android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) { call.resolve(); return; }
            int id = call.getInt("id", 1);
            Intent open = new Intent(getContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("schoolNotificationLink", call.getString("link", "/notifications")).putExtra("schoolNotificationAccount", account);
            android.app.PendingIntent content = android.app.PendingIntent.getActivity(getContext(), id, open, android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
            androidx.core.app.NotificationCompat.Builder builder = new androidx.core.app.NotificationCompat.Builder(getContext(), prefs.getString("general-channel", "halaqat-updates"))
                .setSmallIcon(R.drawable.ic_stat_halaqat).setContentTitle(call.getString("title", "مدرسة عبدالله بن عمر"))
                .setContentText(call.getString("body", "لديك إشعار جديد")).setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(content).setAutoCancel(true);
            if (Build.VERSION.SDK_INT < 26) { String uri = prefs.getString("general-uri", ""); builder.setSound(uri.isEmpty() ? null : Uri.parse(uri)); }
            androidx.core.app.NotificationManagerCompat.from(getContext()).notify(id, builder.build()); call.resolve();
        } catch (Exception error) { call.reject("تعذر عرض الإشعار", error); }
    }

    @PluginMethod
    public void previewDefault(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (preview != null) preview.stop();
                preview = RingtoneManager.getRingtone(getContext(), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
                if (preview != null) preview.play();
                call.resolve();
            } catch (Exception error) { call.reject("تعذرت معاينة صوت الجهاز", error); }
        });
    }

    @PluginMethod
    public void stopPreview(PluginCall call) { if (preview != null) preview.stop(); call.resolve(); }

    @PluginMethod
    public void schedulePrayers(PluginCall call) {
        try {
            String account = call.getString("accountId");
            String channel = call.getString("channelId", "");
            if (account == null || !channel.matches("school-prayer-(default|silent|calm|clear|electronic|custom)-v1") || call.getArray("reminders") == null || call.getArray("reminders").length() > 1900) { call.reject("Invalid prayer schedule"); return; }
            SharedPreferences prefs = PrayerAlarmReceiver.preferences(getContext());
            prefs.edit().putString("account", account).putString("channel", channel).putString("schedule", call.getArray("reminders").toString()).commit();
            PrayerAlarmReceiver.scheduleNext(getContext());
            JSObject result = new JSObject(); result.put("exact", false); call.resolve(result);
        } catch (Exception error) { call.reject("تعذرت جدولة التذكيرات", error); }
    }

    @PluginMethod
    public void clearPrayers(PluginCall call) {
        PrayerAlarmReceiver.preferences(getContext()).edit().remove("schedule").remove("account").apply();
        PrayerAlarmReceiver.cancel(getContext()); call.resolve();
    }

    @PluginMethod
    public void consumePrayerOpen(PluginCall call) {
        Intent intent = getActivity().getIntent();
        boolean opened = intent != null && intent.getBooleanExtra("schoolPrayerOpen", false);
        if (opened) intent.removeExtra("schoolPrayerOpen");
        JSObject result = new JSObject(); result.put("opened", opened);
        if (intent != null && intent.hasExtra("schoolNotificationLink")) {
            String activeAccount = getContext().getSharedPreferences("school-notification-sounds", android.content.Context.MODE_PRIVATE).getString("account", "");
            if (activeAccount.equals(intent.getStringExtra("schoolNotificationAccount"))) { result.put("opened", true); result.put("link", intent.getStringExtra("schoolNotificationLink")); }
            intent.removeExtra("schoolNotificationLink"); intent.removeExtra("schoolNotificationAccount");
        }
        call.resolve(result);
    }

    @Override protected void handleOnNewIntent(Intent intent) {
        getActivity().setIntent(intent);
        if (intent.hasExtra("schoolPrayerOpen") || intent.hasExtra("schoolNotificationLink")) notifyListeners("notificationOpened", new JSObject());
    }
    @Override protected void handleOnDestroy() { if (preview != null) preview.stop(); }
}
