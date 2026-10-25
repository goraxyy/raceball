"""Compose and render RaceBall's two music loops from scratch (no samples, so no licenses).

    python tools/audio/gen_music.py

Lobby, "Old Main Afternoon": 96 BPM in F major, swung. Electric-piano chords (FM, with a slow tremolo), a
vibraphone tune that comes back an octave up, a warm pad, a round bass and lo-fi brushed drums. 16 bars, two halves.
Race, "Happy Valley Rush": 150 BPM in C major. A square-wave lead with vibrato and a little glide, bright supersaw
chord stabs, an acid-ish synth bass with a sub, a sparkly FM bell arpeggio, pumping pads (they duck under the
kick) and a full drum kit with fills, crashes and a riser into the loop point. 16 bars: the hook, then a lift.

Each loop is rendered three times back to back and the middle copy is kept, so note tails and reverb from the end
of the loop wrap into its start: it repeats with no seam.
Needs numpy, scipy and pyloudnorm. Writes apps/web/public/assets/mus/.
"""

from pathlib import Path

import numpy as np
import pyloudnorm
from scipy.io import wavfile
from scipy.signal import butter, lfilter, sosfilt, sosfilt_zi

SR = 32000  # music only plays on laptops and the big screen; 32 kHz keeps the files small
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/assets/mus"
rng = np.random.default_rng(1855)  # fixed seed: the same files every run

NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}
NOTE.update({"Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10})


def hz(name):
    """'A4' -> 440.0, 'Bb3', 'F#5'"""
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[pitch] + 12 * (octave + 1) - 69) / 12)


def t_of(seconds):
    return np.arange(int(seconds * SR)) / SR


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)


def lowpass(x, hi, order=2):
    return sosfilt(butter(order, min(hi, SR * 0.45), "lowpass", fs=SR, output="sos"), x)


def highpass(x, lo, order=2):
    return sosfilt(butter(order, lo, "highpass", fs=SR, output="sos"), x)


def sweep(x, cutoff, block=64, q_order=2):
    """A lowpass whose cutoff follows the curve `cutoff` (Hz per sample), changed every `block` samples: a synth's
    filter envelope"""
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        f = float(np.clip(cutoff[min(i, len(cutoff) - 1)], 40, SR * 0.45))
        sos = butter(q_order, f, "lowpass", fs=SR, output="sos")
        if zi is None:
            zi = sosfilt_zi(sos) * x[0]
        out[i:i + block], zi = sosfilt(sos, x[i:i + block], zi=zi)
    return out


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.08):
    """An envelope n samples long: attack, decay to sustain, and a release at the end"""
    env = np.full(n, s, dtype=float)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    env[:na] = np.linspace(0, 1, na, endpoint=False)
    nd = min(nd, n - na)
    env[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    nr = min(nr, n)
    env[n - nr:] *= np.linspace(1, 0, nr)
    return env


def attack(x, ms):
    n = min(len(x), int(ms / 1000 * SR))
    x[:n] *= np.linspace(0, 1, n)
    return x


# ------------------------------------------------------------------ oscillators (band-limited with polyBLEP)


def _blep(t, dt):
    """polyBLEP correction for a step at phase 0, per sample (t, dt in cycles)"""
    out = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    out[m] = x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt[m]
    out[m] = x * x + x + x + 1
    return out


def saw(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    t = (phase + np.cumsum(dt)) % 1.0
    return 2 * t - 1 - _blep(t, dt)


def square(freq, n, width=0.5, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    t = (phase + np.cumsum(dt)) % 1.0
    x = np.where(t < width, 1.0, -1.0)
    x += _blep(t, dt)
    x -= _blep((t - width) % 1.0, dt)
    return x


# ------------------------------------------------------------------ instruments


def lead(f, dur, glide_from=None):
    """The race's lead: a 40% pulse wave, a short glide into the note, vibrato that comes in late, a filter that
    opens on the strike"""
    n = int((dur + 0.12) * SR)
    t = np.arange(n) / SR
    pitch = np.full(n, f)
    if glide_from:
        g = np.exp(-t / 0.035)
        pitch = f * (glide_from / f) ** g
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.18) / 0.2, 0, 1)
    x = square(pitch * vib, n, 0.4) * 0.6 + saw(pitch * vib * 1.003, n) * 0.25
    x = sweep(x, 1800 + 5200 * np.exp(-t / 0.12))
    return x * adsr(n, 0.006, 0.15, 0.75, 0.1)


def supersaw(f, dur, voices=7, detune=0.012, bright=5200, a=0.004, r=0.06):
    n = int((dur + r) * SR)
    x = np.zeros(n)
    for k in range(voices):
        d = 1 + detune * (k - (voices - 1) / 2) / ((voices - 1) / 2)
        x += saw(f * d, n, phase=rng.random())
    x = lowpass(highpass(x / voices, 180), bright)
    return x * adsr(n, a, 0.12, 0.65, r)


def synth_bass(f, dur, accent=1.0):
    """Saw + sub sine through a plucky filter envelope: punchy and a touch acid on the accents"""
    n = int((dur + 0.03) * SR)
    t = np.arange(n) / SR
    x = saw(f, n) * 0.7 + square(f / 2, n) * 0.25
    x = sweep(x, 260 + (1500 * accent) * np.exp(-t / 0.07), q_order=4)
    sub = np.sin(2 * np.pi * f / 2 * t) * 0.8 if f > 70 else np.sin(2 * np.pi * f * t) * 0.8
    return (x + sub) * adsr(n, 0.002, 0.08, 0.8, 0.03)


def fm_bell(f, dur=0.6, index=2.2, ratio=3.5):
    """A small FM bell for arpeggios: bright on the strike, ringing out"""
    n = int(max(dur, 0.5) * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t / 0.15)
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 0.35)
    return attack(x, 1.5)


