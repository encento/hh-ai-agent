import "./globals.css";

export const metadata = {
  title: "HH Job Agent",
  description: "Local-first HH application dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
