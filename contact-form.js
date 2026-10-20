(function(){
  var form = document.getElementById('contactForm');
  if(!form) return;

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

    var payload = {
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      service: form.service.value,
      message: form.message.value,
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
