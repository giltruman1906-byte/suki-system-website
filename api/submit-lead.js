// Vercel API Route — creates a ClickUp lead when a diagnostic is completed.
// Token + List ID are read server-side; never exposed to the browser.
//
// POST /api/submit-lead
// Body: { meta, answers, computed }

// ── Custom field IDs (fetched from list 901615293901) ──────────
const FIELDS = {
  name:         '4d1dfba9-0fe2-4a40-b526-4a9b30ce05c5',
  company_name: '5b419fb3-c6c8-4abd-a326-064cbb770600',
  email:        '73dfabcd-1b28-4980-97df-8c4dead79995',
  source:       '98ccbe4e-4e0c-4e8e-b3c6-06664a879b21',
  linkedin:     'a5adf978-afbe-4cad-a293-aad44b0a2d83',
  website:      'dd9bebae-dc3b-4377-8f0e-dd2605c8a711',
  phone:        'df2bfd4c-1f46-4b8b-b1e9-5f71e5a51a02',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const token  = process.env.CLICKUP_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;

  if (!token || !listId) {
    console.error('Missing CLICKUP_TOKEN or CLICKUP_LIST_ID');
    return res.status(500).json({ ok: false, error: 'server_config' });
  }

  const { meta = {}, answers = {}, computed = {} } = req.body || {};

  const name    = (meta.name    || '').trim();
  const email   = (meta.email   || '').trim();
  const company = (meta.company || '').trim();
  const url     = (meta.url     || '').trim();

  // ClickUp phone field requires E.164: strip everything except leading + and digits.
  // Only pass the custom field if the result starts with + (has a country code).
  const rawPhone = (meta.phone || '').trim();
  const e164Phone = ('+' + rawPhone.replace(/[^\d]/g, '')).replace(/^\+0/, '+'); // drop leading zero after +
  const phoneForField = e164Phone.length > 4 && rawPhone.includes('+') ? e164Phone : null;

  const totalLeak = computed.total
    ? '$' + Math.round(computed.total).toLocaleString()
    : 'N/A';

  const timeline = answers.timeline || 'N/A';

  // Priority: 1=urgent, 2=high, 3=normal
  const priority = timeline === 'this_month' ? 1
    : timeline === '90d' ? 2
    : 3;

  // Headline: prefer domain > company name > full name
  let headline = company;
  if (!headline && url) {
    try { headline = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
  }
  if (!headline) headline = name || 'Unknown';
  const taskName = headline + ' · Diagnostic Lead — ' + totalLeak + '/yr';

  const description = [
    '## Contact',
    `Name: ${name || '—'}`,
    `Email: ${email || '—'}`,
    `Phone: ${rawPhone || '—'}`,
    `Company: ${company || '—'}`,
    `Website: ${url || '—'}`,
    '',
    '## Diagnostic',
    `Annual leak estimate: ${totalLeak}`,
    `Industry: ${answers.industry || '—'}`,
    `Top priority: ${answers.priority || '—'}`,
    `Timeline: ${timeline}`,
    '',
    '## Breakdown',
    `Lead capture: $${Math.round(computed.capture || 0).toLocaleString()}/yr`,
    `Lead conversion: $${Math.round(computed.convert || 0).toLocaleString()}/yr`,
    `Manual ops: $${Math.round(computed.manual_ops || 0).toLocaleString()}/yr`,
    `Data visibility: $${Math.round(computed.visibility || 0).toLocaleString()}/yr`,
    `Tool sprawl: $${Math.round(computed.tools || 0).toLocaleString()}/yr`,
    '',
    'Source: suki-systems.com/diagnostic',
  ].join('\n');

  // Build custom_fields array — skip fields with no value
  const customFields = [
    { id: FIELDS.name,         value: name },
    { id: FIELDS.company_name, value: company },
    { id: FIELDS.email,        value: email },
    { id: FIELDS.phone,        value: phoneForField },
    { id: FIELDS.source,       value: 'diagnostic' },
    { id: FIELDS.website,      value: url },
  ].filter(f => f.value);

  const task = {
    name: taskName,
    description,
    status: 'in progress',
    priority,
    start_date: Date.now(),
    start_date_time: true,
    assignees: [306777577], // Yali Reichental
    tags: ['qualifying lead', 'source diagnostic'],
    custom_fields: customFields,
  };

  try {
    const cuRes = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(task),
    });

    const data = await cuRes.json();

    if (!cuRes.ok) {
      console.error('ClickUp error:', JSON.stringify(data));
      return res.status(502).json({ ok: false, error: 'clickup_error' });
    }

    return res.status(200).json({ ok: true, taskId: data.id });
  } catch (err) {
    console.error('submit-lead error:', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
