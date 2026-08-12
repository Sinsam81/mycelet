#!/usr/bin/env node
/**
 * Builds the static «Sanketips» article pages under public/landing/sanketips/.
 *
 * Source of truth is markdown in content/sanketips/*.md; the design comes from
 * the landing page itself — this script lifts its @font-face block, header and
 * footer out of public/landing/index.html so an article can never drift from
 * the designed page's typography or chrome. Zero JS on the output, same as the
 * landing.
 *
 * Run: node scripts/build-articles.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const landing = readFileSync(join(root, 'public/landing/index.html'), 'utf8');
const contentDir = join(root, 'content/sanketips');
const outDir = join(root, 'public/landing/sanketips');

/** Pull the font-face + base style blocks out of the landing page. */
function landingStyles() {
  const blocks = [...landing.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  return blocks.join('\n');
}

function landingFragment(tag) {
  const m = landing.match(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`));
  if (!m) throw new Error(`Fant ikke <${tag}> i landingssiden`);
  // Article pages live one level deeper: /sanketips/<slug>. Absolute app links
  // already work; in-page anchors must point back at the landing page.
  return m[0]
    .replace(/href="#([a-z]+)"/g, 'href="/#$1"')
    .replace(/href="#"/g, 'href="/"');
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline markdown: **bold**, *italic*, [text](url), `code`. */
function inline(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2d5238;text-decoration:underline">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/** Minimal markdown → HTML for the subset the articles use. */
function renderMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p style="margin:0 0 20px">${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushPara();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      if (level === 1) continue; // page title is rendered from front matter
      const size = level === 2 ? 30 : 22;
      const top = level === 2 ? 44 : 32;
      out.push(
        `<h${level} style="font-family:Newsreader,Georgia,serif;font-size:${size}px;font-weight:600;color:#1a3a24;line-height:1.25;margin:${top}px 0 14px">${inline(heading[2])}</h${level}>`
      );
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const want = bullet ? 'ul' : 'ol';
      if (list !== want) {
        flushList();
        out.push(`<${want} style="margin:0 0 20px;padding-left:24px;display:grid;gap:8px">`);
        list = want;
      }
      out.push(`<li>${inline((bullet || numbered)[1])}</li>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushPara();
      flushList();
      out.push(
        `<blockquote style="margin:0 0 20px;padding:16px 20px;background:#fdf6e3;border-left:3px solid #fbbf24;border-radius:0 12px 12px 0">${inline(line.replace(/^>\s?/, ''))}</blockquote>`
      );
      continue;
    }

    if (/^---+$/.test(line)) {
      flushPara();
      flushList();
      out.push('<hr style="border:0;border-top:1px solid #e3ddcd;margin:36px 0">');
      continue;
    }

    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join('\n');
}

function parseArticle(file) {
  const raw = readFileSync(join(contentDir, file), 'utf8');
  const meta = {};
  let body = raw;
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    body = raw.slice(fm[0].length);
  }
  const titleLine = body.match(/^#\s+(.*)$/m);
  meta.title ??= titleLine ? titleLine[1] : file.replace(/\.md$/, '');
  meta.slug ??= file.replace(/\.md$/, '');
  return { meta, body };
}

function page({ meta, body }, others) {
  const related = others
    .filter((o) => o.meta.slug !== meta.slug)
    .map(
      (o) => `<a href="/sanketips/${o.meta.slug}" style="display:block;background:#ffffff;border-radius:20px;padding:24px 26px;text-decoration:none;color:inherit">
  <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a5f06;margin:0 0 10px">${escapeHtml(o.meta.kicker ?? 'Sanketips')}</p>
  <h3 style="font-family:Newsreader,Georgia,serif;font-size:21px;font-weight:600;color:#1a3a24;margin:0 0 8px;line-height:1.3">${escapeHtml(o.meta.title)}</h3>
  <p style="font-size:15px;color:#5b6659;margin:0;line-height:1.5">${escapeHtml(o.meta.summary ?? '')}</p>
</a>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)} — Mycelet</title>
<meta name="description" content="${escapeHtml(meta.summary ?? '')}">
<link rel="canonical" href="https://www.mycelet.com/sanketips/${meta.slug}">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<meta property="og:type" content="article">
<meta property="og:locale" content="nb_NO">
<meta property="og:site_name" content="Mycelet">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.summary ?? '')}">
<meta property="og:url" content="https://www.mycelet.com/sanketips/${meta.slug}">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: meta.title,
  description: meta.summary ?? '',
  inLanguage: 'nb',
  ...(meta.published ? { datePublished: meta.published } : {}),
  ...(meta.updated ? { dateModified: meta.updated } : {}),
  mainEntityOfPage: `https://www.mycelet.com/sanketips/${meta.slug}`,
  author: { '@type': 'Organization', name: 'Mycelet', url: 'https://www.mycelet.com' },
  publisher: { '@type': 'Organization', name: 'Mycelet', url: 'https://www.mycelet.com' }
})}</script>
<style>${landingStyles()}</style>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#faf7ef; color:#3d4c41; font-family:Figtree,-apple-system,BlinkMacSystemFont,sans-serif; font-size:18px; line-height:1.7; -webkit-font-smoothing:antialiased; }
  a { color:inherit; }
  .wrap { max-width:720px; margin:0 auto; padding:0 clamp(20px,5vw,56px); }
  @media (max-width:760px) { .mycelet-split { grid-template-columns:1fr !important; } }
