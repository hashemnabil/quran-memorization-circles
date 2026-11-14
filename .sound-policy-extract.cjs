const fs=require('fs');const p='frontend/android/app/src/main/java/com/abdullahschool/myapp/SchoolNotificationsPlugin.java';let s=fs.readFileSync(p,'utf8');const start=s.indexOf('    private static final int MAX_CUSTOM_CHANNELS');const end=s.indexOf('    private void cleanUnusedAudio',start);if(start<0||end<0)throw new Error('Missing channel planner');s=s.slice(0,start)+`    private void makeRoom(NotificationManager manager, SharedPreferences prefs, String scope, String incoming) {
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

`+s.slice(end);fs.writeFileSync(p,s);
