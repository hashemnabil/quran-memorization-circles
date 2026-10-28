const fs=require('fs');const file='frontend/android/app/src/main/java/com/abdullahschool/myapp/SchoolNotificationsPlugin.java';let source=fs.readFileSync(file,'utf8');const start=source.indexOf('    @PluginMethod\n');const end=source.indexOf('    @PluginMethod\n    public void openSettings',start);
// Source files may retain CRLF from an older checkout.
if(start<0||end<0){source=source.replaceAll('\r\n','\n');}
const from=source.indexOf('    @PluginMethod\n');const to=source.indexOf('    @PluginMethod\n    public void openSettings',from);
if(from<0||to<0)throw new Error('Cannot locate configureChannel');
const replacement=`    private static final int MAX_CUSTOM_CHANNELS = 8;

    private void makeRoom(NotificationManager manager, SharedPreferences prefs, String scope, String incoming) throws Exception {
        if (Build.VERSION.SDK_INT < 26 || manager.getNotificationChannel(incoming) != null) return;
        java.util.List<NotificationChannel> channels = new java.util.ArrayList<>();
        for (NotificationChannel channel : manager.getNotificationChannels()) if (channel.getId().startsWith("school-" + scope + "-custom-")) channels.add(channel);
        channels.sort((left, right) -> Long.compare(prefs.getLong("used:" + left.getId(), 0), prefs.getLong("used:" + right.getId(), 0)));
        String active = prefs.getString(scope + "-channel", "");
        String prayer = PrayerAlarmReceiver.preferences(getContext()).getString("channel", "");
        for (NotificationChannel channel : new java.util.ArrayList<>(channels)) {
            if (channels.size() < MAX_CUSTOM_CHANNELS) break;
            String id = channel.getId();
            if (id.equals(active) || id.equals(prayer) || !prefs.contains("uri:" + id)) continue;
            String expected = prefs.getString("uri:" + id, "");
            String actual = channel.getSound() == null ? "" : channel.getSound().toString();
            // Retain channels modified or blocked by the user in Android settings.
            if (!expected.equals(actual) || channel.getImportance() != NotificationManager.IMPORTANCE_DEFAULT || channel.shouldVibrate() != prefs.getBoolean("vibrate:" + id, false)) continue;
            manager.deleteNotificationChannel(id); channels.remove(channel);
            prefs.edit().remove("uri:" + id).remove("vibrate:" + id).remove("used:" + id).apply();
        }
        if (channels.size() >= MAX_CUSTOM_CHANNELS) throw new IllegalStateException("وصلت إلى حد القنوات المخصصة النشطة (8). راجع إعدادات إشعارات أندرويد؛ لم نغيّر القنوات التي خصصتها في النظام.");
    }

    private void cleanUnusedAudio(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < 26) return;
        File directory = new File(getContext().getFilesDir(), "notification_sounds");
        File[] files = directory.listFiles(); if (files == null) return;
        for (File file : files) {
            if (!file.getName().matches("(general|prayer)-[a-f0-9]{12}\\\\.audio")) continue;
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            boolean referenced = false;
            for (NotificationChannel channel : manager.getNotificationChannels()) if (uri.equals(channel.getSound())) { referenced = true; break; }
            // Prayer playback also uses its private fixed copy; general files belong to channels.
            if (!referenced && file.getName().startsWith("general-")) file.delete();
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
                File file = new File(directory, scope + "-" + fingerprint + ".audio");
                if (!file.exists()) try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }
                if (scope.equals("prayer")) try (FileOutputStream stream = new FileOutputStream(new File(directory, "prayer.audio"))) { stream.write(bytes); }
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

`;
source=source.slice(0,from)+replacement+source.slice(to);
source=source.replace('builder.setSound(uri.isEmpty() ? null : Uri.parse(uri)); }', 'builder.setSound(uri.isEmpty() ? null : Uri.parse(uri)); if (prefs.getBoolean("general-vibrate", false)) builder.setVibrate(new long[]{0,140}); }');
source=source.replace('    @Override protected void handleOnDestroy() { if (preview != null) preview.stop(); }', '    @Override protected void handleOnPause() { if (preview != null) preview.stop(); super.handleOnPause(); }\n    @Override protected void handleOnDestroy() { if (preview != null) preview.stop(); super.handleOnDestroy(); }');
fs.writeFileSync(file,source);
