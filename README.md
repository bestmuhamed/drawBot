# DRAW Coin Telegram‑Bot (Next.js API Route)

Dieses Verzeichnis enthält ein Next.js‑Projekt für den Telegram‑Bot von DRAW Coin. Die Bot‑Logik wird in einer serverlosen Funktion (`pages/api/telegram.js`) implementiert und kann über einen Webhook angesprochen werden. So lässt sich der Bot kostengünstig auf Vercel deployen.

## Einrichtung

1. **Abhängigkeiten installieren**

   Stelle sicher, dass Node.js und npm installiert sind. Führe im Verzeichnis Folgendes aus:

   ```bash
   npm install
   ```

2. **Bot‑Token konfigurieren**

   Erstelle einen Telegram‑Bot über [@BotFather](https://t.me/BotFather) und notiere den API‑Token. Lege anschließend eine Datei `.env.local` im Projektverzeichnis an und füge folgende Zeile ein:

   ```env
   TELEGRAM_BOT_TOKEN=dein_bot_token
   ```

   Next.js lädt diese Umgebungsvariable automatisch ein, wenn `process.env.TELEGRAM_BOT_TOKEN` abgefragt wird.

3. **Entwicklungsserver starten**

   ```bash
   npm run dev
   ```

   Die API‑Route ist unter `http://localhost:3000/api/telegram` erreichbar. Lokal kannst du die Route per `curl` testen.

4. **Webhook setzen (optional)**

   Für den produktiven Einsatz muss dein Bot einen Webhook haben. Nachdem du das Projekt auf Vercel deployt hast, setze den Webhook via BotFather oder mit einem HTTP‑Aufruf:

   ```bash
   curl -F "url=https://deine-vercel-domain.vercel.app/api/telegram" https://api.telegram.org/bot<dein_bot_token>/setWebhook
   ```

   Ersetze `deine-vercel-domain.vercel.app` durch deine tatsächliche Vercel‑URL.

## Funktionsweise

Die API‑Route verarbeitet eingehende Updates von Telegram und schickt Antworten zurück. Unterstützt werden folgende Befehle:

- `/start` – Begrüßung und Übersicht der Befehle
- `/info` – Kurze Info zum DRAW‑Coin‑Projekt
- `/price` – Platzhalter für den Token‑Preis
- `/game` – Startet ein Ratespiel (Zahl zwischen 1 und 5)

Der Spielzustand wird in einer globalen Variable `globalThis.gameStates` gespeichert. Bei einem GET‑Request gibt die Route einen 405 Fehler zurück, da der Bot nur POST‑Updates erwartet.

## Hinweise

* Für echte Preisabfragen solltest du den Platzhalter in `/api/telegram.js` durch einen API‑Aufruf (z. B. DexScreener, pump.fun API) ersetzen.
* Persistente Spielzustände solltest du in einer Datenbank ablegen (z. B. Redis, Firebase oder Supabase), da serverlose Funktionen bei jedem Aufruf neu starten können.
* Die Datei `styles/globals.css` enthält optionale Stile für die einfache Indexseite.