def epiano(f, dur):
    """Electric piano (FM, a Rhodes-like tine): a soft bell on the strike over a warm body, a slow tremolo"""
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * f * t + 1.1 * np.exp(-t / 0.5) * np.sin(2 * np.pi * f * t))
    tine = np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.03) * 0.25
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
    env = np.exp(-t / 1.6) * adsr(n, 0.003, 0.2, 1.0, 0.25)
    return attack((body + tine) * trem * env, 2)


def vibes(f, dur):
    """Vibraphone: the bar's 1 : 4 partials, a soft mallet and the motor's tremolo"""
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 1.2)
    x += 0.25 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.25)
    x += 0.05 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t / 0.05)
    trem = 1 + 0.25 * np.sin(2 * np.pi * 5.2 * t)
    return attack(x * trem, 3)


def warm_pad(freqs, dur):
    """Slow, soft chord: detuned saws through a dark filter, fading in"""
    n = int((dur + 0.8) * SR)
    x = np.zeros(n)
    for f in freqs:
        for d in (0.996, 1.0, 1.004):
            x += saw(f * d, n, phase=rng.random())
    x = lowpass(x / (3 * len(freqs)), 1400)
    return x * adsr(n, 0.6, 0.4, 0.85, 0.7)


def round_bass(f, dur):
    """The lobby's bass: a sine with a little 2nd harmonic and a soft thumb on the strike"""
    n = int((dur + 0.05) * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.3)
    thumb = lowpass(rng.standard_normal(n), 900) * np.exp(-t / 0.01) * 0.3
    return (x + thumb) * adsr(n, 0.004, 0.25, 0.7, 0.06)


def kick(tight=1.0, punch=1.0):
    t = t_of(0.45)
    f = 44 + 110 * punch * np.exp(-t / (0.03 * tight))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.25 * tight))
    click = highpass(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.0018)
    return np.tanh(1.6 * (x + 0.15 * click))


def snare(brush=False, tone=200):
    t = t_of(0.32)
    noise = bandpass(rng.standard_normal(len(t)), 1500, 8000)
    if brush:
        return attack(highpass(noise, 3000) * np.exp(-t / 0.09), 12) * 0.9
    body = np.sin(2 * np.pi * np.cumsum(tone * (1 + 0.4 * np.exp(-t / 0.01))) / SR) * np.exp(-t / 0.06)
    return noise * np.exp(-t / 0.12) + 0.6 * body


def rim():
    t = t_of(0.08)
    return (np.sin(2 * np.pi * 1700 * t) * 0.6 + bandpass(rng.standard_normal(len(t)), 2000, 6000)) * np.exp(-t / 0.012)


def tom(f):
    t = t_of(0.5)
    x = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.6 * np.exp(-t / 0.04))) / SR) * np.exp(-t / 0.22)
    return x + 0.2 * bandpass(rng.standard_normal(len(t)), 800, 4000) * np.exp(-t / 0.02)


