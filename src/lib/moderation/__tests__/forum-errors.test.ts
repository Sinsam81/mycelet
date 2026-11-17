import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  erAvbruttDeling,
  forumErrorMessage,
  ForumAuthError,
  ForumPostNotFoundError,
  isNotAuthenticatedError,
  isPostNotFoundError,
  skalHenteInnleggPaaNytt
} from '../forum-errors';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

const tekster = { fallback: 'Kunne ikke oppdatere innlegg.', prohibited: 'Ikke tillatt.', notLoggedIn: 'Du må logge inn først.' };

describe('forumErrorMessage', () => {
  it('oversetter innholdsfilterets kode i stedet for å vise den', () => {
    // PostgrestError arver fra Error, så `err.message` ga koden i klartekst.
    const fraTrigger = Object.assign(new Error('MYCELET_PROHIBITED_CONTENT'), { code: 'P0001' });
    expect(forumErrorMessage(fraTrigger, tekster)).toBe('Ikke tillatt.');
    expect(forumErrorMessage({ message: 'ERROR: MYCELET_PROHIBITED_CONTENT' }, tekster)).toBe('Ikke tillatt.');
  });

  it('gir egen tekst når brukeren ikke er innlogget', () => {
    expect(forumErrorMessage(new ForumAuthError(), tekster)).toBe('Du må logge inn først.');
  });

  it('viser aldri en rå feilmelding', () => {
    const postgrest = Object.assign(new Error('new row violates row-level security policy for table "comments"'), { code: '42501' });
    expect(forumErrorMessage(postgrest, tekster)).toBe(tekster.fallback);
    expect(forumErrorMessage(new Error('Failed to fetch'), tekster)).toBe(tekster.fallback);
    expect(forumErrorMessage('noe rart', tekster)).toBe(tekster.fallback);
    expect(forumErrorMessage(null, tekster)).toBe(tekster.fallback);
  });
});

describe('ForumAuthError', () => {
  it('bærer en kode, ikke en setning på ett språk', () => {
    const feil = new ForumAuthError();
    expect(feil).toBeInstanceOf(Error);
    expect(feil.code).toBe('NOT_AUTHENTICATED');
    expect(feil.message).not.toMatch(/innlogget/i);
    expect(isNotAuthenticatedError(feil)).toBe(true);
    expect(isNotAuthenticatedError(new Error('annet'))).toBe(false);
    expect(isNotAuthenticatedError(undefined)).toBe(false);
  });
});

describe('ForumPostNotFoundError', () => {
  it('kan skilles fra en henting som feilet', () => {
    const borte = new ForumPostNotFoundError();
    expect(borte).toBeInstanceOf(Error);
    expect(borte.code).toBe('POST_NOT_FOUND');
    expect(isPostNotFoundError(borte)).toBe(true);
    // Det trådsiden faktisk får når nettet faller ut, eller PostgREST svarer feil.
    expect(isPostNotFoundError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isPostNotFoundError(Object.assign(new Error('JWT expired'), { code: 'PGRST301' }))).toBe(false);
    expect(isPostNotFoundError(new ForumAuthError())).toBe(false);
    expect(isPostNotFoundError(null)).toBe(false);
    expect(isPostNotFoundError(undefined)).toBe(false);
  });

  it('er ikke en feiltekst som skal vises rått', () => {
    expect(forumErrorMessage(new ForumPostNotFoundError(), tekster)).toBe(tekster.fallback);
  });
});

