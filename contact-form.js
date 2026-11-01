(function(){
  var form = document.getElementById('contactForm');
  if(!form) return;

  var selectedPairs = '1';
  var selectedUrgency = 'normal';
  var pillBtns = Array.prototype.slice.call(form.querySelectorAll('.form-pill'));

  function selectPill(group, val) {
    pillBtns.forEach(function (btn) {
      if (btn.getAttribute('data-pill-group') === group) {
        var match = btn.getAttribute('data-pill-val') === val;
        btn.setAttribute('aria-pressed', match ? 'true' : 'false');
      }
    });
    if (group === 'pairs') selectedPairs = val;
    if (group === 'urgency') selectedUrgency = val;
  }

  pillBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var group = btn.getAttribute('data-pill-group');
      var val = btn.getAttribute('data-pill-val');
      if (group && val) selectPill(group, val);
    });
  });

  // Pre-select service option and pairs if navigated with ?service=...&pairs=...
  try {
    var params = new URLSearchParams(window.location.search);
    var requestedService = params.get('service');
    var requestedPairs = params.get('pairs');
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
    var rawMsg = (form.message.value || '').trim();
    var metaPrefix = '[Sílécek száma: ' + pairsLabel + ' | Időzítés: ' + urgLabel + ']';
    var combinedMessage = rawMsg ? (metaPrefix + '\n\n' + rawMsg) : metaPrefix;

    var payload = {
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      service: form.service.value,
      pairs: pairsLabel,
      urgency: urgLabel,
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