def clap():
    t = t_of(0.3)
    env = np.zeros(len(t))
    for d in (0, 0.009, 0.018):  # three hands, slightly apart
        i = int(d * SR)
        env[i:] += np.exp(-(t[: len(t) - i]) / 0.012)
    env += 0.5 * np.exp(-t / 0.09)
    return bandpass(rng.standard_normal(len(t)), 900, 5000) * env * 0.7


def hat(open_=False):
    t = t_of(0.4 if open_ else 0.07)
    x = highpass(rng.standard_normal(len(t)), 7500)
    x += 0.3 * square(np.full(len(t), 5400.0), len(t)) * 0.2  # a metallic ring under the hiss
    return x * np.exp(-t / (0.14 if open_ else 0.02))


def crash():
    t = t_of(2.2)
    x = highpass(rng.standard_normal(len(t)), 4000)
    return attack(x * np.exp(-t / 0.7), 2) * 0.8


def shaker():
    t = t_of(0.12)
    return attack(bandpass(rng.standard_normal(len(t)), 4500, 9500) * np.exp(-t / 0.035), 9)


def riser(seconds):
    """White noise sweeping up through a band, getting louder: the build into the loop point"""
    t = t_of(seconds)
    x = rng.standard_normal(len(t))
    x = sweep(x, 400 + 7000 * (t / seconds) ** 2)
    return x * (t / seconds) ** 2 * 0.8


# ------------------------------------------------------------------ arranging


class Track:
    """Collects notes on a beat grid. Renders three copies of the loop and keeps the middle one."""

    def __init__(self, bpm, bars, swing=0.5):
        self.beat = 60 / bpm
        self.bars = bars
        self.swing = swing
        self.length = bars * 4 * self.beat
        self.stems = {}
        self.kicks = []  # where the kicks land: the pumping stems duck under them

    def time(self, bar, beat):
        """bar from 0, beat from 0 (fractions allowed). Off-beat 8ths are pushed by the swing."""
        whole, frac = divmod(beat, 1)
        if abs(frac - 0.5) < 1e-6:
            frac = self.swing
        return (bar * 4 + whole + frac) * self.beat

    def add(self, stem, sound, bar, beat, gain=1.0, pan=0.0, jitter_ms=4):
        # humanize once per note (timing and velocity), so all three rendered copies match
        at = self.time(bar, beat) + (rng.normal(0, jitter_ms / 1000) if jitter_ms else 0)
        gain *= 1 + rng.normal(0, 0.05)
        self.stems.setdefault(stem, []).append((at, sound, gain, pan))

    def kick(self, sound, bar, beat, gain=1.0):
        self.add("kick", sound, bar, beat, gain, jitter_ms=0)
        self.kicks.append(self.time(bar, beat))

    def render(self, mix, pump=0.0):
        """mix: stem -> (level, reverb send, pumps). pump: how deep the pumping stems duck under each kick"""
        n = int(self.length * SR)
        total = 3 * n + SR * 4
        out = np.zeros((total, 2))
        sends = np.zeros(total)
        duck = np.ones(total)
        if pump:
            t = np.arange(total) / SR
            for copy in range(3):
                for k in self.kicks:
                    at = copy * self.length + k
                    i = int(at * SR)
                    seg = slice(i, min(total, i + int(0.3 * SR)))
                    duck[seg] = np.minimum(duck[seg], 1 - pump * np.exp(-(t[seg] - at) / 0.09))
        for stem, notes in self.stems.items():
            level, reverb, pumps = mix[stem]
            layer = np.zeros((total, 2))
            for copy in range(3):
                for at, sound, gain, pan in notes:
                    i = max(0, int((copy * self.length + at) * SR))
                    s = sound * gain * level
                    end = min(total, i + len(s))
                    seg = s[: end - i]
                    layer[i:end, 0] += seg * np.sqrt((1 - pan) / 2)  # equal-power pan
                    layer[i:end, 1] += seg * np.sqrt((1 + pan) / 2)
            if pumps:
                layer *= duck[:, None]
            out += layer
            sends += layer.mean(axis=1) * reverb
        out += room(sends)
        return out[n : 2 * n]  # the middle copy: tails from the copy before are already in it


