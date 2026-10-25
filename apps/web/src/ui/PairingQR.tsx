import { QrCode } from "./QrCode";

/** The laptop's pairing QR. Once a phone joins with its token, it turns into a "paired" sticker */
export function PairingQR({ url, paired }: { url?: string; paired: boolean }) {
  if (paired) {
    return (
      <div className="pairing is-paired">
        <span className="pairing-check" aria-hidden />
        <h2>Phone paired</h2>
        <p>Calibrate on your phone, then tap Ready.</p>
      </div>
    );
  }
  return (
    <div className="pairing">
      <span className="eyebrow">Step 2</span>
      <h2>Scan with your phone</h2>
      {url ? (
        <QrCode url={url} label="Pairing QR code for your phone" />
      ) : (
        <span className="qr">
          <span className="qr-blank" />
        </span>
      )}
      <p>Your phone becomes the steering wheel. No app needed.</p>
    </div>
  );
}
