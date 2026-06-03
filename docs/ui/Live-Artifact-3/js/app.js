// Shared app utilities — 磐石 Gateway Admin
(function() {
  'use strict';

  // ── Modal helpers ──
  window.openModal = function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('open');
  };
  window.closeModal = function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  };
  // Close modal on overlay click
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
    }
    if (e.target.classList.contains('drawer-overlay')) {
      e.target.classList.remove('open');
    }
  });

  // ── Toast notifications ──
  window.showToast = function(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s';
      setTimeout(function() { toast.remove(); }, 300);
    }, duration);
  };

  // ── Action menu toggle ──
  document.addEventListener('click', function(e) {
    document.querySelectorAll('.action-dropdown.open').forEach(function(d) {
      if (!d.contains(e.target) && d.previousElementSibling && !d.previousElementSibling.contains(e.target)) {
        d.classList.remove('open');
      }
    });
  });
  window.toggleActionMenu = function(el) {
    var dropdown = el.nextElementSibling;
    if (dropdown) dropdown.classList.toggle('open');
  };

  // ── Select all checkbox ──
  document.addEventListener('change', function(e) {
    if (e.target.closest('thead') && e.target.type === 'checkbox') {
      var checked = e.target.checked;
      var tbody = e.target.closest('table').querySelector('tbody');
      if (tbody) {
        tbody.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
          cb.checked = checked;
        });
      }
    }
  });

  // ── Row click select ──
  document.addEventListener('click', function(e) {
    var row = e.target.closest('tr[data-row-id]');
    if (row && !e.target.closest('button') && !e.target.closest('a') && !e.target.closest('input') && !e.target.closest('.action-dropdown')) {
      var checkbox = row.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = !checkbox.checked;
    }
  });

  // ── Drawer helpers ──
  window.openDrawer = function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('open');
  };
  window.closeDrawer = function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('open');
  };

  // ── Format helpers ──
  window.formatDate = function(dateStr) {
    if (!dateStr) return '-';
    return dateStr.replace('T', ' ').substring(0, 19);
  };
  window.formatFileSize = function(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  window.statusLabel = function(status) {
    if (status === 1 || status === true) return '<span class="badge badge-success"><span class="status-dot online"></span>启用</span>';
    return '<span class="badge badge-danger"><span class="status-dot offline"></span>禁用</span>';
  };
  window.nodeStatusLabel = function(status, statusDetail) {
    if (status === 1) {
      if (statusDetail && statusDetail.nginx && statusDetail.nginx.running) {
        return '<span class="badge badge-success"><span class="status-dot online"></span>运行中</span>';
      }
      return '<span class="badge badge-warning"><span class="status-dot warning"></span>异常</span>';
    }
    return '<span class="badge badge-danger"><span class="status-dot offline"></span>已停止</span>';
  };
  window.methodTags = function(methods) {
    if (!methods) return '';
    var list = methods.split(',').map(function(m) { return m.trim(); });
    return list.map(function(m) {
      var cls = 'tag-' + m.toLowerCase();
      return '<span class="tag ' + cls + '">' + m + '</span>';
    }).join(' ');
  };
  window.loadBalanceLabel = function(lb) {
    var map = {
      weighted_roundrobin: '加权轮询',
      chash: '一致性哈希',
      ewma: '延迟最小',
      least_conn: '最少连接'
    };
    return map[lb] || lb || '-';
  };
  window.roleLabel = function(role) {
    if (role === 'admin') return '<span class="badge badge-info">管理员</span>';
    return '<span class="badge badge-neutral">普通用户</span>';
  };
  window.pluginCategoryLabel = function(cat) {
    var map = { security: '安全', traffic: '流量', log: '日志', auth: '认证', serverless: '无服务', other: '其他' };
    return map[cat] || cat || '其他';
  };

  // ── JSON tools ──
  window.JSONTools = {
    format: function(str) {
      try {
        var obj = typeof str === 'string' ? JSON.parse(str) : str;
        return JSON.stringify(obj, null, 2);
      } catch(e) { return str || ''; }
    },
    minify: function(str) {
      try {
        var obj = typeof str === 'string' ? JSON.parse(str) : str;
        return JSON.stringify(obj);
      } catch(e) { return str || ''; }
    },
    parse: function(str) {
      try { return JSON.parse(str); } catch(e) { return null; }
    }
  };

  // ── URL tools ──
  window.URLTools = {
    encode: function(str) { return encodeURIComponent(str || ''); },
    decode: function(str) { try { return decodeURIComponent(str || ''); } catch(e) { return str || ''; } }
  };

  // ── Base64 tools ──
  window.Base64Tools = {
    encode: function(str) { try { return btoa(unescape(encodeURIComponent(str || ''))); } catch(e) { return ''; } },
    decode: function(str) { try { return decodeURIComponent(escape(atob(str || ''))); } catch(e) { return str || ''; } }
  };

  // ── Clipboard ──
  window.copyToClipboard = function(text) {
    if (!text) { window.showToast('没有可复制的内容', 'warning'); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        window.showToast('已复制到剪贴板', 'success');
      }).catch(function() {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  };
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); window.showToast('已复制到剪贴板', 'success'); } catch(e) { window.showToast('复制失败', 'error'); }
    document.body.removeChild(ta);
  }
  window.pasteFromClipboard = function(callback) {
    if (navigator.clipboard) {
      navigator.clipboard.readText().then(function(text) {
        if (text) { callback(text); window.showToast('已粘贴', 'success'); }
        else { window.showToast('剪贴板为空', 'warning'); }
      }).catch(function() {
        window.showToast('粘贴失败，请手动 Ctrl+V', 'warning');
      });
    } else {
      window.showToast('粘贴失败，请手动 Ctrl+V', 'warning');
    }
  };

  // ── SM4 (simplified ECB/PKCS7 for tools page) ──
  window.SM4Tools = {
    _sbox: [0xD6,0x90,0xE9,0xFE,0xCC,0xE1,0x3D,0xB7,0x16,0xB6,0x14,0xC2,0x28,0xFB,0x2C,0x05,
            0x2B,0x67,0x9A,0x76,0x2A,0xBE,0x04,0xC3,0xAA,0x44,0x13,0x26,0x49,0x86,0x06,0x99,
            0x9C,0x42,0x50,0xF4,0x91,0xEF,0x98,0x7A,0x33,0x54,0x0B,0x43,0xED,0xCF,0xAC,0x62,
            0xE4,0xB3,0x1C,0xA9,0xC9,0x08,0xE8,0x95,0x80,0xDF,0x94,0xFA,0x75,0x8F,0x3F,0xA6,
            0x47,0x07,0xA7,0xFC,0xF3,0x73,0x17,0xBA,0x83,0x59,0x3C,0x19,0xE6,0x85,0x4F,0xA8,
            0x68,0x6B,0x81,0xB2,0x71,0x64,0xDA,0x8B,0xF8,0xEB,0x0F,0x4B,0x70,0x56,0x9D,0x35,
            0x1E,0x24,0x0E,0x5E,0x63,0x58,0xD1,0xA2,0x25,0x22,0x7C,0x3B,0x01,0x21,0x78,0x87,
            0xD4,0x00,0x46,0x57,0x9F,0xD3,0x27,0x52,0x4C,0x36,0x02,0xE7,0xA0,0xC4,0xC8,0x9E,
            0xEA,0xBF,0x8A,0xD2,0x40,0xC7,0x38,0xB5,0xA3,0xF7,0xF2,0xCE,0xF9,0x61,0x15,0xA1,
            0xE0,0xAE,0x5D,0xA4,0x9B,0x34,0x1A,0x55,0xAD,0x93,0x32,0x30,0xF5,0x8C,0xB1,0xE3,
            0x1D,0xF6,0xE2,0x2E,0x82,0x66,0xCA,0x60,0xC0,0x29,0x23,0xAB,0x0D,0x53,0x4E,0x6F,
            0xD5,0xDB,0x37,0x45,0xDE,0xFD,0x8E,0x2F,0x03,0xFF,0x6A,0x72,0x6D,0x6C,0x5B,0x51,
            0x8D,0x1B,0xAF,0x92,0xBB,0xDD,0xBC,0x7F,0x11,0xD9,0x5C,0x41,0x1F,0x10,0x5A,0xD8,
            0x0A,0xC1,0x31,0x88,0xA5,0xCD,0x7B,0xBD,0x2D,0x74,0xD0,0x12,0xB8,0xE5,0xB4,0xB0,
            0x89,0x69,0x97,0x4A,0x0C,0x96,0x77,0x7E,0x65,0xB9,0xF1,0x09,0xC5,0x6E,0xC6,0x84,
            0x18,0xF0,0x7D,0xEC,0x3A,0xDC,0x4D,0x20,0x79,0xEE,0x5F,0x3E,0xD7,0xCB,0x39,0x48],
    _fk: [0xA3B1BAC6,0x56AA3350,0x677D9197,0xB27022DC],
    _ck: [0x00070E15,0x1C232A31,0x383F464D,0x545B6269,0x70777E85,0x8C939AA1,0xA8AFB6BD,0xC4CBD2D9,
          0xE0E7EEF5,0xFC030A11,0x181F262D,0x343B4249,0x50575E65,0x6C737A81,0x888F969D,0xA4ABB2B9,
          0xC0C7CED5,0xDCE3EAF1,0xF8FF060D,0x141B2229,0x30373E45,0x4C535A61,0x686F767D,0x848B9299,
          0xA0A7AEB5,0xBCC3CAD1,0xD8DFE6ED,0xF4FB0209,0x10171E25,0x2C333A41,0x484F565D,0x646B7279],
    _rotl: function(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; },
    _byteToHex: function(b) { return (b >>> 4).toString(16) + (b & 0x0f).toString(16); },
    _hexToByte: function(h) { return parseInt(h, 16); },
    _stringToByte: function(str) {
      var bytes = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 128) bytes.push(c);
        else if (c < 2048) { bytes.push((c >> 6) | 192); bytes.push((c & 63) | 128); }
        else { bytes.push((c >> 12) | 224); bytes.push(((c >> 6) & 63) | 128); bytes.push((c & 63) | 128); }
      }
      return bytes;
    },
    _byteToString: function(bytes) {
      var str = '';
      for (var i = 0; i < bytes.length;) {
        var b = bytes[i++];
        if (b < 128) str += String.fromCharCode(b);
        else if (b > 191 && b < 224) { str += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63)); }
        else { str += String.fromCharCode(((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)); }
      }
      return str;
    },
    _pkcs7Pad: function(bytes) {
      var pad = 16 - (bytes.length % 16);
      for (var i = 0; i < pad; i++) bytes.push(pad);
      return bytes;
    },
    _pkcs7Unpad: function(bytes) {
      var pad = bytes[bytes.length - 1];
      if (pad < 1 || pad > 16) return bytes;
      return bytes.slice(0, bytes.length - pad);
    },
    _keySchedule: function(keyBytes) {
      var MK = [];
      for (var i = 0; i < 4; i++) MK[i] = (keyBytes[i*4] << 24) | (keyBytes[i*4+1] << 16) | (keyBytes[i*4+2] << 8) | keyBytes[i*4+3];
      var K = [];
      for (var i = 0; i < 36; i++) {
        if (i < 4) K[i] = MK[i] ^ this._fk[i];
        else K[i] = this._rotl(K[i-4] ^ this._tau(K[i-3]) ^ this._tau(K[i-2]) ^ this._tau(K[i-1]) ^ this._ck[i-4], 1);
      }
      var rk = [];
      for (var i = 0; i < 32; i++) rk[i] = K[i+4];
      return rk;
    },
    _tau: function(A) {
      var B = [(A >>> 24) & 0xff, (A >>> 16) & 0xff, (A >>> 8) & 0xff, A & 0xff];
      for (var i = 0; i < 4; i++) B[i] = this._sbox[B[i]];
      return (B[0] << 24) | (B[1] << 16) | (B[2] << 8) | B[3];
    },
    _L: function(B) { return B ^ this._rotl(B, 2) ^ this._rotl(B, 10) ^ this._rotl(B, 18) ^ this._rotl(B, 24); },
    _L2: function(B) { return B ^ this._rotl(B, 13) ^ this._rotl(B, 23); },
    _processBlock: function(block, rk) {
      var X = [];
      for (var i = 0; i < 4; i++) X[i] = (block[i*4] << 24) | (block[i*4+1] << 16) | (block[i*4+2] << 8) | block[i*4+3];
      for (var i = 0; i < 32; i++) {
        var tmp = X[(i+1) % 4] ^ X[(i+2) % 4] ^ X[(i+3) % 4] ^ rk[i];
        X[(i+3) % 4] = X[i % 4] ^ this._L(this._tau(tmp));
      }
      var result = [];
      for (var i = 0; i < 4; i++) {
        result.push((X[i] >>> 24) & 0xff);
        result.push((X[i] >>> 16) & 0xff);
        result.push((X[i] >>> 8) & 0xff);
        result.push(X[i] & 0xff);
      }
      return result;
    },
    encrypt: function(plaintext, keyHex) {
      if (!plaintext) return '';
      keyHex = keyHex || 'a16bc20453da220f';
      var keyBytes = [];
      for (var i = 0; i < 16; i++) keyBytes.push(this._hexToByte(keyHex.substr(i*2, 2)));
      var rk = this._keySchedule(keyBytes);
      var dataBytes = this._stringToByte(plaintext);
      dataBytes = this._pkcs7Pad(dataBytes);
      var result = [];
      for (var i = 0; i < dataBytes.length; i += 16) {
        var block = dataBytes.slice(i, i+16);
        var encrypted = this._processBlock(block, rk);
        result = result.concat(encrypted);
      }
      return btoa(String.fromCharCode.apply(null, result));
    },
    decrypt: function(ciphertext, keyHex) {
      if (!ciphertext) return '';
      keyHex = keyHex || 'a16bc20453da220f';
      try {
        var keyBytes = [];
        for (var i = 0; i < 16; i++) keyBytes.push(this._hexToByte(keyHex.substr(i*2, 2)));
        var rk = this._keySchedule(keyBytes);
        var binaryStr = atob(ciphertext);
        var dataBytes = [];
        for (var i = 0; i < binaryStr.length; i++) dataBytes.push(binaryStr.charCodeAt(i));
        var result = [];
        for (var i = 0; i < dataBytes.length; i += 16) {
          var block = dataBytes.slice(i, i+16);
          var decrypted = this._processBlock(block, rk);
          result = result.concat(decrypted);
        }
        result = this._pkcs7Unpad(result);
        return this._byteToString(result);
      } catch(e) { return ''; }
    }
  };

  // ── Toggle sub tabs ──
  window.switchSubTab = function(containerId, tabName) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.sub-tab').forEach(function(t) { t.classList.remove('active'); });
    container.querySelectorAll('.tab-content').forEach(function(t) { t.classList.add('hidden'); });
    var tab = container.querySelector('.sub-tab[data-tab="' + tabName + '"]');
    if (tab) tab.classList.add('active');
    var content = container.querySelector('.tab-content[data-tab="' + tabName + '"]');
    if (content) content.classList.remove('hidden');
  };

  // ── Toggle steps wizard ──
  window.goStep = function(wizardId, step) {
    var wizard = document.getElementById(wizardId);
    if (!wizard) return;
    wizard.querySelectorAll('.step').forEach(function(s, i) {
      s.classList.remove('active', 'completed');
      if (i < step) s.classList.add('completed');
      if (i === step) s.classList.add('active');
    });
    wizard.querySelectorAll('.step-panel').forEach(function(p) { p.classList.add('hidden'); });
    var panel = wizard.querySelector('.step-panel[data-step="' + step + '"]');
    if (panel) panel.classList.remove('hidden');
  };

  // ── Toggle collapse ──
  window.toggleCollapse = function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.classList.toggle('hidden');
      var arrow = el.previousElementSibling;
      if (arrow) {
        var a = arrow.querySelector('.collapse-arrow');
        if (a) a.classList.toggle('open');
      }
    }
  };

  // ── Toggle advanced section ──
  window.toggleAdvanced = function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.classList.toggle('hidden');
      var toggle = el.previousElementSibling;
      if (toggle) toggle.classList.toggle('on');
    }
  };

  // ── Delete confirmation helper ──
  window.confirmDelete = function(message, onConfirm) {
    var modal = document.getElementById('confirm-modal');
    if (!modal) {
      // Create a minimal confirm modal
      var div = document.createElement('div');
      div.id = 'confirm-modal';
      div.className = 'modal-overlay';
      div.innerHTML = '<div class="modal"><div class="modal-header"><h2>确认操作</h2><button class="modal-close" onclick="closeModal(\'confirm-modal\')">×</button></div><div class="modal-body"><p>' + message + '</p></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal(\'confirm-modal\')">取消</button><button class="btn btn-danger" id="confirm-yes">确认</button></div></div>';
      document.body.appendChild(div);
      document.getElementById('confirm-yes').addEventListener('click', function() {
        closeModal('confirm-modal');
        if (onConfirm) onConfirm();
      });
    } else {
      modal.querySelector('.modal-body p').textContent = message;
      var btn = modal.querySelector('#confirm-yes') || modal.querySelector('.btn-danger');
      if (btn) btn.onclick = function() { closeModal('confirm-modal'); if (onConfirm) onConfirm(); };
    }
    openModal('confirm-modal');
  };

  // ── Tab/panel visibility helpers ──
  window.showPanel = function(group, id) {
    var container = document.getElementById(group);
    if (!container) return;
    container.querySelectorAll('[data-panel]').forEach(function(p) { p.classList.add('hidden'); });
    var panel = container.querySelector('[data-panel="' + id + '"]');
    if (panel) panel.classList.remove('hidden');
    container.querySelectorAll('[data-tab-trigger]').forEach(function(t) { t.classList.remove('active'); });
    var trigger = container.querySelector('[data-tab-trigger="' + id + '"]');
    if (trigger) trigger.classList.add('active');
  };

  // ── Add hidden class to CSS ──
  // (also defined in CSS utility section)
  if (!document.getElementById('hidden-style')) {
    var style = document.createElement('style');
    style.id = 'hidden-style';
    style.textContent = '.hidden { display: none !important; }';
    document.head.appendChild(style);
  }

  // ── Set active nav item ──
  document.addEventListener('DOMContentLoaded', function() {
    var page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(function(item) {
      var href = item.getAttribute('href');
      if (href === page) {
        item.classList.add('active');
      }
    });
    // Also handle edge-client, edge-import, tools pages with query params
    if (page.indexOf('?') > -1) {
      page = page.split('?')[0];
      document.querySelectorAll('.nav-item').forEach(function(item) {
        var href = item.getAttribute('href');
        if (href === page) {
          item.classList.add('active');
        }
      });
    }
  });

})();
