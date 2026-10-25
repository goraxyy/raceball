// Error screens (Nuris): what each failure says and the road sign it shows, shared by the pad
// and the web app so a phone and a laptop explain the same problem the same way.
// Styles: .error-screen in packages/shared/theme/theme.css.
import { PLAYER_COLORS } from "./constants";
import { JoinError } from "./protocol";

export type ErrorKind =
  | "notFound"
  | "full"
  | "version"
  | "permission"
  | "unsupported"
  | "pairExpired"
  | "alreadyPaired"
  | "disconnected"
  | "lost";

/** Where the screen shows: the copy differs because a phone can't type a code */
export type ErrorSurface = "pad" | "web";

export interface ErrorCopy {
  title: string;
  body: Record<ErrorSurface, string>;
  action: Record<ErrorSurface, string>;
}

export const ERROR_COPY: Record<ErrorKind, ErrorCopy> = {
  notFound: {
    title: "No race at this code",
    body: {
      pad: "The race may have ended, or the host started a new one. Scan the QR on the big screen again.",
      web: "Check the four letters on the big screen. The race may have ended, or the host started a new one.",
    },
    action: { pad: "Try again", web: "Try another code" },
  },
  full: {
    title: "The grid is full",
    body: {
      pad: "This race already has 8 players. Watch this one from the big screen and jump into the next.",
      web: "This race already has 8 players. Watch this one from the big screen and jump into the next.",
    },
    action: { pad: "Try again", web: "Back" },
  },
  version: {
    title: "RaceBall got an update",
    body: {
      pad: "This page is older than the race. Refresh to load the new version, then scan back in.",
      web: "This page is older than the race. Refresh to load the new version.",
    },
    action: { pad: "Refresh", web: "Refresh" },
  },
  permission: {
    title: "Motion access is off",
    body: {
      pad: 'RaceBall steers with motion. On iPhone, close Safari completely, reopen this page and tap Allow. On Android, allow "Motion sensors" in the site settings.',
      web: "Your phone needs motion access to steer. Follow the steps on its screen.",
    },
    action: { pad: "Try again", web: "Back" },
  },
  unsupported: {
    title: "This browser can't feel tilt",
    body: {
      pad: "Open this link in Safari on iPhone or Chrome on Android. Browsers inside apps, like Instagram's, don't share motion.",
      web: "This browser can't draw the 3D race. Use a recent Chrome, Edge, Firefox or Safari.",
    },
    action: { pad: "Copy link", web: "Copy link" },
  },
  pairExpired: {
    title: "That pairing code expired",
    body: {
      pad: "Scan the QR code on your laptop again. It makes a fresh one each time.",
      web: "Make a new pairing QR and scan it with your phone.",
    },
    action: { pad: "Try again", web: "New QR code" },
  },
  alreadyPaired: {
    title: "Someone's already steering",
    body: {
      pad: "Another phone is paired to this player. To race as yourself, scan the QR on the big screen instead.",
      web: "Another phone is already paired to this player.",
    },
    action: { pad: "Try again", web: "Back" },
  },
  disconnected: {
    title: "Lost the race",
    body: {
      pad: "Your phone dropped off the connection. Check the Wi-Fi, then rejoin.",
      web: "This laptop dropped off the connection. Check the Wi-Fi, then rejoin.",
    },
    action: { pad: "Rejoin", web: "Rejoin" },
  },
  lost: {
    title: "Wrong turn",
    body: {
      pad: "There's nothing at this address. Scan the QR on the big screen.",
      web: "There's nothing at this address. Head back to the start line.",
    },
    action: { pad: "Back to start", web: "Back to start" },
  },
};

/** Colyseus matchmaking: no room with that id (the room code) */
const ROOM_NOT_FOUND = 522;

/** Which screen to show for a join error or close code from the server */
export function errorKindFor(code: number | undefined): ErrorKind {
  switch (code) {
    case ROOM_NOT_FOUND:
      return "notFound";
    case JoinError.RoomFull:
      return "full";
    case JoinError.VersionMismatch:
      return "version";
    case JoinError.BadPairToken:
      return "pairExpired";
    case JoinError.AlreadyPaired:
      return "alreadyPaired";
    default:
      return "disconnected";
  }
}

