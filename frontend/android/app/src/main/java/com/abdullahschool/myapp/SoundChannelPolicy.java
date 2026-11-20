package com.abdullahschool.myapp;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Pure planning: never delete a channel unless the whole bounded plan can succeed. */
final class SoundChannelPolicy {
    static final int MAX_CUSTOM_CHANNELS = 8;
    static final class Candidate {
        final String id;
        final long lastUsed;
        final boolean evictable;
        Candidate(String id, long lastUsed, boolean evictable) { this.id = id; this.lastUsed = lastUsed; this.evictable = evictable; }
    }
    static List<String> evictionsForNewChannel(List<Candidate> channels) {
        int needed = channels.size() - MAX_CUSTOM_CHANNELS + 1;
        List<String> result = new ArrayList<>();
        if (needed <= 0) return result;
        List<Candidate> eligible = new ArrayList<>();
        for (Candidate channel : channels) if (channel.evictable) eligible.add(channel);
        eligible.sort(Comparator.comparingLong((Candidate channel) -> channel.lastUsed).thenComparing(channel -> channel.id));
        if (eligible.size() < needed) throw new IllegalStateException("وصلت إلى حد القنوات المخصصة النشطة (8). راجع إعدادات إشعارات أندرويد؛ لم نغيّر القنوات التي خصصتها في النظام.");
        for (int index = 0; index < needed; index++) result.add(eligible.get(index).id);
        return result;
    }
}
