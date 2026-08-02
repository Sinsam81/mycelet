# Trengsel: når mange brukere sendes til samme område

> Notert 2. august 2026. **Ikke et problem i dag** — 17 kontoer. Bygg det når
> du nærmer deg tusen brukere. Designbeslutningen er tatt nå; selve endringen er
> en dags arbeid når den trengs.

## Problemet

Blir appen mye brukt, sender den 20–100 mennesker til samme område. Det er dårlig
på tre måter:

1. **For skogen.** Plukkepress på et populært område.
2. **For brukeren.** Man kommer fram til noe som allerede er gjennomsøkt.
3. **For merkevaren.** Brukeren klandrer appen, ikke tilfeldighetene.

## Større sirkel er feil svar

Det første forslaget var å øke søkeområdet fra 1 km². Det sprer ikke folk:
**alle får fortsatt samme sirkel.** Går den fra 1 til 5 km², står de hundre
fortsatt på samme sted, bare mer spredt innenfor det — og vi mister
informasjonsverdien som gjorde at vi krympet den i utgangspunktet
(se `docs/validering-romlig-signal.md` og PR #124).

Trengsel løses ved å **ikke vise alle det samme**.

## Løsningen, og hvorfor vi har lov

Valideringen 2. august målte at modellen **ikke kan skille område 1 fra område 4**
— AUC 0,654, p = 0,44, over 18 skogmatchede steder.

Det var et nedslående funn. Men det gir oss også lov til dette:

**Det koster ingenting i forventet kvalitet å sende én bruker til område 4 og en
annen til område 7.** Så langt vi vet er de like gode.

### Slik

- Velg et **brukerspesifikt utvalg** blant områdene innenfor samme poengbånd
  (for eksempel alle innenfor 10 poeng av det høyeste).
- **Stabilt per bruker** — seed på bruker-ID, ikke på tidspunkt. Et utvalg som
  stokkes om ved hver lasting ser ødelagt ut.
- Ti brukere fordeles da på tolv områder i stedet for å møtes på ett.

Dette er **mer** ærlig enn dagens rangering, ikke mindre: i dag later vi som om
det øverste er best, når målingen sier at vi ikke vet det.

### Fallgruve

Ikke velg fra hele lista — bare fra båndet nær toppen. Ellers sender vi
systematisk noen brukere til dårligere områder for å spre trafikken, og det er en
annen og verre urett.

## Og så: si det rett ut

Kildedatasettet vi vurderte 2. august gjør nettopp dette i sine egne
beskrivelser:

> «gå 5–7 km inn for lavere plukkepress»
> «gå bort fra hovedrutene»
> «indre marka gir mindre plukkepress enn de nærmeste utfartsområdene»

En linje som **«populært utfartsområde — gå et stykke inn fra parkeringen»** er
nyttig for brukeren og bra for skogen, og koster ingenting å legge til. Den kan
utløses på områder nær vei, parkering eller kollektivpunkt.

## Det vi IKKE bør gjøre

- **Spore hvem som har vært hvor** for å dempe området etterpå. Det krever at vi
  lagrer bevegelsesmønstre, og posisjonspersonvern er en bærebjelke i dette
  produktet.
- **Skjule gode områder** for å beskytte dem. Da selger vi noe vi holder tilbake.
