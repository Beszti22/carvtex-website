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