def room(x):
    """A warm room (Schroeder: four combs, two allpasses), slightly wider on the right."""
    def comb(sig, ms, fb):
        d = int(ms / 1000 * SR)
        a = np.zeros(d + 1)
        a[0], a[d] = 1, -fb
        return lfilter([1.0], a, sig)

    def allpass(sig, ms, g):
        d = int(ms / 1000 * SR)
        b = np.zeros(d + 1)
        a = np.zeros(d + 1)
        b[0], b[d] = -g, 1
        a[0], a[d] = 1, -g
        return lfilter(b, a, sig)

    x = lowpass(highpass(x, 200), 6500)
    left = sum(comb(x, ms, 0.8) for ms in (29.7, 37.1, 41.1, 43.7)) / 4
    right = sum(comb(x, ms, 0.8) for ms in (31.1, 35.3, 40.3, 45.1)) / 4
    left = allpass(allpass(left, 5.0, 0.7), 1.7, 0.7)
    right = allpass(allpass(right, 5.3, 0.7), 1.9, 0.7)
    return np.stack([left, right], axis=1) * 0.5


def master(stereo, lufs):
    """Glue: no rumble, a soft clipper, then loudness-normalize with peaks kept under -1 dBFS."""
    stereo = highpass(stereo.T, 32).T
    stereo = stereo / np.max(np.abs(stereo)) * 0.9
    stereo = np.tanh(stereo * 1.35) / np.tanh(1.35)
    meter = pyloudnorm.Meter(SR)
    stereo = pyloudnorm.normalize.loudness(stereo, meter.integrated_loudness(stereo), lufs)
    peak = np.max(np.abs(stereo))
    if peak > 10 ** (-1 / 20):
        stereo *= 10 ** (-1 / 20) / peak
    return stereo, meter.integrated_loudness(stereo)


# ------------------------------------------------------------------ race: "Happy Valley Rush", 150 BPM, C major

RACE_CHORDS = [  # (root, voicing for stabs and pads)
    ("F", ["A4", "C5", "F5"]), ("G", ["B4", "D5", "G5"]), ("E", ["B4", "E5", "G5"]), ("A", ["C5", "E5", "A5"]),
    ("F", ["A4", "C5", "F5"]), ("G", ["B4", "D5", "G5"]), ("C", ["C5", "E5", "G5"]), ("C", ["C5", "E5", "G5"]),
    ("D", ["A4", "D5", "F5"]), ("E", ["B4", "E5", "G5"]), ("F", ["A4", "C5", "F5"]), ("G", ["B4", "D5", "G5"]),
    ("A", ["C5", "E5", "A5"]), ("F", ["A4", "C5", "F5"]), ("G", ["B4", "D5", "G5"]), ("G", ["B4", "D5", "F5"]),
]
# the lead: (bar, 8th, note, length in 8ths). Bars 0-7 the hook and its answer; 8-15 the lift
RACE_LEAD = [
    (0, 0, "A5", 1), (0, 1, "C6", 1), (0, 2, "F6", 2), (0, 4, "E6", 1), (0, 5, "C6", 1), (0, 6, "A5", 2),
    (1, 0, "B5", 1), (1, 1, "D6", 1), (1, 2, "G6", 2), (1, 4, "F6", 1), (1, 5, "D6", 1), (1, 6, "B5", 1), (1, 7, "D6", 1),
    (2, 0, "E6", 3), (2, 3, "D6", 1), (2, 4, "B5", 2), (2, 6, "G5", 2),
    (3, 0, "A5", 1), (3, 1, "B5", 1), (3, 2, "C6", 1), (3, 3, "E6", 3), (3, 6, "D6", 1), (3, 7, "C6", 1),
    (4, 0, "A5", 1), (4, 1, "C6", 1), (4, 2, "F6", 2), (4, 4, "E6", 1), (4, 5, "F6", 1), (4, 6, "A6", 2),
    (5, 0, "G6", 2), (5, 2, "F6", 1), (5, 3, "E6", 1), (5, 4, "D6", 2), (5, 6, "B5", 2),
    (6, 0, "C6", 1), (6, 1, "E6", 1), (6, 2, "G6", 3), (6, 5, "E6", 1), (6, 6, "G6", 1), (6, 7, "C7", 1),
    (7, 0, "C7", 4), (7, 6, "E6", 1), (7, 7, "F6", 1),
    (8, 0, "F6", 3), (8, 3, "E6", 1), (8, 4, "D6", 2), (8, 6, "A5", 2),
    (9, 0, "G6", 3), (9, 3, "F6", 1), (9, 4, "E6", 2), (9, 6, "B5", 2),
    (10, 0, "A6", 2), (10, 2, "G6", 1), (10, 3, "F6", 1), (10, 4, "C6", 2), (10, 6, "F6", 2),
    (11, 0, "G6", 2), (11, 2, "A6", 1), (11, 3, "B6", 1), (11, 4, "D7", 4),
    (12, 0, "C7", 2), (12, 2, "B6", 1), (12, 3, "A6", 1), (12, 4, "E6", 2), (12, 6, "A6", 2),
    (13, 0, "A6", 2), (13, 2, "G6", 1), (13, 3, "F6", 1), (13, 4, "C6", 2), (13, 6, "A5", 2),
    (14, 0, "B5", 1), (14, 1, "D6", 1), (14, 2, "G6", 1), (14, 3, "B6", 1), (14, 4, "D7", 1), (14, 5, "B6", 1),
    (14, 6, "G6", 1), (14, 7, "D6", 1),
    (15, 0, "G6", 3),
]


