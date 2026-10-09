// Vercel build identity used by installed Loop PWAs to detect fresh releases.
// No user data, login or third-party tracking required.
export default function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store, max-age=0, must-revalidate');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Method not allowed'});
  }
  const version = process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_URL || null;
  return res.status(200).json({version});
}
