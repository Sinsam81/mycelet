'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/hooks/useAuth';
import { NonNativeOnly } from '@/components/native/NonNativeOnly';
import { trackEvent } from '@/lib/analytics';
import { PassordFelt } from '@/components/auth/PassordFelt';
import { readSafeNext } from '@/lib/auth/safe-redirect';
import { authFeilNokkel, varsleUkjentAuthFeil, type AuthFeilNokkel } from '@/lib/auth/auth-feil';
import { glemRegistrertEpost, lesRegistrertEpost } from '@/lib/auth/registrert-epost';
import { isNativePlatform } from '@/lib/native/platform';

/** Minste tid mellom to «send bekreftelsen på nytt» fra samme skjerm. */
const SEND_PA_NYTT_VENT_SEKUNDER = 60;

// Next 15+ requires useSearchParams() to be inside a Suspense boundary.
// Inner form rendered by LoginForm; default export wraps it in Suspense.

function LoginForm() {
  const t = useTranslations('AuthLogin');
  const tFeil = useTranslations('AuthErrors');
  const searchParams = useSearchParams();
  // Validert mot åpen redirect — se src/lib/auth/safe-redirect.ts. Verdien
  // brukes både til navigasjonen etter innlogging og til OAuth-callbackens next-param.
  const redirectPath = useMemo(() => readSafeNext(searchParams), [searchParams]);

  // Hvorfor havnet du her? Settes av registreringssiden — og av
  // /auth/confirm, som lander purremail-lenkene her med tydelig utfall.
  const notice = useMemo(() => {
    if (searchParams.get('recover') === '1') return 'noticeRecover';
    if (searchParams.get('confirm') === '1') return searchParams.get('app') === '1' ? 'noticeConfirmApp' : 'noticeConfirm';
    if (searchParams.get('verified') === '1') return 'noticeVerified';
    if (searchParams.get('linkExpired') === '1') return 'noticeLinkExpired';
    if (searchParams.get('otherBrowser') === '1') return 'noticeOtherBrowser';
    return null;
  }, [searchParams]);

  const { signIn, signInWithGoogle, user, loading: authLoading, supabase } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feilNokkel, setFeilNokkel] = useState<AuthFeilNokkel | null>(null);

  // Rett fra registreringen: vis HVILKEN adresse e-posten gikk til (tastefeil
  // var den vanligste grunnen til at kontoer aldri ble bekreftet) og fyll ut
  // feltet. Leses i en effekt — sessionStorage finnes ikke under SSR.
  const kommerFraRegistrering = notice === 'noticeConfirm' || notice === 'noticeConfirmApp';
  const [registrertEpost, setRegistrertEpost] = useState<string | null>(null);
  useEffect(() => {
    if (!kommerFraRegistrering) return;
    const husket = lesRegistrertEpost();
    if (!husket) return;
    setRegistrertEpost(husket);
    setEmail((naa) => naa || husket);
  }, [kommerFraRegistrering]);

  // «Send bekreftelsen på nytt». Aldri automatisk — bare når brukeren trykker.
  const [ventSekunder, setVentSekunder] = useState(0);
  const [sendPaNyttMelding, setSendPaNyttMelding] = useState<string | null>(null);
  useEffect(() => {
    if (ventSekunder <= 0) return;
    const id = setTimeout(() => setVentSekunder((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [ventSekunder]);
  const visSendPaNytt = kommerFraRegistrering || feilNokkel === 'emailNotConfirmed';

  const handleSendPaNytt = async () => {
    const adresse = email.trim();
    if (!adresse) {
      setSendPaNyttMelding(t('resendNeedsEmail'));
      return;
    }
    setVentSekunder(SEND_PA_NYTT_VENT_SEKUNDER);
    setSendPaNyttMelding(null);
    try {
      // ⚠️ AVHENGER AV E-POSTMALEN I SUPABASE. resend() sender ingen
      // code_challenge (auth-js), så den nye lenka er IKKE en PKCE-lenke som
      // den første fra signUp. Det går bra fordi malen «Confirm signup» skal
      // peke på {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
      // — den ruten løser inn begge slag i hvilken som helst nettleser (se
      // auth/confirm/route.ts). Settes malen tilbake til {{ .ConfirmationURL }},
      // ender denne lenka med økten i URL-fragmentet på en side som aldri
      // leser det (samme felle som purre-cronen beskriver). Da må utsendingen
      // flyttes til serveren: generateLink + egen e-post til /auth/confirm.
      const { error: sendFeil } = await supabase.auth.resend({
        type: 'signup',
        email: adresse,
        // Samme landingssted som den første e-posten fikk i signUp (useAuth).
        ...(isNativePlatform() ? { options: { emailRedirectTo: `${window.location.origin}/auth/callback` } } : {})
      });
      if (sendFeil) throw sendFeil;
      setSendPaNyttMelding(t('resendDone'));
    } catch (err) {
      const k = authFeilNokkel(err);
      // Samme nøytrale tekst uansett om kontoen finnes — bare grense og
      // nettverk er verdt å si noe eget om.
      setSendPaNyttMelding(k === 'rateLimited' || k === 'network' ? tFeil(k) : t('resendDone'));
    }
  };

  // En allerede innlogget besøkende skal ikke se innloggingsskjemaet — send
  // dem dit de var på vei. Dette er også SELVHELBREDELSEN for appskallet:
  // i WKWebView henger synkroniseringen av øktinformasjonskapslene etter
  // (document.cookie → HTTP-lageret), så navigasjonen rett etter innlogging
  // kan bli avvist av middleware og sendt STILLE tilbake hit — skjermen står
  // urørt, og knappen ser død ut. Det var halve App Review-avvisningen 21.08
  // (2.1a): serverloggen viser at anmelderens innlogging LYKTES, elleve
  // sekunder før skjermbildet av den «døde» knappen. Når den avviste
  // navigasjonen lander her igjen, ser denne effekten økten og prøver på
  // nytt — innen da har kapslene rukket fram.
  const omdirigert = useRef(false);
  useEffect(() => {
    if (authLoading || !user || omdirigert.current) return;
    omdirigert.current = true;
    // Full sidelast, ikke klientnavigasjon: da går forespørselen med de
    // synkroniserte kapslene, og middleware ser samme økt som nettleseren.
    window.location.replace(redirectPath);
  }, [authLoading, user, redirectPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Send tastaturet ned FØR innloggingen fullfører. I WKWebView etterlater
    // et åpent tastatur viewporten forskjøvet i sekundene etterpå, og alt som
    // monteres bunnforankret i det vinduet (onboarding-introen) kan havne
    // utenfor skjermen — det var App Review-avvisningen 21.08.2026 (2.1a).
    (document.activeElement as HTMLElement | null)?.blur?.();
    setError(null);
    setFeilNokkel(null);
    setLoading(true);

    try {
      await signIn(email, password);
      trackEvent('login', { method: 'password' });
      glemRegistrertEpost();
      // Full sidelast i stedet for router.push: klientnavigasjonen kunne bli
      // avvist av middleware i appskallet (kapsel-synkroniseringen over) og
      // lande stille tilbake på skjemaet. En full last konvergerer: skulle
      // også den bli avvist, fanger allerede-innlogget-effekten over det opp
      // og prøver igjen.
      window.location.assign(redirectPath);
    } catch (err) {
      // Aldri den rå Supabase-meldingen: den er engelsk («Invalid login
      // credentials») for både norske og svenske brukere.
      const k = authFeilNokkel(err);
      if (!k) varsleUkjentAuthFeil('login', err);
      setFeilNokkel(k);
      setError(k ? tFeil(k) : t('signInFailed'));
      setLoading(false);
    }
    // Merk: ved suksess får loading stå — siden er på vei bort, og en aktiv
    // knapp i det vinduet inviterer til dobbelttrykk.
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);

    try {
      const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`;
      await signInWithGoogle(callback);
    } catch (err) {
      const k = authFeilNokkel(err);
      if (!k) varsleUkjentAuthFeil('login.google', err);
      setError(k ? tFeil(k) : t('googleSignInFailed'));
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-forest-900">{t('heading')}</h1>
        <p className="mt-2 text-sm text-gray-700">{t('subheading')}</p>

        {/*
          Registreringssiden sender folk hit med et hint om hvorfor. Begge
          parameterne har til nå vært døde — de ble satt, men aldri lest — så
          brukeren ble flyttet til et innloggingsskjema uten et ord om hva som
          skjedde. `recover` er særlig viktig: kontoen ble opprettet, men uten
          profil, og det er nettopp innloggingen som reparerer den (signIn
          kaller ensureProfile).
        */}
        {notice ? (
          <p className="mt-4 rounded-lg border border-forest-200 bg-forest-50 px-3 py-2 text-sm text-forest-900">
            {t(notice)}
          </p>
        ) : null}

        {kommerFraRegistrering && registrertEpost ? (
          <p className="mt-2 text-sm text-gray-700">
            {t.rich('sentTo', {
              email: registrertEpost,
              strong: (chunks) => <span className="break-all font-medium text-gray-900">{chunks}</span>,
              link: (chunks) => (
                <Link
                  href={`/auth/register?next=${encodeURIComponent(redirectPath)}`}
                  className="font-semibold text-forest-800 underline"
                >
                  {chunks}
                </Link>
              )
            })}
          </p>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-800">
            {t('emailLabel')}
            <input
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <PassordFelt
            label={t('passwordLabel')}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          <div className="-mt-1 text-right">
            <Link href="/auth/forgot" className="text-sm font-medium text-forest-800 hover:underline">
              {t('forgotPassword')}
            </Link>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button type="submit" className="w-full" loading={loading}>
            {t('signInButton')}
          </Button>
        </form>

        {visSendPaNytt ? (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-sm text-gray-700">{t('resendHint')}</p>
            <button
              type="button"
              onClick={handleSendPaNytt}
              disabled={ventSekunder > 0}
              className="mt-1 min-h-[44px] text-sm font-semibold text-forest-800 underline disabled:text-gray-500 disabled:no-underline"
            >
              {ventSekunder > 0 ? t('resendWait', { seconds: ventSekunder }) : t('resendButton')}
            </button>
            {sendPaNyttMelding ? (
              <p className="mt-1 text-sm text-gray-700" role="status">
                {sendPaNyttMelding}
              </p>
            ) : null}
          </div>
        ) : null}

        <NonNativeOnly>
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={handleGoogle} disabled={loading}>
            {t('continueWithGoogle')}
          </Button>
        </NonNativeOnly>

        <p className="mt-4 text-sm text-gray-700">
          {t('noAccount')}{' '}
          <Link className="font-semibold text-forest-800" href={`/auth/register?next=${encodeURIComponent(redirectPath)}`}>
            {t('registerLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  const t = useTranslations('AuthLogin');
  return (
    <Suspense fallback={<main className="mx-auto min-h-screen w-full max-w-screen-sm p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))]"><p className="text-sm text-gray-700">{t('loading')}</p></main>}>
      <LoginForm />
    </Suspense>
  );
}
