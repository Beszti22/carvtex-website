(function(){
  var form = document.getElementById('contactForm');
  if(!form) return;

  var selectedPairs = '1';
  var selectedUrgency = 'normal';
  var pillBtns = Array.prototype.slice.call(form.querySelectorAll('.form-pill'));
  var pairNotice = document.getElementById('pairNotice');
  var pickupBox = document.getElementById('pickupBox');
  var pickupCheckbox = document.getElementById('cPickup');
  var pickupFreeBadge = document.getElementById('pickupFreeBadge');
  var pickupAddressWrap = document.getElementById('pickupAddressWrap');
  var pickupAddressInput = document.getElementById('cPickupAddress');

  function updatePairUi(val) {
    if (!pairNotice) return;
    if (val === '2') {
      pairNotice.setAttribute('data-i18n', 'pairNotice2');
      pairNotice.style.display = 'block';
      if (pickupFreeBadge) pickupFreeBadge.style.display = 'none';
    } else if (val === '3+') {
      pairNotice.setAttribute('data-i18n', 'pairNotice3');
      pairNotice.style.display = 'block';
      if (pickupFreeBadge) pickupFreeBadge.style.display = 'inline-flex';
    } else {
      pairNotice.removeAttribute('data-i18n');
      pairNotice.innerHTML = '';
      pairNotice.style.display = 'none';
      if (pickupFreeBadge) pickupFreeBadge.style.display = 'none';
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

  if (pickupCheckbox) {
    pickupCheckbox.addEventListener('change', function () {
      var isChecked = pickupCheckbox.checked;
      if (pickupBox) pickupBox.classList.toggle('is-active', isChecked);
      if (pickupAddressWrap) pickupAddressWrap.classList.toggle('is-open', isChecked);
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
    var serviceSelect = document.getElementById('cService');
    if (requestedService && serviceSelect) {
      var map = {
        alap: 'Alapszerviz',
        alapszerviz: 'Alapszerviz',
        premium: 'Prémium szerviz',
        'prémium szerviz': 'Prémium szerviz',
        kotes: 'Kötésbeállítás',
        'kötésbeállítás': 'Kötésbeállítás'
      };
      var normalized = requestedService.trim().toLowerCase();
      var targetVal = map[normalized] || requestedService;
      Array.prototype.slice.call(serviceSelect.options).forEach(function (opt) {
        if (opt.value === targetVal || opt.value.toLowerCase() === normalized) {
          serviceSelect.value = opt.value;
        }
      });
    }
    if (requestedPairs && (requestedPairs === '1' || requestedPairs === '2' || requestedPairs === '3+')) {
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

  var submitBtn = document.getElementById('contactSubmitBtn');
  var status = document.getElementById('contactStatus');
  var sendingText = document.getElementById('i18nContactSending');
  var successText = document.getElementById('i18nContactSuccess');
  var errorText = document.getElementById('i18nContactError');

  form.addEventListener('submit', function(e){
    e.preventDefault();
    if(!form.checkValidity()){ form.reportValidity(); return; }

    status.textContent = '';
    status.classList.remove('is-error', 'is-success');
    submitBtn.disabled = true;
    if(sendingText){ status.textContent = sendingText.textContent; }

    var activePairsBtn = form.querySelector('.form-pill[data-pill-group="pairs"][aria-pressed="true"]');
    var activeUrgBtn = form.querySelector('.form-pill[data-pill-group="urgency"][aria-pressed="true"]');
    var pairsLabel = activePairsBtn ? activePairsBtn.textContent.trim() : selectedPairs;
    var urgLabel = activeUrgBtn ? activeUrgBtn.textContent.trim() : selectedUrgency;

    var isPickupChecked = pickupCheckbox ? pickupCheckbox.checked : false;
    var pickupAddressVal = (pickupAddressInput && isPickupChecked) ? pickupAddressInput.value.trim() : '';
    var pickupSummary = 'Nem kér szállítást (műhely leadás)';
    if (isPickupChecked) {
      pickupSummary = (selectedPairs === '3+' ? 'Ingyenes háztól-házig szállítás (10 km)' : 'Háztól-házig szállítás kérése (10 km)') +
        (pickupAddressVal ? ' — Cím: ' + pickupAddressVal : '');
    }

    var rawMsg = (form.message.value || '').trim();
    var metaPrefix = '[Sílécek száma: ' + pairsLabel + ' | Időzítés: ' + urgLabel + ' | Szállítás: ' + pickupSummary + ']';
    var combinedMessage = rawMsg ? (metaPrefix + '\n\n' + rawMsg) : metaPrefix;

    var payload = {
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      service: form.service.value,
      pairs: pairsLabel,
      urgency: urgLabel,
      pickup: isPickupChecked,
      pickupAddress: pickupAddressVal,
      message: combinedMessage,
      consent: form.consent.checked,
      botcheck: form.botcheck.value
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
      submitBtn.disabled = false;
      if(result.ok){
        status.textContent = successText ? successText.textContent : '';
        status.classList.add('is-success');
        form.reset();
        selectPill('pairs', '1');
        selectPill('urgency', 'normal');
        if (pickupBox) pickupBox.classList.remove('is-active');
        if (pickupAddressWrap) pickupAddressWrap.classList.remove('is-open');
      } else {
        status.textContent = errorText ? errorText.textContent : '';
        status.classList.add('is-error');
      }
    }).catch(function(){
      submitBtn.disabled = false;
      status.textContent = errorText ? errorText.textContent : '';
      status.classList.add('is-error');
    });
  });
})();
