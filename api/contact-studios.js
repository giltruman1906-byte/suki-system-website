// Vercel API Route — creates a ClickUp lead when someone submits the Suki Studios contact form.
// Uses CLICKUP_STUDIOS_LIST_ID if set, otherwise falls back to CLICKUP_LIST_ID.
//
// POST /api/contact-studios
// Body: { name, company, email, phone, website, message }

const FIELDS = {
  name:         '4d1dfba9-0fe2-4a40-b526-4a9b30ce05c5',
  company_name: '5b419fb3-c6c8-4abd-a326-064cbb770600',
  email:        '73dfabcd-1b28-4980-97df-8c4dead79995',
  source:       '98ccbe4e-4e0c-4e8e-b3c6-06664a879b21',
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
    console.error('Missing CLICKUP_TOKEN or list ID env var');
    return res.status(500).json({ ok: false, error: 'server_config' });
  }

  const { name = '', company = '', email = '', phone = '', website = '', message = '' } = req.body || {};

  const rawPhone = phone.trim();
  const e164Phone = ('+' + rawPhone.replace(/[^\d]/g, '')).replace(/^\+0/, '+');
  const phoneForField = e164Phone.length > 4 && rawPhone.includes('+') ? e164Phone : null;

  const headline = company.trim() || name.trim() || 'Unknown';
  const taskName = `${headline} · Studios Enquiry`;

  const description = [
    '## Contact',
    `Name: ${name || '—'}`,
    `Email: ${email || '—'}`,
    `Phone: ${rawPhone || '—'}`,
    `Company: ${company || '—'}`,
    '',
    '## Message',
    message || '—',
    '',
    'Source: suki-systems.com/creative',
  ].join('\n');

  const customFields = [
    { id: FIELDS.name,         value: name.trim() },
    { id: FIELDS.company_name, value: company.trim() },
    { id: FIELDS.email,        value: email.trim() },
    { id: FIELDS.phone,        value: phoneForField },
    { id: FIELDS.website,      value: website.trim() },
    { id: FIELDS.source,       value: 'studios' },
  ].filter(f => f.value);

  const task = {
    name: taskName,
    description,
    status: 'in progress',
    priority: 3,
    start_date: Date.now(),
    start_date_time: true,
    assignees: [306777577],
    tags: ['studios enquiry'],
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
    console.error('contact-studios error:', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
}
