export const metadata = {
  title: 'InstaToon AI Lab',
  description: '그림체 이미지와 4컷 내용을 넣어 인스타툰을 만드는 초간단 웹앱',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
