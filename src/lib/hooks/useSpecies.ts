'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
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

function isInSeason(month: number, start: number, end: number) {
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

export function useSpecies(filters: SpeciesFilters) {
  return useQuery({
    queryKey: ['species', filters],
    queryFn: async () => {
      const supabase = createClient();
      let data: Species[] | null = null;

      if (filters.query.trim().length >= 2) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('search_species', {
          search_query: filters.query.trim()
        });
        if (rpcError) throw rpcError;
        data = rpcData;
      } else {
        const { data: rawData, error } = await supabase
          .from('mushroom_species')
          .select('id,norwegian_name,latin_name,description,habitat,season_start,season_end,edibility')
          .order('norwegian_name', { ascending: true })
          .limit(200);

        if (error) throw error;
        data = rawData;
      }

      const month = currentMonth();
      return (data ?? []).filter((item) => {
        if (filters.edibility !== 'all' && item.edibility !== filters.edibility) return false;
        if (filters.inSeasonNow && !isInSeason(month, item.season_start, item.season_end)) return false;
        if (filters.habitat.trim() && !(item.habitat ?? []).some((h) => h.toLowerCase().includes(filters.habitat.toLowerCase()))) {
          return false;
        }
        return true;
      });
    }
  });
}
