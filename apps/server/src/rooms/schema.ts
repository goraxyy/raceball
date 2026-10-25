import { schema, t, type SchemaType } from "@colyseus/schema";
import { DEFAULT_LAPS, type Phase } from "@raceball/shared";

// Lobby and race state, patched to every client automatically.
// Ball transforms are NOT here: they go out in the `snap` message.

export const PlayerState = schema(
  {
    name: t.string().default(""),
    ball: t.string().default(""),
    /** Index into the 8 player colors in the art bible */
    color: t.uint8().default(0),
    /** Index into the 8 player shapes (colorblind-safe pairing with color) */
    shape: t.uint8().default(0),
    phoneOnly: t.boolean().default(false),
    /** A server-side fill-up bot (always ready) */
    bot: t.boolean().default(false),
    paired: t.boolean().default(false),
    calibrated: t.boolean().default(false),
    assetsLoaded: t.boolean().default(false),
    ready: t.boolean().default(false),
    lap: t.uint8().default(0),
    checkpoint: t.uint16().default(0),
    place: t.uint8().default(0),
    /** Race time in ms when they finished, 0 until then */
    finishedAt: t.number().default(0),
    connected: t.boolean().default(true),
    /** Session stats, kept across rematches for as long as the player stays in the room */
    wins: t.uint16().default(0),
    /** Fastest lap this session, ms; 0 until they complete one */
    bestLap: t.number().default(0),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const ItemBox = schema(
  {
    id: t.string().default(""),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    active: t.boolean().default(true),
  },
  "ItemBox",
);
export type ItemBox = SchemaType<typeof ItemBox>;

export const Puddle = schema(
  {
    id: t.string().default(""),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    radius: t.float32().default(0),
  },
  "Puddle",
);
export type Puddle = SchemaType<typeof Puddle>;

export const RaceState = schema(
  {
    phase: t.string<Phase>().default("lobby"),
    laps: t.uint8().default(DEFAULT_LAPS),
    /** Server time in ms when the countdown ends, 0 outside the countdown */
    countdownEndsAt: t.number().default(0),
    trackId: t.string().default("happy_valley"),
    /** By playerId */
    players: t.map(PlayerState),
    itemBoxes: t.array(ItemBox),
    puddles: t.array(Puddle),
  },
  "RaceState",
);
export type RaceState = SchemaType<typeof RaceState>;
