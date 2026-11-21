(function(){
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if(toggle && links){
    toggle.addEventListener('click', function(){
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('nav-open', open);
    });
    links.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-open');
      });
    });
  }

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasFinePointer = window.matchMedia('(hover: hover)').matches;

  /* ----- Stagger: reveal siblings animate in sequence ----- */
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
    if(el.getAttribute('data-counted') === 'true') return;
    el.setAttribute('data-counted', 'true');
    var target = parseFloat(el.getAttribute('data-count'));
    if(isNaN(target)) return;
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    if(prefersReduced){ el.textContent = prefix + target + suffix; return; }
    var start = null, dur = 1400;
    function step(ts){
      if(start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
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
          if(entry.target.hasAttribute('data-count')) countUp(entry.target);
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
  var heroImg = document.querySelector('.hero-media img');
  var ticking = false;
  function onScroll(){
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    if(progress){ progress.style.transform = 'scaleX(' + (docH > 0 ? y / docH : 0) + ')'; }
    if(header){ header.classList.toggle('scrolled', y > 20); }
    if(heroImg && !prefersReduced && y < window.innerHeight){
      heroImg.style.transform = 'translate3d(0,' + (y * 0.14).toFixed(1) + 'px,0) scale(1.04)';
    }
    ticking = false;
  }
  window.addEventListener('scroll', function(){
    if(!ticking){ requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ----- About portrait: pointer-driven 3D tilt -----
     Skipped on touch devices (no real pointer to track - a tap would
     just leave the card stuck at whatever angle the synthetic mouse
     event implied) and when the visitor prefers reduced motion. */
  var aboutPortrait = document.getElementById('aboutPortrait');
  if(aboutPortrait && !prefersReduced && hasFinePointer){
    var tiltMax = 8;
    aboutPortrait.addEventListener('mousemove', function(e){
      var rect = aboutPortrait.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width;
      var py = (e.clientY - rect.top) / rect.height;
      var rotY = (px - 0.5) * tiltMax * 2;
      var rotX = (0.5 - py) * tiltMax * 2;
      aboutPortrait.style.transform = 'rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg)';
    });
    aboutPortrait.addEventListener('mouseleave', function(){
      aboutPortrait.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  }

  /* ----- 3D Perspective Tilt + Radial Spotlight on [data-tilt] cards ----- */
  var tiltCards = Array.prototype.slice.call(document.querySelectorAll('[data-tilt]'));
  if(tiltCards.length && !prefersReduced && hasFinePointer){
    var cardTiltMax = 5.5;
    tiltCards.forEach(function(card){
      card.addEventListener('mousemove', function(e){
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var px = x / rect.width;
        var py = y / rect.height;
        var rotY = (px - 0.5) * cardTiltMax * 2;
        var rotX = (0.5 - py) * cardTiltMax * 2;
        card.style.setProperty('--spot-x', x.toFixed(1) + 'px');
        card.style.setProperty('--spot-y', y.toFixed(1) + 'px');
        card.style.transform = 'perspective(900px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg) translateY(-3px)';
      });
      card.addEventListener('mouseleave', function(){
        card.style.transform = '';
      });
    });
  }

  /* ----- Interactive Before / After Ski Restoration Slider ----- */
  var baContainer = document.getElementById('baContainer');
  var baBeforeLayer = document.getElementById('baBeforeLayer');
  var baHandle = document.getElementById('baHandle');
  var baPresetBtns = Array.prototype.slice.call(document.querySelectorAll('.ba-preset-btn'));

  if(baContainer && baBeforeLayer && baHandle){
    var baAnimId = null;
    var currentBaPos = 5; // Starts showing Utána (CarvteX Prémium) with handle on the left (5%)
    var isDraggingBa = false;

    function setBaPos(val){
      var clamped = Math.max(2, Math.min(98, parseFloat(val) || 50));
      currentBaPos = clamped;
      baHandle.style.left = clamped + '%';
      baBeforeLayer.style.clipPath = 'inset(0 ' + (100 - clamped) + '% 0 0)';

      baContainer.classList.toggle('ba-hide-before-tag', clamped < 18);
      baContainer.classList.toggle('ba-hide-after-tag', clamped > 82);

      baPresetBtns.forEach(function(btn){
        var target = parseFloat(btn.getAttribute('data-ba-pos'));
        var isMatch = Math.abs(clamped - target) <= 10;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });
    }

    function animateBaPos(targetVal, duration){
      if(baAnimId) cancelAnimationFrame(baAnimId);
      var startVal = currentBaPos;
      var target = Math.max(2, Math.min(98, parseFloat(targetVal) || 50));
      var startTime = performance.now();
      var dur = duration || 280;

      function step(now){
        var elapsed = now - startTime;
        var progress = Math.min(1, elapsed / dur);
        var ease = 1 - Math.pow(1 - progress, 3);
        var cur = startVal + (target - startVal) * ease;
        setBaPos(cur);
        if(progress < 1){
          baAnimId = requestAnimationFrame(step);
        } else {
          baAnimId = null;
        }
      }
      baAnimId = requestAnimationFrame(step);
    }

    function handleBaPointer(e){
      var rect = baContainer.getBoundingClientRect();
      var clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
      var x = clientX - rect.left;
      var pct = (x / rect.width) * 100;
      setBaPos(pct);
    }

    baContainer.addEventListener('mousedown', function(e){
      isDraggingBa = true;
      if(baAnimId) cancelAnimationFrame(baAnimId);
      handleBaPointer(e);
    });

    window.addEventListener('mousemove', function(e){
      if(!isDraggingBa) return;
      handleBaPointer(e);
    });

    window.addEventListener('mouseup', function(){
      isDraggingBa = false;
    });

    baContainer.addEventListener('touchstart', function(e){
      isDraggingBa = true;
      if(baAnimId) cancelAnimationFrame(baAnimId);
      handleBaPointer(e);
    }, { passive: true });

    window.addEventListener('touchmove', function(e){
      if(!isDraggingBa) return;
      handleBaPointer(e);
    }, { passive: true });

    window.addEventListener('touchend', function(){
      isDraggingBa = false;
    });

    baPresetBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        animateBaPos(btn.getAttribute('data-ba-pos'));
      });
    });

    setBaPos(5);
  }

  /* ----- 3-Click Service Diagnostic Finder ----- */
  var finderRoot = document.getElementById('serviceFinder');
  if(finderRoot){
    var state = {
      base: 'scratched',   // 'scratched' | 'smooth'
      edge: 'slipping',    // 'slipping' | 'ok'
      quantity: '1'        // '1' | '2' | '3+'
    };
    var currentStep = 1;

    var steps = Array.prototype.slice.call(finderRoot.querySelectorAll('.finder-step'));
    var dots = Array.prototype.slice.call(finderRoot.querySelectorAll('.step-dot'));
    var optBtns = Array.prototype.slice.call(finderRoot.querySelectorAll('.finder-opt'));
    var titleEl = document.getElementById('finderTitle');
    var descEl = document.getElementById('finderDesc');
    var promoEl = document.getElementById('finderPromo');
    var ctaEl = document.getElementById('finderCtaBtn');
    var resetBtn = document.getElementById('finderResetBtn');

    function goToStep(stepNum){
      currentStep = stepNum;
      steps.forEach(function(s){
        var sNum = parseInt(s.getAttribute('data-step'), 10);
        s.classList.toggle('active', sNum === currentStep);
      });
      dots.forEach(function(d){
        var dNum = parseInt(d.getAttribute('data-step-dot'), 10);
        d.classList.toggle('active', dNum === currentStep);
      });
    }

    dots.forEach(function(dot){
      dot.style.cursor = 'pointer';
      dot.addEventListener('click', function(){
        var targetStep = parseInt(dot.getAttribute('data-step-dot'), 10);
        if(targetStep) goToStep(targetStep);
      });
    });

    function updateFinderRecommendation(){
      var isPremium = (state.base === 'scratched' || state.edge === 'slipping');
      var lang = document.documentElement.lang || 'hu';
      var serviceName = isPremium ? 'Prémium szerviz' : 'Alapszerviz';

      if(titleEl){
        titleEl.setAttribute('data-i18n', isPremium ? 'svc2Title' : 'svc1Title');
        titleEl.textContent = isPremium ? 'Prémium szerviz' : 'Alapszerviz';
      }

      if(descEl){
        descEl.setAttribute('data-i18n', isPremium ? 'finderRecReasonPrem' : 'finderRecReasonBase');
        if(isPremium){
          descEl.textContent = (lang === 'en')
            ? 'Complete ski restoration: deep gouge repair with P-Tex, machine edge tuning, performance hot waxing and DIN binding calibration.'
            : 'Mély sérülések feltöltése P-Tex anyaggal, oldal- és alsó él precíziós gépi élezése, hőillesztett melegwaxolás és biztonsági kötéskalibráció.';
        } else {
          descEl.textContent = (lang === 'en')
            ? 'Ideal for regular in-season maintenance: machine edge sharpening, hot iron wax and multi-brush polishing for skis with sound bases.'
            : 'Ideális szezonközi frissítéshez: gépi élélezés, hőillesztett melegwaxolás és többkefés polírozás ép talpú léceknek.';
        }
      }

      if(promoEl){
        if(state.quantity === '2'){
          promoEl.style.display = 'block';
          promoEl.innerHTML = (lang === 'en')
            ? '🎿 <strong>Family/Duo Bonus:</strong> -10% discount on total service fee!'
            : '🎿 <strong>Páros kedvezmény:</strong> -10% kedvezmény a teljes munkadíjból!';
        } else if(state.quantity === '3+'){
          promoEl.style.display = 'block';
          promoEl.innerHTML = (lang === 'en')
            ? '🚚 <strong>Family Special:</strong> -15% discount + FREE pickup & return delivery within 20 km!'
            : '🚚 <strong>Családi csomag:</strong> -15% kedvezmény + INGYENES háztól-házig szállítás 20 km-en belül!';
        } else {
          promoEl.style.display = 'none';
          promoEl.innerHTML = '';
        }
      }

      if(ctaEl){
        var url = '/kapcsolat?service=' + encodeURIComponent(serviceName) +
                  '&pairs=' + encodeURIComponent(state.quantity);
        if(state.quantity === '3+'){
          url += '&pickup=yes';
        }
        ctaEl.setAttribute('href', url);
      }

      if(window.applyLang){
        window.applyLang(lang);
      }
    }

    optBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        var q = btn.getAttribute('data-q');
        var val = btn.getAttribute('data-val');
        if(!q || !val) return;
        state[q] = val;

        optBtns.forEach(function(other){
          if(other.getAttribute('data-q') === q){
            var isSel = (other === btn);
            other.classList.toggle('selected', isSel);
            other.setAttribute('aria-pressed', isSel ? 'true' : 'false');
          }
        });

        if(currentStep === 1){
          goToStep(2);
        } else if(currentStep === 2){
          goToStep(3);
        }

        updateFinderRecommendation();
      });
    });

    if(resetBtn){
      resetBtn.addEventListener('click', function(){
        state = { base: 'scratched', edge: 'slipping', quantity: '1' };
        optBtns.forEach(function(btn){
          var q = btn.getAttribute('data-q');
          var val = btn.getAttribute('data-val');
          var isDefault = (q === 'base' && val === 'scratched') ||
                          (q === 'edge' && val === 'slipping') ||
                          (q === 'quantity' && val === '1');
          btn.classList.toggle('selected', isDefault);
          btn.setAttribute('aria-pressed', isDefault ? 'true' : 'false');
        });
        goToStep(1);
        updateFinderRecommendation();
      });
    }

    optBtns.forEach(function(btn){
      var q = btn.getAttribute('data-q');
      var val = btn.getAttribute('data-val');
      var isDefault = (q === 'base' && val === 'scratched') ||
                      (q === 'edge' && val === 'slipping') ||
                      (q === 'quantity' && val === '1');
      btn.classList.toggle('selected', isDefault);
      btn.setAttribute('aria-pressed', isDefault ? 'true' : 'false');
    });

    goToStep(1);
    updateFinderRecommendation();
  }

  /* ----- Floating contact button (call / WhatsApp speed-dial) ----- */
  var contactFab = document.getElementById('contactFab');
  var contactFabToggle = document.getElementById('contactFabToggle');
  if(contactFab && contactFabToggle){
    function closeFab(){
      contactFab.classList.remove('open');
      contactFabToggle.setAttribute('aria-expanded', 'false');
    }
    contactFabToggle.addEventListener('click', function(){
      var open = contactFab.classList.toggle('open');
      contactFabToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function(e){
      if(contactFab.classList.contains('open') && !contactFab.contains(e.target)){ closeFab(); }
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && contactFab.classList.contains('open')){
        closeFab();
        contactFabToggle.focus();
      }
    });
  }
})();
