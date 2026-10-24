'use strict';
// Startup service for the webOS 4 Home Helper (Node 0.12, ES5 only), installed by
// install-windows.sh --webos4 in place of native/service/service.js. A persistent activity calls
// tick every 30 s; tick launches the helper at most once per boot and never while its heartbeat is
// fresh: launching it again while it runs stalls every later app launch on webOS 4.
// This jail cannot read the helper's files, so the helper reports beat/stopped here over the bus.
var fs = require('fs'), Service = require('webos-service'), bootState = require('./boot-state');
var service = new Service('com.local.nativehome.service');
var statePath = __dirname + '/state/startup-state.json', activityName = 'com.local.nativehome.boot';
var alivePath = '/tmp/com.local.nativehome.alive'; // tmpfs: gone after a reboot, no flash writes

function read() { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) { return {enabled: false}; } }
function save(state) { fs.writeFileSync(statePath + '.tmp', JSON.stringify(state)); fs.renameSync(statePath + '.tmp', statePath); }
function boot() {
  return bootState.identity(fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), fs.readFileSync('/proc/stat', 'utf8'));
}
function alive() {
  try { return Date.now() - Number(fs.readFileSync(alivePath, 'utf8')) < 30000; } catch (e) { return false; }
}
function beat() { fs.writeFileSync(alivePath, String(Date.now())); }
function complete(message, result) {
  if (message.payload.$activity && message.activity) {
    service.activityManager.complete(message.activity, {restart: true}, function () { message.respond({returnValue: true, result: result}); });
  } else message.respond({returnValue: true, result: result});
}
function guarded(handler) {
  return function (m) { try { handler(m); } catch (e) { m.respond({returnValue: false, errorText: String(e)}); } };
}

service.register('status', guarded(function (m) {
  var state = read();
  m.respond({returnValue: true, alive: alive(), blocked: state.blocked === true, state: state, boot: boot()});
}));

service.register('beat', guarded(function (m) { beat(); m.respond({returnValue: true}); }));

// Called by the helper when it exits; an emergency stop (hold Home) keeps it from restarting.
service.register('stopped', guarded(function (m) {
  try { fs.unlinkSync(alivePath); } catch (e) {}
  var state = read();
  state.blocked = m.payload.blocked === true;
  save(state);
  m.respond({returnValue: true});
}));

// Called by the helper at start: this boot is covered; (re)create the persistent activity.
service.register('arm', guarded(function (m) {
  save({enabled: true, boot: boot(), blocked: false});
  beat();
  service.call('luna://com.palm.activitymanager/create', {
    activity: {
      name: activityName, description: 'Start Home Helper once per boot',
      type: {foreground: true, persist: true}, schedule: {interval: '30s', precise: true},
      callback: {method: 'luna://com.local.nativehome.service/tick', params: {}}
    },
    start: true, replace: true, subscribe: false
  }, function (r) { m.respond({returnValue: true, create: r.payload}); });
}));

service.register('tick', function (m) {
  try {
    var state = read();
    if (state.blocked === true) { complete(m, {blocked: true}); return; }
    if (alive()) { complete(m, {alive: true}); return; }
    var next = bootState.claim(state, boot(), false);
    if (!next) { complete(m, {skipped: true}); return; }
    // Persist before launching: a crash or watchdog exit must never create a launch loop.
    next.claimedAt = Date.now();
    save(next);
    service.call('luna://com.webos.applicationManager/launch', {id: 'com.local.nativehome', params: {nativeHomeAuto: true}},
      function (r) { next.launch = r.payload; save(next); complete(m, r.payload); });
  } catch (e) { complete(m, {returnValue: false, errorText: String(e)}); }
});
