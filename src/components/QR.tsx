import { useEffect, useState } from 'react';

export function QR({ text, size = 240, className }: { text: string; size?: number; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode').then((QRCode) =>
      QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#1a1a19', light: '#ffffff' } }).then(
        (u) => alive && setSrc(u),
      ),
    );
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={`QR 코드: ${text}`} className={className} />
  ) : (
    <div style={{ width: size, height: size }} className={className} />
  );
}
