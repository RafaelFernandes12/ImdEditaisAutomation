// Fills the live Google Form's fields. Runs in the ISOLATED world but operates
// on the shared page DOM. Google Forms is Angular-driven, so setting a value is
// not enough — we use the native value setter and dispatch input/change so the
// framework registers the change, and click the real option widgets.
//
// Question types: 0=short text, 1=paragraph, 2=radio, 3=dropdown, 4=checkbox.
// Anything else is attempted as text and logged if it fails.
(function () {
  function entryNumber(entryId) {
    return String(entryId).replace('entry.', '');
  }

  // Locate the question's list item by the entry id embedded in [data-params].
  function findContainer(entryId) {
    const num = entryNumber(entryId);
    const holders = document.querySelectorAll('[data-params]');
    for (const h of holders) {
      const params = h.getAttribute('data-params') || '';
      if (params.includes(num)) {
        return h.closest('[role="listitem"]') || h;
      }
    }
    return null;
  }

  function setNativeValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillText(container, value) {
    const el = container.querySelector('input[type="text"], textarea');
    if (!el) return false;
    setNativeValue(el, String(value));
    return true;
  }

  function clickOption(container, role, value) {
    const target = String(value).trim();
    // Preferred: option carries its text in data-value.
    let el = container.querySelector(
      `[role="${role}"][data-value="${CSS.escape(target)}"]`,
    );
    if (!el) {
      // Fallback: match by accessible label / text content.
      const candidates = container.querySelectorAll(`[role="${role}"]`);
      for (const c of candidates) {
        const label = (c.getAttribute('aria-label') || c.textContent || '')
          .trim();
        if (label === target) {
          el = c;
          break;
        }
      }
    }
    if (!el) return false;
    el.click();
    return true;
  }

  function fillDropdown(container, value) {
    const listbox = container.querySelector('[role="listbox"]');
    if (!listbox) return false;
    listbox.click(); // open
    // Options may render into the listbox or a detached popup; try both.
    const target = String(value).trim();
    const scopes = [container, document];
    for (const scope of scopes) {
      const options = scope.querySelectorAll('[role="option"]');
      for (const o of options) {
        const label = (o.getAttribute('data-value') ||
          o.getAttribute('aria-label') ||
          o.textContent ||
          '').trim();
        if (label === target) {
          o.click();
          return true;
        }
      }
    }
    return false;
  }

  function fillOne(question, answer) {
    const container = findContainer(question.entryId);
    if (!container) return { entryId: question.entryId, ok: false, reason: 'no-container' };

    let ok = false;
    switch (question.type) {
      case 0:
      case 1:
        ok = fillText(container, answer);
        break;
      case 2:
        ok = clickOption(container, 'radio', answer);
        break;
      case 3:
        ok = fillDropdown(container, answer);
        break;
      case 4: {
        const values = Array.isArray(answer) ? answer : [answer];
        ok = values.every((v) => clickOption(container, 'checkbox', v));
        break;
      }
      default:
        ok = fillText(container, answer);
    }
    return { entryId: question.entryId, ok, reason: ok ? '' : 'fill-failed' };
  }

  // Exposed to content.js (same isolated world). Returns per-question results.
  window.GFAI_fill = function (questions, answers) {
    const byEntry = new Map(answers.map((a) => [a.entryId, a.answer]));
    const results = [];
    for (const q of questions) {
      if (!byEntry.has(q.entryId)) continue;
      results.push(fillOne(q, byEntry.get(q.entryId)));
    }
    return results;
  };
})();
