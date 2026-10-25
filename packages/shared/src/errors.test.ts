import { describe, expect, it } from "vitest";
import {
  ERROR_COPY,
  errorKindFor,
  errorSignSvg,
  type ErrorKind,
} from "./errors";
import { JoinError } from "./protocol";

const kinds = Object.keys(ERROR_COPY) as ErrorKind[];

describe("error screens", () => {
  it("gives every join error its own screen", () => {
    expect(errorKindFor(522)).toBe("notFound");
    expect(errorKindFor(JoinError.RoomFull)).toBe("full");
    expect(errorKindFor(JoinError.VersionMismatch)).toBe("version");
    expect(errorKindFor(JoinError.BadPairToken)).toBe("pairExpired");
    expect(errorKindFor(JoinError.AlreadyPaired)).toBe("alreadyPaired");
    expect(errorKindFor(1006)).toBe("disconnected");
  });

  it("keeps headlines short and buttons to a few words", () => {
    for (const k of kinds) {
      expect(ERROR_COPY[k].title.length, k).toBeLessThanOrEqual(30);
      for (const a of Object.values(ERROR_COPY[k].action))
        expect(a.split(" ").length, k).toBeLessThanOrEqual(3);
    }
  });

  it("draws a sign for every kind", () => {
    for (const k of kinds)
      expect(errorSignSvg(k)).toMatch(/^<svg class="error-sign".*<\/svg>$/);
  });
});
