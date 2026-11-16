# Forum trust model

## Badge-tabell
- `verified_foragers` brukes for forum-badges.
- Roller:
  - `trusted_forager`
  - `expert`
  - `community_verifier`
  - `moderator`

## Admin-UI
- Side: `/admin/forum-trust`
- Krever moderator/admin-rolle.
- Brukes til å tildele, oppdatere og fjerne badge uten manuell SQL.
- Feltet «Intern merknad» (`note`) er ment for moderatorene, men det følger med i brukerens egen dataeksport (`/api/me/export`) – skriv det slik at brukeren kan lese det. Hvem som ellers får lese kolonnen, styres av migrasjon 074; status står i `docs/migrasjoner-a-kjore.md`.

## Moderasjon av meldt innhold

- Side: `/forum/moderation`. Krever moderator/admin-rolle, og alt går gjennom `/api/admin/moderation`.
- Konsollen viser **hva** som er meldt – utdrag, bilder og hvem som skrev det – men aldri hvem som meldte.
- Det du kan gjøre med en rapport:
  - **Skjul innhold** – innlegget eller kommentaren forsvinner for alle, og alle åpne rapporter om det samme regnes som løst.
  - **Vis igjen** – angrer en skjuling. Rapportene som skjulingen løste, blir åpne igjen.
  - **Avvis** – rapporten var ikke berettiget. Innholdet står.
  - **Marker som gjennomgått** – du har sett den, men ikke bestemt deg. Rapporten er fortsatt åpen.
  - **Marker som løst** – saken er tatt hånd om uten skjuling (for eksempel at forfatteren selv rettet eller slettet).
- «Åpen» betyr at rapporten venter på en avgjørelse: ny *eller* gjennomgått. Det samme tallet står i konsollen, på `/admin` og i dagsrapporten.
- **Fristen er ett døgn.** Apple (retningslinje 1.2) venter at en melding følges opp innen 24 timer.
- **Slik får du vite om en melding.** Ingenting sier fra i det meldingen kommer inn. Varslingen er e-post på en fast klokke, to ganger i døgnet, til `post@mycelet.com`:
  - **Dagsrapporten om morgenen** (06:00 UTC – kl. 07 om vinteren, kl. 08 om sommeren) sier fra i emnelinja og øverst i e-posten så snart noe er åpent, med lenke rett til konsollen.
  - **Kveldsvarselet** (18:00 UTC – kl. 19/20) er en egen kort e-post som bare kommer når noe er åpent. Ingen e-post om kvelden betyr at ingenting venter; får ikke jobben lest tabellen, kommer det en e-post som sier «ikke målt» i stedet for stillhet.
  - En melding som kommer rett etter den ene e-posten, står altså først i den neste – **inntil 12 timer senere**, og da med minst 12 timer igjen av fristen. Før kveldsvarselet fantes kunne det gå nesten 24 timer.
  - Begge skriver **klokkeslettet fristen går ut** for den eldste («fristen på 24 t går ut i morgen kl. 08:10», norsk tid), ikke bare hvor lenge den har ventet. De sier «Behandle den nå» når neste e-post ville kommet for sent – etter fristen, eller med mindre enn tre timer igjen – og blir røde med «over døgnfristen» i emnet når fristen er ute.
  - Kortet «Rapporter — venter» på `/admin` lenker til samme sted.
  - Skal en melding varsle i det den kommer inn, må innsendingen flyttes fra nettleseren til en serverrute. Det er ikke gjort.
- **Funn kan ikke skjules herfra ennå.** En funnrapport kan bare avvises eller markeres som løst; må et funn fjernes, gjøres det for hånd i databasen (konsollen viser funnets id). `deleted_at` skal ikke brukes til moderasjon – det er eierens egen angrefrist, og opprydningsjobben sletter raden og bildet for godt etter 30 dager.
- Hver handling logges i `admin_audit_log` (`moderation.hide`, `moderation.unhide`, `moderation.dismiss`, `moderation.reviewed`, `moderation.resolve`) og kan leses på `/admin/audit-log`.
- Det finnes ikke noe for å utestenge en bruker ennå. Til det er bestemt, er tiltaket å skjule innholdet og håndtere kontoen for hånd.

## Eksempel: gi badge
```sql
insert into verified_foragers (user_id, role, badge_label, note)
values ('<user-uuid>', 'expert', 'Soppsakkyndig', 'Verifisert av team');
```

## Eksempel: oppdatere badge
```sql
update verified_foragers
set role = 'trusted_forager',
    badge_label = 'Verifisert plukker'
where user_id = '<user-uuid>';
```
