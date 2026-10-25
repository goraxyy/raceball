"""Compose and render RaceBall's two music loops from scratch (no samples, so no licenses).

    python tools/audio/gen_music.py

Lobby: a swung toy-box groove, 100 BPM in F major (marimba, plucked bass, glockenspiel, shaker).
Race: a driving 148 BPM in G major (steel-drum hook, plucked bass, offbeat marimba, drums).
Both sit next to the pizzicato and steel-drum jingles in the Kenney shortlist.

Each loop is rendered three times back to back and the middle copy is kept, so note tails and
reverb from the end of the loop wrap into its start: it repeats with no seam.
Needs numpy, scipy and pyloudnorm. Writes apps/web/public/assets/mus/.
"""

from pathlib import Path

import numpy as np
import pyloudnorm
from scipy.io import wavfile
from scipy.signal import butter, lfilter, sosfilt

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
    return sosfilt(butter(order, hi, "lowpass", fs=SR, output="sos"), x)


def highpass(x, lo, order=2):
    return sosfilt(butter(order, lo, "highpass", fs=SR, output="sos"), x)


def attack(x, ms):
    n = min(len(x), int(ms / 1000 * SR))
    x[:n] *= np.linspace(0, 1, n)
    return x


# ------------------------------------------------------------------ instruments


def marimba(f, dur=1.0):
    """Wooden bar: fundamental, the 4th-ish partial a marimba is tuned to, and a mallet knock."""
    t = t_of(max(dur, 0.9))
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.42)
    x += 0.32 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.07)
    x += 0.08 * np.sin(2 * np.pi * f * 9.3 * t) * np.exp(-t / 0.02)
    knock = bandpass(rng.standard_normal(len(t)), 1800, 6000) * np.exp(-t / 0.004)
    return attack(x + 0.3 * knock, 2)


def glock(f, dur=1.6):
    """Toy glockenspiel: bright, ringing, with the metal bar's inharmonic overtones."""
    t = t_of(max(dur, 1.6))
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9)
    x += 0.28 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.25)
    x += 0.12 * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t / 0.09)
    return attack(x, 1.5)


def steelpan(f, dur=0.8):
    """Steel drum: octave and twelfth partials, a tiny pitch dip on the strike, a shimmer."""
    t = t_of(max(dur, 0.9))
    bend = 1 + 0.006 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f * bend) / SR
    x = np.sin(ph) * np.exp(-t / 0.55)
    x += 0.55 * np.sin(2 * ph) * np.exp(-t / 0.32)
    x += 0.22 * np.sin(3 * ph) * np.exp(-t / 0.16)
    x += 0.18 * np.sin(2.012 * ph) * np.exp(-t / 0.3)  # slow beating = the pan's shimmer
    return attack(x, 4)


def pluck(f, dur=0.9, damp=0.996, bright=2600, sub=0.0):
    """Karplus-Strong string: pizzicato upright bass when low, a plucked toy guitar higher up."""
    n = int(SR / f - 0.5)
    t_len = int(max(dur, 0.25) * SR)
    burst = np.zeros(t_len)
    burst[:n] = lowpass(rng.uniform(-1, 1, n), bright)
    a = np.zeros(n + 2)
    a[0], a[n], a[n + 1] = 1, -damp / 2, -damp / 2
    x = lfilter([1.0], a, burst)
    fade = np.ones(t_len)
    k = int(0.04 * SR)
    fade[-k:] = np.linspace(1, 0, k)  # damp the string at the note's end
    if sub:
        t = np.arange(t_len) / SR
        x = x + sub * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.25) * np.max(np.abs(x))
    return x * fade


def kick(tight=1.0):
    t = t_of(0.4)
    f = 46 + 90 * np.exp(-t / (0.035 * tight))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.22 * tight))
    click = highpass(rng.standard_normal(len(t)), 2000) * np.exp(-t / 0.002)
    return x + 0.12 * click


def snare(brush=False):
    t = t_of(0.3)
    noise = bandpass(rng.standard_normal(len(t)), 1500, 7000)
    if brush:
        return attack(highpass(noise, 3000) * np.exp(-t / 0.09), 12) * 0.9
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return noise * np.exp(-t / 0.11) + 0.5 * tone


