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
    static void restoreSoundGrants(android.content.Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        for (NotificationChannel channel : context.getSystemService(NotificationManager.class).getNotificationChannels()) {
            Uri sound = channel.getSound();
            if (sound == null || !(context.getPackageName() + ".fileprovider").equals(sound.getAuthority())) continue;
            try {
                context.grantUriPermission("com.android.systemui", sound, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                context.grantUriPermission("android", sound, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception error) { android.util.Log.w("SchoolSounds", "Unable to restore sound permission", error); }
        }
    }

    private void makeRoom(NotificationManager manager, SharedPreferences prefs, String scope, String incoming) {
        if (Build.VERSION.SDK_INT < 26 || manager.getNotificationChannel(incoming) != null) return;
        java.util.List<SoundChannelPolicy.Candidate> channels = new java.util.ArrayList<>();
        String active = prefs.getString(scope + "-channel", "");
        String serverChannel = prefs.getString(scope + "-server-channel", "");
        String prayer = PrayerAlarmReceiver.preferences(getContext()).getString("channel", "");
        for (NotificationChannel channel : manager.getNotificationChannels()) {
            String id = channel.getId(); if (!id.startsWith("school-" + scope + "-custom-")) continue;
            String expected = prefs.getString("uri:" + id, "");
            String actual = channel.getSound() == null ? "" : channel.getSound().toString();
            boolean safe = !id.equals(active) && !id.equals(serverChannel) && !id.equals(prayer) && prefs.contains("uri:" + id)
                && expected.equals(actual) && channel.getImportance() == NotificationManager.IMPORTANCE_DEFAULT
                && channel.shouldVibrate() == prefs.getBoolean("vibrate:" + id, false);
            channels.add(new SoundChannelPolicy.Candidate(id, prefs.getLong("used:" + id, 0), safe));
        }
        for (String id : SoundChannelPolicy.evictionsForNewChannel(channels)) {
            manager.deleteNotificationChannel(id);
            prefs.edit().remove("uri:" + id).remove("vibrate:" + id).remove("used:" + id).apply();
        }
    }

    private void cleanUnusedAudio(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < 26) return;
        File directory = new File(getContext().getFilesDir(), "notification_sounds");
        File[] files = directory.listFiles(); if (files == null) return;
        for (File file : files) {
            if (!file.getName().matches("(general|prayer)-[a-f0-9]{12}\\.audio")) continue;
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            boolean referenced = false;
            for (NotificationChannel channel : manager.getNotificationChannels()) if (uri.equals(channel.getSound())) { referenced = true; break; }
            // Prayer playback also uses its private fixed copy; general files belong to channels.
            if (!referenced) file.delete();
        }
    }

    @PluginMethod
    public void configureChannel(PluginCall call) {
        String scope = call.getString("scope", "general");
        String sound = call.getString("sound", "default");
        if (!Arrays.asList("general", "prayer").contains(scope) || !Arrays.asList("default", "silent", "calm", "electronic", "clear", "school", "soft", "bright", "pulse", "custom").contains(sound)) {
            call.reject("Invalid notification sound"); return;
        }
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("school-notification-sounds", android.content.Context.MODE_PRIVATE);
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            String account = call.getString("accountId", "");
            if (account.isEmpty()) { call.reject("Account required"); return; }
            boolean explicit = Boolean.TRUE.equals(call.getBoolean("explicit", false));
            boolean vibrate = Boolean.TRUE.equals(call.getBoolean("vibrate", false));
            String previous = prefs.getString(scope + "-channel", "");
            if (scope.equals("general") && account.equals(prefs.getString("account", "")) && !previous.isEmpty() && !prefs.contains("general-server-channel")) prefs.edit().putString("general-server-channel", previous).commit();
            String[] previousParts = previous.split("-");
            // Reconnects and upgrades preserve the existing channel and its OS customizations.
            if (!explicit && account.equals(prefs.getString("account", "")) && previousParts.length > 2 && previousParts[2].equals(sound) && (Build.VERSION.SDK_INT < 26 || manager.getNotificationChannel(previous) != null)) {
                JSObject result = new JSObject(); result.put("channelId", previous); call.resolve(result); return;
            }
            if (Build.VERSION.SDK_INT < 26 && scope.equals("general") && sound.equals("custom")) {
                call.reject("الصوت المخصص لإشعارات الخلفية يتطلب أندرويد 8 أو أحدث. اختر أحد أصوات التطبيق أو صوت الجهاز."); return;
            }
            byte[] bytes = null; String fingerprint = "";
            if (sound.equals("custom")) {
                String data = call.getString("customData"); String mime = call.getString("mime", "");
                if (data == null || data.length() > 7100000 || !mime.startsWith("audio/")) { call.reject("ملف صوتي غير صالح"); return; }
                bytes = Base64.decode(data, Base64.DEFAULT);
                if (bytes.length == 0 || bytes.length > 5 * 1024 * 1024) { call.reject("حجم الملف غير صالح"); return; }
                byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
                StringBuilder hex = new StringBuilder(); for (int i = 0; i < 6; i++) hex.append(String.format(java.util.Locale.ROOT, "%02x", hash[i] & 0xff));
                fingerprint = hex.toString();
            }
            String id = scope.equals("general")
                ? "school-general-" + sound + "-v3" + (fingerprint.isEmpty() ? "" : "-" + fingerprint) + "-b" + (vibrate ? "1" : "0")
                : "school-prayer-" + sound + (fingerprint.isEmpty() ? "-v1" : "-v2-" + fingerprint);
            if (sound.equals("custom")) makeRoom(manager, prefs, scope, id);
            Uri uri = null;
            if (sound.equals("default")) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            else if (sound.equals("custom")) {
                File directory = new File(getContext().getFilesDir(), "notification_sounds");
                if (!directory.exists() && !directory.mkdirs()) throw new java.io.IOException("Cannot create sound directory");
                File file = new File(directory, scope.equals("prayer") ? "prayer.audio" : scope + "-" + fingerprint + ".audio");
                if (scope.equals("prayer") || !file.exists()) try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }

                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                getContext().grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().grantUriPermission("android", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else if (!sound.equals("silent")) {
                if (getContext().getResources().getIdentifier("school_" + sound, "raw", getContext().getPackageName()) == 0) { call.reject("Sound asset is unavailable"); return; }
                uri = Uri.parse("android.resource://" + getContext().getPackageName() + "/raw/school_" + sound);
            }
            Uri channelSound = scope.equals("prayer") && sound.equals("custom") ? null : uri;
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel channel = new NotificationChannel(id, scope.equals("prayer") ? "تذكيرات الصلاة — " + sound : "إشعارات المدرسة — " + sound, NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("صوت واهتزاز حسب اختيارك؛ إعدادات أندرويد لها الأولوية");
                channel.setSound(channelSound, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                channel.enableVibration(vibrate);
                channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
                manager.createNotificationChannel(channel);
            }
            prefs.edit().putString("account", account).putString(scope + "-channel", id)
                .putString(scope + "-uri", uri == null ? "" : uri.toString()).putBoolean(scope + "-vibrate", vibrate)
                .putString("uri:" + id, channelSound == null ? "" : channelSound.toString()).putBoolean("vibrate:" + id, vibrate)
                .putLong("used:" + id, System.currentTimeMillis()).commit();
            cleanUnusedAudio(manager);
            JSObject result = new JSObject(); result.put("channelId", id); call.resolve(result);
        } catch (Exception error) { call.reject(error instanceof IllegalStateException ? error.getMessage() : "تعذر إعداد صوت الإشعار", error); }
    }

    @PluginMethod
    public void confirmGeneralChannel(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("school-notification-sounds", android.content.Context.MODE_PRIVATE);
        String channel = call.getString("channelId", "");
        if (call.getString("accountId", "").equals(prefs.getString("account", "")) && channel.equals(prefs.getString("general-channel", ""))) prefs.edit().putString("general-server-channel", channel).commit();
        call.resolve();
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
            if (Build.VERSION.SDK_INT < 26) { String uri = prefs.getString("general-uri", ""); builder.setSound(uri.isEmpty() ? null : Uri.parse(uri)); if (prefs.getBoolean("general-vibrate", false)) builder.setVibrate(new long[]{0,140}); }
            androidx.core.app.NotificationManagerCompat.from(getContext()).notify(id, builder.build()); call.resolve();
        } catch (Exception error) { call.reject("تعذر عرض الإشعار", error); }
    }

    @PluginMethod
    public void previewDefault(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (preview != null) preview.stop();
                preview = RingtoneManager.getRingtone(getContext(), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
                if (preview != null) { preview.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()); preview.play(); }
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
            if (account == null || !channel.matches("school-prayer-(default|silent|calm|clear|electronic|custom)-v[12](-[a-f0-9]{12})?") || call.getArray("reminders") == null || call.getArray("reminders").length() > 1900) { call.reject("Invalid prayer schedule"); return; }
            SharedPreferences prefs = PrayerAlarmReceiver.preferences(getContext());
            prefs.edit().putString("account", account).putString("channel", channel).putString("schedule", call.getArray("reminders").toString()).commit();
            PrayerAlarmReceiver.scheduleNext(getContext());
            JSObject result = new JSObject(); result.put("exact", Build.VERSION.SDK_INT < 31 || getContext().getSystemService(android.app.AlarmManager.class).canScheduleExactAlarms()); call.resolve(result);
        } catch (Exception error) { call.reject("تعذرت جدولة التذكيرات", error); }
    }

    @PluginMethod
    public void requestExactAlarm(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 31 && !getContext().getSystemService(android.app.AlarmManager.class).canScheduleExactAlarms()) {
                getContext().startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
            call.resolve();
        } catch (Exception error) { call.reject("تعذر فتح إعداد المنبهات", error); }
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
    @Override protected void handleOnPause() { if (preview != null) preview.stop(); super.handleOnPause(); }
    @Override protected void handleOnDestroy() { if (preview != null) preview.stop(); super.handleOnDestroy(); }
}
