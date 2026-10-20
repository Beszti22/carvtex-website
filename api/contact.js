// /api/contact.js — CarvteX contact form handler (Vercel serverless function)
// Sends inquiry emails via Resend (https://resend.com). Requires the RESEND_API_KEY
// environment variable to be set in the Vercel project settings.

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const { name, email, phone, service, message, consent, botcheck } = body;

  // Honeypot: real visitors never fill this hidden field. Bots usually do.
  // Silently accept without sending any email.
  if (botcheck) {
    return res.status(200).json({ ok: true });
  }

  if (!name || !email || !consent) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(String(email))) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set in the Vercel project environment variables.');
    return res.status(500).json({ ok: false, error: 'server_not_configured' });
  }

  const toAddress = process.env.CONTACT_TO_EMAIL || 'carvtexszerviz@gmail.com';
  // Resend's shared sandbox sender works immediately with no domain setup.
  // Once a sending domain (e.g. no-reply@carvtex.hu) is verified in Resend,
  // set CONTACT_FROM_EMAIL in Vercel to switch over — no code change needed.
  const fromAddress = process.env.CONTACT_FROM_EMAIL || 'CarvteX Website <onboarding@resend.dev>';

  const notifyHtml = `
    <h2 style="font-family:sans-serif;color:#0B1C2C;">Új megkeresés — carvtex website</h2>
    <table style="font-family:sans-serif;font-size:14px;color:#0B1C2C;border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Név</td><td>${escapeHtml(name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Email</td><td>${escapeHtml(email)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Telefon</td><td>${escapeHtml(phone || '-')}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Szolgáltatás</td><td>${escapeHtml(service || '-')}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:14px;color:#0B1C2C;"><b>Üzenet:</b><br>${escapeHtml(message || '-').replace(/\n/g, '<br>')}</p>
    <p style="font-family:sans-serif;font-size:12px;color:#55687C;">A carvtex website kapcsolat űrlapjáról küldve. Válaszolj közvetlenül erre az emailre, hogy elérd a feladót.</p>
  `;

  const confirmationHtml = `
    <div style="font-family:sans-serif;color:#0B1C2C;">
      <h2 style="color:#0B1C2C;">Köszönjük a megkeresésed!</h2>
      <p>Kedves ${escapeHtml(name)}!<br>
      Megkaptuk az üzeneted. Hamarosan, de legkésőbb 2 munkanapon belül jelentkezünk az időpont egyeztetéséhez.</p>
      <p style="font-size:13px;color:#55687C;">— CarvteX Síszerviz<br>carvtexszerviz@gmail.com</p>
    </div>
  `;

  try {
    const notifyResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toAddress],
        reply_to: email,
        subject: `Új megkeresés: ${name} (${service || 'nincs megadva'})`,
        html: notifyHtml
      })
    });

    if (!notifyResp.ok) {
      const errText = await notifyResp.text();
      console.error('Resend error (service notification):', notifyResp.status, errText);
      return res.status(502).json({ ok: false, error: 'email_send_failed' });
    }

    // Best-effort auto-reply to the sender. If this fails, the service still got
    // the inquiry above, so we don't fail the whole request over it.
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [email],
          subject: 'Megkaptuk a megkeresésed — CarvteX Síszerviz',
          html: confirmationHtml
        })
      });
    } catch (confirmErr) {
      console.error('Resend error (sender confirmation, non-fatal):', confirmErr);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form server error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
