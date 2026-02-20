import { createClient } from '@supabase/supabase-js';

type TilePayload = {
  tile_date: string;
  source: 'mvp_baseline';
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  score: number;
  confidence: number;
  components: {
    vegetation: number;
    moisture: number;
    terrain: number;
    history: number;
  };
  metadata: {
    grid_size_deg: number;
    region: string;
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY må være satt');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pseudoNoise(lat: number, lng: number, seed = 0) {
  const raw = Math.sin(lat * 12.9898 + lng * 78.233 + seed) * 43758.5453;
  return raw - Math.floor(raw);
}

function baselineScore(lat: number, lng: number) {
  const vegetation = Math.round(40 + pseudoNoise(lat, lng, 11) * 30);
  const moisture = Math.round(30 + pseudoNoise(lat, lng, 23) * 40);
  const terrain = Math.round(20 + pseudoNoise(lat, lng, 37) * 35);
  const history = Math.round(10 + pseudoNoise(lat, lng, 53) * 45);

  const score = clamp(Math.round(vegetation * 0.35 + moisture * 0.3 + terrain * 0.15 + history * 0.2), 0, 100);
  const confidence = clamp(Math.round(45 + pseudoNoise(lat, lng, 67) * 35), 0, 100);

  return {
    score,
    confidence,
    components: { vegetation, moisture, terrain, history }
  };
}

async function generateForRegion(
  regionName: string,
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  stepDeg = 0.08
) {
  const tileDate = new Date().toISOString().slice(0, 10);
  const rows: TilePayload[] = [];

  for (let lat = minLat; lat <= maxLat; lat += stepDeg) {
    for (let lng = minLng; lng <= maxLng; lng += stepDeg) {
      const { score, confidence, components } = baselineScore(lat, lng);
      rows.push({
        tile_date: tileDate,
        source: 'mvp_baseline',
        center_lat: Number(lat.toFixed(5)),
        center_lng: Number(lng.toFixed(5)),
        radius_meters: 500,
        score,
        confidence,
        components,
        metadata: {
          grid_size_deg: stepDeg,
          region: regionName
        }
      });
    }
  }

  if (rows.length === 0) {
    return;
  }

  const { error: deleteError } = await supabase
    .from('prediction_tiles')
    .delete()
    .eq('tile_date', tileDate)
    .eq('source', 'mvp_baseline')
    .contains('metadata', { region: regionName });

  if (deleteError) {
    throw deleteError;
  }

  const { error } = await supabase.from('prediction_tiles').insert(rows);

  if (error) {
    throw error;
  }

  console.log(`Generated ${rows.length} prediction tiles for ${regionName}`);
}

async function run() {
  await generateForRegion('Oslo', 59.72, 60.05, 10.35, 11.15, 0.06);
  await generateForRegion('Trondheim', 63.28, 63.52, 10.2, 10.65, 0.07);
  await generateForRegion('Bergen', 60.2, 60.52, 5.05, 5.6, 0.07);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
