import Airtable from 'airtable';

const apiKey = import.meta.env.VITE_AIRTABLE_API_KEY;
const baseId = import.meta.env.VITE_AIRTABLE_BASE_ID;

if (!apiKey || !baseId) {
  console.warn('[airtable] Missing VITE_AIRTABLE_API_KEY or VITE_AIRTABLE_BASE_ID');
}

Airtable.configure({ apiKey, endpointUrl: 'https://api.airtable.com' });
export const base = Airtable.base(baseId);

export async function fetchAll(tableName, opts = {}) {
  const out = [];
  await base(tableName)
    .select({ pageSize: 100, ...opts })
    .eachPage((records, fetchNextPage) => {
      records.forEach(r => out.push({ id: r.id, fields: r.fields }));
      fetchNextPage();
    });
  return out;
}

export async function fetchPage(tableName, opts = {}) {
  return new Promise((resolve, reject) => {
    base(tableName)
      .select({ pageSize: 100, maxRecords: 100, ...opts })
      .firstPage((err, records) => {
        if (err) return reject(err);
        resolve(records.map(r => ({ id: r.id, fields: r.fields })));
      });
  });
}

export const f = (record, name, fallback = null) =>
  record?.fields?.[name] ?? fallback;
