import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code drawn in ink on paper, so it matches the rest of the UI and still scans well */
export function QrCode({ url, label }: { url: string; label: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 512,
      errorCorrectionLevel: "M",
      color: { dark: "#17151fff", light: "#ffffffff" },
    }).then((data) => live && setSrc(data));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <span className="qr">
      {src ? <img src={src} alt={label} /> : <span className="qr-blank" />}
    </span>
  );
}
