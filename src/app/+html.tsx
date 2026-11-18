import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Web only: the root HTML document (RTL + Arabic). The web app is installable on a computer («Install» in
// Chrome / Edge): public/manifest.json. Its links are relative, so it works at the site's root (expo start)
// and under GitHub Pages' /family-games/ (every route is one level deep).
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#1B0F3B" />
        <meta name="description" content="ألعاب جماعية للعائلة: كل لاعب على هاتفه أو حاسوبه" />
        <link rel="manifest" href="manifest.json" />
        <link rel="apple-touch-icon" href="pwa/icon-192.png" />
        <title>ألعاب العائلة</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'body{background-color:#1B0F3B;}' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
