import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseReady } from '../lib/supabase';
import {
  DEFAULT_PRESALES_CONFIG,
  DEFAULT_SALES_CONFIG,
  DEFAULT_AR_CONFIG,
} from '../lib/incentive';

const DEFAULTS = {
  presales: DEFAULT_PRESALES_CONFIG,
  sales: DEFAULT_SALES_CONFIG,
  ar: DEFAULT_AR_CONFIG,
};

// Returns { presales, sales, ar } configs. Merges any active row from
// `incentive_config` (most recent effective_from per team) with defaults.
export function useIncentiveConfigs() {
  const q = useQuery({
    queryKey: ['sb', 'incentive_config'],
    queryFn: async () => {
      if (!supabaseReady()) return [];
      const { data, error } = await supabase
        .from('incentive_config')
        .select('*')
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const merged = useMemo(() => {
    const out = { ...DEFAULTS };
    if (!q.data) return out;
    // Take the most-recent row per team.
    const seen = new Set();
    for (const row of q.data) {
      if (seen.has(row.team)) continue;
      seen.add(row.team);
      out[row.team] = { ...DEFAULTS[row.team], ...(row.config || {}) };
    }
    return out;
  }, [q.data]);

  return { ...q, configs: merged, raw: q.data };
}

export function useSaveIncentiveConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ team, config, effective_from }) => {
      if (!supabaseReady()) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('incentive_config')
        .insert({
          team,
          config,
          effective_from: effective_from || new Date().toISOString().slice(0, 10),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sb', 'incentive_config'] }),
  });
}
