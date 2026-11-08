import { buildInfo } from './version';
import { useRef, useState } from 'react';
import { VersionIndicator } from './VersionIndicator';

type Notice = 'privacy' | 'impressum' | 'legal';
const titles: Record<Notice, string> = { privacy: 'Privacy & local processing', impressum: 'Impressum', legal: 'Legal notes & license' };

export function AppFooter() {
  const desktop = buildInfo.channel === 'desktop';
  const sourceRef = buildInfo.commit || (buildInfo.channel === 'github-pages-preview' ? 'develop' : 'main');
  const [notice, setNotice] = useState<Notice>('privacy');
  const dialog = useRef<HTMLDialogElement>(null);
  const open = (next: Notice) => { setNotice(next); dialog.current?.showModal(); };
  return <footer className="app-footer">
    <span className="footer-privacy"><span className="footer-privacy-full">Nothing is uploaded. Processing stays on your device.</span><span className="footer-privacy-short">Local processing · no uploads</span></span>
    <nav className="footer-links" aria-label="Legal information">
      <button onClick={() => open('privacy')} aria-haspopup="dialog">Privacy</button>
      <button onClick={() => open('impressum')} aria-haspopup="dialog">Impressum</button>
      <button onClick={() => open('legal')} aria-haspopup="dialog">Legal notes</button>
    </nav>
    <VersionIndicator/>
    <dialog className="legal-dialog" ref={dialog} aria-labelledby="legal-heading" onKeyDown={e => e.stopPropagation()}>
      <div className="legal-heading"><h2 id="legal-heading">{titles[notice]}</h2><form method="dialog"><button aria-label="Close legal information">×</button></form></div>
      <div className="legal-content">
        {notice === 'privacy' && <>
          <h3>Your spectra stay on this device</h3>
          <p>MossA does not upload spectrum files, calibration references, projects, or fit results. Import, preprocessing, calibration, fitting, plotting, and export all run locally {desktop ? 'in this app' : 'in your browser'} on your computer. There is no server-side fitting service.</p>
          <h3>Local autosave</h3>
          <p>The whole project, including every spectrum, model, calibration reference, completed fit, and layout, is saved in this {desktop ? 'application' : 'browser'} on this device using IndexedDB, with a local-storage fallback. Undo/Redo history stays in memory. {desktop ? 'Removing the application’s saved data removes the autosave. Browser and desktop autosaves are separate; use a .mossa file to transfer projects.' : 'Clearing this site’s browser data removes the autosave.'} Use Save project to keep a portable backup on your computer.</p>
          <h3>Hosting & update checks</h3>
          {desktop ? <p>This desktop app bundles its program files, fitting engine, fonts, searchable manual, and tutorial data. Analysis and documentation work without internet. It makes no automatic website update checks. External links open in your default application when you choose them.</p> : <p>The public app is hosted on GitHub Pages. Loading the app downloads its program files, and update checks request a small build-information file. These requests contain no spectrum, project, or fit data. GitHub logs visitor IP addresses for security purposes when serving GitHub Pages. See <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection" target="_blank" rel="noreferrer">GitHub Pages data collection</a> and the <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">GitHub Privacy Statement</a>.</p>}
          <h3>Analytics & external links</h3>
          <p>MossA includes no analytics, advertising, or tracking cookies. External websites and email links are opened only when you choose them; their providers’ privacy policies apply.</p>
        </>}
        {notice === 'impressum' && <>
          <h3>Publisher & person responsible for content</h3>
          <address>Prof. Dr. Clemens Prescher<br/>c/o Chair of Geomaterials and Crystalline Materials<br/>University of Freiburg<br/>Hermann-Herder-Str. 5<br/>79104 Freiburg im Breisgau<br/>Germany</address>
          <h3>Contact</h3>
          <p>Email: <a href="mailto:clemens.prescher@geomat.uni-freiburg.de">clemens.prescher@geomat.uni-freiburg.de</a><br/>Telephone: <a href="tel:+497612036436">+49 761 203 6436</a></p>
          <p>MossA is published by Clemens Prescher. The university address above is the publisher’s work contact address.</p>
          <p><a href="https://github.com/CPrescher/MossA" target="_blank" rel="noreferrer">MossA source code & project information ↗</a></p>
        </>}
        {notice === 'legal' && <>
          <h3>Open-source software</h3>
          <p>MossA 2 is developed by Clemens Prescher and contributors. The application source is licensed under the MIT License. The repository retains the original MATLAB application and its history. Third-party dependencies retain their own licenses.</p>
          <p><a href="./LICENSE.txt" target="_blank" rel="noreferrer">Read the MIT license</a> · <a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Third-party notices</a>{desktop && <> · <a href="./DESKTOP_NOTICES.txt" target="_blank" rel="noreferrer">Desktop &amp; manual notices</a></>} · <a href={`https://github.com/CPrescher/MossA/tree/${sourceRef}`} target="_blank" rel="noreferrer">Browser version source ↗</a></p>
          <h3>Warranty & scientific use</h3>
          <p>The software is provided without warranty, to the extent permitted by applicable law, as described in the license. This version is a scientific preview. Check fitted models, residuals, calibration standards, and uncertainty assumptions before using results in research or teaching.</p>
          <p>The scope and validation limits are documented in the <a href={`https://github.com/CPrescher/MossA/blob/${sourceRef}/PORTING.md`} target="_blank" rel="noreferrer">porting notes ↗</a>.</p>
        </>}
      </div>
    </dialog>
  </footer>;
}
