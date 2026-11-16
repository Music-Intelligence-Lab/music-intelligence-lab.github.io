/* In-place editing for the lab site, served by scripts/edit_server.py.
   Only loaded when the site runs through ./edit.sh. Click outlined text to edit
   its source; saving writes the YAML file and the page reloads with the change. */
(function () {
  'use strict';
  var API = 'http://127.0.0.1:4001';
  var ON_KEY = 'mil-edit-on', SCROLL_KEY = 'mil-edit-scroll';
  var on = sessionStorage.getItem(ON_KEY) !== 'off';
  var pop = null;

  var css = `
  body.mil-edit [data-edit] { outline: 1px dashed rgba(201,74,76,.55); outline-offset: 3px; cursor: text; }
  body.mil-edit [data-edit]:hover { outline: 2px solid #C94A4C; background: rgba(255,255,255,.35); }
  .edit-empty { opacity: .55; }
  body:not(.mil-edit) .edit-empty { display: none; }
  .mil-bar { position: fixed; right: 16px; bottom: 16px; z-index: 9999; display: flex; gap: 10px; align-items: center;
    background: #fff; color: #232647; border: 1px solid #232647; padding: 8px 10px; font: 13px/1.3 system-ui, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.12); }
  .mil-bar button { font: inherit; border: 1px solid #232647; background: #232647; color: #fff; padding: 4px 10px; cursor: pointer; }
  .mil-bar button.off { background: #fff; color: #232647; }
  .mil-status { max-width: 260px; }
  .mil-pop { position: absolute; z-index: 10000; background: #fff; color: #232647; border: 1px solid #232647;
    box-shadow: 0 6px 24px rgba(0,0,0,.18); padding: 12px; font: 14px/1.45 system-ui, sans-serif; }
  .mil-pop .mil-where { font-size: 12px; color: #454867; margin-bottom: 8px; }
  .mil-pop label { display: block; font-size: 12px; font-weight: 600; margin: 8px 0 3px; }
  .mil-pop textarea, .mil-pop input { width: 100%; box-sizing: border-box; font: 15px/1.5 system-ui, sans-serif; color: #111;
    border: 1px solid #9aa; padding: 8px; resize: vertical; }
  .mil-pop .mil-row { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
  .mil-pop button { font: inherit; padding: 5px 14px; cursor: pointer; border: 1px solid #232647; background: #fff; color: #232647; }
  .mil-pop button.save { background: #232647; color: #fff; }
  .mil-pop .mil-hint { font-size: 12px; color: #454867; margin-left: auto; }
  .mil-pop .mil-err { color: #A0333A; font-size: 13px; margin-top: 8px; white-space: pre-wrap; }`;
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.className = 'mil-bar';
  bar.innerHTML = '<button type="button" class="mil-toggle"></button><span class="mil-status"></span>';
  document.body.appendChild(bar);
  var toggle = bar.querySelector('.mil-toggle'), status = bar.querySelector('.mil-status');

  function setOn(v) {
    on = v;
    sessionStorage.setItem(ON_KEY, v ? 'on' : 'off');
    document.body.classList.toggle('mil-edit', v);
    toggle.textContent = v ? 'Editing on' : 'Editing off';
    toggle.classList.toggle('off', !v);
    say(v ? 'Click any outlined text to change it.' : 'Browsing. Alt-click text to edit it.');
  }
  function say(t) { status.textContent = t; }
  toggle.addEventListener('click', function () { setOn(!on); });

  function close() { if (pop) { pop.remove(); pop = null; } }

  function field(name, value) {
    var wrap = document.createElement('div');
    var lab = document.createElement('label');
    lab.textContent = name;
    var input;
    if (name === 'url') {
      input = document.createElement('input');
      input.type = 'text';
    } else {
      input = document.createElement('textarea');
      input.rows = Math.min(16, Math.max(2, Math.ceil(value.length / 70) + (value.match(/\n/g) || []).length));
    }
    input.value = value;
    input.defaultValue = value;
    input.dataset.field = name;
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  function open(el) {
    close();
    var ref = el.getAttribute('data-edit');
    var fields = el.getAttribute('data-fields');
    var q = API + '/api/get?ref=' + encodeURIComponent(ref) + (fields ? '&fields=' + encodeURIComponent(fields) : '');
    say('Loading…');
    fetch(q).then(function (r) { return r.json(); }).then(function (res) {
      if (res.error) { say(res.error); return; }
      var r = el.getBoundingClientRect();
      pop = document.createElement('div');
      pop.className = 'mil-pop';
      var width = Math.max(Math.min(r.width + 24, 760), 440);
      var left = Math.min(Math.max(8, r.left + window.scrollX - 12), window.scrollX + document.documentElement.clientWidth - width - 8);
      pop.style.width = width + 'px';
      pop.style.left = left + 'px';
      pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
      var where = document.createElement('div');
      where.className = 'mil-where';
      where.textContent = res.label;
      pop.appendChild(where);
      if (typeof res.value === 'object') {
        Object.keys(res.value).forEach(function (k) { pop.appendChild(field(k, res.value[k])); });
      } else {
        var f = field('text', res.value);
        f.querySelector('label').style.display = 'none';
        pop.appendChild(f);
      }
      var row = document.createElement('div');
      row.className = 'mil-row';
      row.innerHTML = '<button type="button" class="save">Save</button><button type="button" class="cancel">Cancel</button>' +
        '<span class="mil-hint">Cmd+Enter saves, Esc cancels. Markdown links: [text](url)</span>';
      pop.appendChild(row);
      var err = document.createElement('div');
      err.className = 'mil-err';
      pop.appendChild(err);
      document.body.appendChild(pop);
      pop.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var first = pop.querySelector('textarea, input');
      if (first) { first.focus(); first.setSelectionRange(first.value.length, first.value.length); }

      function save() {
        var inputs = pop.querySelectorAll('[data-field]');
        var value;
        if (typeof res.value === 'object') {
          value = {};
          inputs.forEach(function (i) { value[i.dataset.field] = i.value; });
        } else {
          value = inputs[0].value;
        }
        err.textContent = '';
        fetch(API + '/api/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: ref, value: value }) })
          .then(function (r) { return r.json(); })
          .then(function (out) {
            if (out.error) { err.textContent = out.error; return; }
            sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
            close();
            say('Saved. Reloading when Jekyll has rebuilt…');
            setTimeout(function () { location.reload(); }, 6000);  // if live reload does not fire
          })
          .catch(function (e) { err.textContent = 'Could not reach the edit server: ' + e; });
      }
      row.querySelector('.save').addEventListener('click', save);
      row.querySelector('.cancel').addEventListener('click', function () { close(); say(on ? 'Click any outlined text to change it.' : ''); });
      pop.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { close(); }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
      });
      say('Editing ' + res.label);
    }).catch(function (e) { say('Could not reach the edit server (is ./edit.sh running?) ' + e); });
  }

  document.addEventListener('click', function (e) {
    if (pop && pop.contains(e.target)) return;
    if (bar.contains(e.target)) return;
    var el = e.target.closest('[data-edit]');
    if (!el) { if (pop) close(); return; }
    if (!on && !e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    open(el);
  }, true);

  /* My own changes to other files make the preview reload; never lose text you are typing. */
  window.addEventListener('beforeunload', function (e) {
    if (!pop) return;
    var dirty = Array.prototype.some.call(pop.querySelectorAll('[data-field]'), function (i) { return i.value !== i.defaultValue; });
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  window.addEventListener('load', function () {
    var y = sessionStorage.getItem(SCROLL_KEY);
    if (y !== null) { sessionStorage.removeItem(SCROLL_KEY); window.scrollTo(0, +y); }
  });

  setOn(on);
})();
