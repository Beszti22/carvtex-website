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
  const fromAddress = process.env.CONTACT_FROM_EMAIL || 'CarvteX Síszerviz <no-reply@carvtex.hu>';

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || '-');
  const safeService = escapeHtml(service || 'Nincs megadva (Állapotfelmérés)');
  const safePairs = escapeHtml(pairs || '1 pár');
  const safeUrgency = escapeHtml(urgency || 'Normál (24–48 óra)');
  const safeMessage = escapeHtml(message || '-');
  const safeAddress = escapeHtml(pickupAddress || 'Nincs cím megadva');

  // Parse phone for quick-action buttons
  const rawPhone = String(phone || '');
  const cleanPhone = rawPhone.replace(/[^\d+]/g, '');
  let waPhone = cleanPhone.replace(/[^\d]/g, '');
  if (waPhone.startsWith('06')) {
    waPhone = '36' + waPhone.substring(2);
  }

  // Dynamic status badges
  let badgesHtml = '';
  if (pickup) {
    badgesHtml += '<span style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;margin-right:6px;margin-bottom:6px;">🚚 HÁZTÓL-HÁZIG SZÁLLÍTÁS</span>';
  }
  if (pairs && String(pairs).includes('3+')) {
    badgesHtml += '<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;margin-right:6px;margin-bottom:6px;">🎿 CSALÁDI (-15%)</span>';
  }
  if (urgency && String(urgency).toLowerCase().includes('sürgős')) {
    badgesHtml += '<span style="display:inline-block;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;margin-right:6px;margin-bottom:6px;">⚡ SÜRGŐS</span>';
  }

  // Quick Action buttons HTML for admin
  let actionButtonsHtml = '';
  if (cleanPhone) {
    actionButtonsHtml += `
      <a href="tel:${cleanPhone}" style="display:inline-block;background:#0B1C2C;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;margin:4px 6px 4px 0;">📞 Hívás: ${safePhone}</a>
      <a href="https://wa.me/${waPhone}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;margin:4px 6px 4px 0;">💬 WhatsApp</a>
    `;
  }
  actionButtonsHtml += `
    <a href="mailto:${safeEmail}" style="display:inline-block;background:#1E9BE0;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;margin:4px 0 4px 0;">✉️ Válasz emailben</a>
  `;

  // Pickup row
  const pickupRowHtml = pickup
    ? `<tr>
         <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;width:34%;vertical-align:top;">Szállítási cím (10 km)</td>
         <td style="padding:10px 14px;background:#ffffff;color:#047857;font-weight:700;border-bottom:1px solid #e2e8f0;">${safeAddress}</td>
       </tr>`
    : `<tr>
         <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;width:34%;">Átvétel módja</td>
         <td style="padding:10px 14px;background:#ffffff;color:#334155;border-bottom:1px solid #e2e8f0;">Személyes leadás a délegyházi műhelyben</td>
       </tr>`;

  // Dynamic subject line
  let subjectTag = 'Új megkeresés';
  if (pickup && pairs && String(pairs).includes('3+')) {
    subjectTag = '🚚 [SZÁLLÍTÁS 10KM] Új megkeresés';
  } else if (urgency && String(urgency).toLowerCase().includes('sürgős')) {
    subjectTag = '⚡ [SÜRGŐS] Új megkeresés';
  }
  const subjectLine = `${subjectTag}: ${safeName} (${safeService})`;

  // 1. ADMIN NOTIFICATION EMAIL TEMPLATE
  const notifyHtml = `
<!DOCTYPE html>
<html lang="hu">
<head><meta charset="UTF-8"><title>Új megkeresés — CarvteX Síszerviz</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 6px 24px rgba(11,28,44,0.06);">
          <tr>
            <td style="background:#0B1C2C;padding:24px 28px;border-bottom:3px solid #1E9BE0;">
              <table width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-family:'Arial Black',Impact,sans-serif;font-size:22px;color:#ffffff;letter-spacing:1px;line-height:1;">CARVTEX</div>
                    <div style="font-size:11px;color:#93c5fd;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-top:4px;">Síszerviz · Új foglalási értesítő</div>
                  </td>
                  <td align="right">
                    <span style="font-size:24px;">🎿</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${badgesHtml ? `<div style="margin-bottom:16px;">${badgesHtml}</div>` : ''}
              <h1 style="font-size:20px;font-weight:700;color:#0B1C2C;margin:0 0 12px 0;line-height:1.3;">Új szerviz megkeresés érkezett!</h1>
              <p style="font-size:14px;color:#475569;margin:0 0 20px 0;line-height:1.5;">Egy vendég kitöltötte az időpontfoglalási űrlapot a <a href="https://www.carvtex.hu" style="color:#1E9BE0;text-decoration:none;font-weight:600;">carvtex.hu</a> oldalon.</p>
              
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;font-size:13.5px;">
                <tr>
                  <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;width:34%;">Megrendelő neve</td>
                  <td style="padding:10px 14px;background:#ffffff;color:#0B1C2C;font-weight:700;border-bottom:1px solid #e2e8f0;">${safeName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Email cím</td>
                  <td style="padding:10px 14px;background:#ffffff;color:#0B1C2C;border-bottom:1px solid #e2e8f0;"><a href="mailto:${safeEmail}" style="color:#1E9BE0;text-decoration:none;font-weight:600;">${safeEmail}</a></td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Telefonszám</td>
                  <td style="padding:10px 14px;background:#ffffff;color:#0B1C2C;font-weight:700;border-bottom:1px solid #e2e8f0;">${safePhone}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Választott szolgáltatás</td>
                  <td style="padding:10px 14px;background:#ffffff;color:#1E9BE0;font-weight:700;border-bottom:1px solid #e2e8f0;">${safeService}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Sílécek száma</td>
                  <td style="padding:10px 14px;background:#ffffff;color:#0B1C2C;font-weight:700;border-bottom:1px solid #e2e8f0;">${safePairs}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Időzítés / Határidő</td>
                  <td style="padding:10px 14px;background:#ffffff;color:#0B1C2C;border-bottom:1px solid #e2e8f0;">${safeUrgency}</td>
                </tr>
                ${pickupRowHtml}
              </table>

              <div style="background:#f8fafc;border-left:4px solid #1E9BE0;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;letter-spacing:0.5px;">Üzenet / Megjegyzés:</div>
                <div style="font-size:14px;color:#334155;line-height:1.5;">${safeMessage.replace(/\\n/g, '<br>')}</div>
              </div>

              <div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px;letter-spacing:0.5px;">Gyors válaszadás az ügyfélnek:</div>
                ${actionButtonsHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:18px 28px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;line-height:1.5;">
              <strong style="color:#64748b;">CarvteX Síszerviz Délegyháza</strong><br>
              Ez az email automatikusan generálódott a <a href="https://www.carvtex.hu" style="color:#1E9BE0;text-decoration:none;">carvtex.hu</a> weboldalról.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  // 2. CUSTOMER AUTO-REPLY CONFIRMATION EMAIL TEMPLATE
  const confirmationHtml = `
