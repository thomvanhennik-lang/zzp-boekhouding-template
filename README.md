# ZZP Boekhouding Template

Een Nederlandse, herbruikbare starttemplate voor een zelfstandige die per kwartaal btw-aangifte voorbereidt. De interface bevat onder meer conceptfacturen, uitgaven, documenten, kwartaaloverzicht en een downloadbaar pakket.

> **Belangrijk:** dit is een lokale testtemplate, geen productieklaar boekhoudsysteem en geen vervanger voor een boekhouder of de Belastingdienst. Gebruik nu uitsluitend fictieve gegevens. Dien nooit een aangifte in op basis van deze testversie.

## Wat is bewust gescheiden?

Deze map bevat geen gegevens van een andere ondernemer: geen facturen, documenten, browserdatabase, `.env.local`, productiebestanden, projectplanning of git-geschiedenis. De lokale testdata van de ontvanger staat los in diens eigen browser.

## Lokaal starten

Vereist: Node.js `>=24.15.0 <25`.

```bash
npm ci
npm run dev
```

Open vervolgens de lokale URL die Vite toont, meestal `http://127.0.0.1:5174`.

Handige controles:

```bash
npm run check
```

## Gebruik nu alleen als oefenomgeving

1. Open de app lokaal; er is een plaatselijke testidentiteit zodat je de interface zonder account kunt bekijken.
2. Vul alleen verzonnen bedrijfsgegevens, facturen en kosten in.
3. Wis testdata via de browseropslag wanneer je opnieuw wilt beginnen.
4. Houd echte pdf’s, bankgegevens, btw-nummers en wachtwoorden buiten deze template.

## Nog nodig voordat echte boekhouding kan

Deze bron is **niet** klaar voor echte administratie. Voor productie zijn minimaal nodig:

- een eigen, afgeschermd Supabase-project per gebruiker;
- echte login en toegangsbeheer; de lokale testidentiteit moet verdwijnen;
- server-side documentopslag, back-ups en herstelproeven;
- een voltooide, beveiligde synchronisatielaag: nu blijven boekingen in IndexedDB in de browser, ook als Supabase-variabelen zijn ingevuld;
- onafhankelijke fiscale en beveiligingscontrole, inclusief btw-regels en bewaarplicht;
- een gecontroleerde productie-release en expliciete gebruikersacceptatie.

Gebruik nooit een `service_role`-sleutel in de browser en deel geen database, opslagbucket of inloggegevens met andere ondernemers.

## Voor overdracht via GitHub

Maak een **private** repository in het eigen GitHub-account van de ontvanger, voeg alleen deze map toe en nodig alleen de bedoelde personen uit. Zet echte configuratie uitsluitend in de eigen secrets/omgevingsvariabelen van de ontvanger; commit geen `.env.local`.

Zie [HANDOVER.md](HANDOVER.md) voor de overdrachtschecklist.
