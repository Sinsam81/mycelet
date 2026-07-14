/**
 * Parse the two observation layouts used by SMHI's corrected archive.
 *
 * Hourly/instantaneous parameters use:
 *   YYYY-MM-DD;HH:mm:ss;value;quality
 *
 * Daily aggregate/extreme parameters use:
 *   from datetime;to datetime;representative date;value;quality
 */
export function parseSmhiCsv(csv) {
  const rows = [];

  for (const line of csv.split(/\r?\n/)) {
    const cols = line.split(';');
    let date;
    let time;
    let rawValue;

    if (/^\d{4}-\d{2}-\d{2}$/.test(cols[0] ?? '')) {
      date = cols[0];
      time = Date.parse(`${date}T${cols[1] || '00:00:00'}Z`);
      rawValue = cols[2];
    } else if (
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(cols[0] ?? '') &&
      /^\d{4}-\d{2}-\d{2}$/.test(cols[2] ?? '')
    ) {
      date = cols[2];
      // Noon keeps a daily representative value inside its calendar-day
      // window without pretending that the interval start is the sample time.
      time = Date.parse(`${date}T12:00:00Z`);
      rawValue = cols[3];
    } else {
      continue;
    }

    const value = Number(String(rawValue).replace(',', '.'));
    if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
    rows.push({ time, date, value });
  }

  return rows;
}

export function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