def clap():
    t = t_of(0.3)
    env = np.zeros(len(t))
    for d in (0, 0.009, 0.018):  # three hands, slightly apart
        i = int(d * SR)
        env[i:] += np.exp(-(t[: len(t) - i]) / 0.012)
    env += 0.5 * np.exp(-t / 0.08)
    return bandpass(rng.standard_normal(len(t)), 900, 5000) * env * 0.7


def hat(open_=False):
    t = t_of(0.35 if open_ else 0.06)
    x = highpass(rng.standard_normal(len(t)), 7000)
    return x * np.exp(-t / (0.12 if open_ else 0.018))


def shaker():
    t = t_of(0.12)
    return attack(bandpass(rng.standard_normal(len(t)), 4500, 9500) * np.exp(-t / 0.035), 9)


# ------------------------------------------------------------------ arranging


class Track:
    """Collects notes on a beat grid. Renders three copies of the loop and keeps the middle one."""

    def __init__(self, bpm, bars, swing=0.5):
        self.beat = 60 / bpm
        self.bars = bars
        self.swing = swing
        self.length = bars * 4 * self.beat
        self.stems = {}

    def time(self, bar, beat):
        """bar from 0, beat from 0 (fractions allowed). Off-beat 8ths are pushed by the swing."""
        whole, frac = divmod(beat, 1)
        if abs(frac - 0.5) < 1e-6:
            frac = self.swing
        return (bar * 4 + whole + frac) * self.beat

    def add(self, stem, sound, bar, beat, gain=1.0, pan=0.0, jitter_ms=5):
        # humanize once per note (timing and velocity), so all three rendered copies match
        at = self.time(bar, beat) + (rng.normal(0, jitter_ms / 1000) if jitter_ms else 0)
        gain *= 1 + rng.normal(0, 0.06)
        self.stems.setdefault(stem, []).append((at, sound, gain, pan))

    def render(self, mix):
        n = int(self.length * SR)
        out = np.zeros((3 * n + SR * 4, 2))
        sends = np.zeros(len(out))
        for stem, notes in self.stems.items():
            level, reverb = mix[stem]
            for copy in range(3):
                for at, sound, gain, pan in notes:
                    i = max(0, int((copy * self.length + at) * SR))
                    s = sound * gain * level
                    end = min(len(out), i + len(s))
                    seg = s[: end - i]
                    out[i:end, 0] += seg * np.sqrt((1 - pan) / 2)  # equal-power pan
                    out[i:end, 1] += seg * np.sqrt((1 + pan) / 2)
                    sends[i:end] += seg * reverb
        out += room(sends)
        return out[n : 2 * n]  # the middle copy: tails from the copy before are already in it


def room(x):
    """A small, warm room (Schroeder: four combs, two allpasses), slightly wider on the right."""
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

    x = lowpass(x, 6000)
    left = sum(comb(x, ms, 0.78) for ms in (29.7, 37.1, 41.1, 43.7)) / 4
    right = sum(comb(x, ms, 0.78) for ms in (31.1, 35.3, 40.3, 45.1)) / 4
    left = allpass(allpass(left, 5.0, 0.7), 1.7, 0.7)
    right = allpass(allpass(right, 5.3, 0.7), 1.9, 0.7)
    return np.stack([left, right], axis=1) * 0.5


def master(stereo, lufs):
    """Gentle glue: a soft clipper, then loudness-normalize with peaks kept under -1 dBFS."""
    stereo = highpass(stereo.T, 35).T  # no rumble below the bass
    stereo = stereo / np.max(np.abs(stereo)) * 0.9
    stereo = np.tanh(stereo * 1.25) / np.tanh(1.25)
    meter = pyloudnorm.Meter(SR)
    stereo = pyloudnorm.normalize.loudness(stereo, meter.integrated_loudness(stereo), lufs)
    peak = np.max(np.abs(stereo))
    if peak > 10 ** (-1 / 20):
        stereo *= 10 ** (-1 / 20) / peak
    return stereo, meter.integrated_loudness(stereo)


# ------------------------------------------------------------------ lobby: 100 BPM, F major, swung


