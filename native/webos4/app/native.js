'use strict';
// Home Helper controller for webOS 4 (Node 0.12, ES5 only), installed by install-windows.sh --webos4
// in place of native/app/native.js. No webos-service (it fails to load here) and no SSAP watchers, so
// only short Home is handled. The relay keeps its own safety exits: hold Home 2 s, or no heartbeat 2 s.
// Never launch this app while it runs: on webOS 4 that relaunch stalls every later app launch (black
// screen). So it reports a heartbeat to its startup service (the service's jail cannot read this app's
// files), and the service and the launcher launch it only when that heartbeat is stale.
var fs = require('fs'), cp = require('child_process');
var root = '/media/developer/apps/usr/palm/applications/com.local.nativehome';
var data = root + '/state';
var params = {};
try { params = JSON.parse(process.argv[2] || '{}'); } catch (e) {}
var automatic = params.nativeHomeAuto === true;

// Service-triggered starts respect an emergency stop; a start from the launcher's Resume clears it.
if (automatic && fs.existsSync(data + '/blocked')) process.exit(0);
if (!automatic) { try { fs.unlinkSync(data + '/blocked'); } catch (e) {} }

var logPath = data + '/controller.log';
fs.writeFileSync(logPath, '');
function log(event, detail) {
  var entry = {time: Date.now(), event: event};
  if (detail !== undefined) entry.detail = detail;
  try { fs.appendFileSync(logPath, JSON.stringify(entry) + '\n'); } catch (e) {}
}
function monotonic() { var t = process.hrtime(); return t[0] * 1000 + t[1] / 1e6; }

var child = null, ready = false, stopping = false, launching = false, buffer = '', lastAck = monotonic();
var timer = null, lastBeat = 0;

function luna(uri, payload, done) {
  cp.execFile('/usr/bin/luna-send-pub', ['-n', '1', uri, JSON.stringify(payload)], {timeout: 5000}, function (err, out) {
    var ok = !err && /"returnValue"\s*:\s*true/.test(String(out));
    if (done) done(ok, ok ? 'ok' : String(err || out).slice(0, 300));
  });
}
function heartbeat() { luna('luna://com.local.nativehome.service/beat', {}); }
function launchHome(done) {
  luna('luna://com.webos.applicationManager/launch', {id: 'com.gathin.tvhome'}, function (ok, detail) {
    log('launch', detail);
    if (done) done(ok);
  });
}

function finish(code, signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  log('relay-exit', {code: code, signal: signal});
  // The relay leaves state/blocked on an emergency stop; tell the service so it does not restart us.
  luna('luna://com.local.nativehome.service/stopped', {blocked: fs.existsSync(data + '/blocked')}, function (ok, detail) {
    log('stopped', detail);
    if (!ready) { process.exit(0); return; }
    // Release any key the relay was holding down on the forwarded device before leaving.
    cp.spawn(root + '/relay', ['cleanup'], {stdio: 'ignore'}).on('exit', function () { process.exit(0); });
  });
}

function start() {
  child = cp.spawn(root + '/relay', [], {stdio: ['pipe', 'pipe', 'pipe']});
  log('relay-start', child.pid);
  child.stdin.on('error', function () {});
  child.stderr.on('data', function (b) { log('relay-stderr', String(b)); });
  child.on('error', function (e) { log('relay-error', String(e)); finish(1); });
  child.on('exit', finish);
  child.stdout.on('data', function (b) {
    buffer += b;
    var i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      var line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (line === 'P') { lastAck = monotonic(); continue; }
      log('relay', line);
      if (line === 'READY') { ready = true; lastAck = monotonic(); }
      if (line === 'HOME' && !stopping && !launching) {
        launching = true;
        launchHome(function () { launching = false; });
      }
    }
  });
  // Relay heartbeat every 400 ms (it exits and ungrabs the remote after 2 s of silence);
  // service heartbeat every 10 s for the startup service and the launcher.
  timer = setInterval(function () {
    if (stopping) return;
    if (monotonic() - lastAck > 2500) { log('relay-watchdog'); child.kill('SIGKILL'); return; }
    child.stdin.write('P');
    if (Date.now() - lastBeat >= 10000) { lastBeat = Date.now(); heartbeat(); }
  }, 400);
}

process.on('uncaughtException', function (e) {
  log('error', String(e && e.stack || e));
  if (child && !stopping) child.stdin.end();
  setTimeout(function () { process.exit(2); }, 2500);
});
process.on('SIGTERM', function () { if (child && !stopping) child.stdin.write('Q'); else process.exit(0); });

log('start', {pid: process.pid, automatic: automatic});
if (!automatic) launchHome();
// Mark this boot as covered (also the first heartbeat) and keep the once-per-boot activity in place.
lastBeat = Date.now();
luna('luna://com.local.nativehome.service/arm', {}, function (ok, detail) { log('arm', detail); });
start();
