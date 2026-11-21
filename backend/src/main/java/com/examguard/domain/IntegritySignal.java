package com.examguard.domain;

public enum IntegritySignal {
    FOCUS_LOSS,
    FOCUS_RETURN,
    VISIBILITY_HIDDEN,
    // Informational pre-exam/surveillance signals: recorded for review, never a strike.
    FULLSCREEN_EXIT,
    GAZE_AWAY,
    GAZE_RETURN,
    CAMERA_LOST,
    NOISE_HIGH,
    NETWORK_LOST,
    NETWORK_RESTORED
}
