const a=require('node:assert/strict'),vm=require('vm'),fs=require('fs');
const calls=[];let pending,bridge;
function PalmServiceBridge(){bridge=this;this.call=(uri,payload)=>calls.push({uri,payload:JSON.parse(payload)});this.cancel=()=>this.cancelled=true;}
const ctx={PalmServiceBridge,setTimeout(fn){pending=fn;return 1;},clearTimeout(){pending=null;}};
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../../launcher/native-bootstrap.js'),'utf8'),ctx);
a.equal(calls.length,1);a.equal(calls[0].payload.id,'com.local.nativehome');a.equal(calls[0].payload.params.nativeHomeAuto,true);
bridge.onservicecallback('{"returnValue":true}');a.equal(pending,null);a.equal(calls.length,1);
// Launcher-only installs and the webOS 4 helper (started by its service) must never be launched from here.
for(const CONFIG of [{noHelper:true},{helperStatus:'service'}]){calls.length=0;
 vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../../launcher/native-bootstrap.js'),'utf8'),Object.assign({CONFIG},ctx));
 a.equal(calls.length,0);}
console.log('PASS: launcher requests only guarded automatic start, no retry/relaunch loop');
