import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENWEATHER_API_KEY mangler' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return NextResponse.json({ error: 'Koordinater mangler' }, { status: 400 });
  }

  try {
    const [currentRes, forecastRes] = await Promise.all([
      fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=no&appid=${apiKey}`,
        { next: { revalidate: 900 } }
      ),
      fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=no&appid=${apiKey}`,
        { next: { revalidate: 900 } }
      )
    ]);

    if (!currentRes.ok || !forecastRes.ok) {
      return NextResponse.json({ error: 'Kunne ikke hente værdata' }, { status: 502 });
    }

    const current = await currentRes.json();
    const forecast = await forecastRes.json();

    const temp = current?.main?.temp ?? 0;
    const humidity = current?.main?.humidity ?? 0;

    let score = 0;
    if (temp >= 8 && temp <= 18) score += 40;
    else if (temp >= 5 && temp <= 22) score += 20;

    if (humidity > 80) score += 30;
    else if (humidity > 60) score += 15;

    const recentRain = (forecast?.list ?? [])
      .slice(0, 24)
      .reduce((sum: number, item: { rain?: { '3h'?: number } }) => sum + (item.rain?.['3h'] ?? 0), 0);

    if (recentRain > 10) score += 30;
    else if (recentRain > 3) score += 15;

    const condition = score >= 70 ? 'excellent' : score >= 40 ? 'good' : score >= 20 ? 'moderate' : 'poor';

    return NextResponse.json({
      temperature: Math.round(temp),
      humidity,
      description: current?.weather?.[0]?.description ?? 'Ukjent',
      icon: current?.weather?.[0]?.icon ?? null,
      recentRainMm: Math.round(recentRain * 10) / 10,
      mushroomScore: score,
      mushroomCondition: condition,
      conditionText: {
        excellent: 'Perfekte soppforhold! 🍄',
        good: 'Gode forhold for sopp',
        moderate: 'Moderate soppforhold',
        poor: 'Dårlige soppforhold akkurat nå'
      }[condition]
    });
  } catch {
    return NextResponse.json({ error: 'Kunne ikke hente værdata' }, { status: 502 });
  }
}