def race():
    tr = Track(bpm=150, bars=16)
    e8 = tr.beat / 2
    for bar, (root, voicing) in enumerate(RACE_CHORDS):
        lift = bar >= 8
        # bass: 8ths in the hook (octave bounce, a fifth before the next bar); syncopated and longer in the lift
        r2 = hz(f"{root}2") if NOTE[root] < NOTE["F#"] else hz(f"{root}1")
        fifth = r2 * 1.5
        if not lift:
            for k, (f, acc) in enumerate([(r2, 1), (r2 * 2, 0.4), (r2, 0.7), (r2, 0.5), (r2 * 2, 0.9), (r2, 0.5),
                                           (fifth, 0.6), (r2 * 2, 0.8)]):
                tr.add("bass", synth_bass(f, e8 * 0.9, acc), bar, k * 0.5, gain=0.9 if k % 2 == 0 else 0.7, jitter_ms=2)
        else:
            for beat, f, d, acc in ((0, r2, 3, 1), (1.5, r2 * 2, 2, 0.6), (2.5, r2, 2, 0.9), (3.5, fifth, 1, 0.7)):
                tr.add("bass", synth_bass(f, e8 * d * 0.95, acc), bar, beat, jitter_ms=2)
        # chords: stabs on the off-beats in the hook; a pumping pad in the lift
        freqs = [hz(v) for v in voicing]
        if not lift:
            for beat in (0.5, 1.5, 2.5, 3.5):
                stab = sum(supersaw(f, e8 * 0.55, voices=5, bright=6500) for f in freqs) / len(freqs)
                tr.add("stabs", stab, bar, beat, gain=0.9 if beat in (0.5, 2.5) else 0.7, pan=-0.3, jitter_ms=2)
        else:
            pad = sum(supersaw(f, tr.beat * 4, voices=7, bright=2800, a=0.08, r=0.4) for f in freqs) / len(freqs)
            tr.add("pad", pad, bar, 0, jitter_ms=0)
        # the arpeggio: chord tones climbing in 16ths, in the answer and the lift
        if bar >= 4:
            tones = freqs + [f * 2 for f in freqs]
            for k in range(16):
                f = tones[k % len(tones)] * (2 if k % 8 >= 6 else 1)
                tr.add("arp", fm_bell(f, 0.35), bar, k * 0.25, gain=0.6 if k % 4 == 0 else 0.4,
                       pan=0.5 if k % 2 else -0.2, jitter_ms=1)
        # drums: kick on 1, 2& and 3 (four on the floor in the lift), snare + clap on 2 and 4, 16th hats
        kicks = (0, 1.5, 2) if not lift else (0, 1, 2, 3)
        for beat in kicks:
            tr.kick(kick(), bar, beat, gain=1.0 if beat in (0, 2) else 0.8)
        for beat in (1, 3):
            tr.add("snare", snare(), bar, beat, gain=0.75)
            tr.add("snare", clap(), bar, beat, gain=0.55, pan=0.15)
        for k in range(16):
            if bar in (7, 15) and k >= 12:
                break  # the fill takes over
            tr.add("hats", hat(open_=(k % 8 == 6)), bar, k * 0.25, gain=0.6 if k % 2 == 0 else 0.32, pan=0.55,
                   jitter_ms=2)
        if bar in (0, 8):
            tr.add("cymbal", crash(), bar, 0, pan=-0.4)
    # fills: toms down into the lift, a snare roll and a riser into the loop point
    for k, f in enumerate((220, 196, 165, 130)):
        tr.add("snare", tom(f), 7, 3 + k * 0.25, gain=0.8, pan=0.5 - k * 0.3)
    for k in range(8):
        tr.add("snare", snare(), 15, 2 + k * 0.25, gain=0.3 + 0.08 * k)
    tr.add("fx", riser(tr.beat * 4), 15, 0)
    # the lead, with a little glide between close notes
    prev = None
    for bar, pos, note, length in RACE_LEAD:
        f = hz(note)
        glide = prev if prev and abs(np.log2(f / prev)) < 0.6 else None
        tr.add("lead", lead(f, length * e8 * 0.92, glide), bar, pos * 0.5, gain=1.0 if pos % 2 == 0 else 0.85,
               pan=0.12, jitter_ms=3)
        prev = f

    return tr.render({
        "lead": (0.5, 0.25, False),
        "stabs": (0.32, 0.18, True),
        "pad": (0.3, 0.3, True),
        "arp": (0.22, 0.35, False),
        "bass": (0.75, 0.03, True),
        "kick": (0.95, 0.02, False),
        "snare": (0.55, 0.12, False),
        "hats": (0.17, 0.05, False),
        "cymbal": (0.3, 0.2, False),
        "fx": (0.35, 0.3, False),
    }, pump=0.55)


