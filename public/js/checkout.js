/* FunnelBD — checkout interactions (vanilla JS, no framework).
 * Live totals, quantity stepper, AJAX submit, thank-you swap, sticky bar. */
(function () {
  'use strict';

  var DATA = window.__FUNNEL__ || {};
  var offers = DATA.offers || [];
  var zones = DATA.zones || [];
  var freeDelivery = DATA.freeDelivery || { enabled: false, threshold: 0, allFree: false };

  var state = {
    offerId: DATA.defaultOfferId || (offers[0] && offers[0].id) || '',
    zoneId: DATA.defaultZoneId || (zones[0] && zones[0].id) || '',
    qty: 1,
    discount: 0,
    orderSubmitted: false,
  };

  // ── Bengali numeral formatting (matches the design aesthetic) ──
  var BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  function toBn(n) {
    return String(n).replace(/\d/g, function (d) { return BN[+d]; });
  }
  function money(n) { return toBn(n) + '৳'; }

  function findOffer(id) { for (var i = 0; i < offers.length; i++) if (offers[i].id === id) return offers[i]; return null; }
  function findZone(id) { for (var i = 0; i < zones.length; i++) if (zones[i].id === id) return zones[i]; return null; }

  // ── Core: recompute + reflect totals everywhere ──
  function recompute() {
    var offer = findOffer(state.offerId);
    var zone = findZone(state.zoneId);
    var subtotal = offer ? offer.price * state.qty : 0;

    var delivery = zone ? zone.charge : 0;
    if (freeDelivery.allFree) delivery = 0;
    else if (freeDelivery.enabled && subtotal >= (freeDelivery.threshold || 0)) delivery = 0;

    var discount = state.discount || 0;
    var total = Math.max(0, subtotal + delivery - discount);

    setText('sumSubtotal', money(subtotal));
    setText('reviewSubtotalMirror', money(subtotal));
    setText('sumDelivery', delivery === 0 ? 'ফ্রি' : money(delivery));
    setText('sumTotal', money(total));
    setText('btnTotal', money(total));
    setText('stickyTotal', money(total));

    // Discount row & alert in checkout review
    var discountRow = document.getElementById('reviewDiscountRow');
    if (discountRow) {
      discountRow.style.display = discount > 0 ? '' : 'none';
      setText('sumDiscount', money(discount));
    }
    var discAlert = document.getElementById('discountAppliedAlert');
    if (discAlert) {
      discAlert.style.display = discount > 0 ? 'flex' : 'none';
    }

    // Khaleshaat order review table synchronization
    if (offer) {
      setText('reviewProdName', offer.title);
      setText('reviewProdQty', '× ' + toBn(state.qty));
      var reviewImg = document.getElementById('reviewProdImg');
      if (reviewImg && (offer.image || (DATA.productImages && DATA.productImages[0]))) {
        reviewImg.src = offer.image || DATA.productImages[0];
      }
    }
    updateReviewVariants();
  }

  function updateReviewVariants() {
    var sizeEl = document.getElementById('f_size') || document.querySelector('[name=size]') || document.querySelector('[name=billing_shoes_size]');
    var colorEl = document.getElementById('f_color') || document.querySelector('[name=color]') || document.querySelector('[name=billing_color]');
    var sizeVal = sizeEl ? (sizeEl.value || '').trim() : '';
    var colorVal = colorEl ? (colorEl.value || '').trim() : '';

    var parts = [];
    if (sizeVal) parts.push('সাইজ: ' + sizeVal);
    if (colorVal) parts.push('কালার: ' + colorVal);

    var wrap = document.getElementById('reviewVariantWrap');
    var textEl = document.getElementById('reviewVariantText');
    if (wrap && textEl) {
      if (parts.length > 0) {
        textEl.textContent = parts.join(' · ');
        wrap.style.display = 'block';
      } else {
        wrap.style.display = 'none';
      }
    }
  }

  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

  // ── Offer selection ──
  function selectOffer(id) {
    state.offerId = id;
    document.querySelectorAll('.offer-card').forEach(function (card) {
      var on = card.getAttribute('data-offer-id') === id;
      card.classList.toggle('selected', on);
      card.classList.toggle('wcf-selected-product', on);
      var radio = card.querySelector('input[type=radio]');
      if (radio) radio.checked = on;
    });
    recompute();

    if (window.fbdTrackAddToCart) {
      var selOffer = findOffer(id);
      if (selOffer) {
        window.fbdTrackAddToCart({
          offerId: selOffer.id,
          offerTitle: selOffer.title,
          price: selOffer.price,
          qty: state.qty,
          value: selOffer.price * state.qty,
        });
      }
    }
  }

  function selectZone(id) {
    state.zoneId = id;
    document.querySelectorAll('.zone-row').forEach(function (row) {
      var on = row.getAttribute('data-zone-id') === id;
      row.classList.toggle('selected', on);
      row.classList.toggle('wcf-selected-shipping', on);
      var radio = row.querySelector('input[type=radio]');
      if (radio) radio.checked = on;
    });
    recompute();
  }

  // ── Wire up events ──
  function init() {
    document.querySelectorAll('.offer-card').forEach(function (card) {
      card.addEventListener('click', function () { selectOffer(card.getAttribute('data-offer-id')); });
    });
    document.querySelectorAll('.zone-row').forEach(function (row) {
      row.addEventListener('click', function () { selectZone(row.getAttribute('data-zone-id')); });
    });

    document.querySelectorAll('.qty-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.getAttribute('data-step'), 10) || 0;
        state.qty = Math.max(1, state.qty + step);
        var input = document.getElementById('qty');
        if (input) input.value = toBn(state.qty);
        recompute();
      });
    });

    // Smooth scroll to checkout.
    document.querySelectorAll('.js-scroll-checkout').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById('checkout');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    var form = document.getElementById('orderForm');
    if (form) {
      form.addEventListener('submit', onSubmit);
      form.addEventListener('change', updateReviewVariants);
      form.addEventListener('input', updateReviewVariants);
      wireDraftCapture(form);
    }

    // Hide sticky bar once checkout is on screen.
    var checkout = document.getElementById('checkout');
    var sticky = document.getElementById('stickyBar');
    if (checkout && sticky && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        sticky.classList.toggle('hidden', entries[0].isIntersecting);
      }, { threshold: 0.15 }).observe(checkout);
    }

    wireGallery();
    wireExitIntentModal();

    var qtyInput = document.getElementById('qty');
    if (qtyInput) qtyInput.value = toBn(state.qty);
    recompute();
  }

  // ── Gallery: thumbnails + prev/next arrows switch the main image ──
  function wireGallery() {
    var mains = document.querySelectorAll('.gmain');
    var thumbs = document.querySelectorAll('.gthumb');
    if (mains.length < 2) return;
    var cur = 0;
    function show(idx) {
      cur = (idx + mains.length) % mains.length;
      mains.forEach(function (m, i) { m.classList.toggle('active', i === cur); });
      thumbs.forEach(function (t, i) { t.classList.toggle('active', i === cur); });
    }
    thumbs.forEach(function (t) {
      t.addEventListener('click', function () { show(parseInt(t.getAttribute('data-idx'), 10) || 0); });
    });
    var prev = document.querySelector('.gnav.prev');
    var next = document.querySelector('.gnav.next');
    if (prev) prev.addEventListener('click', function () { show(cur - 1); });
    if (next) next.addEventListener('click', function () { show(cur + 1); });
  }

  // ── Incomplete-order capture: debounced draft POST as the user types ──
  var draftSent = false;
  function wireDraftCapture(form) {
    var timer = null;
    function sendDraft() {
      var fields = collectFields();
      var hasContent = Object.keys(fields).some(function (k) { return String(fields[k] || '').trim() !== ''; });
      if (!hasContent) return;
      draftSent = true;
      try {
        fetch('/api/checkout/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({ offerId: state.offerId, fields: fields }),
        }).catch(function () {});
      } catch (e) {}
    }
    // Debounce 2s after typing; also flush on blur so we don't lose a phone.
    form.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(sendDraft, 2000);
    });
    form.addEventListener('blur', function () { clearTimeout(timer); sendDraft(); }, true);
  }

  // ── Collect all dynamic form field values ──
  function collectFields() {
    var fields = {};
    document.querySelectorAll('#orderForm .field').forEach(function (wrap) {
      var name = wrap.getAttribute('data-field');
      if (!name) return;
      var checkbox = wrap.querySelector('input[type=checkbox]');
      var radio = wrap.querySelector('input[type=radio]:checked');
      var other = wrap.querySelector('input:not([type=radio]):not([type=checkbox]), textarea, select');
      if (checkbox) fields[name] = checkbox.checked ? '1' : '';
      else if (radio) fields[name] = radio.value;
      else if (other) fields[name] = other.value;
    });
    return fields;
  }

  function clearErrors() {
    document.querySelectorAll('.field-error').forEach(function (p) { p.textContent = ''; });
    var msg = document.getElementById('formMessage');
    if (msg) { msg.textContent = ''; msg.className = 'form-message'; }
  }

  function showErrors(errors) {
    Object.keys(errors || {}).forEach(function (key) {
      var p = document.querySelector('[data-error-for="' + key + '"]');
      if (p) p.textContent = errors[key];
    });
  }

  function message(text, kind) {
    var msg = document.getElementById('formMessage');
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'form-message ' + (kind || '');
  }

  // ── Read first-party tracking cookies (populated in Phase 2). ──
  function readTracking() {
    function ck(name) {
      var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
      return m ? decodeURIComponent(m[1]) : '';
    }
    return {
      fbp: ck('_fbp'),
      fbc: ck('_fbc'),
      fbclid: ck('fbd_fbclid'),
      gclid: ck('fbd_gclid'),
      ttclid: ck('fbd_ttclid'),
      ttp: ck('_ttp') || ck('fbd_ttp'),
      wbraid: ck('fbd_wbraid'),
      gbraid: ck('fbd_gbraid'),
      campaignId: ck('fbd_campaign_id'),
      adId: ck('fbd_ad_id'),
      adsetId: ck('fbd_adset_id'),
      gaClientId: (window.fbdGaClientId && window.fbdGaClientId()) || '',
      utm: {
        source: ck('fbd_utm_source'),
        medium: ck('fbd_utm_medium'),
        campaign: ck('fbd_utm_campaign'),
        content: ck('fbd_utm_content'),
        term: ck('fbd_utm_term'),
        id: ck('fbd_utm_id'),
      },
    };
  }

  // ── Submit ──
  function onSubmit(e) {
    e.preventDefault();
    clearErrors();

    var btn = document.getElementById('submitBtn');
    var fields = collectFields();
    var payload = {
      offerId: state.offerId,
      quantity: state.qty,
      deliveryZoneId: state.zoneId,
      discount: state.discount || 0,
      fields: fields,
      tracking: readTracking(),
    };

    if (btn) { btn.disabled = true; btn.classList.add('loading'); }

    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
      .then(function (res) {
        var data = res.data;
        if (res.status === 201 && data.ok) {
          state.orderSubmitted = true;
          closeExitModal();
          // Fire browser Purchase with the SERVER's event_id → platform dedup.
          if (window.fbdTrackPurchase) {
            window.fbdTrackPurchase({
              eventId: data.eventId,
              orderNumber: data.orderNumber,
              value: data.total,
              contentId: state.offerId,
              quantity: state.qty,
              phone: fields && fields.phone,
              name: fields && fields.name,
            });
          }
          showThankYou(data);
          return;
        }
        if (data.duplicate) {
          message(data.message, 'info');
          return;
        }
        if (data.errors) {
          showErrors(data.errors);
          message(data.message || 'ফর্মে কিছু ভুল আছে, ঠিক করে আবার চেষ্টা করুন।', 'error');
          return;
        }
        message(data.error || 'কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।', 'error');
      })
      .catch(function () {
        message('নেটওয়ার্ক সমস্যা — ইন্টারনেট চেক করে আবার চেষ্টা করুন।', 'error');
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
      });
  }

  function showThankYou(data) {
    var form = document.getElementById('orderForm');
    var ty = document.getElementById('thankyou');
    var num = document.getElementById('tyOrderNumber');
    var orderNumber = typeof data === 'object' ? data.orderNumber : data;
    if (num) num.textContent = '#' + toBn(orderNumber);

    if (typeof data === 'object') {
      var detailsBox = document.getElementById('tyOrderDetails');
      var summaryEl = document.getElementById('tyOrderSummary');
      var totalEl = document.getElementById('tyOrderTotal');
      if (summaryEl && data.summary) summaryEl.textContent = data.summary;
      if (totalEl && data.total) totalEl.textContent = money(data.total);
      if (detailsBox && (data.summary || data.total)) detailsBox.hidden = false;
    }

    if (form) form.hidden = true;
    if (ty) { ty.hidden = false; ty.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  // ── Exit Intent Survey & Special Discount Modal ──
  var exitModalShown = false;

  function closeExitModal() {
    var modal = document.getElementById('exitIntentModal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function openExitModal() {
    if (exitModalShown || state.orderSubmitted) return;
    try {
      if (sessionStorage.getItem('fbd_exit_modal_shown') === '1') return;
    } catch (e) {}

    exitModalShown = true;
    try { sessionStorage.setItem('fbd_exit_modal_shown', '1'); } catch (e) {}

    var mainPhone = document.querySelector('input[name="phone"]') || document.querySelector('input[type="tel"]');
    var exitPhone = document.getElementById('exitLeadPhone');
    if (exitPhone && mainPhone && mainPhone.value && !exitPhone.value) {
      exitPhone.value = mainPhone.value.trim();
    }

    var modal = document.getElementById('exitIntentModal');
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function getSelectedExitReason() {
    var checked = document.querySelector('input[name="exit_reason"]:checked');
    return checked ? checked.value : 'দাম একটু বেশি মনে হচ্ছে';
  }

  function sendExitLeadToServer(phone, reason) {
    try {
      fetch('/api/checkout/exit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          phone: phone,
          reason: reason,
          offerId: state.offerId,
        }),
      }).catch(function () {});
    } catch (e) {}
  }

  function wireExitIntentModal() {
    var modal = document.getElementById('exitIntentModal');
    if (!modal) return;

    // Reason pills single-click checkmark selection
    var pills = modal.querySelectorAll('.exit-reason-pill');
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        pills.forEach(function (p) { p.classList.remove('selected'); });
        pill.classList.add('selected');
        var radio = pill.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });

    // Close buttons & backdrop click
    var closeBtn = document.getElementById('closeExitModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeExitModal);

    var dismissBtn = document.getElementById('exitDismissBtn');
    if (dismissBtn) dismissBtn.addEventListener('click', closeExitModal);

    var successCloseBtn = document.getElementById('exitSuccessCloseBtn');
    if (successCloseBtn) successCloseBtn.addEventListener('click', closeExitModal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeExitModal();
    });

    // Action 1: "২০৳ ডিসকাউন্টে এখনই অর্ডার করব"
    var claimBtn = document.getElementById('exitClaimDiscountBtn');
    if (claimBtn) {
      claimBtn.addEventListener('click', function () {
        var exitPhone = document.getElementById('exitLeadPhone');
        var phoneVal = exitPhone ? exitPhone.value.trim() : '';
        var reason = getSelectedExitReason();

        if (phoneVal) {
          var mainPhone = document.querySelector('input[name="phone"]') || document.querySelector('input[type="tel"]');
          if (mainPhone) {
            mainPhone.value = phoneVal;
            mainPhone.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        // Always notify the server — it grants the discount per session.
        sendExitLeadToServer(phoneVal, reason);

        // Apply 20 Tk discount
        state.discount = 20;
        recompute();
        closeExitModal();

        // Smooth scroll to checkout form
        var checkoutEl = document.getElementById('checkout');
        if (checkoutEl) {
          checkoutEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    // Action 2: "প্রতিনিধি আমাকে কল দিয়ে সমাধান দিক"
    var callBtn = document.getElementById('exitRequestCallBtn');
    if (callBtn) {
      callBtn.addEventListener('click', function () {
        var exitPhone = document.getElementById('exitLeadPhone');
        var errEl = document.getElementById('exitPhoneError');
        var rawPhone = exitPhone ? exitPhone.value.trim() : '';
        var digits = rawPhone.replace(/\D/g, '');
        if (digits.length === 13 && digits.indexOf('8801') === 0) digits = digits.slice(2);

        if (!/^01[3-9]\d{8}$/.test(digits)) {
          if (errEl) errEl.textContent = 'অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)';
          if (exitPhone) exitPhone.focus();
          return;
        }
        if (errEl) errEl.textContent = '';

        var reason = getSelectedExitReason();
        callBtn.disabled = true;

        var mainPhone = document.querySelector('input[name="phone"]') || document.querySelector('input[type="tel"]');
        if (mainPhone) {
          mainPhone.value = digits;
          mainPhone.dispatchEvent(new Event('input', { bubbles: true }));
        }

        sendExitLeadToServer(digits, reason);

        var mainContent = document.getElementById('exitModalMainContent');
        var successContent = document.getElementById('exitModalSuccessContent');
        if (mainContent) mainContent.style.display = 'none';
        if (successContent) successContent.style.display = 'block';
      });
    }

    // Desktop mouseleave trigger
    document.addEventListener('mouseleave', function (e) {
      if (e.clientY <= 15) {
        openExitModal();
      }
    });

    // Mobile back button trap using History API
    try {
      if (window.history && window.history.pushState) {
        window.history.pushState({ fbdPage: true }, '', window.location.href);
        window.addEventListener('popstate', function () {
          if (!exitModalShown && !state.orderSubmitted) {
            openExitModal();
          }
        });
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
