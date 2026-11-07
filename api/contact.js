// /api/contact.js — CarvteX contact form handler (Vercel serverless function)
// Sends styled inquiry emails via Resend (https://resend.com). Requires the RESEND_API_KEY
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

  const { name, email, phone, service, message, consent, botcheck, pairs, urgency, pickup, pickupAddress } = body;

  // Honeypot: real visitors never fill this hidden field. Bots usually do.
  if (botcheck) {
    return res.status(200).json({ ok: true });
  }

  if (!name || !email || !consent) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  const emailPattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  if (!emailPattern.test(String(email))) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set in the Vercel project environment variables.');
    return res.status(500).json({ ok: false, error: 'server_not_configured' });
  }

  const toAddress = process.env.CONTACT_TO_EMAIL || 'carvtexszerviz@gmail.com';
  const fromAddress = process.env.CONTACT_FROM_EMAIL || 'CarvteX Síszerviz <no-reply@carvtex.hu>';

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || '-');
  const safeService = escapeHtml(service || 'Nincs megadva (Állapotfelmérés)');
  const safeMessage = escapeHtml(message || '(Nincs megadott megjegyzés)');
  const safePairs = escapeHtml(pairs || '1 pár');
  const safeUrgency = escapeHtml(urgency || 'Normál (24–48 órán belül)');
  const isPickup = Boolean(pickup);
  const safeAddress = escapeHtml(pickupAddress || '-');

  const now = new Date().toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });

  // Volume discount note calculation
  let discountBadge = '';
  if (safePairs.includes('2')) {
    discountBadge = '<span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;margin-left:8px;">🎿 PÁROS KEDVEZMÉNY (-10%)</span>';
  } else if (safePairs.includes('3') || safePairs.includes('+')) {
    discountBadge = '<span style="display:inline-block;background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;margin-left:8px;">🎿 CSALÁDI CSOMAG (-15%)</span>';
  }

  const pickupBadge = isPickup
    ? '<span style="display:inline-block;background:#dcfce7;color:#15803d;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;">🚚 HÁZTÓL-HÁZIG FELVÉTEL KÉRVE</span>'
    : '<span style="display:inline-block;background:#f1f5f9;color:#64748b;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;">🏠 Ügyfél hozza a műhelybe</span>';

  const urgencyBadge = safeUrgency.includes('Hétvégén') || safeUrgency.includes('Sürgős')
    ? '<span style="display:inline-block;background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;margin-left:8px;">⚡ SÜRGŐS</span>'
    : '';

  const cleanPhoneDigits = String(phone || '').replace(/[^0-9+]/g, '');

  try {
    // 1. Email notification to CarvteX (Bence)
    const adminNotificationHtml = `
      <!DOCTYPE html>
      <html lang="hu">
      <head>
        <meta charset="utf-8">
        <title>Új időpontfoglalás — CarvteX</title>
      </head>
      <body style="margin:0;padding:20px;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background:#0B1C2C;padding:28px 32px;text-align:left;border-bottom:3px solid #1E9BE0;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:26px;font-weight:900;letter-spacing:1px;color:#ffffff;text-transform:uppercase;">CARV<span style="color:#1E9BE0;">TEX</span></span>
                    <div style="font-size:12px;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">Síszerviz Délegyháza</div>
                  </td>
                  <td style="text-align:right;">
                    <span style="background:#1E9BE0;color:#ffffff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">Új foglalás</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 8px 0;font-size:20px;color:#0B1C2C;font-weight:800;">Új megkeresés érkezett a weboldalról</h2>
              <p style="margin:0 0 24px 0;font-size:13px;color:#64748b;">Érkezett: <strong>${now}</strong></p>

              <!-- Delivery status badge -->
              <div style="margin-bottom:24px;">
                ${pickupBadge}
              </div>

              <!-- Quick action bar -->
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
                <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Gyors műveletek az ügyféllel:</div>
                <div style="display:inline-block;">
                  ${cleanPhoneDigits ? `<a href="tel:${cleanPhoneDigits}" style="display:inline-block;background:#0B1C2C;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;margin:4px;">📞 Hívás (${safePhone})</a>` : ''}
                  ${cleanPhoneDigits ? `<a href="https://wa.me/${cleanPhoneDigits.replace('+', '')}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;margin:4px;">💬 WhatsApp</a>` : ''}
                  <a href="mailto:${safeEmail}?subject=Re: CarvteX Síszerviz időpont egyeztetés" style="display:inline-block;background:#1E9BE0;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;margin:4px;">✉️ Válasz email</a>
                </div>
              </div>

              <!-- Details Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;">
                <tr style="border-bottom:1px solid #edf2f7;">
                  <td style="padding:10px 0;font-size:13px;color:#64748b;width:35%;">Ügyfél neve:</td>
                  <td style="padding:10px 0;font-size:14px;color:#0B1C2C;font-weight:700;">${safeName}</td>
                </tr>
                <tr style="border-bottom:1px solid #edf2f7;">
                  <td style="padding:10px 0;font-size:13px;color:#64748b;">Email cím:</td>
                  <td style="padding:10px 0;font-size:14px;color:#0B1C2C;"><a href="mailto:${safeEmail}" style="color:#1E9BE0;text-decoration:none;font-weight:600;">${safeEmail}</a></td>
                </tr>
                <tr style="border-bottom:1px solid #edf2f7;">
                  <td style="padding:10px 0;font-size:13px;color:#64748b;">Telefonszám:</td>
                  <td style="padding:10px 0;font-size:14px;color:#0B1C2C;font-weight:600;">${safePhone}</td>
                </tr>
                <tr style="border-bottom:1px solid #edf2f7;">
                  <td style="padding:10px 0;font-size:13px;color:#64748b;">Választott csomag:</td>
                  <td style="padding:10px 0;font-size:14px;color:#0B1C2C;font-weight:700;">${safeService}</td>
                </tr>
                <tr style="border-bottom:1px solid #edf2f7;">
                  <td style="padding:10px 0;font-size:13px;color:#64748b;">Sílécek darabszáma:</td>
                  <td style="padding:10px 0;font-size:14px;color:#0B1C2C;font-weight:700;">${safePairs} ${discountBadge}</td>
                </tr>
                <tr style="border-bottom:1px solid #edf2f7;">
                  <td style="padding:10px 0;font-size:13px;color:#64748b;">Időzítés / határidő:</td>
                  <td style="padding:10px 0;font-size:14px;color:#0B1C2C;font-weight:600;">${safeUrgency} ${urgencyBadge}</td>
                </tr>
                ${isPickup ? `
                <tr style="border-bottom:1px solid #edf2f7;background:#f0fdf4;">
                  <td style="padding:12px 8px;font-size:13px;color:#166534;font-weight:700;">Átvételi & visszaszállítási cím:</td>
                  <td style="padding:12px 8px;font-size:14px;color:#14532d;font-weight:700;">
                    ${safeAddress}<br>
                    <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeAddress)}" target="_blank" style="font-size:12px;color:#1E9BE0;text-decoration:underline;">📍 Cím megnyitása Google Maps-en</a>
                  </td>
                </tr>` : ''}
              </table>

              <!-- Customer Message Box -->
              <div style="background:#f8fafc;border-left:4px solid #1E9BE0;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;letter-spacing:0.5px;">Üzenet / Megjegyzés:</div>
                <div style="font-size:14px;color:#334155;line-height:1.5;">${safeMessage.replace(/\\n/g, '<br>')}</div>
              </div>

              <div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;">
                <span style="font-size:12px;color:#64748b;">Ez egy automatikus értesítő a <a href="https://www.carvtex.hu" style="color:#1E9BE0;text-decoration:none;font-weight:600;">carvtex.hu</a> weboldalról.</span>
              </div>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const adminResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toAddress],
        reply_to: email,
        subject: `[CarvteX Foglalás] ${safeName} — ${safeService} (${safePairs})`,
        html: adminNotificationHtml,
      }),
    });

    if (!adminResponse.ok) {
      const errText = await adminResponse.text();
      console.error('Resend API error (admin notification):', adminResponse.status, errText);
      return res.status(502).json({ ok: false, error: 'email_provider_error', details: errText });
    }

    // 2. Customer auto-reply confirmation email
    const customerConfirmationHtml = `
      <!DOCTYPE html>
      <html lang="hu">
      <head>
        <meta charset="utf-8">
        <title>Időpontfoglalás megerősítése — CarvteX Síszerviz</title>
      </head>
      <body style="margin:0;padding:20px;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background:#0B1C2C;padding:32px;text-align:center;border-bottom:3px solid #1E9BE0;">
              <span style="font-size:28px;font-weight:900;letter-spacing:1.5px;color:#ffffff;text-transform:uppercase;">CARV<span style="color:#1E9BE0;">TEX</span></span>
              <div style="font-size:12px;color:#94a3b8;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Síszerviz • Délegyháza</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="margin:0 0 12px 0;font-size:22px;color:#0B1C2C;font-weight:800;">Kedves ${safeName}!</h2>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#334155;">
                Köszönjük megkeresésedet! Az időpontfoglalási igényed sikeresen megérkezett műhelyünkbe. Hamarosan jelentkezünk a megadott elérhetőségeiden a pontos időpont és részletek véglegesítéséhez.
              </p>

              <!-- Summary Card -->
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:28px;">
                <div style="font-size:12px;font-weight:800;color:#1E9BE0;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">A leadott foglalásod adatai:</div>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
                  <tr>
                    <td style="padding:6px 0;color:#64748b;width:40%;">Szolgáltatás:</td>
                    <td style="padding:6px 0;color:#0B1C2C;font-weight:700;">${safeService}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;">Sílécek száma:</td>
                    <td style="padding:6px 0;color:#0B1C2C;font-weight:700;">${safePairs} ${discountBadge}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;">Kért határidő:</td>
                    <td style="padding:6px 0;color:#0B1C2C;font-weight:600;">${safeUrgency} ${urgencyBadge}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;">Szállítás módja:</td>
                    <td style="padding:6px 0;color:#0B1C2C;font-weight:600;">${isPickup ? '🚚 Háztól-házig szállítás (10 km-es körzetben)' : '🏠 Személyes leadás a délegyházi műhelyben'}</td>
                  </tr>
                  ${isPickup ? `
                  <tr>
                    <td style="padding:6px 0;color:#64748b;">Megadott cím:</td>
                    <td style="padding:6px 0;color:#0B1C2C;font-weight:600;">${safeAddress}</td>
                  </tr>` : ''}
                </table>
              </div>

              <!-- Helpful Tips -->
              <div style="background:#f0f9ff;border-left:4px solid #1E9BE0;padding:16px 18px;border-radius:0 8px 8px 0;margin-bottom:28px;">
                <div style="font-weight:700;color:#0369a1;font-size:14px;margin-bottom:6px;">💡 Hasznos tudnivaló a leadáshoz:</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#0c4a6e;line-height:1.6;">
                  <li>Kötésbeállításhoz kérjük, hozz magaddal <strong>egy darab síbakancsot</strong> a pontos beállításhoz.</li>
                  <li>Műhelyünk előtt közvetlen, ingyenes parkolási lehetőség áll rendelkezésedre a ki- és bepakoláshoz.</li>
                  <li>Ha kérdésed merülne fel vagy módosítanál, közvetlenül elérsz minket telefonon vagy WhatsAppon is.</li>
                </ul>
              </div>

              <!-- Workshop info card -->
              <div style="background:#0B1C2C;color:#ffffff;border-radius:10px;padding:24px;text-align:center;">
                <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">CarvteX Síszerviz Műhely</div>
                <div style="font-size:16px;font-weight:800;color:#ffffff;margin-bottom:4px;">Szappanos Bence</div>
                <div style="font-size:13px;color:#cbd5e1;margin-bottom:14px;">Délegyháza, Magyarország (Budapest déli agglomeráció)</div>
                <div style="margin-bottom:16px;">
                  <a href="tel:+36308849273" style="display:inline-block;background:#1E9BE0;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:13px;margin:4px;">📞 +36 30 884 9273</a>
                  <a href="https://wa.me/36308849273" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:13px;margin:4px;">💬 WhatsApp</a>
                </div>
                <div style="font-size:11px;color:#94a3b8;">
                  A pontos házszámot az időpont megerősítésekor küldjük el.
                </div>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
              <span style="font-size:12px;color:#64748b;">
                © 2026 CarvteX Síszerviz • <a href="https://www.carvtex.hu" style="color:#1E9BE0;text-decoration:none;">www.carvtex.hu</a>
              </span>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Fire-and-forget customer confirmation (don't block success if client mail provider rejects)
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        reply_to: toAddress,
        subject: 'Időpontfoglalási igényed megérkezett — CarvteX Síszerviz',
        html: customerConfirmationHtml,
      }),
    }).catch(err => {
      console.warn('Customer confirmation email failed silently:', err);
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Unhandled serverless error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
