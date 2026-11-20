package com.abdullahschool.myapp;

import android.app.*;
import android.content.*;
import android.hardware.*;
import android.media.*;
import android.os.*;
import androidx.core.app.NotificationCompat;
import java.io.File;
import android.content.res.AssetFileDescriptor;

/** Offline adhan playback, cancelled by a stable face-down position. */
public class AdhanService extends Service implements SensorEventListener {
    private MediaPlayer player;
    private SensorManager sensors;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private AudioManager.OnAudioFocusChangeListener focusListener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final FaceDownStopDetector faceDown = new FaceDownStopDetector();
    private final Runnable faceDownCheck = () -> { if (faceDown.shouldStop(SystemClock.elapsedRealtime())) stopSelf(); };
    private static final int ID = 871933;
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || "stop".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        String account = intent.getStringExtra("account");
        if (account == null || !account.equals(PrayerAlarmReceiver.preferences(this).getString("account", ""))) { stopSelf(); return START_NOT_STICKY; }
        try {
            handler.removeCallbacksAndMessages(null);
            faceDown.reset();
            if (sensors != null) sensors.unregisterListener(this);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (!androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()) { stopSelf(); return START_NOT_STICKY; }
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel channel = new NotificationChannel("school-adhan-playback", "تشغيل الأذان", NotificationManager.IMPORTANCE_LOW);
                channel.setSound(null, null); manager.createNotificationChannel(channel);
                NotificationChannel reminder = manager.getNotificationChannel("school-prayer-adhan-v1");
                if (manager.getNotificationChannel("school-adhan-playback").getImportance() == NotificationManager.IMPORTANCE_NONE || reminder != null && reminder.getImportance() == NotificationManager.IMPORTANCE_NONE) { stopSelf(); return START_NOT_STICKY; }
            }
            PendingIntent stop = PendingIntent.getService(this, ID, new Intent(this, AdhanService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            startForeground(ID, new NotificationCompat.Builder(this, "school-adhan-playback").setSmallIcon(R.drawable.ic_stat_halaqat)
                .setContentTitle("الأذان").setContentText("اقلب الهاتف على وجهه لإيقاف الأذان")
                .setOngoing(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).addAction(0, "إيقاف الأذان", stop).build());
            if (player != null) { player.release(); player = null; }
            audio = getSystemService(AudioManager.class);
            if (audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL || manager.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL) { stopSelf(); return START_NOT_STICKY; }
            AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
            focusListener = change -> { if (change < 0) stopSelf(); };
            int granted;
            if (Build.VERSION.SDK_INT >= 26) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener).build();
                granted = audio.requestAudioFocus(focus);
            } else granted = audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { stopSelf(); return START_NOT_STICKY; }
            player = new MediaPlayer(); player.setAudioAttributes(attributes);
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            if ("custom".equals(intent.getStringExtra("source"))) player.setDataSource(new File(getFilesDir(), "notification_sounds/prayer.audio").getAbsolutePath());
            else try (AssetFileDescriptor recording = getResources().openRawResourceFd(R.raw.school_adhan)) {
                player.setDataSource(recording.getFileDescriptor(), recording.getStartOffset(), recording.getLength());
            }
            player.setOnCompletionListener(p -> stopSelf());
            player.setOnErrorListener((p, what, extra) -> { stopSelf(); return true; });
            player.setOnPreparedListener(p -> p.start()); player.prepareAsync();
            sensors = getSystemService(SensorManager.class);
            Sensor sensor = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (sensor != null) sensors.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL);
            handler.postDelayed(this::stopSelf, 10 * 60 * 1000L);
        } catch (Exception error) { android.util.Log.w("SchoolAdhan", "Unable to play local recording", error); stopSelf(); }
        return START_NOT_STICKY;
    }
    @Override public void onSensorChanged(SensorEvent event) {
        faceDown.update(event.values[2], SystemClock.elapsedRealtime());
        handler.removeCallbacks(faceDownCheck);
        if (faceDown.shouldStop(SystemClock.elapsedRealtime())) stopSelf();
        else if (faceDown.isFaceDown()) handler.postDelayed(faceDownCheck, FaceDownStopDetector.HOLD_MS);
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (sensors != null) sensors.unregisterListener(this);
        if (player != null) { player.release(); player = null; }
        if (audio != null && Build.VERSION.SDK_INT >= 26 && focus != null) audio.abandonAudioFocusRequest(focus);
        else if (audio != null && focusListener != null) audio.abandonAudioFocus(focusListener);
        stopForeground(true); super.onDestroy();
    }
}
