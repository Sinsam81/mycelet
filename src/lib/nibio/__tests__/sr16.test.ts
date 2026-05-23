import { afterEach, describe, expect, it, vi } from 'vitest';
import { getForestProperties, isWithinNorway, parseSr16Html } from '../sr16';

/**
 * Faithful fixtures captured from the live NIBIO SR16 WMS GetFeatureInfo
 * response (2026-05-23). Each queried layer comes back as its own
 * concatenated HTML doc, and the value sits inside a JS `if (X == 9999)`
 * guard. The VOLMB doc header is mislabelled "SSRVOLMB" in NIBIO's own
 * template — kept here so the positional parser stays honest.
 */
function layerDoc(header: string, value: number): string {
  return `<!doctype html>
<html lang="no"><head><title>Resultat</title></head>
<body class="query">
<table cellspacing="2" cellpadding="2" nowrap>
<tr><th colspan="2">Skogressurskart (${header} raster)</th></tr>
<script type = "text/javascript">
\tif (${value} == 9999) {
\t\tdocument.write("<tr><td>${header}:</td><td>ikke relevant</td></tr>");}
\telse {
\t\tdocument.write("<tr><td>${header}:</td><td>${value}</td></tr>");}\t
</script>
</table></body></html>`;
}

// Nordmarka pine-forest point (60.010, 10.690): furu, bonitet 8, 65 m³/ha.
const NORDMARKA_HTML =
  layerDoc('SRRTRESLAG', 2) + layerDoc('SRRBONITET', 8) + layerDoc('SSRVOLMB', 65);

// Sognsvann lake point (59.967, 10.728): all layers nodata (-9999).
const WATER_HTML =
  layerDoc('SRRTRESLAG', -9999) + layerDoc('SRRBONITET', -9999) + layerDoc('SSRVOLMB', -9999);

// Forest cell where the secondary layers have no value but treslag does.
const PARTIAL_HTML =
  layerDoc('SRRTRESLAG', 1) + layerDoc('SRRBONITET', -9999) + layerDoc('SSRVOLMB', -9999);

function mockFetch(html: string, ok = true) {
  return vi.fn().mockResolvedValue({ ok, text: async () => html } as Response);
}

describe('isWithinNorway', () => {
  it('returns true for Oslo', () => {
    expect(isWithinNorway({ lat: 59.9, lon: 10.75 })).toBe(true);
  });

  it('returns true for Tromsø', () => {
    expect(isWithinNorway({ lat: 69.65, lon: 18.95 })).toBe(true);
  });

  it('returns false for Stockholm', () => {
    expect(isWithinNorway({ lat: 59.33, lon: 18.07 })).toBe(false);
  });

  it('returns false for Copenhagen', () => {
    expect(isWithinNorway({ lat: 55.68, lon: 12.57 })).toBe(false);
  });

  it('returns false for far-north Svalbard', () => {
    expect(isWithinNorway({ lat: 78.2, lon: 15.6 })).toBe(false);
  });
});

describe('parseSr16Html', () => {
  it('parses all three layer values positionally', () => {
    expect(parseSr16Html(NORDMARKA_HTML)).toEqual({
      SRRTRESLAG: 2,
      SRRBONITET: 8,
      SRRVOLMB: 65
    });
  });

  it('treats -9999 (and negatives) as nodata → null', () => {
    expect(parseSr16Html(WATER_HTML)).toEqual({
      SRRTRESLAG: null,
      SRRBONITET: null,
      SRRVOLMB: null
    });
  });

  it('keeps a valid treslag while nulling missing secondary layers', () => {
    expect(parseSr16Html(PARTIAL_HTML)).toEqual({
      SRRTRESLAG: 1,
      SRRBONITET: null,
      SRRVOLMB: null
    });
  });

  it('returns all-null for unparseable html', () => {
    expect(parseSr16Html('<html>no data here</html>')).toEqual({
      SRRTRESLAG: null,
      SRRBONITET: null,
      SRRVOLMB: null
    });
  });
});

describe('getForestProperties', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a live SR16 response to ForestProperties', async () => {
    const fetchMock = mockFetch(NORDMARKA_HTML);
    vi.stubGlobal('fetch', fetchMock);

    const result = await getForestProperties({ lat: 60.01, lon: 10.69 });

    expect(result).toEqual({
      forestType: 'furu',
      ageYears: null,
      productivity: 8,
      volumePerHa: 65,
      source: 'sr16'
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns null on a nodata (water/urban) cell', async () => {
    vi.stubGlobal('fetch', mockFetch(WATER_HTML));
    const result = await getForestProperties({ lat: 59.967, lon: 10.728 });
    expect(result).toBeNull();
  });

  it('returns forest props with null secondary fields when only treslag is present', async () => {
    vi.stubGlobal('fetch', mockFetch(PARTIAL_HTML));
    const result = await getForestProperties({ lat: 60.01, lon: 10.69 });
    expect(result).toMatchObject({
      forestType: 'gran',
      productivity: null,
      volumePerHa: null,
      source: 'sr16'
    });
  });

  it('does not hit the network for non-Norwegian coordinates', async () => {
    const fetchMock = mockFetch(NORDMARKA_HTML);
    vi.stubGlobal('fetch', fetchMock);

    const result = await getForestProperties({ lat: 59.33, lon: 18.07 });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the WMS responds non-ok', async () => {
    vi.stubGlobal('fetch', mockFetch('error', false));
    const result = await getForestProperties({ lat: 60.01, lon: 10.69 });
    expect(result).toBeNull();
  });

  it('returns null when the fetch throws (network/timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await getForestProperties({ lat: 60.01, lon: 10.69 });
    expect(result).toBeNull();
  });
});
