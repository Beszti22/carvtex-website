(function(){
  var form = document.getElementById('contactForm');
  if(!form) return;

  var selectedPairs = '1';
  var selectedUrgency = 'normal';
  var pillBtns = Array.prototype.slice.call(form.querySelectorAll('.form-pill'));
  var skisSelect = document.getElementById('formSkis') || form.querySelector('select[name="skis"]');
  var serviceSelect = document.getElementById('formService') || document.getElementById('cService') || form.querySelector('select[name="service"]');
  var pairNotice = document.getElementById('pairNotice');
  var pickupBox = document.getElementById('pickupBox');
  var pickupCheckbox = document.getElementById('pickupCheckbox') || document.getElementById('cPickup');
  var pickupFreeBadge = document.getElementById('pickupBadge') || document.getElementById('pickupFreeBadge');
  var pickupAddressWrap = document.getElementById('pickupAddressField') || document.getElementById('pickupAddressWrap');
  var pickupAddressInput = document.getElementById('pickupAddress') || document.getElementById('cPickupAddress');
  var submitBtn = document.getElementById('formSubmitBtn') || document.getElementById('contactSubmitBtn');
  var status = document.getElementById('formStatus') || document.getElementById('contactStatus');

  function updatePairUi(val) {
    if (!pairNotice) return;
    if (val === '2') {
      pairNotice.setAttribute('data-i18n', 'pairNotice2');
      pairNotice.style.display = 'block';
    } else if (val === '3+' || val === '3-4' || val === '5+') {
      pairNotice.setAttribute('data-i18n', 'pairNotice3');
      pairNotice.style.display = 'block';
    } else {
      pairNotice.removeAttribute('data-i18n');
      pairNotice.innerHTML = '';
      pairNotice.style.display = 'none';
    }
    if (window.applyLang) {
      window.applyLang(document.documentElement.lang || 'hu');
    }
  }

  function selectPill(group, val) {
    pillBtns.forEach(function (btn) {
      if (btn.getAttribute('data-pill-group') === group) {
        var match = btn.getAttribute('data-pill-val') === val;
        btn.setAttribute('aria-pressed', match ? 'true' : 'false');
      }
    });
    if (group === 'pairs') {
      selectedPairs = val;
      updatePairUi(val);
    }
    if (group === 'urgency') selectedUrgency = val;
  }

  pillBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var group = btn.getAttribute('data-pill-group');
      var val = btn.getAttribute('data-pill-val');
      if (group && val) selectPill(group, val);
    });
  });

  if (skisSelect) {
    skisSelect.addEventListener('change', function () {
      selectedPairs = skisSelect.value;
      updatePairUi(skisSelect.value);
    });
    if (skisSelect.value) {
      selectedPairs = skisSelect.value;
      updatePairUi(skisSelect.value);
    }
  }

  if (pickupCheckbox) {
    pickupCheckbox.addEventListener('change', function () {
      var isChecked = pickupCheckbox.checked;
      if (pickupBox) pickupBox.classList.toggle('is-active', isChecked);
      if (pickupAddressWrap) {
        pickupAddressWrap.classList.toggle('is-open', isChecked);
        pickupAddressWrap.style.display = isChecked ? 'block' : 'none';
      }
      if (pickupAddressInput) {
        pickupAddressInput.required = isChecked;
        if (isChecked) {
          pickupAddressInput.focus();
        }
      }
    });
  }

  // Pre-select service option, pairs, and pickup if navigated with ?service=...&pairs=...&pickup=...
  try {
    var params = new URLSearchParams(window.location.search);
    var requestedService = params.get('service');
    var requestedPairs = params.get('pairs');
    var requestedPickup = params.get('pickup');

    if (requestedService && serviceSelect) {
      var map = {
        alap: 'Alapszerviz',
        alapszerviz: 'Alapszerviz',
        basic: 'Alapszerviz',
        premium: 'Prémium szerviz',
        'prémium szerviz': 'Prémium szerviz',
        race: 'CarvteX Race',
        'carvtex race': 'CarvteX Race',
        verseny: 'CarvteX Race',
        alacarte: 'A-la-carte',
        'a-la-carte': 'A-la-carte',
        korcsolya: 'Korcsolyaélezés',
        korcsolyaélezés: 'Korcsolyaélezés',
        skates: 'Korcsolyaélezés'
      };
      var normalized = requestedService.trim().toLowerCase();
      var targetVal = map[normalized] || requestedService;
      Array.prototype.slice.call(serviceSelect.options).forEach(function (opt) {
        if (opt.value === targetVal || opt.value.toLowerCase() === normalized || opt.value.toLowerCase().indexOf(normalized) !== -1) {
          serviceSelect.value = opt.value;
        }
      });
    }
    if (requestedPairs) {
      if (skisSelect) {
        Array.prototype.slice.call(skisSelect.options).forEach(function(opt) {
          if (opt.value === requestedPairs || (requestedPairs === '3+' && (opt.value === '3-4' || opt.value === '3+'))) {
            skisSelect.value = opt.value;
            selectedPairs = opt.value;
            updatePairUi(opt.value);
          }
        });
      }
      selectPill('pairs', requestedPairs);
    }
    if (requestedPickup === 'yes' || requestedPickup === '1' || requestedPickup === 'true') {
      if (pickupCheckbox) {
        pickupCheckbox.checked = true;
        pickupCheckbox.dispatchEvent(new Event('change'));
      }
    }
  } catch (e) {
    /* ignore URLSearchParams errors in legacy browsers */
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    if(!form.checkValidity()){ form.reportValidity(); return; }

    if (status) {
      status.textContent = '';
      status.classList.remove('is-error', 'is-success');
    }
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    var sendingEl = document.getElementById('i18nContactSending');
    var successEl = document.getElementById('i18nContactSuccess');
    var errorEl = document.getElementById('i18nContactError');

    var isEn = (document.documentElement.lang === 'en');
    var msgSending = sendingEl ? sendingEl.textContent : (isEn ? 'Sending inquiry…' : 'Küldés folyamatban...');
    var msgSuccess = successEl ? successEl.textContent : (isEn ? 'Thank you! Your inquiry has been sent. We\'ll be in touch shortly.' : 'Köszönjük! Az időpontfoglalási igényed megérkezett, hamarosan jelentkezünk.');
    var msgError = errorEl ? errorEl.textContent : (isEn ? 'Something went wrong. Please call or email us directly.' : 'Hiba történt a küldés során. Kérjük, próbáld újra, vagy hívj minket telefonon!');

    if (status) {
      status.textContent = msgSending;
    }

    var activePairsBtn = form.querySelector('.form-pill[data-pill-group="pairs"][aria-pressed="true"]');
    var activeUrgBtn = form.querySelector('.form-pill[data-pill-group="urgency"][aria-pressed="true"]');
    var pairsLabel = activePairsBtn ? activePairsBtn.textContent.trim() : (skisSelect ? (skisSelect.options[skisSelect.selectedIndex] ? skisSelect.options[skisSelect.selectedIndex].text : selectedPairs) : selectedPairs);
    var urgLabel = activeUrgBtn ? activeUrgBtn.textContent.trim() : selectedUrgency;

    var isPickupChecked = pickupCheckbox ? pickupCheckbox.checked : false;
    var pickupAddressVal = (pickupAddressInput && isPickupChecked) ? pickupAddressInput.value.trim() : '';
    var pickupSummary = 'Nem kér szállítást (műhely leadás)';
    if (isPickupChecked) {
      pickupSummary = ((selectedPairs === '3+' || selectedPairs === '3-4' || selectedPairs === '5+') ? 'Ingyenes háztól-házig szállítás (20 km)' : 'Háztól-házig szállítás kérése (20 km)') +
        (pickupAddressVal ? ' — Cím: ' + pickupAddressVal : '');
    }

    var rawMsg = (form.message ? form.message.value : '').trim();
    var metaPrefix = '[Sílécek: ' + pairsLabel + ' | Szolgáltatás: ' + (serviceSelect ? serviceSelect.value : '') + ' | Szállítás: ' + pickupSummary + ']';
    var combinedMessage = rawMsg ? (metaPrefix + '\n\n' + rawMsg) : metaPrefix;

    var botcheckVal = (form.botcheck ? form.botcheck.value : '');

    var payload = {
      name: (form.name ? form.name.value : ''),
      email: (form.email ? form.email.value : ''),
      phone: (form.phone ? form.phone.value : ''),
      service: (serviceSelect ? serviceSelect.value : (form.service ? form.service.value : '')),
      pairs: pairsLabel,
      urgency: urgLabel,
      pickup: isPickupChecked,
      pickupAddress: pickupAddressVal,
      message: combinedMessage,
      consent: (form.consent ? form.consent.checked : false),
      botcheck: botcheckVal
    };

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(json){
        return { ok: res.ok && json.ok, json: json };
      });
    }).then(function(result){
      if (submitBtn) submitBtn.disabled = false;
      if (result.ok){
        if (status) {
          status.textContent = msgSuccess;
          status.classList.add('is-success');
        }
        form.reset();
        selectPill('pairs', '1');
        selectPill('urgency', 'normal');
        if (pickupBox) pickupBox.classList.remove('is-active');
        if (pickupAddressWrap) {
          pickupAddressWrap.classList.remove('is-open');
          pickupAddressWrap.style.display = 'none';
        }
        if (pairNotice) {
          pairNotice.style.display = 'none';
          pairNotice.innerHTML = '';
        }
      } else {
        if (status) {
          status.textContent = msgError;
          status.classList.add('is-error');
        }
      }
    }).catch(function(){
      if (submitBtn) submitBtn.disabled = false;
      if (status) {
        status.textContent = msgError;
        status.classList.add('is-error');
      }
    });
  });
})();
