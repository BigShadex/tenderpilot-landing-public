const DEFAULT_ONBOARDING_CONFIG = {
  endpoint: 'https://formsubmit.co/ajax/tenderpilot.ops@gmail.com',
  method: 'POST',
  contentType: 'application/json',
  headers: {
    Accept: 'application/json',
  },
};

async function loadOnboardingConfig() {
  const candidates = [
    './onboarding.endpoint.json',
    '../config/onboarding.endpoint.example.json',
  ];

  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) continue;
      return await res.json();
    } catch (_err) {
      // try next config candidate
    }
  }

  return DEFAULT_ONBOARDING_CONFIG;
}

async function loadPaymentsConfig() {
  const candidates = [
    '../config/payments.local.json',
    '../config/payments.example.json',
  ];

  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) continue;
      return await res.json();
    } catch (_err) {
      // try next candidate
    }
  }
  return null;
}

function checkoutUrlForProvider(plan, provider) {
  if (!plan || !provider) return '';
  if (provider === 'stripe') return String(plan.stripe?.paymentLink || '').trim();
  if (provider === 'gumroad') return String(plan.gumroad?.productUrl || '').trim();
  if (provider === 'lemonSqueezy') return String(plan.lemonSqueezy?.checkoutUrl || '').trim();
  return '';
}

function applyPaymentLinks(config) {
  const buttons = document.querySelectorAll('[data-plan-checkout]');
  if (!buttons.length) return;

  const provider = String(config?.activeProvider || 'stripe').trim();
  const plans = config?.plans || {};

  buttons.forEach((btn) => {
    const planKey = String(btn.getAttribute('data-plan-checkout') || '').trim();
    const plan = plans?.[planKey];
    const url = checkoutUrlForProvider(plan, provider);

    if (url) {
      btn.href = url;
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('disabled');
      btn.textContent = `Start ${plan?.name || planKey}`;
    } else {
      btn.href = '#cta';
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('disabled');
      btn.textContent = 'Join waitlist';
    }
  });
}

function leadPayload(form) {
  const fd = new FormData(form);
  const payload = {
    name: String(fd.get('name') || '').trim(),
    email: String(fd.get('email') || '').trim(),
    company: String(fd.get('company') || '').trim(),
    trade: String(fd.get('trade') || '').trim(),
    region: String(fd.get('region') || '').trim(),
    source: 'landing_page',
    consent: Boolean(fd.get('consent')),
    submittedAt: new Date().toISOString(),
  };

  payload._subject = 'TenderPilot early-access lead';
  payload.message = `Lead: ${payload.name} | ${payload.email} | ${payload.company} | ${payload.trade} | ${payload.region}`;
  return payload;
}

function persistLeadLocal(payload) {
  const key = 'tenderpilot_leads';
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.push(payload);
  localStorage.setItem(key, JSON.stringify(existing));
}

function showStatus(form, message, isError = false) {
  const el = form.querySelector('[data-form-status]');
  if (!el) return;
  el.textContent = message;
  el.className = isError ? 'form-status error' : 'form-status';
}

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('.lead-form');

  const [onboardingConfig, paymentsConfig] = await Promise.all([
    loadOnboardingConfig(),
    loadPaymentsConfig(),
  ]);

  applyPaymentLinks(paymentsConfig);

  if (!form) return;

  if (onboardingConfig?.endpoint) form.action = onboardingConfig.endpoint;
  if (onboardingConfig?.method) form.method = String(onboardingConfig.method).toLowerCase();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = leadPayload(form);

    if (!payload.consent) {
      showStatus(form, 'Please confirm consent before submitting.', true);
      return;
    }

    persistLeadLocal(payload);

    if (!onboardingConfig?.endpoint) {
      showStatus(form, 'Saved locally (endpoint not configured yet).');
      form.reset();
      return;
    }

    try {
      const resp = await fetch(onboardingConfig.endpoint, {
        method: onboardingConfig.method || 'POST',
        headers: {
          'Content-Type': onboardingConfig.contentType || 'application/json',
          ...(onboardingConfig.headers || {}),
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showStatus(form, 'Thanks — details received. We will send your sample matches shortly.');
      form.reset();
    } catch (_err) {
      showStatus(form, 'Saved locally. Endpoint unavailable right now.', true);
    }
  });
});
