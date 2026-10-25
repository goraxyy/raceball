// Error screens on the laptop and big screen (Nuris). The copy and sign art are shared with the
// pad (packages/shared/src/errors.ts), so a phone and a laptop explain a problem the same way.
import { ERROR_COPY, errorSignSvg, type ErrorKind } from "@raceball/shared";

export interface ErrorScreenProps {
  kind: ErrorKind;
  /** The room code, shown on the plate so players can check it against the big screen */
  room?: string;
  /** The server's error or close code, shown on the plate for whoever is debugging */
  code?: number;
  /** The way out (button). Defaults: refresh for version and disconnected, home otherwise. */
  onAction?: () => void;
}

export function ErrorScreen({ kind, room, code, onAction }: ErrorScreenProps) {
  const copy = ERROR_COPY[kind];
  const plate = [room && `Room ${room}`, code && `Code ${code}`]
    .filter(Boolean)
    .join(" · ");
  const act =
    onAction ??
    (() => {
      if (kind === "version" || kind === "disconnected") location.reload();
      else if (kind === "unsupported")
        void navigator.clipboard?.writeText(location.href);
      else location.assign("/");
    });

  return (
    <section className="ui-screen error-screen" data-kind={kind}>
      <div className="error-body">
        <span
          className="error-sign-wrap"
          // static SVG from our own shared code, no user input
          dangerouslySetInnerHTML={{ __html: errorSignSvg(kind) }}
        />
        <div className="error-text">
          {plate && <span className="error-plate">{plate}</span>}
          <h1>{copy.title}</h1>
          <p>{copy.body.web}</p>
          <div className="error-actions">
            <button type="button" className="btn" onClick={act}>
              {copy.action.web}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
