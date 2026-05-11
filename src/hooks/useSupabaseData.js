import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseReady } from '../lib/supabase';

// Convenience helper — returns [] when Supabase isn't wired so the UI keeps
// working in dev mode.
async function safeSelect(table, query) {
  if (!supabaseReady()) return [];
  const q = query ? query(supabase.from(table)) : supabase.from(table).select('*');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export function useRegions() {
  return useQuery({
    queryKey: ['sb', 'regions'],
    queryFn: () => safeSelect('regions'),
  });
}

export function useEmployeesMirror() {
  return useQuery({
    queryKey: ['sb', 'employees'],
    queryFn: () => safeSelect('employees'),
  });
}

export function useRegionTargets(month) {
  return useQuery({
    queryKey: ['sb', 'region_targets', month],
    queryFn: () => safeSelect('region_targets', q => q.select('*').eq('period_month', month)),
  });
}

export function useIndividualTargets(month) {
  return useQuery({
    queryKey: ['sb', 'individual_targets', month],
    queryFn: () => safeSelect('individual_targets', q => q.select('*').eq('period_month', month)),
  });
}

export function useAttendance(month) {
  return useQuery({
    queryKey: ['sb', 'attendance', month],
    queryFn: () => safeSelect('attendance', q =>
      q.select('*').gte('date', `${month}-01`).lt('date', nextMonth(month))),
  });
}

export function useIncentiveConfig() {
  return useQuery({
    queryKey: ['sb', 'incentive_config'],
    queryFn: () => safeSelect('incentive_config', q =>
      q.select('*').order('effective_from', { ascending: false })),
  });
}

export function useUserPrefs(userId) {
  return useQuery({
    queryKey: ['sb', 'prefs', userId],
    enabled: !!userId && supabaseReady(),
    queryFn: async () => {
      const { data } = await supabase.from('user_preferences').select('*').eq('user_id', userId).single();
      return data;
    },
  });
}

export function useUpsert(table, key) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows) => {
      if (!supabaseReady()) return rows;
      const { data, error } = await supabase.from(table).upsert(rows, { onConflict: key }).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sb', table] }),
  });
}

function nextMonth(monthStr) {
  // monthStr "2026-05" -> "2026-06-01"
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
