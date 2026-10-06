const { randomUUID } = require('crypto');

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function validEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function supabaseRequest(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error('Feedback storage is not configured.');

  const response = await fetch(base.replace(/\/$/, '') + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Feedback storage failed: ' + response.status + ' ' + detail.slice(0, 160));
  }
  return response;
}

async function sendNotification(record) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  const from = process.env.FEEDBACK_FROM_EMAIL;
  if (!apiKey || !to || !from) return { sent: false, reason: 'not_configured' };

  const subject = '[Loop Alpha Feedback] ' + record.feedback_type;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:auto">
      <h2 style="margin-bottom:6px">New Loop Alpha feedback</h2>
      <p style="color:#667069;margin-top:0">Submission ID: ${escapeHtml(record.id)}</p>
      <p><strong>Type:</strong> ${escapeHtml(record.feedback_type)}</p>
      <p><strong>Message:</strong></p>
      <div style="white-space:pre-wrap;background:#f4f7f4;border-radius:12px;padding:14px">${escapeHtml(record.message)}</div>
      <p><strong>Follow-up email:</strong> ${escapeHtml(record.contact_email || 'Not provided')}</p>
      <p><strong>Page:</strong> ${escapeHtml(record.page_url || 'Unknown')}</p>
      <p><strong>App version:</strong> ${escapeHtml(record.app_version)}</p>
      <p style="color:#667069;font-size:12px">Basic browser information was stored with this submission to help diagnose Alpha issues.</p>
    </div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'loop-feedback/' + record.id
    },
    body: JSON.stringify({ from, to: [to], subject, html })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { sent: false, reason: 'provider_error', detail: detail.slice(0, 160) };
  }
  return { sent: true };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Honeypot: bots tend to fill hidden fields.
    if (clean(body.website, 100)) {
      return res.status(200).json({ ok: true, saved: true, notified: true });
    }

    const type = clean(body.type, 80);
    const message = clean(body.message, 700);
    const contactEmail = clean(body.contactEmail, 180);
    const pageUrl = clean(body.pageUrl, 500);
    const appVersion = clean(body.appVersion, 40) || 'alpha';

    const allowedTypes = new Set([
      'Idea or suggestion',
      'Something is not working',
      'Privacy or safety concern',
      'Other'
    ]);

    if (!allowedTypes.has(type)) {
      return res.status(400).json({ ok: false, error: 'Choose a valid feedback type.' });
    }
    if (message.length < 5) {
      return res.status(400).json({ ok: false, error: 'Feedback must be at least 5 characters.' });
    }
    if (!validEmail(contactEmail)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid follow-up email or leave it blank.' });
    }

    const record = {
      id: randomUUID(),
      feedback_type: type,
      message,
      contact_email: contactEmail || null,
      page_url: pageUrl || null,
      user_agent: clean(req.headers['user-agent'], 500) || null,
      app_version: appVersion,
      notification_status: 'pending'
    };

    await supabaseRequest('feedback', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(record)
    });

    const notification = await sendNotification(record);
    const status = notification.sent ? 'sent' : 'failed';

    try {
      await supabaseRequest('feedback?id=eq.' + encodeURIComponent(record.id), {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ notification_status: status })
      });
    } catch (_) {
      // Saving the feedback is the primary requirement; notification status is best-effort.
    }

    return res.status(notification.sent ? 200 : 202).json({
      ok: true,
      saved: true,
      notified: notification.sent,
      id: record.id
    });
  } catch (error) {
    console.error('Loop feedback error:', error && error.message ? error.message : error);
    return res.status(503).json({
      ok: false,
      error: 'Loop feedback is temporarily unavailable. Please try again shortly.'
    });
  }
};