</style>
</head>
<body>
${landingFragment('header')}
<main>
  <article class="wrap" style="padding-top:clamp(24px,4vw,48px);padding-bottom:clamp(48px,6vw,80px)">
    <a href="/#laer" style="display:inline-block;font-size:14px;color:#5b6659;text-decoration:none;margin-bottom:22px">← Alle sanketips</a>
    <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a5f06;margin:0 0 12px">${escapeHtml(meta.kicker ?? 'Sanketips')}</p>
    <h1 style="font-family:Newsreader,Georgia,serif;font-size:clamp(34px,5vw,48px);font-weight:600;color:#1a3a24;line-height:1.12;letter-spacing:-.01em;margin:0 0 18px">${escapeHtml(meta.title)}</h1>
    ${meta.summary ? `<p style="font-size:21px;line-height:1.55;color:#5b6659;margin:0 0 8px">${escapeHtml(meta.summary)}</p>` : ''}
    <hr style="border:0;border-top:1px solid #e3ddcd;margin:32px 0">
    ${renderMarkdown(body)}
    <aside style="margin-top:44px;padding:22px 26px;background:#fdf6e3;border-radius:18px;border:1px solid #f0e2bd">
      <p style="margin:0;font-size:16px;line-height:1.6"><strong>Er du i tvil, la soppen stå.</strong> Ingen artikkel — og ingen app — erstatter det å kjenne arten selv. Ta med funnet til soppkontroll hos <a href="https://soppognyttevekster.no" style="color:#2d5238">Norges sopp- og nyttevekstforbund</a> hvis du er usikker.</p>
    </aside>
  </article>

  <section class="wrap" style="max-width:1180px;padding-bottom:clamp(48px,6vw,80px)">
    <h2 style="font-family:Newsreader,Georgia,serif;font-size:28px;font-weight:600;color:#1a3a24;margin:0 0 20px">Les mer</h2>
    <div class="mycelet-split" style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
${related}
    </div>
  </section>
</main>
${landingFragment('footer')}
</body>
</html>
`;
}

mkdirSync(outDir, { recursive: true });
const files = readdirSync(contentDir).filter((f) => f.endsWith('.md'));
const articles = files.map(parseArticle);
for (const article of articles) {
  const html = page(article, articles);
  writeFileSync(join(outDir, `${article.meta.slug}.html`), html);
  console.log(`✓ ${article.meta.slug}.html  (${Math.round(html.length / 1024)} KB)`);
}
console.log(`\n${articles.length} artikler bygget til public/landing/sanketips/`);
