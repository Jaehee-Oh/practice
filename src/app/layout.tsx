import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '나의 방명록',
  description: '10초 안에 흔적을 남겨주세요',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
