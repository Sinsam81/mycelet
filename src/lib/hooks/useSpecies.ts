'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { baseSeasonMask, isMonthInMask } from '@/lib/utils/season-region';
import { compareSpeciesByDisplayName } from '@/lib/utils/species-name';
import type { Edibility, Species } from '@/types/species';

interface SpeciesFilters {
  query: string;
  edibility: 'all' | Edibility;
  inSeasonNow: boolean;
  habitat: string;
}

function currentMonth() {
  return new Date().getMonth() + 1;
}

export function useSpecies(filters: SpeciesFilters) {
  const locale = useLocale();

  return useQuery({
    queryKey: ['species', locale, filters],
    queryFn: async () => {
      const supabase = createClient();
      const search = filters.query.trim();
      let data: Species[] | null = null;

      if (search.length >= 2 && locale !== 'sv') {
        // Keep the existing full-text ranking and description/English matches
        // for Norwegian search.
        const { data: rpcData, error } = await supabase.rpc('search_species', { search_query: search });
        if (error) throw error;
        data = rpcData as Species[] | null;
      } else {
        let query = supabase
          .from('mushroom_species')
          .select('id,norwegian_name,swedish_name,latin_name,description,habitat,season_start,season_end,edibility,primary_image_url')
          .limit(200);

        if (search.length >= 2) {
          query = query.or(
            `norwegian_name.ilike.%${search}%,swedish_name.ilike.%${search}%,latin_name.ilike.%${search}%,synonyms_text.ilike.%${search}%`
          );
        }

        const { data: rawData, error } = await query;
        if (error) throw error;
        data = rawData as Species[] | null;
      }

      const month = currentMonth();
      return (data ?? []).filter((item) => {
        if (filters.edibility !== 'all' && item.edibility !== filters.edibility) return false;
        // Samme kalibrerte sesongvindu som kalenderen, ellers svarer «i sesong
        // nå» ulikt på to sider i samme app.
        if (filters.inSeasonNow && !isMonthInMask(baseSeasonMask(item), month)) return false;
        if (filters.habitat.trim() && !(item.habitat ?? []).some((h) => h.toLowerCase().includes(filters.habitat.toLowerCase()))) {
          return false;
        }
        return true;
      }).sort((a, b) => compareSpeciesByDisplayName(a, b, locale));
    }
  });
}