<!DOCTYPE html>
<html lang="hu">
<head><meta charset="UTF-8"><title>Időpontfoglalás megerősítése — CarvteX Síszerviz</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 6px 24px rgba(11,28,44,0.06);">
          <tr>
            <td style="background:#0B1C2C;padding:26px 28px;border-bottom:3px solid #1E9BE0;text-align:center;">
              <div style="font-family:'Arial Black',Impact,sans-serif;font-size:26px;color:#ffffff;letter-spacing:1px;line-height:1;">CARVTEX</div>
              <div style="font-size:11.5px;color:#93c5fd;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-top:6px;">Síszerviz · Délegyháza</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;">
              <div style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;margin-bottom:16px;">✓ MEGKERESÉS RÖGZÍTVE</div>
              <h1 style="font-size:22px;font-weight:800;color:#0B1C2C;margin:0 0 14px 0;line-height:1.3;">Köszönjük az időpontkérésedet, ${safeName}!</h1>
              <p style="font-size:15px;color:#334155;margin:0 0 20px 0;line-height:1.6;">
                Megkaptuk az üzenetedet. <strong>Szappanos Bence</strong> korábbi alpesi síedző hamarosan (legkésőbb 24 órán belül) felveszi veled a kapcsolatot a leadási időpont pontosításához.
              </p>

              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
                <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#1E9BE0;letter-spacing:0.5px;margin-bottom:12px;">Az általad leadott adatok:</div>
                <table width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:13.5px;line-height:1.6;">
                  <tr>
                    <td style="color:#64748b;padding:4px 0;width:40%;">Szolgáltatás:</td>
                    <td style="color:#0B1C2C;font-weight:700;padding:4px 0;">${safeService}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:4px 0;">Sílécek száma:</td>
                    <td style="color:#0B1C2C;font-weight:700;padding:4px 0;">${safePairs}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:4px 0;">Időzítés:</td>
                    <td style="color:#0B1C2C;font-weight:600;padding:4px 0;">${safeUrgency}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;padding:4px 0;">Átvétel módja:</td>
                    <td style="color:#047857;font-weight:700;padding:4px 0;">${pickup ? '🚚 Háztól-házig szállítás (10 km) — ' + safeAddress : 'Műhelybe hozatal (Délegyháza)'}</td>
                  </tr>
                </table>
              </div>

              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
                <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:8px;">💡 Fontos tudnivalók a leadáshoz:</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#1e3a8a;line-height:1.6;">
                  <li style="margin-bottom:6px;"><strong>Kötésbeállítás esetén:</strong> Kérjük, készítsd össze az egyik síbakancsodat is a pontos talphossz és DIN-érték beállításához!</li>
                  <li style="margin-bottom:6px;"><strong>Ingyenes parkolás:</strong> A délegyházi műhelyünk előtt közvetlenül meg tudsz állni a lécek kényelmes ki- és bepakolásához.</li>
                  <li><strong>Nincs előre fizetés:</strong> A szervizdíjat az elkészült lécek átvételekor vagy visszaszállításakor tudod rendezni.</li>
                </ul>
              </div>

              <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:10px;">
                <tr>
                  <td align="center">
                    <a href="https://www.google.com/maps/dir/?api=1&destination=D%C3%A9legyh%C3%A1za" style="display:inline-block;background:#0B1C2C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:13.5px;font-weight:700;margin:4px;">📍 Útvonaltervezés a műhelyhez</a>
                    <a href="tel:+36308849273" style="display:inline-block;background:#1E9BE0;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:13.5px;font-weight:700;margin:4px;">📞 Hívás: +36 30 884 9273</a>
                  </td>
                </tr>
              </table>

              <p style="font-size:14px;color:#475569;margin:24px 0 0 0;line-height:1.6;">
                Hamarosan beszélünk!<br>
                Üdvözlettel,<br>
                <strong style="color:#0B1C2C;">Szappanos Bence</strong><br>
                <span style="font-size:13px;color:#64748b;">CarvteX Síszerviz Délegyháza</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:18px 28px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;line-height:1.5;">
              <strong style="color:#64748b;">CarvteX Síszerviz</strong> · Délegyháza (Budapest déli agglomeráció)<br>
              Weboldal: <a href="https://www.carvtex.hu" style="color:#1E9BE0;text-decoration:none;">carvtex.hu</a> · Email: <a href="mailto:carvtexszerviz@gmail.com" style="color:#1E9BE0;text-decoration:none;">carvtexszerviz@gmail.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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
        subject: subjectLine,
        html: notifyHtml
      })
    });

    if (!notifyResp.ok) {
      const errText = await notifyResp.text();
      console.error('Resend error (service notification):', notifyResp.status, errText);
      return res.status(502).json({ ok: false, error: 'email_send_failed' });
    }

    // Best-effort auto-reply to the sender.
    try {
      const confirmResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [email],
          subject: 'Időpontfoglalás megerősítése — CarvteX Síszerviz',
          html: confirmationHtml
        })
      });
      if (!confirmResp.ok) {
        const confirmErrText = await confirmResp.text();
        console.warn('Resend auto-reply warning:', confirmResp.status, confirmErrText);
      }
    } catch (confirmErr) {
      console.error('Resend error (sender confirmation, non-fatal):', confirmErr);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form server error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
