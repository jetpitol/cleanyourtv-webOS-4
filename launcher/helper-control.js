/* Explicit recovery after long Home. Never clear a stop marker on page load. */
(function () {
  'use strict';
  var busy = false, checking = false, stopped = false, statusDenied = false;
  function rpc(uri, payload, callback) {
    var bridge, timer, done = false;
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (bridge) { try { bridge.cancel(); } catch (_) {} }
      callback(result);
    }
    try {
      bridge = new PalmServiceBridge();
      bridge.onservicecallback = function (raw) {
        var result;
        try { result = JSON.parse(raw); } catch (_) { result = {returnValue:false}; }
        finish(result);
      };
      timer = setTimeout(function () { finish({returnValue:false}); }, 5000);
      bridge.call(uri, JSON.stringify(payload));
    } catch (_) { finish({returnValue:false}); }
  }
  // webOS 4 helper: it is not on the bus, so its startup service reports whether it is alive.
  var viaService = !!(window.CONFIG && CONFIG.helperStatus === 'service');
  function serviceStatus(callback) {
    rpc('luna://com.local.nativehome.service/status', {}, function (result) {
      callback(result.returnValue === true && typeof result.alive === 'boolean' ? !result.alive : null);
    });
  }
  function check() {
    // Launcher-only installs have no helper to resume.
    if (checking || busy || document.hidden || statusDenied || (window.CONFIG && CONFIG.noHelper)) return;
    checking = true;
    if (viaService) {
      serviceStatus(function (isStopped) {
        checking = false;
        // Unknown status must never be presented as a stopped helper.
        stopped = isStopped === true;
        // The service can answer before app.js has loaded; the next 5 s check applies it then.
        if (window.setHelperResumeVisible) window.setHelperResumeVisible(stopped);
      });
      return;
    }
    rpc('luna://com.webos.service.bus/signal/registerServerStatus', {serviceName:'com.local.nativehome', subscribe:true}, function (result) {
      checking = false;
      if (result.returnValue !== false && typeof result.connected === 'boolean') {
        stopped = !result.connected;
        window.setHelperResumeVisible(stopped);
      } else {
        // Unknown status must never be presented as a stopped helper.
        // Manual recovery remains available through the Home Helper app.
        stopped = false;
        window.setHelperResumeVisible(false);
        if (/denied|permission/i.test(result.errorText || '')) statusDenied = true;
      }
    });
  }
  window.HelperControl = {resume: function () {
    if (busy || !stopped) return;
    busy = true;
    window.helperResumeMessage('Enabling Home control…');
    if (viaService) {
      // Re-check right before launching: launching a running helper stalls webOS 4.
      serviceStatus(function (isStopped) {
        if (isStopped === true) { launchHelper(); return; }
        busy = false; stopped = false;
        if (window.setHelperResumeVisible) window.setHelperResumeVisible(false);
      });
      return;
    }
    launchHelper();
  }};
  function launchHelper() {
    rpc('luna://com.webos.applicationManager/launch', {id:'com.local.nativehome', params:{}}, function (result) {
      busy = false;
      if (result.returnValue === true) {
        window.helperResumeMessage('Home helper opened');
        check();
      }
      else window.helperResumeMessage('Could not enable Home control. Try again.');
    });
  }
  document.addEventListener('visibilitychange', check);
  document.addEventListener('webOSRelaunch', check);
  setInterval(check, 5000);
  check();
}());
