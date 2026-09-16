# Overdrachtschecklist

## Voor degene die deelt

- Deel uitsluitend de map `friend-template-zzp-boekhouding` of een private repository die daaruit is gemaakt.
- Deel geen facturen, pdf’s, exports, backups, e-mailadressen, databasegegevens of `.env`-bestanden uit een andere administratie.
- Deze template is op dit moment alleen een oefen-/bouwbasis. Noem hem niet een officieel boekhoudprogramma.

## Voor de ontvanger

1. Maak een eigen private GitHub-repository of kopieer deze map naar je eigen computer.
2. Start hem lokaal met de stappen in [README.md](README.md).
3. Test met fictieve gegevens; controleer daarna zelf of de factuur-, kosten- en kwartaalweergaven logisch voelen.
4. Gebruik een eigen domein, eigen e-mail, eigen Supabase-project en eigen documentopslag wanneer een latere productieversie wordt gebouwd.
5. Laat de productieversie vóór echt gebruik beoordelen op beveiliging, dataverlies/back-ups, privacy en Nederlandse fiscale verwerking.

## Harde grenzen

- De gegevens in de browser zijn lokaal en kunnen verdwijnen bij het wissen van browserdata.
- De aanwezige Supabase-migraties zijn een beveiligde basis, maar vormen nog geen werkende cloudopslag voor boekingen of documenten.
- Btw-bedragen en exportbestanden in de testapp zijn hulpmiddelen ter controle, geen ingediende aangifte en geen fiscaal advies.
- Een Google-login of Supabase-configuratie invullen maakt deze bron niet automatisch productieklaar.

## Veilig delen

Controleer vóór elk delen dat er geen `.env.local`, `node_modules`, `dist`, exports, databaseback-ups of persoonlijke pdf’s in de map staan. Deel nooit een Supabase `service_role`-sleutel: die hoort uitsluitend aan de serverkant in secrets.