// ---------------------------------------------------------------- the signs
// Each error is a trackside road sign on a post, drawn in the livery: a 120×124 SVG whose
// parts are styled by class (.sign-face, .sign-ink …) so it follows the theme colors.

type Shape = "diamond" | "circle" | "board";

const FACE: Record<Shape, string> = {
  diamond: '<path class="sign-face" d="M60 6 104 50 60 94 16 50Z"/>',
  circle: '<circle class="sign-face" cx="60" cy="50" r="42"/>',
  board:
    '<rect class="sign-face" x="12" y="14" width="96" height="70" rx="9"/>',
};

const slash = '<path class="sign-slash" d="M30 22 90 80"/>';

const SIGNS: Record<ErrorKind, { shape: Shape; tone: string; glyph: string }> =
  {
    notFound: {
      shape: "diamond",
      tone: "var(--flag)",
      glyph:
        '<path class="sign-ink" d="M48 40a12 12 0 1 1 17 11c-4 2-5 5-5 10"/><circle class="sign-dot" cx="60" cy="72" r="4.5"/>',
    },
    full: {
      shape: "board",
      tone: "#fff",
      glyph: PLAYER_COLORS.slice(0, 8)
        .map(
          (c, i) =>
            `<circle class="sign-seat" cx="${30 + (i % 4) * 20}" cy="${i < 4 ? 38 : 60}" r="7.5" style="fill:${c}"/>`,
        )
        .join(""),
    },
    version: {
      shape: "circle",
      tone: "var(--brake)",
      glyph:
        '<path class="sign-ink" d="M81 54a21 21 0 1 1-6-20"/><path class="sign-ink" d="M78 20v15H63"/>',
    },
    permission: {
      shape: "circle",
      tone: "#fff",
      glyph:
        '<circle class="sign-slash" cx="60" cy="50" r="34"/>' +
        '<rect class="sign-ink" x="47" y="29" width="26" height="42" rx="5" transform="rotate(-18 60 50)"/>' +
        slash,
    },
    unsupported: {
      shape: "diamond",
      tone: "var(--flag)",
      glyph:
        '<rect class="sign-ink" x="47" y="28" width="26" height="44" rx="5"/><path class="sign-ink thin" d="M55 44a5 5 0 1 1 7 5c-2 1-2 2-2 4"/><circle class="sign-dot" cx="60" cy="61" r="2.6"/>',
    },
    pairExpired: {
      shape: "board",
      tone: "#fff",
      glyph:
        '<rect class="sign-ink thin" x="30" y="26" width="16" height="16" rx="2"/><rect class="sign-ink thin" x="74" y="26" width="16" height="16" rx="2"/><rect class="sign-ink thin" x="30" y="56" width="16" height="16" rx="2"/><path class="sign-ink thin" d="M58 30h6M58 42h8M76 58h6M62 64v6M74 70h14"/>' +
        slash,
    },
    alreadyPaired: {
      shape: "board",
      tone: "var(--gas)",
      glyph:
        '<rect class="sign-ink" x="24" y="38" width="42" height="24" rx="12"/><rect class="sign-ink" x="54" y="38" width="42" height="24" rx="12"/>',
    },
    disconnected: {
      shape: "diamond",
      tone: "var(--flag)",
      glyph:
        '<path class="sign-ink" d="M38 50a31 31 0 0 1 44 0M48 60a17 17 0 0 1 24 0"/><circle class="sign-dot" cx="60" cy="71" r="4.5"/>' +
        '<path class="sign-slash" d="M38 30 82 74"/>',
    },
    lost: {
      shape: "board",
      tone: "var(--go)",
      glyph:
        '<path class="sign-ink paper" d="M44 72V46a15 15 0 0 1 30 0v16"/><path class="sign-ink paper" d="M64 54l10 10 10-10"/>',
    },
  };

/** The sign for an error as an SVG string (static, safe to inject) */
export function errorSignSvg(kind: ErrorKind): string {
  const s = SIGNS[kind];
  return (
    `<svg class="error-sign" viewBox="0 0 120 124" style="--tone:${s.tone}" aria-hidden="true">` +
    '<g class="sign-swing"><rect class="sign-post" x="55" y="80" width="10" height="40" rx="2"/>' +
    FACE[s.shape] +
    s.glyph +
    "</g></svg>"
  );
}
