import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';

const PLANTID_API_URL = 'https://mushroom.kindwise.com/api/v1/identification';

type PlantIdSuggestion = {
  name: string;
  probability: number;
  similar_images?: Array<{ url: string }>;
  details?: {
    common_names?: string[];
    taxonomy?: Record<string, string>;
    description?: { value?: string };
    edibility?: string;
  };
};

type IdentifyRequest = {
  image: string;
  latitude?: number;
  longitude?: number;
};

function isAiEnabled() {
  const apiKey = process.env.PLANTID_API_KEY;
  return Boolean(apiKey && apiKey !== 'your-api-key-here' && apiKey.length >= 20);
}

export async function GET() {
  return NextResponse.json({ enabled: isAiEnabled() });
}

export async function POST(request: NextRequest) {
  try {
    if (!isAiEnabled()) {
      return NextResponse.json(
        { error: 'AI-identifikasjon er ikke aktivert ennå.', code: 'ai_disabled' },
        { status: 503 }
      );
    }
    const apiKey = process.env.PLANTID_API_KEY!;

    const supabase = createClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    // Short-term burst protection on top of the daily billing-tier limit
    // below. Stops compromised-account abuse and runaway client loops.
    const rateLimit = checkRateLimit(`identify:${getClientKey(request, user.id)}`, 20, 60);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    const capabilities = getBillingCapabilities(subscription);

    if (!capabilities.paid) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from('findings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('ai_used', true)
        .gte('created_at', oneDayAgo);

      if (countError) {
        return NextResponse.json({ error: 'Kunne ikke validere rate limit' }, { status: 500 });
      }

      if ((count ?? 0) >= FREE_DAILY_AI_LIMIT) {
        return NextResponse.json(
          {
            error: `Gratisbrukere har maks ${FREE_DAILY_AI_LIMIT} identifikasjoner per døgn. Oppgrader til Premium eller Sesongpass for ubegrenset bruk.`
          },
          { status: 429 }
        );
      }
    }

    const body = (await request.json()) as IdentifyRequest;
    if (!body.image) {
      return NextResponse.json({ error: 'Bilde mangler' }, { status: 400 });
    }

    const plantIdResponse = await fetch(PLANTID_API_URL, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        images: [body.image],
        similar_images: true,
        language: 'no',
        details: ['common_names', 'taxonomy', 'description', 'edibility'],
        ...(body.latitude != null && body.longitude != null
          ? {
              latitude: body.latitude,
              longitude: body.longitude
            }
          : {})
      })
    });

    if (!plantIdResponse.ok) {
      return NextResponse.json({ error: 'Identifikasjon feilet. Prøv igjen.' }, { status: 502 });
    }

    const plantIdData = await plantIdResponse.json();
    const suggestionsRaw: PlantIdSuggestion[] = plantIdData?.result?.classification?.suggestions ?? [];

    const suggestions = await Promise.all(
      suggestionsRaw.slice(0, 3).map(async (suggestion) => {
        const mapped = {
          name: suggestion.name,
          commonNames: suggestion.details?.common_names ?? [],
          probability: Math.round((suggestion.probability ?? 0) * 100),
          edibility: mapEdibility(suggestion.details?.edibility),
          description: suggestion.details?.description?.value ?? null,
          taxonomy: suggestion.details?.taxonomy ?? null,
          similarImages: (suggestion.similar_images ?? []).slice(0, 3).map((img) => img.url)
        } as {
          name: string;
          commonNames: string[];
          probability: number;
          edibility: string;
          description: string | null;
          taxonomy: Record<string, string> | null;
          similarImages: string[];
          speciesId?: number;
          norwegianName?: string;
        };

        const { data: species } = await supabase
          .from('mushroom_species')
          .select('id,norwegian_name,edibility')
          .ilike('latin_name', suggestion.name)
          .maybeSingle();

        if (species) {
          mapped.speciesId = species.id;
          mapped.norwegianName = species.norwegian_name;
          mapped.edibility = species.edibility;
        }

        return mapped;
      })
    );

    return NextResponse.json({
      suggestions,
      isPlant: plantIdData?.result?.is_plant?.binary ?? false
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'En feil oppstod. Prøv igjen.',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}

function mapEdibility(plantIdEdibility?: string): string {
  const mapping: Record<string, string> = {
    edible: 'edible',
    edible_with_caution: 'conditionally_edible',
    not_edible: 'inedible',
    poisonous: 'toxic',
    highly_poisonous: 'deadly'
  };

  return mapping[plantIdEdibility ?? ''] ?? 'unknown';
}
