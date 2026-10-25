"""Turns the Kenney audio shortlist (docs/ASSETS.md) into game-ready sounds.

    python tools/audio/build_sfx.py

Reads the CC0 packs from assets-src/packs/ (Drive, not in git) and writes
apps/web/public/assets/sfx/: each sound is trimmed, faded, made mono, loudness-matched
to its group and saved as a 128 kbps MP3 named by our convention. The boost loop is a
seamless crossfaded WAV, because MP3 leaves a gap when it repeats.
Needs numpy, scipy, soundfile, pyloudnorm and lameenc.
"""

from pathlib import Path

import lameenc
import numpy as np
import pyloudnorm
import soundfile as sf
from scipy.io import wavfile
from scipy.signal import resample_poly

SR = 44100
ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / "assets-src/packs"
OUT = ROOT / "apps/web/public/assets/sfx"

# (output name, source file, group). Groups set loudness, so a category sits together in the mix.
SHORTLIST = [
    ("sfx_lap", "music-jingles/Audio/Pizzicato jingles/jingles_PIZZI04.ogg", "race"),
    ("sfx_final_lap", "music-jingles/Audio/Pizzicato jingles/jingles_PIZZI10.ogg", "race"),
    ("sfx_finish", "music-jingles/Audio/Steel jingles/jingles_STEEL03.ogg", "race"),
    ("mus_results_sting", "music-jingles/Audio/Steel jingles/jingles_STEEL07.ogg", "race"),
    ("sfx_item_pickup", "digital-audio/Audio/powerUp11.ogg", "items"),
    ("sfx_item_ready", "digital-audio/Audio/twoTone1.ogg", "items"),
    ("sfx_boost_start", "digital-audio/Audio/phaserUp7.ogg", "items"),
    ("sfx_roar_whoomp", "sci-fi-sounds/Audio/forceField_000.ogg", "items"),
    ("sfx_roar_boom", "sci-fi-sounds/Audio/lowFrequency_explosion_001.ogg", "items"),
    ("sfx_spill", "sci-fi-sounds/Audio/slime_000.ogg", "items"),
    ("sfx_snowday", "digital-audio/Audio/zapThreeToneDown.ogg", "items"),
    ("sfx_respawn", "digital-audio/Audio/phaseJump2.ogg", "ball"),
    ("sfx_fall", "digital-audio/Audio/phaserDown1.ogg", "ball"),
    *[(f"sfx_bump_heavy_{i + 1:02d}", f"impact-sounds/Audio/impactSoft_heavy_00{i}.ogg", "ball") for i in range(5)],
    *[(f"sfx_land_{i + 1:02d}", f"impact-sounds/Audio/impactSoft_medium_00{i}.ogg", "ball") for i in range(5)],
    ("sfx_snow_crunch_01", "impact-sounds/Audio/footstep_snow_001.ogg", "ball"),
    ("sfx_snow_crunch_02", "impact-sounds/Audio/footstep_snow_002.ogg", "ball"),
    ("sfx_edge_tick", "interface-sounds/Audio/tick_002.ogg", "ui"),
    ("sfx_ui_join", "interface-sounds/Audio/maximize_002.ogg", "ui"),
    ("sfx_ui_leave", "interface-sounds/Audio/minimize_002.ogg", "ui"),
    ("sfx_ui_ready", "interface-sounds/Audio/confirmation_001.ogg", "ui"),
    ("sfx_ui_error", "interface-sounds/Audio/error_007.ogg", "ui"),
    ("sfx_ui_toggle", "interface-sounds/Audio/toggle_002.ogg", "ui"),
    ("sfx_ui_select", "interface-sounds/Audio/select_007.ogg", "ui"),
    ("sfx_ui_back", "interface-sounds/Audio/back_002.ogg", "ui"),
]

