import {
  html,
  render,
} from 'https://unpkg.com/htm@latest/preact/index.mjs?module';
import { useState } from 'https://unpkg.com/preact@latest/hooks/dist/hooks.module.js?module';

function SiteForm({ create = false }) {
  const [newSite, setNewSite] = useState({});
  const [error, setError] = useState(null);
  const [siteKey, setSiteKey] = useState(null);
  const [siteUpdated, setSiteUpdated] = useState(false);

  const onChange = (att) => (e) => {
    setNewSite((prev) => ({ ...prev, [att]: e.target.value }));
  };

  const onClick = async (e) => {
    e.preventDefault();
    setSiteUpdated(false);
    setError(null);

    const result = await fetch(
      create ? '/_register/' : `/_register/${newSite.siteId}`,
      {
        method: create ? 'POST' : 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSite),
      }
    );

    if (result.status === 400) {
      const { message } = await result.json();
      setError(message);
      return;
    }

    if (result.status === 403) {
      const { message } = await result.json();
      setError(message);
      return;
    }

    if (result.status === 404) {
      const { message } = await result.json();
      setError(message);
      return;
    }

    if (result.status >= 300) {
      setError('Unknown error, try again later...');
      return;
    }

    setNewSite({});

    if (create) {
      const { key } = await result.json();
      setSiteKey(key);
    } else {
      setSiteUpdated(true);
    }
  };

  return html`<div class="card">
    <header>
      <h2>${create ? 'Create new site' : 'Update site'}</h2>
    </header>
    <div class="content">
      <form>
        <div class="field">
          <label>
            Site Id:
            <input value=${newSite.siteId || ''} onChange=${onChange('siteId')}
          /></label>
          <p class="help-text">Only letters and '_' are accepted.</p>
        </div>
        <div class="field">
          <label>
            Name:
            <input value=${newSite.name || ''} onChange=${onChange('name')}
          /></label>
          <p class="help-text">This name will appears in sent email.</p>
        </div>
        <div class="field">
          <label>
            Email from:
            <input
              value=${newSite.emailFrom || ''}
              onChange=${onChange('emailFrom')}
            />
          </label>
          <p class="help-text">
            All sent email for this site will have this origin.
          </p>
        </div>

        ${create &&
        html`<div class="field">
          <label>
            Owner:
            <input value=${newSite.owner || ''} onChange=${onChange('owner')} />
          </label>
          <p class="help-text">
            This is the site owner email. Confirmation links are sent to this
            address.
          </p>
        </div>`}
      </form>

      ${error && html`<p class="text-error">${error}</p>`}
      ${siteKey &&
      html`<p class="text-success">
          Success! Please, save the site encryption key:
          <input value=${siteKey} onChange=${(e) => e.preventDefault()} />
          this is the last opportunity to read it.
        </p>
        <p class="text-success">
          Now you must confirm the site creation before using it, you will
          receive an email at the 'owner' address with a confirmation link.
        </p>`}
      ${siteUpdated &&
      html` <p class="text-success">
        Success! Now you must confirm the site update by visiting the
        confirmation link we have just sent to the owner email.
      </p>`}
    </div>
    <footer>
      <button
        class="button primary"
        onClick=${onClick}
        disabled=${!newSite.siteId}
      >
        ${create ? 'Create site' : 'Update site'}
      </button>
    </footer>
  </div>`;
}

function App() {
  return html`<div class="container">
    <div class="row">
      <div class="col-4" />
      <div class="col"><h1>Ricochet.js admin</h1></div>
    </div>
    <div class="row">
      <div class="col-2" />
      <div class="col-4">
        <${SiteForm} create />
      </div>
      <div class="col-4">
        <${SiteForm} />
      </div>
    </div>
  </div>`;
}

render(html`<${App} />`, document.body);
