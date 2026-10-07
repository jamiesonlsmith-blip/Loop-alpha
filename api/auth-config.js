// Auth environment refresh
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL || '';
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!url || !publishableKey) {
    return res.status(200).json({ configured: false });
  }

  return res.status(200).json({
    configured: true,
    url,
    publishableKey,
  });
}
