# CarvteX Síszerviz — weboldal

Statikus HTML/CSS/JS oldal, GitHub + Vercel + Resend stack (ugyanaz a felépítés, mint a Snowline oldalnál).

## Struktúra

- `index.html` — főoldal (szolgáltatások, rólunk, kapcsolat űrlap, 3D viewer helyőrző)
- `i18n.js` — HU/EN fordítások, `data-i18n` kulcsok alapján
- `styles.css` — CSS custom property-kre épülő stílus (CarvteX szín: navy + kék accent)
- `main.js` — nav, nyelvváltó, scroll reveal, scroll progress
- `contact-form.js` — a kapcsolat űrlap beküldése `/api/contact`-ra
- `api/contact.js` — Vercel serverless function, Resend-en keresztül küldi az emailt

## Még hiányzik — bináris fájlok

Ezeket a GitHub webes felületén kell feltölteni az `/assets` mappába (a Composio/GitHub commit tool nem megbízható bináris fájlokhoz):

- `assets/logo-icon.png` — CarvteX logó (a fejlécben és a lábjegyzetben hivatkozva)
- `assets/hero-banner.jpg` — hero háttérkép (pl. a hósíkos posztból)
- `assets/favicon-96x96.png`, `assets/apple-touch-icon.png` — favicon fájlok
- A síléc `.glb` modell (a `CarvteX_World_Cup_Race_SL_165_pair_fixed.glb`), amikor a Three.js 3D viewer elkészül

## Következő lépések

1. Bináris assetek feltöltése (fent)
2. Vercel projekt összekötése a repóval (auto-deploy a `main`-re)
3. `RESEND_API_KEY` és `CONTACT_TO_EMAIL` env változók beállítása Vercelen (Config típusként, nem Secret)
4. Domain beszerzése és DNS beállítása — ellenőrizni, hogy a Vercel vagy a regisztrátor kezeli-e a DNS-t, mielőtt bármit módosítunk
5. 3D síléc viewer megépítése Three.js-szel a már elkészült `.glb` modellből (külön `Topsheet`/`Sidewall`/`Base`/`SteelEdge`/`Binding` node-okkal a scroll-highlighthoz)
6. `impresszum.html` / `adatvedelem.html` oldalak (jogi kötelezettség, mielőtt a kapcsolat űrlap élesben gyűjt adatot)
