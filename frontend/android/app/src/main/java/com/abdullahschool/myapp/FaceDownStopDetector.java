package com.abdullahschool.myapp;

/** Monotonic sensor policy kept independent of Android for boundary tests. */
public final class FaceDownStopDetector {
    public static final long HOLD_MS = 700;
    private long since = -1;
    public void reset() { since = -1; }
    public void update(float z, long now) {
        if (!Float.isFinite(z) || z >= -7.5f) reset();
        else if (since < 0 || now < since) since = now;
    }
    public boolean isFaceDown() { return since >= 0; }
    public boolean shouldStop(long now) { return since >= 0 && now - since >= HOLD_MS; }
}
