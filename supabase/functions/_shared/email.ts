/**
 * Resend e-mail helper for retention-policy notifications.
 *
 * Resend was chosen over Postmark/SendGrid for three reasons:
 *   - 3000 emails/month free tier (well above SoppJakt's beta needs)
 *   - REST-only API works seamlessly from Deno without npm: imports
 *   - Setup is just an API key + a verified domain, no SDK quirks
 *
 * Setup checklist (Sindre):
 *   1. Sign up at https://resend.com (free)
 *   2. Verify domain soppjakt.no with the DNS records Resend provides
 *      (SPF + DKIM + return-path). DNS lives at the registrar.
 *   3. Generate an API key in the Resend dashboard.
 *   4. supabase secrets set RESEND_API_KEY=re_...
 *   5. supabase secrets set RESEND_FROM_EMAIL=noreply@soppjakt.no
 *      (must match your verified domain)
 *
 * If RESEND_API_KEY is unset, sendEmail returns { ok: false } and the
 * caller logs a warning — the cron job still completes successfully,
 * the warning row is still written, the user just doesn't get an email
 * yet. This is intentional: we want the Edge Function deployable
 * before the email setup is finished.
 */

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /**
   * Plain-text fallback. Resend will auto-generate one from html if
   * omitted, but explicit is better for accessibility/screen readers.
   */
  text?: string;
}

interface SendEmailResult {
  ok: boolean;
  /** Resend's email_id when successful, error message otherwise. */
  detail: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');

  if (!apiKey || !fromEmail) {
    return { ok: false, detail: 'RESEND_API_KEY or RESEND_FROM_EMAIL not configured' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `SoppJakt <${fromEmail}>`,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, detail: `Resend ${response.status}: ${text.slice(0, 200)}` };
    }

    const data = await response.json();
    return { ok: true, detail: data?.id ?? 'sent' };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'unknown error' };
  }
}

/**
 * Build the inactive-account warning email. Kept here so the cron
 * function stays focused on logic rather than HTML template plumbing.
 *
 * Pure function — no I/O. Easy to unit-test if we set up Deno tests
 * later.
 */
export function buildInactiveWarningEmail(args: {
  userEmail: string;
  appUrl: string;
  scheduledDeletionAt: Date;
}) {
  const formattedDate = args.scheduledDeletionAt.toLocaleDateString('nb-NO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const daysRemaining = Math.max(
    0,
    Math.ceil((args.scheduledDeletionAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  const keepLink = `${args.appUrl}/auth/login?redirect=/profile`;

  const html = `<!doctype html>
<html lang="nb">
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2937; max-width: 560px; margin: 24px auto; padding: 0 16px;">
    <h1 style="font-size: 18px; font-weight: 600; color: #1A3409;">Vi savner deg på SoppJakt 🍄</h1>
    <p>Du har ikke logget inn på SoppJakt på over 3 år. For å holde brukerdata under kontroll og oppfylle norsk personvern-lovgivning, sletter vi automatisk inaktive kontoer.</p>
    <p style="background: #fef3c7; padding: 12px; border-radius: 8px; border: 1px solid #fbbf24;">
      <strong>Kontoen din er planlagt slettet ${formattedDate}</strong> (${daysRemaining} dager igjen).
    </p>
    <p>Hvis du vil beholde kontoen din og soppfunnene dine, logg inn én gang innen denne datoen — så avbryter vi slettingen automatisk.</p>
    <p style="margin-top: 24px;">
      <a href="${keepLink}" style="background: #1A3409; color: white; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
        Logg inn og behold kontoen
      </a>
    </p>
    <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;">
    <p style="font-size: 12px; color: #6b7280;">
      Hvis du ikke ønsker å beholde kontoen, kan du bare ignorere denne e-posten — vi sletter den automatisk på den planlagte datoen. Du kan også slette den selv umiddelbart fra profil-siden.
    </p>
    <p style="font-size: 12px; color: #6b7280;">SoppJakt — sopp-prediksjon for Norge og Sverige</p>
  </body>
</html>`;

  const text = `Vi savner deg på SoppJakt!

Du har ikke logget inn på over 3 år. Kontoen din er planlagt slettet ${formattedDate} (${daysRemaining} dager igjen).

For å beholde kontoen og soppfunnene dine — logg inn én gang innen denne datoen:
${keepLink}

Hvis du ikke ønsker å beholde kontoen, kan du ignorere denne e-posten.`;

  return {
    subject: `Kontoen din slettes ${formattedDate} med mindre du logger inn`,
    html,
    text
  };
}
