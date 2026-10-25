type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

export interface TimingGate {
  index: number;
  section: string;
  position: Vec3;
  rotation: Quat;
  halfExtents: Vec3;
}

/** A local playtest stopwatch; server-side checkpoints and race results remain in game-core. */
export class LocalLapTimer {
  private readonly gates: TimingGate[];
  private startedAt: number | null = null;
  nextCheckpoint = 0;
  laps = 0;
  section = "start";
  lastLap: number | null = null;
  bestLap: number | null = null;

  constructor(gates: TimingGate[]) {
    this.gates = [...gates].sort((a, b) => a.index - b.index);
  }

  get available(): boolean {
    return this.gates.length >= 2;
  }

  elapsed(now: number): number | null {
    return this.startedAt === null ? null : now - this.startedAt;
  }

  /** Sweep the finish plane, so thin gates still work when the ball moves fast. */
  advance(from: Vec3, to: Vec3, now: number, dt: number): void {
    if (!this.available) return;
    const gate = this.gates[this.nextCheckpoint];
    const a = localPoint(from, gate);
    const b = localPoint(to, gate);
    if (a[2] >= 0 || b[2] < 0) return; // only forward crossings count
    const fraction = -a[2] / (b[2] - a[2]);
    const x = a[0] + (b[0] - a[0]) * fraction;
    const y = a[1] + (b[1] - a[1]) * fraction;
    if (Math.abs(x) > gate.halfExtents[0] || Math.abs(y) > gate.halfExtents[1])
      return;

    const crossedAt = now - dt + fraction * dt;
    this.section = gate.section;
    if (this.nextCheckpoint === 0) {
      if (this.startedAt !== null) {
        this.lastLap = crossedAt - this.startedAt;
        this.bestLap = Math.min(this.bestLap ?? Infinity, this.lastLap);
        this.laps++;
      }
      this.startedAt = crossedAt;
    }
    this.nextCheckpoint = (this.nextCheckpoint + 1) % this.gates.length;
  }

  reset(): void {
    this.startedAt = null;
    this.nextCheckpoint = this.laps = 0;
    this.section = "start";
    this.lastLap = this.bestLap = null;
  }
}

/** Rotate the translated point by the conjugate of the gate's world quaternion. */
function localPoint(point: Vec3, gate: TimingGate): Vec3 {
  const x = point[0] - gate.position[0];
  const y = point[1] - gate.position[1];
  const z = point[2] - gate.position[2];
  const [rx, ry, rz, w] = gate.rotation;
  const qx = -rx;
  const qy = -ry;
  const qz = -rz;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + w * tx + qy * tz - qz * ty,
    y + w * ty + qz * tx - qx * tz,
    z + w * tz + qx * ty - qy * tx,
  ];
}