# ------------------------------------------------------------------ lobby: "Old Main Afternoon", 96 BPM, F major

LOBBY_CHORDS = [  # (bass root, voicing: 3rds, 7ths and 9ths, around middle C)
    ("F", ["A3", "C4", "E4", "G4"]), ("A", ["G3", "C4", "E4", "B4"]), ("Bb", ["A3", "D4", "F4", "C5"]),
    ("C", ["Bb3", "D4", "E4", "G4"]),
    ("D", ["C4", "E4", "F4", "A4"]), ("G", ["Bb3", "D4", "F4", "A4"]), ("Bb", ["A3", "C4", "D4", "F4"]),
    ("C", ["Bb3", "C4", "F4", "G4"]),
    ("F", ["A3", "C4", "E4", "G4"]), ("A", ["G3", "C4", "E4", "B4"]), ("D", ["C4", "E4", "F4", "A4"]),
    ("C", ["Bb3", "D4", "F4", "A4"]),
    ("Bb", ["A3", "D4", "F4", "C5"]), ("A", ["G3", "C4", "E4", "G4"]), ("G", ["Bb3", "D4", "F4", "A4"]),
    ("C", ["Bb3", "E4", "G4", "D5"]),
]
# the vibraphone: (bar, beat, note, beats). Two-bar phrases with room to breathe; the second half lifts
LOBBY_TUNE = [
    (0, 0.5, "C5", 0.5), (0, 1, "F5", 1), (0, 2, "A5", 1.5), (0, 3.5, "G5", 0.5), (1, 0, "E5", 2.5),
    (1, 3, "C5", 0.5), (1, 3.5, "D5", 0.5),
    (2, 0, "F5", 1), (2, 1, "D5", 0.5), (2, 1.5, "C5", 1), (2, 2.5, "A4", 1.5), (3, 0, "G4", 2), (3, 2.5, "E5", 1),
    (4, 0, "F5", 1.5), (4, 1.5, "A5", 0.5), (4, 2, "C6", 1), (4, 3, "A5", 1), (5, 0, "Bb5", 2),
    (5, 2.5, "A5", 0.5), (5, 3, "F5", 1),
    (6, 0, "D5", 1), (6, 1, "F5", 0.5), (6, 1.5, "A5", 1.5), (6, 3, "G5", 1), (7, 0, "F5", 3),
    (8, 0.5, "C6", 0.5), (8, 1, "A5", 1), (8, 2, "C6", 1), (8, 3, "E6", 1), (9, 0, "D6", 2), (9, 2.5, "C6", 0.5),
    (9, 3, "B5", 1),
    (10, 0, "A5", 1.5), (10, 1.5, "F5", 0.5), (10, 2, "A5", 1), (10, 3, "C6", 1), (11, 0, "Bb5", 3),
    (12, 0, "A5", 1), (12, 1, "C6", 0.5), (12, 1.5, "D6", 1), (12, 2.5, "F6", 1.5), (13, 0, "E6", 2),
    (13, 2, "C6", 1), (13, 3, "A5", 1),
    (14, 0, "Bb5", 1), (14, 1, "A5", 0.5), (14, 1.5, "G5", 1), (14, 2.5, "D5", 1.5), (15, 0, "E5", 2),
    (15, 2.5, "G5", 0.5), (15, 3, "C6", 1),
]