# Short-term loudness targets per group, in LUFS (momentary-ish, measured over the sound).
# Race cues and items sit on top of the music (-16/-18 LUFS); UI stays polite.
TARGET = {"race": -14.0, "items": -15.0, "ball": -16.0, "ui": -20.0}
PEAK = 10 ** (-1 / 20)


def load(rel):
    x, sr = sf.read(PACKS / rel, always_2d=True)
    x = x.mean(axis=1)  # mono: positional audio is the engine's job
    if sr != SR:
        x = resample_poly(x, SR, sr)
    return x


def trim(x, floor_db=-50, pad_ms=4, fade_ms=8):
    """Cut silence off both ends (keeping a hair of pre-roll), with a short fade at the tail."""
    thresh = np.max(np.abs(x)) * 10 ** (floor_db / 20)
    idx = np.nonzero(np.abs(x) > thresh)[0]
    a = max(0, idx[0] - int(pad_ms / 1000 * SR))
    b = min(len(x), idx[-1] + int(fade_ms / 1000 * SR))
    x = x[a:b].copy()
    n = min(len(x) // 4, int(fade_ms / 1000 * SR))
    if n:
        x[-n:] *= np.linspace(1, 0, n)
    return x


def loudness(x):
    """Loudness of a short sound: pyloudnorm needs 400 ms, so pad very short ones with silence."""
    meter = pyloudnorm.Meter(SR, block_size=0.2)
    padded = np.concatenate([x, np.zeros(max(0, int(0.45 * SR) - len(x)))])
    return meter.integrated_loudness(padded)


def limit(x, drive):
    """A soft limiter: rounds off only the tallest peaks, so a peaky sound can sit louder."""
    return np.tanh(x * drive) / np.tanh(drive)


def match(x, lufs):
    """Reach the group's loudness with peaks under -1 dBFS. Peaky sounds (impacts, the squelch)
    hit the ceiling first, so they get up to ~6 dB of soft limiting to close the gap."""
    x = x / np.max(np.abs(x)) * PEAK
    for drive in (1.0, 1.5, 2.0, 2.6, 3.4):
        y = limit(x, drive) * PEAK if drive > 1 else x
        if loudness(y) >= lufs - 1.5:
            break
    gain = 10 ** ((lufs - loudness(y)) / 20)
    y = y * min(gain, PEAK / np.max(np.abs(y)))
    return y


def write_mp3(name, x):
    enc = lameenc.Encoder()
    enc.set_bit_rate(128)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()) + enc.flush()
    (OUT / f"{name}.mp3").write_bytes(data)
    return len(data)


def boost_loop():
    """A seamless 1.2 s slice of the thruster: the tail crossfades into the head (equal power)."""
    x = load("sci-fi-sounds/Audio/thrusterFire_003.ogg")
    start = int(1.6 * SR)  # past the ignition, into the steady roar
    n, fade = int(1.2 * SR), int(0.25 * SR)
    body = x[start : start + n + fade]
    t = np.linspace(0, np.pi / 2, fade)
    head = body[:fade] * np.sin(t) + body[n : n + fade] * np.cos(t)
    loop = np.concatenate([head, body[fade:n]])
    loop = match(loop, TARGET["items"] - 2)
    loop = resample_poly(loop, 1, 2)  # 22 kHz is plenty for a rumble
    wavfile.write(OUT / "sfx_boost_loop.wav", SR // 2, (np.clip(loop, -1, 1) * 32767).astype(np.int16))
    return loop


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, src, group in SHORTLIST:
        x = match(trim(load(src)), TARGET[group])
        size = write_mp3(name, x)
        total += size
        print(f"{name:22} {len(x) / SR:5.2f}s  {loudness(x):6.1f} LUFS  {size // 1024:3d} KB  <- {src.split('/')[-1]}")
    loop = boost_loop()
    print(f"{'sfx_boost_loop.wav':22} {len(loop) / (SR / 2):5.2f}s  (seamless)")
    print(f"{len(SHORTLIST)} MP3s, {total // 1024} KB")
