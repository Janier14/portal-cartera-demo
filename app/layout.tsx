import type { Metadata } from "next";
import { DM_Sans, Space_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

import "./globals.css";
import "./styles/sidebar.css";
import "./styles/cards-tables.css";
import "./styles/components.css";
import "./styles/headers-nav.css";
import "./styles/modules.css";
import "./styles/planillas.css";
import "./styles/pyg-modal.css";

const legacyFavicon =
  "data:image/png;base64,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";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans"
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono"
});

export const metadata: Metadata = {
  title: "Demo Operativa | Portafolio",
  description: "Proyecto demo de analitica operativa y gestion comercial para portafolio",
  icons: {
    icon: legacyFavicon,
    apple: "/icons/icon-192.png"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${spaceMono.variable}`} suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key='cmm-tema';var themes=['tema-claro','tema-medio','tema-oscuro'];var theme=localStorage.getItem(key)||'tema-claro';if(themes.indexOf(theme)===-1){theme='tema-claro';}document.body.classList.remove('tema-claro','tema-medio','tema-oscuro');document.body.classList.add(theme);}catch(e){document.body.classList.add('tema-claro');}})();`
          }}
        />
        {children}
        <Script id="sw-cleanup" strategy="afterInteractive">{`
          (function(){
            if(!('serviceWorker' in navigator)) return;
            navigator.serviceWorker.getRegistrations().then(function(regs){
              regs.forEach(function(r){ r.unregister(); });
            });
            if('caches' in window){
              caches.keys().then(function(keys){
                keys.forEach(function(k){ caches.delete(k); });
              });
            }
          })();
        `}</Script>
      </body>
    </html>
  );
}
