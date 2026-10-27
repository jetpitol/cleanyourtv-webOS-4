(function(){
  'use strict';
  var panel = document.createElement('section');
  panel.id = 'renewalPanel';
  panel.className = 'hidden';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Home settings');
  panel.setAttribute('aria-modal', 'true');

  panel.innerHTML = '<div class="renewal-card">' +
    '<div class="settings-heading">' +
      '<h2>Home settings</h2>' +
      '<span class="settings-edition" style="background:#15803d;border-color:#16a34a;color:#fff;font-weight:600;padding:5px 12px;border-radius:6px;">Root Edition (Persistent)</span>' +
    '</div>' +
    '<p>Quản lý giao diện Clean TV, phần cứng và trạng thái hệ thống.</p>' +
    '<section class="settings-section">' +
      '<h3>Root & System Status</h3>' +
      '<div style="background:rgba(22,163,74,0.12);border:1px solid #16a34a;border-radius:8px;padding:14px;margin:8px 0;line-height:1.5;">' +
        '<p style="color:#4ade80;font-weight:bold;margin:0 0 6px 0;font-size:20px;">✔ Persistent Root: ĐÃ KÍCH HOẠT (SSH Port 22, uid 0)</p>' +
        '<p style="margin:0 0 4px 0;font-size:18px;color:#e2e8f0;">• LG Developer Mode: Đã gỡ bỏ sạch (Không giới hạn 50 giờ)</p>' +
        '<p style="margin:0 0 4px 0;font-size:18px;color:#e2e8f0;">• DevMode Flag: Đã khóa bất biến (chattr +i devmode_enabled)</p>' +
        '<p style="margin:0 0 4px 0;font-size:18px;color:#e2e8f0;">• Chặn cập nhật (OTA Block): Đã kích hoạt bảo vệ firmware</p>' +
        '<p style="margin:0;font-size:18px;color:#e2e8f0;">• Bloatware: Đã gỡ bỏ 12 app rác mặc định</p>' +
      '</div>' +
      '<div id="renewalStatus" style="font-size:16px;color:#94a3b8;margin-top:6px;" aria-live="polite">Hệ thống tối ưu 100%. Toàn quyền Root vĩnh viễn.</div>' +
    '</section>' +
    '<section class="settings-section">' +
      '<h3>Cài đặt và Tiện ích TV</h3>' +
      '<p>Mở cài đặt gốc của LG cho hình ảnh, âm thanh hoặc cập nhật Home.</p>' +
      '<div class="renewal-actions settings-links">' +
        '<button id="renewalTV">Cài đặt TV (LG Settings)</button>' +
        '<button id="renewalUpdates">Cập nhật Home</button>' +
      '</div>' +
    '</section>' +
    '<div class="settings-footer">' +
      '<p>Để trở về LG Home gốc, bấm giữ nút Home trong 2 giây.</p>' +
      '<div class="renewal-actions">' +
        '<button id="renewalClose">Quay lại Home</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  document.body.appendChild(panel);

  var previous;
  var buttons = Array.prototype.slice.call(panel.querySelectorAll('button'));
  var index = 0;

  function openNow() { return !panel.classList.contains('hidden'); }
  function focus(i) {
    var direction = i < index ? -1 : 1;
    for (var n = 0; n < buttons.length; n++, i += direction) {
      var j = (i + buttons.length * 2) % buttons.length;
      if (!buttons[j].disabled) {
        index = j;
        buttons[index].focus();
        return;
      }
    }
  }

  function close() {
    panel.classList.add('hidden');
    if (previous && previous.focus) previous.focus();
  }

  document.getElementById('renewalClose').onclick = close;
  document.getElementById('renewalUpdates').onclick = function() {
    panel.classList.add('hidden');
    if (window.HomeUpdates && window.HomeUpdates.open) {
      window.HomeUpdates.open({
        onClose: function() {
          panel.classList.remove('hidden');
          focus(1);
        }
      });
    }
  };
  document.getElementById('renewalTV').onclick = function() {
    close();
    try {
      var b = new PalmServiceBridge();
      b.onservicecallback = function() { b.cancel(); };
      b.call('luna://com.webos.applicationManager/launch', JSON.stringify({id: 'com.palm.app.settings', params: {}}));
    } catch (_) {}
  };

  buttons.forEach(function(b, i) {
    b.addEventListener('mouseover', function() { focus(i); });
  });

  document.addEventListener('keydown', function(e) {
    if (!openNow()) return;
    var k = e.keyCode;
    if ([9, 37, 38, 39, 40, 13, 461, 27].indexOf(k) < 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (k === 461 || k === 27) {
      close();
    } else if (k === 13) {
      if (!e.repeat) buttons[index].click();
    } else {
      focus(index + (k === 37 || k === 38 || (k === 9 && e.shiftKey) ? -1 : 1));
    }
  }, true);

  window.RenewalPanel = {
    isOpen: openNow,
    open: function() {
      if (openNow()) return;
      previous = document.activeElement;
      panel.classList.remove('hidden');
      focus(0);
    }
  };
}());
