"""Generate RaceBall's original sounds from scratch (no samples, so no licenses).

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


# ---------------------------------------------------------------- crowd + lion (sound pass)

# vowel formants (F1, F2, F3) in Hz, with bandwidths, for the voices
VOWELS = {
    "ae": (660, 1720, 2410),  # "yeah"
    "ey": (480, 2000, 2650),  # "hey"
    "ah": (760, 1150, 2500),  # "wahh"
    "oo": (310, 870, 2250),  # "oooh"
    "oh": (450, 800, 2300),
    "aw": (650, 1000, 2500),  # lion, mouth open
}


def formants(src, vowel, gains=(1.0, 0.55, 0.25)):
    """A parallel formant filter: the vocal tract shaping a buzz into a vowel."""
    out = np.zeros_like(src)
    for f, g in zip(VOWELS[vowel], gains):
        bw = 80 + f * 0.08
        out += g * band(src, max(40, f - bw), f + bw)
    return out


def glottal(f0):
    """A buzzy voice source from a pitch contour (Hz per sample): a soft sawtooth plus breath."""
    ph = np.cumsum(f0) / SR
    saw = 2 * (ph % 1) - 1
    return band(saw, 60, 5000) + 0.08 * rng.standard_normal(len(f0))


def room(x, seconds=0.7, tone=3500):
    """A stadium-ish tail: convolve with a short burst of decaying, darkened noise."""
    from scipy.signal import fftconvolve

    t = t_axis(seconds)
    ir = band(rng.standard_normal(len(t)), 120, tone) * np.exp(-t / (seconds / 4))
    ir[0] = 3.0  # keep the dry sound on top of the tail
    return fftconvolve(x, ir)[: len(x) + len(t)] / 4


def voice(length, f0, vowel, contour, onset, hold):
    """One person in the crowd: their own pitch, vowel, timing and a little vibrato."""
    t = t_axis(length)
    k = np.clip((t - onset) / hold, 0, 1)
    pitch = f0 * contour(k) * (1 + 0.012 * np.sin(2 * np.pi * rng.uniform(4.5, 6.5) * t))
    env = np.clip((t - onset) / 0.06, 0, 1) * np.exp(-np.clip(t - onset - hold * 0.55, 0, None) / (hold * 0.45))
    voiced = formants(glottal(pitch), vowel, (1.0, 0.75, 0.5))
    # the breathy h of hey / yeah: a short puff of bright noise as the voice comes in
    h = band(rng.standard_normal(len(t)), 1800, 6500) * np.exp(-np.clip(t - onset, 0, None) / 0.08) * (t >= onset)
    return (voiced + 0.6 * h) * env


def crowd_cheer():
    """Beaver Stadium on an overtake: 48 voices whooping up, with claps and a stadium tail."""
    length = 2.6
    out = np.zeros(int(length * SR))
    for _ in range(48):
        f0 = rng.choice([rng.uniform(105, 160), rng.uniform(190, 290)])  # lower and higher voices
        rise = rng.uniform(1.12, 1.35)
        out += voice(
            length,
            f0,
            rng.choice(["ae", "ey", "ah"]),
            lambda k, r=rise: 0.85 + (r - 0.85) * np.minimum(1, k * 3) - 0.08 * k,  # a "whoo" that peaks early
            onset=rng.uniform(0.0, 0.35),
            hold=rng.uniform(1.0, 1.8),
        ) * rng.uniform(0.5, 1.0)
    t = t_axis(length)
    for _ in range(90):  # scattered claps, thinning out
        at = rng.uniform(0.15, 2.2) ** 1.2
        i = int(at * SR)
        c = band(rng.standard_normal(int(0.03 * SR)), 1500, 6500) * np.exp(-t_axis(0.03) / 0.006)
        out[i : i + len(c)] += c[: len(out) - i] * rng.uniform(0.6, 1.4) * np.exp(-at)
    wash = band(rng.standard_normal(len(t)), 400, 5000) * np.clip(t / 0.2, 0, 1) * np.exp(-t / 1.4)
    out += 0.25 * wash
    out += 0.12 * band(rng.standard_normal(len(t)), 3500, 9000) * np.clip(t / 0.15, 0, 1) * np.exp(-t / 1.0)  # breath and hiss of a big room
    return fade(room(out), 0.002, 0.3)


def crowd_oooh():
    """A near miss: 40 voices on "oooh", swelling up and falling away."""
    length = 1.9
    out = np.zeros(int(length * SR))
    for _ in range(40):
        f0 = rng.choice([rng.uniform(110, 150), rng.uniform(200, 260)])
        out += voice(
            length,
            f0,
            rng.choice(["oo", "oo", "oh"]),
            lambda k: 1.0 + 0.22 * np.sin(np.pi * np.minimum(1, k * 1.6)) - 0.18 * k,  # up, then down
            onset=rng.uniform(0.0, 0.18),
            hold=rng.uniform(1.1, 1.5),
        ) * rng.uniform(0.5, 1.0)
    return fade(band(room(out), 190, 8000), 0.002, 0.3)


def lion_roar():
    """A cartoon lion roar for the Lion Roar item: a growl that opens up and closes, with breath."""
    length = 1.35
    t = t_axis(length)
    k = t / length
    f0 = 92 + 70 * np.sin(np.pi * np.minimum(1, k * 1.25)) ** 1.5 - 20 * k  # rises, then sags
    growl = 1 + 0.65 * np.sin(2 * np.pi * 28 * t + 1.5 * np.sin(2 * np.pi * 3 * t))  # throat rattle
    src = glottal(f0) * growl + 0.6 * glottal(f0 / 2)  # a sub-octave for size
    breath = band(rng.standard_normal(len(t)), 400, 3200) * 0.35
    shut = formants(src + breath, "ah", (1, 0.4, 0.15))
    open_ = formants(src + breath, "aw", (1, 0.85, 0.5))
    mouth = np.sin(np.pi * np.minimum(1, k * 1.15)) ** 0.8  # opens through the middle of the roar
    x = shut * (1 - mouth) + open_ * mouth
    chest = band(src, 55, 320) * 0.9  # the body of the growl, which the vowel filter took out
    hiss = band(rng.standard_normal(len(t)), 1500, 5000) * 0.35 * mouth  # the snarl
    x = x + chest + hiss
    env = np.clip(t / 0.09, 0, 1) * (0.55 + 0.45 * mouth) * np.exp(-np.clip(t - 0.95, 0, None) / 0.18)
    x = np.tanh(2.2 * x * env / (np.max(np.abs(x * env)) + 1e-9))  # snarl
    return fade(room(x, 0.45, 2500), 0.004, 0.15)

# ---------------------------------------------------------------- interactables (M3 polish)
# Their own random stream, so adding them leaves every sound above byte-identical.
irng = np.random.default_rng(7101)


def chirp(f, t):
    """A sine following the frequency curve f(t)"""
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def pad_whoosh():
    """A boost pad: a low thump, air rushing up through a rising band, and a bright two-note zing on top."""
    t = t_axis(0.7)
    thump = chirp(55 + 90 * np.exp(-t / 0.025), t) * np.exp(-t / 0.08)
    noise = irng.standard_normal(len(t))
    rush = np.zeros_like(t)
    for i, centre in enumerate(np.geomspace(500, 4200, 8)):  # the band climbs in steps, crossfaded
        k = np.clip(1 - np.abs(t / 0.42 * 8 - i) / 1.5, 0, 1)
        rush += band(noise, centre * 0.7, centre * 1.4) * k
    rush *= np.clip(t / 0.05, 0, 1) * np.exp(-np.clip(t - 0.3, 0, None) / 0.12)
    zing = chirp(880 * (1 + np.clip(t / 0.12, 0, 1)), t) + 0.5 * chirp(1320 * (1 + np.clip(t / 0.12, 0, 1)), t)
    zing *= np.clip((t - 0.04) / 0.02, 0, 1) * np.exp(-np.clip(t - 0.06, 0, None) / 0.16)
    return fade(0.8 * thump + 1.1 * rush + 0.28 * zing, 0.001, 0.08)


def scoop_pop():
    """A Creamery Scoop: a soft 'bloop' and a little bell. The game raises its pitch with every scoop held."""
    t = t_axis(0.42)
    bloop = chirp(330 + 650 * np.exp(-t / 0.035), t) * np.exp(-t / 0.07)
    bell = np.zeros_like(t)
    for f, a in ((1568, 1.0), (2349, 0.45), (3136, 0.2)):  # G6, D7, G7
        bell += a * np.sin(2 * np.pi * f * t)
    bell *= np.clip((t - 0.03) / 0.004, 0, 1) * np.exp(-np.clip(t - 0.03, 0, None) / 0.13)
    return fade(0.9 * bloop + 0.35 * bell, 0.0005, 0.06)


def scoop_drop():
    """Scoops knocked off: three plops falling in pitch, each with a wet little splat."""
    t = t_axis(0.62)
    out = np.zeros_like(t)
    for start, f0 in ((0.0, 720), (0.13, 540), (0.26, 390)):
        k = np.clip(t - start, 0, None)
        on = t >= start
        plop = chirp(f0 * (0.55 + 0.45 * np.exp(-k / 0.04)) * on, t) * np.exp(-k / 0.06) * on
        splat = band(irng.standard_normal(len(t)), 900, 3200) * np.exp(-k / 0.015) * on
        out += plop + 0.25 * splat
    return fade(out, 0.0005, 0.08)


def paw_boing():
    """A Lion Paw bumper: the pinball thwack (a click and a burst of bright noise), a springy boing and a short
    metallic ring."""
    t = t_axis(0.75)
    click = np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.004)
    snap = band(irng.standard_normal(len(t)), 1200, 5000) * np.exp(-t / 0.018)
    wobble = 1 + 0.18 * np.sin(2 * np.pi * 24 * t) * np.exp(-t / 0.25)
    boing = chirp(170 * (1 + 0.9 * np.exp(-t / 0.045)) * wobble, t) * np.exp(-t / 0.28)
    ring = (np.sin(2 * np.pi * 1210 * t) + 0.6 * np.sin(2 * np.pi * 1737 * t)) * np.exp(-t / 0.09)
    return fade(0.5 * click + 0.6 * snap + boing + 0.18 * ring, 0.0003, 0.1)


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
    # sound pass: the gaps the Kenney packs left (generated last, so the sounds above stay identical)
    one_shot("sfx_crowd_cheer", crowd_cheer())
    one_shot("sfx_crowd_oooh", crowd_oooh())
    one_shot("sfx_lion_roar", lion_roar())
    # the interactables: boost pads, Creamery Scoops and Lion Paw bumpers
    one_shot("sfx_pad_whoosh", pad_whoosh())
    one_shot("sfx_scoop_pop", scoop_pop())
    one_shot("sfx_scoop_drop", scoop_drop())
    one_shot("sfx_paw_boing", paw_boing())
