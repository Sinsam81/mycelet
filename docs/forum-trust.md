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