describe('skalHenteInnleggPaaNytt', () => {
  it('spør ikke på nytt om et innlegg som er borte', () => {
    expect(skalHenteInnleggPaaNytt(0, new ForumPostNotFoundError())).toBe(false);
  });

  it('prøver en feilet henting tre ganger til, som TanStacks standard', () => {
    const nett = new TypeError('Failed to fetch');
    expect([0, 1, 2].map((forsok) => skalHenteInnleggPaaNytt(forsok, nett))).toEqual([true, true, true]);
    expect(skalHenteInnleggPaaNytt(3, nett)).toBe(false);
  });

  /**
   * Det trådsiden bygger på. TanStack setter `error` også når en oppfriskning
   * i bakgrunnen feiler, og beholder innlegget den hadde. Siden skjulte tråden
   * på ENHVER feil: en leser på dårlig dekning mistet tråden og et halvskrevet
   * svar fordi et sanntidsvarsel utløste en henting som ikke kom fram.
   */
  it('en oppfriskning som feiler beholder innlegget; «borte» kommer med én gang', async () => {
    const queryClient = new QueryClient();
    let svar: 'ok' | 'nett' | 'borte' = 'ok';
    let kall = 0;
    const observer = new QueryObserver(queryClient, {
      queryKey: ['forum-post', 'p1'],
      queryFn: async () => {
        kall += 1;
        if (svar === 'borte') throw new ForumPostNotFoundError();
        if (svar === 'nett') throw new TypeError('Failed to fetch');
        return { id: 'p1' };
      },
      retry: skalHenteInnleggPaaNytt,
      retryDelay: 0
    });
    const stopp = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));

      svar = 'nett';
      kall = 0;
      await queryClient.invalidateQueries({ queryKey: ['forum-post', 'p1'] });
      await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
      let resultat = observer.getCurrentResult();
      expect(kall).toBe(4);
      expect(resultat.data).toEqual({ id: 'p1' });
      expect(isPostNotFoundError(resultat.error)).toBe(false);

      svar = 'borte';
      kall = 0;
      await queryClient.invalidateQueries({ queryKey: ['forum-post', 'p1'] });
      await vi.waitFor(() => expect(isPostNotFoundError(observer.getCurrentResult().error)).toBe(true));
      expect(kall).toBe(1);

      // Blir innlegget synlig igjen (blokkeringen opphevet, vist igjen av en
      // moderator), forsvinner feilen og tråden kan vises.
      svar = 'ok';
      await queryClient.invalidateQueries({ queryKey: ['forum-post', 'p1'] });
      await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
      resultat = observer.getCurrentResult();
      expect(resultat.error).toBeNull();
    } finally {
      stopp();
      queryClient.clear();
    }
  });
});

describe('erAvbruttDeling', () => {
  it('et lukket delingsark er ikke en feil', () => {
    expect(erAvbruttDeling(Object.assign(new Error('Share canceled'), { name: 'AbortError' }))).toBe(true);
    expect(erAvbruttDeling(Object.assign(new Error('busy'), { name: 'InvalidStateError' }))).toBe(true);
    expect(erAvbruttDeling(new Error('NotAllowedError'))).toBe(false);
    expect(erAvbruttDeling(null)).toBe(false);
  });
});

describe('tekstene finnes på begge språk', () => {
  const nokler: Array<[string, string[]]> = [
    ['ContentFilter', ['controlledSubstanceTrade', 'notLoggedIn']],
    ['PostDetail', ['emptyError', 'confirmDelete', 'confirmDeleteYes', 'deleting', 'deleteError']],
    ['CommentList', ['confirmDelete', 'confirmDeleteYes', 'deleting', 'deleteError']],
    ['ForumThread', ['loginToComment', 'loginToCommentHint', 'postGone']],
    ['ForumNew', ['privateFinding']]
  ];

  it.each(nokler)('%s', (navnerom, keys) => {
    for (const key of keys) {
      const norsk = (nb as unknown as Record<string, Record<string, string>>)[navnerom][key];
      const svensk = (sv as unknown as Record<string, Record<string, string>>)[navnerom][key];
      expect(norsk, `nb ${navnerom}.${key}`).toBeTruthy();
      expect(svensk, `sv ${navnerom}.${key}`).toBeTruthy();
    }
  });

  it('svensk er svensk, ikke en kopi av norsk', () => {
    expect(sv.ContentFilter.notLoggedIn).not.toBe(nb.ContentFilter.notLoggedIn);
    expect(sv.PostDetail.confirmDelete).not.toBe(nb.PostDetail.confirmDelete);
    expect(sv.ForumThread.loginToComment).not.toBe(nb.ForumThread.loginToComment);
    expect(sv.ForumThread.postGone).not.toBe(nb.ForumThread.postGone);
  });
});
