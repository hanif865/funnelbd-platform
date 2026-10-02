/* FunnelBD — client-side tracking.
 * Captures attribution, loads FB/GA4/TikTok pixels for enabled platforms, and
 * fires browser-side events with the SAME event_id the server uses, so the
 * platforms deduplicate the browser + server copies. */
(function () {
  'use strict';

  var T = window.__TRACKING__ || {};
  var F = window.__FUNNEL__ || {};
  var fb = T.facebook || {};
  var ga = T.google || {};
  var tt = T.tiktok || {};

  // ── cookie helpers ──
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    var m = document.cookie.match('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : '';
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'e-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // ── 1. Ensure first-party fbp & ttp cookies for 100% match capability ──
  function ensureFbp() {
    var fbp = getCookie('_fbp');
    if (!fbp) {
      fbp = 'fb.1.' + Date.now() + '.' + Math.floor(1000000000 + Math.random() * 9000000000);
      setCookie('_fbp', fbp, 90);
    }
    return fbp;
  }

  function ensureTtp() {
    var ttp = getCookie('_ttp') || getCookie('fbd_ttp');
    if (!ttp) {
      ttp = uuid();
      setCookie('fbd_ttp', ttp, 90);
    } else {
      setCookie('fbd_ttp', ttp, 90);
    }
    return ttp;
  }

  // ── 2. Capture click ids, ad campaigns + UTM into first-party cookies (30 days) ──
  function captureAttribution() {
    ensureFbp();
    ensureTtp();

    var p = new URLSearchParams(location.search);

    // Meta Click ID & fbc formatting
    var fbclid = p.get('fbclid');
    if (fbclid) {
      setCookie('fbd_fbclid', fbclid, 30);
      setCookie('_fbc', 'fb.1.' + Date.now() + '.' + fbclid, 30);
    }

    // Google Click ID & Privacy Click IDs
    var gclid = p.get('gclid');
    if (gclid) setCookie('fbd_gclid', gclid, 30);
    var wbraid = p.get('wbraid');
    if (wbraid) setCookie('fbd_wbraid', wbraid, 30);
    var gbraid = p.get('gbraid');
    if (gbraid) setCookie('fbd_gbraid', gbraid, 30);

    // TikTok Click ID
    var ttclid = p.get('ttclid');
    if (ttclid) setCookie('fbd_ttclid', ttclid, 30);

    // Meta / Ad Campaign IDs
    var campId = p.get('campaign_id') || p.get('campaignId') || p.get('campaign');
    if (campId) setCookie('fbd_campaign_id', campId, 30);
    var adId = p.get('ad_id') || p.get('adId');
    if (adId) setCookie('fbd_ad_id', adId, 30);
    var adsetId = p.get('adset_id') || p.get('adsetId');
    if (adsetId) setCookie('fbd_adset_id', adsetId, 30);

    // Standard UTM parameters
    ['source', 'medium', 'campaign', 'content', 'term', 'id'].forEach(function (k) {
      var v = p.get('utm_' + k);
      if (v) setCookie('fbd_utm_' + k, v, 30);
    });
  }

  // ── GA4 client id from the _ga cookie (GA1.1.XX.YY → XX.YY) ──
  function gaClientId() {
    var raw = getCookie('_ga');
    if (!raw) return '';
    var parts = raw.split('.');
    return parts.length >= 4 ? parts[2] + '.' + parts[3] : '';
  }
  window.fbdGaClientId = gaClientId;

  // ── 3. Load pixel base libraries (only enabled platforms) ──
  // Third-party pixel SCRIPTS are the heaviest thing on the page (~250KB and
  // ~600ms of main-thread work for Facebook alone), so they are downloaded only
  // after the page is usable: on the visitor's first interaction, or ~3.5s after
  // load — whichever comes first. The fbq/ttq/gtag stubs exist immediately, so
  // every event fired before that is queued and sent once the script arrives
  // (same event ids → dedup with the server-side mirror still works). Visitors
  // who leave earlier are still counted via the server-side PageView.
  var pendingScripts = [];
  var thirdPartyReleased = false;
  function injectScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }
  function deferScript(src) {
    if (thirdPartyReleased) injectScript(src);
    else pendingScripts.push(src);
  }
  function releaseThirdParty() {
    if (thirdPartyReleased) return;
    thirdPartyReleased = true;
    pendingScripts.splice(0).forEach(injectScript);
  }
  (function scheduleRelease() {
    ['pointerdown', 'touchstart', 'keydown', 'scroll', 'mousemove'].forEach(function (ev) {
      window.addEventListener(ev, releaseThirdParty, { once: true, passive: true, capture: true });
    });
    function afterLoad() { setTimeout(releaseThirdParty, 3500); }
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad);
  })();

  function loadFacebook(pixelId) {
    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      deferScript(v);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', pixelId);
  }

  function loadTikTok(pixelId) {
    /* eslint-disable */
    !(function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = (w[t] = w[t] || []);
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
      ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e };
      ttq.load = function (e, n) {
        var r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r; ttq._t = ttq._t || {}; ttq._t[e] = +new Date();
        ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        deferScript(r + '?sdkid=' + e + '&lib=' + t);
      };
      ttq.load(pixelId); ttq.page();
    })(window, document, 'ttq');
    /* eslint-enable */
  }

  function loadGoogle(measurementId) {
    deferScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId));
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
    if (ga.adsConversionId) window.gtag('config', ga.adsConversionId);
  }

  // ── Current checkout selection (for value on initiate/purchase/cart) ──
  function currentSelection() {
    var card = document.querySelector('.offer-card.selected');
    var price = card ? parseFloat(card.getAttribute('data-price')) || 0 : 0;
    var offerId = card ? card.getAttribute('data-offer-id') : (F.defaultOfferId || (F.offers && F.offers[0] && F.offers[0].id) || '');
    var offerTitle = '';
    if (card) {
      var tEl = card.querySelector('.offer-title, .wcf-item-title, h4');
      if (tEl) offerTitle = tEl.textContent.trim();
    }
    if (!offerTitle && F.offers && F.offers.length) {
      var found = F.offers.find ? F.offers.find(function (o) { return o.id === offerId; }) : F.offers[0];
      if (found) {
        offerTitle = found.title;
        if (!price) price = found.price;
      }
    }
    var qtyEl = document.getElementById('qty');
    var qty = 1;
    if (qtyEl) { qty = parseInt(String(qtyEl.value).replace(/[^\d]/g, ''), 10) || 1; }
    return { offerId: offerId, offerTitle: offerTitle, price: price, qty: qty, value: price * qty };
  }

  function typedField(name) {
    var el = document.querySelector('#orderForm [name="' + name + '"]');
    return el && el.value ? el.value.trim() : '';
  }

  // ── Server mirror beacon (same event_id → dedup) ──
  function beacon(moment, eventId, extra) {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        // sourceUrl = the real page URL (e.g. main domain) for event_source_url.
        body: JSON.stringify(Object.assign({ moment: moment, eventId: eventId, sourceUrl: location.origin + location.pathname }, extra || {})),
      }).catch(function () {});
    } catch (e) {}
  }

  // ── 4. Event firing ──

  // PageView & ViewContent (safely deduplicated with matching event IDs)
  function firePageView() {
    var pvEventId = 'pv_' + uuid();
    var vcEventId = 'vc_' + uuid();
    var contentIds = F.productId ? [String(F.productId)] : [];

    if (window.fbq) {
      window.fbq('track', 'PageView', {}, { eventID: pvEventId });
      window.fbq('track', 'ViewContent', { content_type: 'product', content_ids: contentIds, currency: 'BDT' }, { eventID: vcEventId });
    }
    if (window.ttq) {
      window.ttq.track('ViewContent', { contents: contentIds.map(function (id) { return { content_id: id }; }), content_type: 'product', currency: 'BDT' }, { event_id: vcEventId });
    }
    if (window.gtag && ga.enabled) {
      window.gtag('event', 'page_view');
      window.gtag('event', 'view_item', { currency: 'BDT', items: contentIds.map(function (id) { return { item_id: id }; }) });
    }

    // Mirror server-side with matching event IDs for 100% safe deduplication
    beacon('pageview', pvEventId, { custom: { contentIds: contentIds, vcEventId: vcEventId } });
  }

  // AddToCart (Fires on single-product page load and whenever an offer package is chosen)
  var addToCartFired = false;
  function fireAddToCart(customSel) {
    var sel = customSel || currentSelection();
    var atcEventId = 'atc_' + uuid();
    var contentIds = sel.offerId ? [String(sel.offerId)] : (F.productId ? [String(F.productId)] : []);
    var offerTitle = sel.offerTitle || '';

    if (window.fbq) {
      window.fbq('track', 'AddToCart', {
        currency: 'BDT',
        value: sel.value,
        content_ids: contentIds,
        content_name: offerTitle,
        content_type: 'product',
        num_items: sel.qty || 1,
      }, { eventID: atcEventId });
    }
    if (window.ttq) {
      window.ttq.track('AddToCart', {
        currency: 'BDT',
        value: sel.value,
        contents: contentIds.map(function (id) {
          return { content_id: id, content_name: offerTitle, quantity: sel.qty || 1, price: sel.price || (sel.value / (sel.qty || 1)) };
        }),
        content_type: 'product',
      }, { event_id: atcEventId });
    }
    if (window.gtag && ga.enabled) {
      window.gtag('event', 'add_to_cart', {
        currency: 'BDT',
        value: sel.value,
        items: contentIds.map(function (id) {
          return { item_id: id, item_name: offerTitle, price: sel.price || (sel.value / (sel.qty || 1)), quantity: sel.qty || 1 };
        }),
      });
    }

    beacon('add_to_cart', atcEventId, {
      custom: { value: sel.value, contentIds: contentIds, numItems: sel.qty || 1 }
    });
  }
  window.fbdTrackAddToCart = fireAddToCart;

  // InitiateCheckout (Fires on typing / interaction with checkout form)
  var initiateFired = false;
  function fireInitiate() {
    if (initiateFired) return;
    initiateFired = true;

    var eventId = 'ic_' + uuid();
    var sel = currentSelection();
    var contentIds = sel.offerId ? [String(sel.offerId)] : [];

    if (window.fbq) {
      window.fbq('track', 'InitiateCheckout', {
        currency: 'BDT',
        value: sel.value,
        content_ids: contentIds,
        content_type: 'product',
        num_items: sel.qty,
      }, { eventID: eventId });
    }
    if (window.ttq) {
      window.ttq.track('InitiateCheckout', {
        currency: 'BDT',
        value: sel.value,
        contents: contentIds.map(function (id) { return { content_id: id, quantity: sel.qty }; }),
      }, { event_id: eventId });
    }
    if (window.gtag && ga.enabled) {
      window.gtag('event', 'begin_checkout', {
        currency: 'BDT',
        value: sel.value,
        items: contentIds.map(function (id) { return { item_id: id, quantity: sel.qty }; }),
      });
    }

    // Mirror server-side EXACTLY ONCE (a second server event with the same id
    // shows up as a separate "Processed" event in Meta). Wait for the richest
    // identifiers for high EMQ: send when the phone becomes valid, else after
    // 15s, else when the visitor leaves — whichever comes first.
    var initiateBeaconSent = false;
    function sendInitiateBeacon() {
      if (initiateBeaconSent) return;
      initiateBeaconSent = true;
      clearTimeout(initiateTimer);
      document.removeEventListener('input', onPhoneInput, true);
      beacon('initiate', eventId, {
        fields: {
          phone: typedField('phone'),
          name: typedField('name'),
          address: typedField('address'),
        },
        custom: { value: sel.value, contentIds: contentIds, numItems: sel.qty },
      });
    }
    function onPhoneInput() {
      var digits = String(typedField('phone') || '').replace(/\D/g, '').replace(/^88/, '');
      if (/^01[3-9]\d{8}$/.test(digits)) sendInitiateBeacon();
    }
    var initiateTimer = setTimeout(sendInitiateBeacon, 15000);
    document.addEventListener('input', onPhoneInput, true);
    window.addEventListener('pagehide', sendInitiateBeacon);
    onPhoneInput(); // phone may already be filled (autofill)
  }

  /**
   * Called by checkout.js after a successful order, using the event_id the
   * SERVER generated (returned in the checkout response). The server already
   * fired the server-side Purchase with the same id → platforms deduplicate 1:1.
   */
  window.fbdTrackPurchase = function (o) {
    o = o || {};
    var eventId = o.eventId;
    var contentIds = o.contentId ? [String(o.contentId)] : [];

    if (window.fbq) {
      window.fbq('track', 'Purchase', {
        currency: 'BDT',
        value: o.value,
        content_ids: contentIds,
        content_type: 'product',
        num_items: o.quantity || 1,
      }, { eventID: eventId });
    }
    if (window.ttq) {
      window.ttq.track('CompletePayment', {
        currency: 'BDT',
        value: o.value,
        contents: contentIds.map(function (id) { return { content_id: id, quantity: o.quantity || 1 }; }),
        content_type: 'product',
      }, { event_id: eventId });
    }
    if (window.gtag && ga.enabled) {
      // Enhanced Conversions: send normalized phone to Google Ads
      if (o.phone) {
        var digits = String(o.phone).replace(/\D/g, '');
        if (digits.startsWith('01')) digits = '+88' + digits;
        else if (digits.startsWith('8801')) digits = '+' + digits;
        window.gtag('set', 'user_data', {
          phone_number: digits,
          address: { country: 'BD' },
        });
      }

      window.gtag('event', 'purchase', {
        currency: 'BDT',
        value: o.value,
        transaction_id: String(o.orderNumber || ''),
        items: contentIds.map(function (id) { return { item_id: id, quantity: o.quantity || 1 }; }),
      });

      if (ga.adsConversionId && ga.adsConversionLabel) {
        window.gtag('event', 'conversion', {
          send_to: ga.adsConversionId + '/' + ga.adsConversionLabel,
          value: o.value,
          currency: 'BDT',
          transaction_id: String(o.orderNumber || ''),
        });
      }
    }
  };

  // ── 5. Section Dwell Time & Exit Drop-off Heatmap ──
  var sectionDwell = {};
  var sectionViews = {};
  var currentSection = 'top_banner';
  var lastSectionEnterTime = Date.now();
  var exitBeaconSent = false;

  function switchActiveSection(newSection) {
    if (!newSection || newSection === currentSection) return;
    var now = Date.now();
    var elapsedSec = Math.max(0, Math.round((now - lastSectionEnterTime) / 1000));
    if (elapsedSec > 0 && elapsedSec < 1800) {
      sectionDwell[currentSection] = (sectionDwell[currentSection] || 0) + elapsedSec;
    }
    currentSection = newSection;
    lastSectionEnterTime = now;
    sectionViews[newSection] = true;
  }

  function sendDwellBeacon(isExit) {
    var now = Date.now();
    var elapsedSec = Math.max(0, Math.round((now - lastSectionEnterTime) / 1000));
    if (elapsedSec > 0 && elapsedSec < 1800) {
      sectionDwell[currentSection] = (sectionDwell[currentSection] || 0) + elapsedSec;
    }
    lastSectionEnterTime = now;

    var payload = {
      dwell: sectionDwell,
      exitSection: isExit ? currentSection : '',
      views: Object.keys(sectionViews),
    };

    var url = '/api/analytics/section-dwell';
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(payload),
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function initSectionDwellTracker() {
    var sections = document.querySelectorAll('[data-section]');
    if (!sections.length || !('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
          var name = entry.target.getAttribute('data-section');
          if (name) switchActiveSection(name);
        }
      });
    }, { threshold: [0.25, 0.5] });

    sections.forEach(function (el) {
      observer.observe(el);
      var name = el.getAttribute('data-section');
      if (name && sectionDwell[name] === undefined) sectionDwell[name] = 0;
    });

    window.addEventListener('pagehide', function () {
      if (!exitBeaconSent) { exitBeaconSent = true; sendDwellBeacon(true); }
    });
    window.addEventListener('beforeunload', function () {
      if (!exitBeaconSent) { exitBeaconSent = true; sendDwellBeacon(true); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        sendDwellBeacon(true);
      } else {
        lastSectionEnterTime = Date.now();
        exitBeaconSent = false;
      }
    });

    setInterval(function () {
      if (document.visibilityState === 'visible') {
        sendDwellBeacon(false);
      }
    }, 20000);
  }

  // ── 6. Init ──
  function init() {
    captureAttribution();

    if (fb.enabled && fb.pixelId) loadFacebook(fb.pixelId);
    if (tt.enabled && tt.pixelId) loadTikTok(tt.pixelId);
    if (ga.enabled && ga.measurementId) loadGoogle(ga.measurementId);

    // 1. Safe dual Browser + Server PageView / ViewContent
    firePageView();

    // 2. Single-product landing funnel: fire AddToCart for the default offer
    setTimeout(function () {
      fireAddToCart();
    }, 250);

    // 3. InitiateCheckout on first interaction with form
    var form = document.getElementById('orderForm');
    if (form) {
      var onFirst = function () {
        fireInitiate();
        form.removeEventListener('input', onFirst, true);
        form.removeEventListener('focus', onFirst, true);
      };
      form.addEventListener('input', onFirst, true);
      form.addEventListener('focus', onFirst, true);
    }

    // 4. Section Dwell Time & Exit Tracker
    initSectionDwellTracker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
