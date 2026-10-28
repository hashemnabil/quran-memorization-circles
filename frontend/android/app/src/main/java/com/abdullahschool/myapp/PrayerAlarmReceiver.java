package com.abdullahschool.myapp;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;

/** One inexact alarm at a time, persisted locally; no server or location permission. */
public class PrayerAlarmReceiver extends BroadcastReceiver {
    private static final int ALARM_ID = 871932;
    static SharedPreferences preferences(Context context) { return context.getSharedPreferences("school-prayer-reminders", Context.MODE_PRIVATE); }
    private static PendingIntent alarm(Context context, long at) {
        Intent intent = new Intent(context, PrayerAlarmReceiver.class).setAction("com.abdullahschool.PRAYER");
        intent.putExtra("at", at);
        return PendingIntent.getBroadcast(context, ALARM_ID, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void cancel(Context context) {
        context.stopService(new Intent(context, AdhanService.class));
        context.getSystemService(AlarmManager.class).cancel(alarm(context, 0));
        NotificationManagerCompat.from(context).cancel(ALARM_ID);
    }
    static void scheduleNext(Context context) throws Exception {
        JSONArray schedule = new JSONArray(preferences(context).getString("schedule", "[]"));
        long now = System.currentTimeMillis();
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        for (int i = 0; i < schedule.length(); i++) {
            long at = schedule.getJSONObject(i).getLong("at");
            if (at > now) {
                if (Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms()) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarm(context, at));
                else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarm(context, at));
                return;
            }
        }
        manager.cancel(alarm(context, 0));
    }
    @Override public void onReceive(Context context, Intent intent) {
        try {
            SchoolNotificationsPlugin.restoreSoundGrants(context);
            SharedPreferences prefs = preferences(context);
            if ("com.abdullahschool.PRAYER".equals(intent.getAction())) {
                long at = intent.getLongExtra("at", 0);
                long now = System.currentTimeMillis();
                // A replaced/cancelled alarm must not reveal another account's reminder.
                JSONArray schedule = new JSONArray(prefs.getString("schedule", "[]"));
                JSONObject item = null;
                for (int i = 0; i < schedule.length(); i++) if (schedule.getJSONObject(i).getLong("at") == at) { item = schedule.getJSONObject(i); break; }
                if (item != null && at > prefs.getLong("lastDelivered", 0) && now >= at && now - at < 30 * 60000L && prefs.contains("account") && (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)) {
                    Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("schoolPrayerOpen", true);
                    PendingIntent content = PendingIntent.getActivity(context, ALARM_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    NotificationCompat.Builder builder = new NotificationCompat.Builder(context, prefs.getString("channel", "school-prayer-default-v1"))
                        .setSmallIcon(R.drawable.ic_stat_halaqat).setContentTitle(item.getString("title")).setContentText(item.getString("body"))
                        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(content).setAutoCancel(true);
                    if (Build.VERSION.SDK_INT < 26) {
                        String sound = prefs.getString("channel", "");
                        if (sound.contains("-default-")) builder.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI);
                        else if (sound.startsWith("school-prayer-custom-v2")) builder.setSound(null);
                        else if (sound.contains("-custom-")) builder.setSound(androidx.core.content.FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", new java.io.File(context.getFilesDir(), "notification_sounds/prayer.audio")));
                        else if (!sound.contains("-silent-")) {
                            String name = sound.contains("-calm-") ? "calm" : sound.contains("-clear-") ? "clear" : "electronic";
                            int resource = context.getResources().getIdentifier("school_" + name, "raw", context.getPackageName());
                            builder.setSound(android.net.Uri.parse("android.resource://" + context.getPackageName() + "/" + resource));
                        }
                    }
                    NotificationManagerCompat.from(context).notify(ALARM_ID, builder.build());
                    prefs.edit().putLong("lastDelivered", at).apply();
                    if (prefs.getString("channel", "").startsWith("school-prayer-custom-v2") && item.optBoolean("adhan", false)) {
                        try {
                            Intent play = new Intent(context, AdhanService.class).putExtra("account", prefs.getString("account", ""));
                            ContextCompat.startForegroundService(context, play);
                        } catch (Exception error) { android.util.Log.w("SchoolAdhan", "Background playback restricted; reminder delivered", error); }
                    }
                }
            }
            scheduleNext(context);
        } catch (Exception error) { android.util.Log.w("SchoolPrayers", "Unable to restore local prayer reminder", error); }
    }
}
