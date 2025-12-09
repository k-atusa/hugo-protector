(function () {
  if (!window.crypto || !window.crypto.subtle) {
    console.error('[hugo-protector] Web Crypto API (crypto.subtle) is not available in this browser.');
    return;
  }
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const subtle = window.crypto.subtle;

  const ensureStyles = () => {
    if (document.getElementById('hugo-protector-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'hugo-protector-styles';
    style.textContent = '[data-hugo-protector-mode="block"]{white-space:pre-wrap;word-break:break-word;}';
    document.head.appendChild(style);
  };

  const escapeHtml = text => {
    if (text == null) {
      return '';
    }
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const escapeAttribute = value => {
    if (value == null) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const renderInlineMarkdown = text => {
    if (!text) {
      return '';
    }
    // Process markdown syntax BEFORE escaping so that *, `, [ are still present
    return text
      .replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${escapeHtml(c)}</strong>`)
      .replace(/\*([^*]+)\*/g, (_m, c) => `<em>${escapeHtml(c)}</em>`)
      .replace(/`([^`]+)`/g, (_m, c) => `<code>${escapeHtml(c)}</code>`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => `<a href="${escapeAttribute(url)}" rel="noopener noreferrer">${escapeHtml(label)}</a>`)
      // Escape any remaining plain text (chars outside the tags we just inserted)
      .replace(/(?<=>)([^<]+)(?=<)/g, (_m, c) => escapeHtml(c));
  };

  const markdownToHtml = markdown => {
    if (!markdown) {
      return '';
    }
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let inCodeBlock = false;
    let codeBuffer = [];
    let inList = false;
    let listItems = [];
    let paragraph = [];

    const flushParagraph = () => {
      if (paragraph.length) {
        html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
        paragraph = [];
      }
    };

    const flushList = () => {
      if (inList) {
        html.push(`<ul>${listItems.join('')}</ul>`);
        listItems = [];
        inList = false;
      }
    };

    const flushCode = () => {
      if (codeBuffer.length) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer = [];
      }
    };

    lines.forEach(line => {
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          flushParagraph();
          flushList();
          inCodeBlock = true;
          return;
        }
        inCodeBlock = false;
        flushCode();
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        return;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length;
        html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
        return;
      }

      const listMatch = line.match(/^\s*[-*+]\s+(.*)$/);
      if (listMatch) {
        flushParagraph();
        if (!inList) {
          inList = true;
          listItems = [];
        }
        listItems.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
        return;
      }

      const quoteMatch = line.match(/^\s*>\s?(.*)$/);
      if (quoteMatch) {
        flushParagraph();
        flushList();
        html.push(`<blockquote>${renderInlineMarkdown(quoteMatch[1])}</blockquote>`);
        return;
      }

      paragraph.push(line.trim());
    });

    if (inCodeBlock) {
      flushCode();
    } else {
      flushParagraph();
      flushList();
    }

    return html.join('');
  };

  const renderContent = (plaintext, format) => {
    if (format === 'markdown') {
      return markdownToHtml(plaintext);
    }
    return plaintext;
  };

  const base64ToUint8Array = base64 => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const concatUint8Arrays = (a, b) => {
    const combined = new Uint8Array(a.length + b.length);
    combined.set(a, 0);
    combined.set(b, a.length);
    return combined;
  };

  const parsePayload = payloadBase64 => {
    try {
      const json = atob(payloadBase64);
      return JSON.parse(json);
    } catch (error) {
      throw new Error('Invalid payload format');
    }
  };

  const deriveKey = async (password, salt, iterations) => {
    const keyMaterial = await subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['decrypt']
    );
  };

  const decryptPayload = async (payloadBase64, password) => {
    const payload = parsePayload(payloadBase64);
    const salt = base64ToUint8Array(payload.salt);
    const iv = base64ToUint8Array(payload.iv);
    const ciphertext = base64ToUint8Array(payload.ct);
    const tag = base64ToUint8Array(payload.tag);
    const combined = concatUint8Arrays(ciphertext, tag);

    const key = await deriveKey(password, salt, payload.iter || 310000);

    const plaintextBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128
      },
      key,
      combined
    );
    return decoder.decode(plaintextBuffer);
  };

  const createForm = (options = {}) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'hugo-protector-form';

    const form = document.createElement('form');
    form.autocomplete = 'off';

    const label = document.createElement('label');
    label.textContent = options.prompt || 'Enter password';
    form.appendChild(label);

    const input = document.createElement('input');
    input.type = 'password';
    input.required = true;
    input.placeholder = options.placeholder || 'Password';

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = options.buttonText || 'Unlock';

    const hint = document.createElement('div');
    hint.className = 'hugo-protector-hint';
    hint.textContent = options.hint || '';

    const message = document.createElement('div');
    message.className = 'hugo-protector-message';

    form.appendChild(input);
    form.appendChild(submit);
    if (options.hint) {
      wrapper.appendChild(hint);
    }
    wrapper.appendChild(form);
    wrapper.appendChild(message);

    return { wrapper, form, input, message };
  };

  const renderError = (target, message) => {
    target.textContent = message;
    target.dataset.state = 'error';
  };

  const clearMessage = target => {
    target.textContent = '';
    target.dataset.state = '';
  };

  const injectHTML = (target, html) => {
    target.innerHTML = html;
  };

  const mountBlock = el => {
    const payload = el.getAttribute('data-hugo-protector-payload');
    if (!payload) {
      return;
    }
    const prompt = el.getAttribute('data-hugo-protector-prompt');
    const hint = el.getAttribute('data-hugo-protector-hint');
    const button = el.getAttribute('data-hugo-protector-button');
    const format = (el.getAttribute('data-hugo-protector-format') || 'html').toLowerCase();

    const { wrapper, form, input, message } = createForm({
      prompt,
      hint,
      buttonText: button
    });

    el.innerHTML = '';
    el.appendChild(wrapper);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      clearMessage(message);
      const password = input.value || '';
      if (!password) {
        renderError(message, 'Password is required');
        return;
      }
      form.classList.add('is-working');
      try {
        const plaintext = await decryptPayload(payload, password);
        const rendered = renderContent(plaintext, format);
        injectHTML(el, rendered);
      } catch (error) {
        renderError(message, 'Unable to decrypt payload');
      } finally {
        form.classList.remove('is-working');
        input.value = '';
      }
    });
  };

  const mountFullPage = el => {
    const payload = el.getAttribute('data-hugo-protector-payload');
    if (!payload) {
      return;
    }
    const targetSelector = el.getAttribute('data-hugo-protector-target') || 'main';
    const target = document.querySelector(targetSelector);
    const { wrapper, form, input, message } = createForm({
      prompt: el.getAttribute('data-hugo-protector-prompt') || 'Enter password to view this page'
    });
    wrapper.classList.add('hugo-protector-page-form');
    el.innerHTML = '';
    el.appendChild(wrapper);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      clearMessage(message);
      const password = input.value || '';
      if (!password) {
        renderError(message, 'Password is required');
        return;
      }
      form.classList.add('is-working');
      try {
        const plaintext = await decryptPayload(payload, password);
        if (target) {
          injectHTML(target, plaintext);
          el.remove();
        } else {
          injectHTML(el, plaintext);
        }
      } catch (error) {
        renderError(message, 'Unable to decrypt payload');
      } finally {
        form.classList.remove('is-working');
        input.value = '';
      }
    });
  };

  const initBlocks = () => {
    const blocks = document.querySelectorAll('[data-hugo-protector-mode="block"]');
    blocks.forEach(el => {
      if (!el.dataset.hugoProtectorReady) {
        mountBlock(el);
        el.dataset.hugoProtectorReady = 'true';
      }
    });
  };

  const initFullPage = () => {
    const page = document.querySelector('[data-hugo-protector-mode="page"]');
    if (page && !page.dataset.hugoProtectorReady) {
      mountFullPage(page);
      page.dataset.hugoProtectorReady = 'true';
    }
  };

  const init = () => {
    ensureStyles();
    initBlocks();
    initFullPage();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HugoProtector = {
    decryptPayload,
    refresh: init
  };
})();