def lobby():
    tr = Track(bpm=100, bars=8, swing=0.6)
    # Fmaj7 Dm7 Gm7 C7 | Fmaj7 Am7 Bbmaj7 C7
    chords = [
        ["F", "A", "C", "E"], ["D", "F", "A", "C"], ["G", "Bb", "D", "F"], ["C", "E", "G", "Bb"],
        ["F", "A", "C", "E"], ["A", "C", "E", "G"], ["Bb", "D", "F", "A"], ["C", "E", "G", "Bb"],
    ]
    for bar, (r, third, fifth, seventh) in enumerate(chords):
        # marimba: a rocking broken chord, accents on the beats
        for k, (note, octave) in enumerate([(r, 3), (fifth, 4), (third, 4), (fifth, 4), (seventh, 4), (fifth, 4), (third, 4), (fifth, 4)]):
            octave = octave + (1 if NOTE[note] < NOTE["E"] and octave == 3 else 0)
            tr.add("marimba", marimba(hz(f"{note}{octave}")), bar, k * 0.5, gain=0.85 if k % 2 == 0 else 0.6, pan=-0.55 + 0.12 * (k % 3))
        # plucked bass: root on 1, fifth on 3, a step toward the next chord on 4&
        nxt = chords[(bar + 1) % 8][0]
        tr.add("bass", pluck(hz(f"{r}2"), 1.1, 0.995, 1400), bar, 0)
        tr.add("bass", pluck(hz(f"{fifth}2"), 0.9, 0.995, 1400), bar, 2, gain=0.8)
        step = NOTE[nxt] + 2 if NOTE[nxt] + 2 < 12 else NOTE[nxt] - 1
        names = {v: k for k, v in NOTE.items() if len(k) == 1 or k.endswith("b")}
        tr.add("bass", pluck(hz(f"{names.get(step % 12, nxt)}2"), 0.4, 0.993, 1400), bar, 3.5, gain=0.55)
        # brushes: soft kick on 1 and 3, a brushed snare on 2 and 4, swung shaker 8ths
        tr.add("drums", kick(0.8), bar, 0, gain=0.7)
        tr.add("drums", kick(0.8), bar, 2, gain=0.5)
        tr.add("drums", snare(brush=True), bar, 1, gain=0.55)
        tr.add("drums", snare(brush=True), bar, 3, gain=0.6)
        for k in range(8):
            tr.add("shaker", shaker(), bar, k * 0.5, gain=0.5 if k % 2 else 0.32, pan=0.65)

    # glockenspiel: a sparse, sweet tune that answers itself every two bars
    tune = [
        (0, 0, "A5", 1), (0, 1.5, "C6", 0.5), (0, 2, "A5", 1), (0, 3, "G5", 1),
        (1, 0, "F5", 2), (1, 3.5, "A5", 0.5),
        (2, 0, "Bb5", 1), (2, 1.5, "A5", 0.5), (2, 2, "G5", 1), (2, 3.5, "F5", 0.5),
        (3, 0, "E5", 2), (3, 2.5, "G5", 0.5), (3, 3, "C6", 1),
        (4, 0, "A5", 1), (4, 1.5, "C6", 0.5), (4, 2, "E6", 1), (4, 3, "D6", 1),
        (5, 0, "C6", 2), (5, 2.5, "A5", 0.5), (5, 3, "G5", 1),
        (6, 0, "D6", 1), (6, 1.5, "C6", 0.5), (6, 2, "Bb5", 1), (6, 3, "A5", 1),
        (7, 0, "G5", 2), (7, 2, "E5", 1), (7, 3, "C5", 1),
    ]
    for bar, beat, note, length in tune:
        tr.add("glock", glock(hz(note), length * tr.beat + 1), bar, beat, gain=0.8, pan=0.4)

    return tr.render({
        "marimba": (0.55, 0.25),
        "bass": (0.9, 0.05),
        "glock": (0.5, 0.45),
        "drums": (0.55, 0.12),
        "shaker": (0.75, 0.15),
    })


# ------------------------------------------------------------------ race: 148 BPM, G major


