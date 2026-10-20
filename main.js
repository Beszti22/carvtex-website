(function(){
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  toggle.addEventListener('click', function(){
    var open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  links.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(){
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----- Stagger: reveal siblings animate in sequence ----- */
  var groups = {};
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  revealEls.forEach(function(el){
    var parent = el.parentNode;
    if(!parent) return;
    var siblings = parent.querySelectorAll(':scope > .reveal');
    if(siblings.length > 1){
      var idx = Array.prototype.indexOf.call(siblings, el);
      el.style.setProperty('--reveal-delay', Math.min(idx, 6) * 90 + 'ms');
    }
  });

  /* ----- Count-up for stat numbers ----- */
  function countUp(el){
    var target = parseFloat(el.getAttribute('data-count'));
    if(isNaN(target)) return;
    var suffix = el.getAttribute('data-suffix') || '';
    if(prefersReduced){ el.textContent = target + suffix; return; }
    var start = null, dur = 1400;
    function step(ts){
      if(start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ----- Reveal on scroll ----- */
  if(prefersReduced || !('IntersectionObserver' in window)){
    revealEls.forEach(function(el){ el.classList.add('in-view'); });
    document.querySelectorAll('[data-count]').forEach(countUp);
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          entry.target.querySelectorAll('[data-count]').forEach(countUp);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function(el){ io.observe(el); });
  }

  /* ----- Scroll progress bar + sticky-nav shrink + hero parallax ----- */
  var progress = document.getElementById('scrollProgress');
  var header = document.querySelector('header.site-header');
  var heroImg = document.querySelector('.hero-visual img');
  var ticking = false;
  function onScroll(){
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    if(progress){ progress.style.transform = 'scaleX(' + (docH > 0 ? y / docH : 0) + ')'; }
    if(header){ header.classList.toggle('scrolled', y > 20); }
    if(heroImg && !prefersReduced && y < window.innerHeight){
      heroImg.style.setProperty('--parallax', (y * 0.12).toFixed(1) + 'px');
    }
    ticking = false;
  }
  window.addEventListener('scroll', function(){
    if(!ticking){ requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ----- Gallery lightbox (with prev/next navigation) ----- */
  var galleryGrid = document.getElementById('galleryGrid');
  var lightbox = document.getElementById('lightbox');
  if(galleryGrid && lightbox){
    var lbImg = document.getElementById('lightboxImg');
    var lbCaption = document.getElementById('lightboxCaption');
    var lbClose = document.getElementById('lightboxClose');
    var lbPrev = document.getElementById('lightboxPrev');
    var lbNext = document.getElementById('lightboxNext');
    var lbCounter = document.getElementById('lightboxCounter');
    var lastFocused = null;
    var galleryImgs = Array.prototype.slice.call(galleryGrid.querySelectorAll('img'));
    var currentIndex = 0;

    function renderLightbox(index){
      currentIndex = (index + galleryImgs.length) % galleryImgs.length;
      var imgEl = galleryImgs[currentIndex];
      lbImg.src = imgEl.src;
      lbImg.alt = imgEl.alt || '';
      lbCaption.textContent = imgEl.getAttribute('data-caption') || imgEl.alt || '';
      if(lbCounter){ lbCounter.textContent = (currentIndex + 1) + ' / ' + galleryImgs.length; }
    }
    function openLightbox(imgEl){
      lastFocused = document.activeElement;
      renderLightbox(galleryImgs.indexOf(imgEl));
      lightbox.classList.add('open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      lbClose.focus();
    }
    function closeLightbox(){
      lightbox.classList.remove('open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if(lastFocused){ lastFocused.focus(); }
    }
    function showPrev(){ renderLightbox(currentIndex - 1); }
    function showNext(){ renderLightbox(currentIndex + 1); }

    galleryImgs.forEach(function(img){
      img.addEventListener('click', function(){ openLightbox(img); });
      img.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openLightbox(img); }
      });
    });
    lbClose.addEventListener('click', closeLightbox);
    if(lbPrev){ lbPrev.addEventListener('click', function(e){ e.stopPropagation(); showPrev(); }); }
    if(lbNext){ lbNext.addEventListener('click', function(e){ e.stopPropagation(); showNext(); }); }
    lightbox.addEventListener('click', function(e){
      if(e.target === lightbox){ closeLightbox(); }
    });
    document.addEventListener('keydown', function(e){
      if(!lightbox.classList.contains('open')) return;
      if(e.key === 'Escape'){ closeLightbox(); }
      else if(e.key === 'ArrowLeft'){ showPrev(); }
      else if(e.key === 'ArrowRight'){ showNext(); }
    });

    /* basic touch-swipe support for mobile */
    var touchStartX = null;
    lightbox.addEventListener('touchstart', function(e){ touchStartX = e.changedTouches[0].clientX; }, { passive: true });
    lightbox.addEventListener('touchend', function(e){
      if(touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if(Math.abs(dx) > 40){ dx > 0 ? showPrev() : showNext(); }
      touchStartX = null;
    }, { passive: true });
  }

  /* ----- Newsletter signup (footer form, present on every page) ----- */
  var newsletterForm = document.getElementById('newsletterForm');
  if(newsletterForm){
    var nlEmailInput = document.getElementById('newsletterEmail');
    var nlConsentInput = document.getElementById('newsletterConsent');
    var nlBotcheckInput = document.getElementById('newsletterBotcheck');
    var nlSubmitBtn = document.getElementById('newsletterSubmitBtn');
    var nlStatus = document.getElementById('newsletterStatus');
    var nlSendingText = document.getElementById('i18nNewsletterSending');
    var nlSuccessText = document.getElementById('i18nNewsletterSuccess');
    var nlErrorText = document.getElementById('i18nNewsletterError');

    newsletterForm.addEventListener('submit', function(e){
      e.preventDefault();
      if(!newsletterForm.checkValidity()){ newsletterForm.reportValidity(); return; }

      nlStatus.textContent = '';
      nlStatus.classList.remove('is-error', 'is-success');
      nlSubmitBtn.disabled = true;
      if(nlSendingText){ nlStatus.textContent = nlSendingText.textContent; }

      var payload = {
        email: nlEmailInput.value,
        consent: nlConsentInput.checked,
        botcheck: nlBotcheckInput.value
      };

      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(res){
        return res.json().catch(function(){ return {}; }).then(function(json){
          return { ok: res.ok && json.ok, json: json };
        });
      }).then(function(result){
        nlSubmitBtn.disabled = false;
        if(result.ok){
          nlStatus.textContent = nlSuccessText ? nlSuccessText.textContent : '';
          nlStatus.classList.add('is-success');
          newsletterForm.reset();
        } else {
          nlStatus.textContent = nlErrorText ? nlErrorText.textContent : '';
          nlStatus.classList.add('is-error');
        }
      }).catch(function(){
        nlSubmitBtn.disabled = false;
        nlStatus.textContent = nlErrorText ? nlErrorText.textContent : '';
        nlStatus.classList.add('is-error');
      });
    });
  }
})();
