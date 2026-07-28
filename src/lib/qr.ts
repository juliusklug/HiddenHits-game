import QRCode from "qrcode";

const baseOpts = {
  margin: 1,
  color: { dark: "#000000", light: "#ffffff" },
} as const;

export async function qrToDataUrl(payload: string, size = 512): Promise<string> {
  return QRCode.toDataURL(payload, { ...baseOpts, width: size, errorCorrectionLevel: "M" });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