def lobby():
    tr = Track(bpm=96, bars=16, swing=0.62)
    for bar, (root, voicing) in enumerate(LOBBY_CHORDS):
        freqs = [hz(v) for v in voicing]
        # electric piano: the chord on 1, a lighter push on 2&, and every other bar a little answer on 4
        tr.add("keys", sum(epiano(f, tr.beat * 1.4) for f in freqs) / 3, bar, 0, gain=0.9, pan=-0.25, jitter_ms=6)
        tr.add("keys", sum(epiano(f, tr.beat * 0.8) for f in freqs[1:]) / 3, bar, 1.5, gain=0.55, pan=-0.25,
               jitter_ms=6)
        if bar % 2:
            tr.add("keys", sum(epiano(f * 2, tr.beat * 0.4) for f in freqs[2:]) / 3, bar, 3, gain=0.4, pan=0.3)
        # a warm pad under it all, in the second half
        if bar >= 8:
            tr.add("pad", warm_pad([f / 2 for f in freqs[:3]], tr.beat * 4), bar, 0, jitter_ms=0)
        # bass: root on 1, the fifth on 3, a step toward the next chord on 4&
        r = hz(f"{root}2") if NOTE[root] >= NOTE["E"] else hz(f"{root}3") / 2 * 2
        nxt = hz(f"{LOBBY_CHORDS[(bar + 1) % 16][0]}2")
        tr.add("bass", round_bass(r, tr.beat * 1.6), bar, 0)
        tr.add("bass", round_bass(r * 1.5, tr.beat * 0.9), bar, 2, gain=0.75)
        tr.add("bass", round_bass(nxt * 2 ** (-1 / 12) if bar % 2 else nxt * 2 ** (2 / 12), tr.beat * 0.4), bar,
               3.5, gain=0.5)
        # lo-fi drums: a soft kick on 1 and 2&, a rim on 2 and a brushed snare on 4, swung shaker 8ths
        tr.kick(kick(0.8, 0.7), bar, 0, gain=0.8)
        tr.kick(kick(0.8, 0.7), bar, 2.5, gain=0.55)
        tr.add("drums", rim(), bar, 1, gain=0.45, pan=0.2)
        tr.add("drums", snare(brush=True), bar, 3, gain=0.65)
        if bar % 4 == 3:
            tr.add("drums", snare(brush=True), bar, 3.5, gain=0.35)
        for k in range(8):
            tr.add("shaker", shaker(), bar, k * 0.5, gain=0.45 if k % 2 else 0.28, pan=0.6)
    for bar, beat, note, beats in LOBBY_TUNE:
        tr.add("vibes", vibes(hz(note), beats * tr.beat), bar, beat, gain=0.85, pan=0.3, jitter_ms=7)

    return tr.render({
        "keys": (0.42, 0.3, False),
        "pad": (0.3, 0.4, False),
        "vibes": (0.5, 0.45, False),
        "bass": (0.85, 0.05, False),
        "kick": (0.6, 0.05, False),
        "drums": (0.5, 0.15, False),
        "shaker": (0.6, 0.15, False),
    })


def write(name, stereo, lufs):
    stereo, measured = master(stereo, lufs)
    OUT.mkdir(parents=True, exist_ok=True)
    wavfile.write(OUT / f"{name}.wav", SR, (np.clip(stereo, -1, 1) * 32767).astype(np.int16))
    peak = 20 * np.log10(np.max(np.abs(stereo)))
    print(f"{name}.wav  {len(stereo) / SR:.2f}s  {measured:.1f} LUFS  peak {peak:.1f} dBFS")


if __name__ == "__main__":
    write("mus_lobby_loop", lobby(), -18.0)
    write("mus_race_loop", race(), -16.0)
