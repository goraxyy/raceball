"""Generate RaceBall's first sound set from scratch (no samples, so no licenses).

    python tools/audio/gen_sfx.py

Needs numpy, scipy, lameenc and pyloudnorm (pip install numpy scipy lameenc pyloudnorm).
Writes runtime files to apps/web/public/assets/sfx/ and full-quality WAVs to
assets-src/audio/ (git-ignored, copy them to Drive if you edit them in Audacity).
"""

from pathlib import Path

import lameenc
import numpy as np
import pyloudnorm
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/assets/sfx"
SRC = ROOT / "assets-src/audio"
rng = np.random.default_rng(2026)  # fixed seed, so every run gives the same files


def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def band(x, lo=None, hi=None, order=2):
    if lo and hi:
        sos = butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    elif lo:
        sos = butter(order, lo, "highpass", fs=SR, output="sos")
    else:
        sos = butter(order, hi, "lowpass", fs=SR, output="sos")
    return sosfilt(sos, x)


def fade(x, fade_in=0.002, fade_out=0.01):
    x = x.copy()
    i, o = int(fade_in * SR), int(fade_out * SR)
    if i:
        x[:i] *= np.linspace(0, 1, i)
    if o:
        x[-o:] *= np.linspace(1, 0, o)
    return x


def peak_normalize(x, dbfs=-1.0):
    return x / np.max(np.abs(x)) * 10 ** (dbfs / 20)


# ---------------------------------------------------------------- sounds


def roll_loop(seconds=4.0):
    """Rubber ball rolling on campus paths. Seamless: the noise is built in the
    frequency domain, so the last sample flows straight into the first."""
    n = int(seconds * SR)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1
    # body rumble around 60-250 Hz, a soft roll-off, and a faint gravel band
    rumble = 1 / (1 + (f / 220) ** 4) * np.clip(f / 45, 0, 1) ** 2
    gravel = 0.035 * np.exp(-(((f - 2600) / 1400) ** 2))
    mag = rumble + gravel
    phase = np.exp(2j * np.pi * rng.random(len(f)))
    x = np.fft.irfft(mag * phase, n)
    t = np.arange(n) / SR
    # wobble once per ball turn; whole cycles per loop keep it seamless
    wobble = 1 + 0.18 * np.sin(2 * np.pi * (24 / seconds) * t)
    drift = 1 + 0.08 * np.sin(2 * np.pi * (3 / seconds) * t)
    return x * wobble * drift


def bump(pitch=1.0):
    """Two rubber balls colliding: a pitched-down thud, a plastic knock and a short boing."""
    t = t_axis(0.45)
    f = (60 + 140 * np.exp(-t / 0.03)) * pitch
    thud = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.11)
    knock = band(rng.standard_normal(len(t)), 700 * pitch, 2600 * pitch) * np.exp(-t / 0.012)
    boing_f = 310 * pitch * (1 + 0.04 * np.sin(2 * np.pi * 18 * t))
    boing = np.sin(2 * np.pi * np.cumsum(boing_f) / SR) * np.exp(-t / 0.09)
    return fade(thud + 0.55 * knock + 0.22 * boing, 0.0005, 0.05)


def tone(freq, seconds, vibrato=0.0):
    """Soft, slightly chorused triangle-ish tone for race beeps."""
    t = t_axis(seconds)
    out = np.zeros_like(t)
    for detune in (1.0, 1.004):
        ph = 2 * np.pi * np.cumsum(freq * detune * (1 + vibrato * np.sin(2 * np.pi * 6 * t))) / SR
        for k, a in ((1, 1.0), (3, 0.22), (5, 0.07)):
            out += a * np.sin(k * ph)
    return out


def countdown_beep():
    return fade(tone(587.33, 0.26), 0.004, 0.08)  # D5, for "3, 2, 1"


def countdown_go():
    x = tone(1174.66, 0.75, vibrato=0.006)  # D6, an octave up
    x += 0.5 * tone(587.33, 0.75)
    t = t_axis(0.75)
    return fade(x * np.exp(-t / 0.5), 0.004, 0.2)


def ui_click():
    t = t_axis(0.045)
    tick = np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.006)
    snap = band(rng.standard_normal(len(t)), 3000, 9000) * np.exp(-t / 0.002)
    return fade(tick + 0.4 * snap, 0.0003, 0.01)


# ---------------------------------------------------------------- output


def write_wav(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(path, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


def write_mp3(path, x, kbps=128):
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()
    path.write_bytes(enc.encode(pcm) + enc.flush())


def one_shot(name, x):
    x = peak_normalize(x, -1.0)
    write_wav(SRC / f"{name}.wav", x)
    write_mp3(OUT / f"{name}.mp3", x)
    print(f"{name}.mp3  {len(x) / SR:.2f}s  peak -1.0 dBFS")


def loop(name, x, lufs=-16.0):
    meter = pyloudnorm.Meter(SR)
    x = peak_normalize(x, -6.0)  # raw noise is far too quiet for the meter's silence gate
    x = pyloudnorm.normalize.loudness(x, meter.integrated_loudness(x), lufs)
    peak = 20 * np.log10(np.max(np.abs(x)))
    if peak > -1:  # never clip: pull the whole loop down instead
        x *= 10 ** ((-1 - peak) / 20)
        peak = -1.0
    write_wav(SRC / f"{name}.wav", x)
    # MP3 adds silence at both ends, which leaves a gap on every repeat.
    # Loops ship as a small 22 kHz WAV instead, which repeats cleanly everywhere.
    # The loop has almost nothing above 5 kHz, so plain decimation is fine.
    wavfile.write(OUT / f"{name}.wav", SR // 2, (np.clip(x[::2], -1, 1) * 32767).astype(np.int16))
    print(f"{name}.wav  {len(x) / SR:.2f}s  {meter.integrated_loudness(x):.1f} LUFS  peak {peak:.1f} dBFS")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    loop("sfx_roll_loop", roll_loop())
    for i, p in enumerate((1.0, 0.88, 1.14), start=1):
        one_shot(f"sfx_bump_{i:02d}", bump(p))
    one_shot("sfx_countdown_beep", countdown_beep())
    one_shot("sfx_countdown_go", countdown_go())
    one_shot("sfx_ui_click", ui_click())
