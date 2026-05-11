import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseReady } from '../lib/supabase';

export function useFxRates() {
  return useQuery({
    queryKey: ['fx-rates'],
    queryFn: async () => {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const j = await r.json();
      return j.rates;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}

export function toInr(amount, currency, rates) {
  if (!rates || !amount) return amount || 0;
  if (!currency || currency === 'INR') return amount;
  return (amount / (rates[currency] || 1)) * (rates.INR || 83);
}

export const SYNC_INTERVAL_OPTIONS = [
  { label: 'Manual only', value: 0 },
  { label: 'Every 5 min',  value: 5 },
  { label: 'Every 10 min', value: 10 },
  { label: 'Every 30 min', value: 30 },
  { label: 'Every 1 hour', value: 60 },
  { label: 'Every 2 hours', value: 120 },
  { label: 'Every 6 hours', value: 360 },
];

export function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      if (!supabaseReady()) return {};
      const { data } = await supabase.from('app_settings').select('key, value');
      return Object.fromEntries((data || []).map(r => [r.key, r.value]));
    },
    staleTime: 60 * 1000,
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  });
}

const DATA_KEYS = [
  'after-sales-v2', 'demo-bookings-v2', 'demo-scheduling-v2',
  'old-collection-v2', 'employees-v2', 'last-sync',
];

// Drop this hook in Shell — it silently auto-syncs in the background.
export function useAutoSync() {
  const qc = useQueryClient();
  const { data: settings } = useAppSettings();
  const intervalMinutes = parseInt(settings?.sync_interval_minutes ?? '0', 10);

  const fireRef = useRef(null);
  fireRef.current = async () => {
    if (!supabaseReady()) return;
    try {
      await supabase.functions.invoke('sync-airtable', {
        method: 'POST',
        headers: { 'x-trigger': 'auto' },
      });
      DATA_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      console.warn('[auto-sync] failed:', e?.message);
    }
  };

  useEffect(() => {
    if (!intervalMinutes || intervalMinutes <= 0) return;
    const ms = intervalMinutes * 60 * 1000;
    const timer = setInterval(() => fireRef.current?.(), ms);
    return () => clearInterval(timer);
  }, [intervalMinutes]);

  return { intervalMinutes };
}