def race():
    tr = Track(bpm=148, bars=8)
    # G D Em C | G D C D
    chords = [
        ("G", ["G", "B", "D"]), ("D", ["F#", "A", "D"]), ("E", ["G", "B", "E"]), ("C", ["G", "C", "E"]),
        ("G", ["G", "B", "D"]), ("D", ["F#", "A", "D"]), ("C", ["G", "C", "E"]), ("D", ["F#", "A", "D"]),
    ]
    for bar, (root, triad) in enumerate(chords):
        # bass: driving 8ths, octave jumps on the off-beats
        for k in range(8):
            octave = 3 if k % 2 else 2
            if k == 7 and bar % 2:
                note = {"G": "F#", "D": "C#", "E": "D", "C": "B"}[root]  # lean into the next bar
                octave = 2
            else:
                note = root
            tr.add("bass", pluck(hz(f"{note}{octave}"), 0.3, 0.990, 2200, sub=0.6), bar, k * 0.5, gain=0.9 if k % 2 == 0 else 0.6, jitter_ms=3)
        # marimba skank: short triads on every off-beat
        for beat in (0.5, 1.5, 2.5, 3.5):
            for note in triad:
                o = 4 if NOTE[note] >= NOTE["F"] - 1 else 5
                tr.add("marimba", marimba(hz(f"{note}{o}"), 0.3)[: int(0.22 * SR)], bar, beat, gain=0.45, pan=-0.65, jitter_ms=3)
        # drums: kick on 1 and 3 (plus a push on 3& every other bar), clap and snare on 2 and 4
        tr.add("drums", kick(), bar, 0)
        tr.add("drums", kick(), bar, 2, gain=0.9)
        if bar % 2:
            tr.add("drums", kick(), bar, 2.5, gain=0.6)
        for beat in (1, 3):
            tr.add("drums", snare(), bar, beat, gain=0.7)
            tr.add("drums", clap(), bar, beat, gain=0.6, pan=0.1)
        for k in range(16):
            if bar == 7 and k >= 12:
                break  # the fill takes over
            tr.add("hats", hat(open_=(k == 14)), bar, k * 0.25, gain=0.55 if k % 2 == 0 else 0.3, pan=0.65, jitter_ms=2)
    # the fill into the loop point: snare 16ths, rising
    for k, g in enumerate((0.35, 0.45, 0.55, 0.7)):
        tr.add("drums", snare(), 7, 3 + k * 0.25, gain=g)

    # steel-drum hook: (bar, 8th position, note, length in 8ths)
    hook = [
        (0, 0, "D6", 2), (0, 2, "B5", 1), (0, 3, "D6", 1), (0, 4, "E6", 2), (0, 6, "D6", 1), (0, 7, "B5", 1),
        (1, 0, "A5", 2), (1, 2, "F#5", 1), (1, 3, "A5", 1), (1, 4, "D6", 3), (1, 7, "C6", 1),
        (2, 0, "B5", 2), (2, 2, "G5", 1), (2, 3, "B5", 1), (2, 4, "E6", 2), (2, 6, "D6", 1), (2, 7, "B5", 1),
        (3, 0, "C6", 3), (3, 3, "B5", 1), (3, 4, "A5", 2), (3, 6, "G5", 1), (3, 7, "A5", 1),
        (4, 0, "D6", 2), (4, 2, "B5", 1), (4, 3, "D6", 1), (4, 4, "E6", 2), (4, 6, "D6", 1), (4, 7, "B5", 1),
        (5, 0, "A5", 2), (5, 2, "F#5", 1), (5, 3, "A5", 1), (5, 4, "D6", 2), (5, 6, "E6", 1), (5, 7, "F#6", 1),
        (6, 0, "G6", 2), (6, 2, "E6", 1), (6, 3, "C6", 1), (6, 4, "E6", 2), (6, 6, "D6", 1), (6, 7, "C6", 1),
        (7, 0, "B5", 1), (7, 1, "C6", 1), (7, 2, "D6", 2), (7, 4, "A5", 2), (7, 6, "F#5", 1), (7, 7, "A5", 1),
    ]
    for bar, pos, note, length in hook:
        tr.add("pan", steelpan(hz(note), length * tr.beat / 2 + 0.4), bar, pos * 0.5, gain=1.0 if pos % 2 == 0 else 0.8, pan=0.35, jitter_ms=4)
        # an octave-down double, quieter, for weight
        tr.add("pan", steelpan(hz(note) / 2, length * tr.beat / 2 + 0.3), bar, pos * 0.5, gain=0.3, pan=-0.55, jitter_ms=4)

    return tr.render({
        "pan": (0.42, 0.22),
        "bass": (1.0, 0.04),
        "marimba": (0.4, 0.15),
        "drums": (0.6, 0.08),
        "hats": (0.16, 0.05),
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
