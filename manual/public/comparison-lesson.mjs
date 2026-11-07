// A replay of production-WASM fits, not a second fitting implementation.
export function fRatio(q0, q1, p0, p1, n) {
  return ((q0 - q1) / (p1 - p0)) / (q1 / (n - p1));
}
export function binImprovements(values, observed, max, count = 22) {
  const bins = Array.from({ length: count }, () => ({ ordinary: 0, extreme: 0 }));
  for (const value of values) {
    const bin = bins[Math.min(count - 1, Math.floor(value / max * count))];
    bin[value >= observed ? 'extreme' : 'ordinary']++;
  }
  return bins;
}
const fmt = value => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const svgns = 'http://www.w3.org/2000/svg';
const element = (name, attrs = {}, content = '') => {
  const node = document.createElementNS(svgns, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (content) node.textContent = content;
  return node;
};
function chart(svg, width, height, title, description) {
  svg.replaceChildren(element('title', {}, title), element('desc', {}, description));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
}

class FRatioLesson extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return; this.initialized = true;
    this.classList.add('comparison-lesson');
    this.innerHTML = `<div class="lesson-title">How much improvement did four extra parameters buy?</div>
      <p class="lesson-note">Arithmetic example: 256 observations · 5 versus 9 free parameters · simpler SSE = 300</p>
      <label class="lesson-slider">Larger model SSE <output data-value></output><input type="range" min="210" max="299" value="290" aria-label="Larger model squared error"></label>
      <div class="lesson-controls"><button type="button" data-small>Small gain: SSE 290</button><button type="button" data-large>Large gain: SSE 210</button></div>
      <div class="lesson-error-bar" aria-hidden="true"><span data-remaining></span><span data-removed></span></div>
      <p class="lesson-note" data-bar-label></p>
      <div class="lesson-calculation" aria-live="polite"><span data-numerator></span><span class="lesson-division">÷</span><span data-denominator></span><strong data-f></strong></div>
      <p class="lesson-note">F measures the gain relative to remaining error. Its numerical value alone is not a p-value or a decision threshold.</p>`;
    const input = this.querySelector('input');
    const update = () => {
      const q1 = +input.value;
      this.querySelector('[data-value]').textContent = fmt(q1);
      this.querySelector('[data-remaining]').style.width = `${q1 / 3}%`;
      this.querySelector('[data-removed]').style.width = `${(300 - q1) / 3}%`;
      this.querySelector('[data-bar-label]').textContent = `${q1} error units remain; ${300 - q1} were removed. Together they make the original SSE of 300.`;
      this.querySelector('[data-numerator]').textContent = `Gain per extra parameter: (${300} − ${q1}) / 4 = ${fmt((300 - q1) / 4)}`;
      this.querySelector('[data-denominator]').textContent = `Remaining error per dof: ${q1} / 247 = ${fmt(q1 / 247)}`;
      this.querySelector('[data-f]').textContent = `F = ${fmt(fRatio(300, q1, 5, 9, 256))}`;
    };
    input.addEventListener('input', update);
    for (const [selector, value] of [['[data-small]', 290], ['[data-large]', 210]]) this.querySelector(selector).addEventListener('click', () => { input.value = value; update(); });
    update();
  }
}

class SiteComparisonLesson extends HTMLElement {
  async connectedCallback() {
    if (this.initialized) return; this.initialized = true;
    this.classList.add('comparison-lesson'); this.count = 0; this.running = false;
    const fallback = document.createElement('p'); fallback.className = 'lesson-note';
    fallback.textContent = 'Loading the local teaching replay… The worked example table below remains available without JavaScript.';
    this.replaceChildren(fallback);
    try {
      const response = await fetch(this.dataset.src);
      if (!response.ok) throw new Error('Replay data could not be loaded.');
      this.data = await response.json();
      if (!this.isConnected) return;
      this.case = this.data.cases[0]; this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
      this.innerHTML = `<div class="lesson-title">Can noise alone earn this improvement?</div>
        <label class="lesson-case">Teaching example<select aria-label="Teaching example"></select></label>
        <p class="lesson-note">Synthetic data · 81 observations · fixed singlet centers and widths · 2 versus 3 free parameters</p>
        <div class="lesson-legend"><span><i class="lesson-point"></i>Observations</span><span><i class="lesson-line"></i>One-line fit</span><span><i class="lesson-line lesson-line-extra"></i>Two-line fit</span></div>
        <p class="lesson-stage" data-stage></p>
        <svg class="lesson-spectrum" role="img" aria-label="Observed or simulated spectrum and the two fitted models"></svg>
        <p class="lesson-measures" data-objectives></p>
        <div class="lesson-controls"><button type="button" data-play>Play 199 noise trials</button><button type="button" data-next>Next trial</button><button type="button" data-all>Show all 199</button><button type="button" data-reset>Start over</button></div>
        <p class="lesson-null">Every simulated spectrum below comes from the fitted <strong>one-line model</strong>, with fresh Gaussian noise. Both models are refitted each time.</p>
        <svg class="lesson-histogram" role="img" aria-label="Noise-only fit improvements compared with the observed improvement"></svg>
        <div class="lesson-legend"><span><i class="lesson-bin"></i>Noise-only gains</span><span><i class="lesson-bin lesson-bin-tail"></i>Gains ≥ observed</span><span><i class="lesson-observed"></i>Observed gain</span></div>
        <p class="lesson-progress" data-progress aria-live="polite"></p>
        <div class="lesson-result" data-result aria-live="polite"></div>
        <p class="lesson-note">199 precomputed MossA bootstrap trials per example. The animation replays actual saved fits; it does not analyze your spectrum.</p>`;
      const select = this.querySelector('select');
      for (const item of this.data.cases) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; select.append(option); }
      select.addEventListener('change', () => { this.pause(); this.case = this.data.cases.find(item => item.id === select.value); this.count = 0; this.render(); });
      this.querySelector('[data-play]').addEventListener('click', () => {
        if (this.reduced.matches) { this.pause(); this.count = this.data.simulations; this.render(); }
        else if (this.running) { this.pause(); this.render(); }
        else { if (this.count === this.data.simulations) this.count = 0; this.running = true; this.render(); this.schedule(); }
      });
      this.querySelector('[data-next]').addEventListener('click', () => { this.pause(); this.count = Math.min(this.count + 1, this.data.simulations); this.render(); });
      this.querySelector('[data-all]').addEventListener('click', () => { this.pause(); this.count = this.data.simulations; this.render(); });
      this.querySelector('[data-reset]').addEventListener('click', () => { this.pause(); this.count = 0; this.render(); });
      this.visibility = () => { if (document.hidden) { this.pause(); this.render(); } };
      this.motion = () => { if (this.reduced.matches && this.running) { this.pause(); this.render(); } };
      document.addEventListener('visibilitychange', this.visibility); this.reduced.addEventListener('change', this.motion);
      this.observer = new ResizeObserver(() => this.render()); this.observer.observe(this);
      this.dataset.ready = 'true'; this.render();
    } catch {
      fallback.textContent = 'The interactive replay is unavailable. Use the worked table and downloadable projects below; no browser result has been computed.';
    }
  }
  disconnectedCallback() {
    this.pause(); cancelAnimationFrame(this.frame); this.observer?.disconnect();
    if (this.visibility) document.removeEventListener('visibilitychange', this.visibility);
    if (this.motion) this.reduced.removeEventListener('change', this.motion);
  }
  pause() { this.running = false; clearTimeout(this.timer); }
  schedule() {
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.count++; if (this.count >= this.data.simulations) this.pause();
      this.render(true); if (this.running) this.schedule();
    }, 160);
  }
  render(animate = false) {
    if (!this.data || !this.querySelector('[data-stage]')) return;
    const item = this.case, total = this.data.simulations, sample = this.count ? item.samples[this.count - 1] : item;
    this.querySelector('[data-stage]').textContent = this.count ? `Noise-only spectrum ${this.count} of ${total} · generated with ONE line` : `Observed teaching spectrum · ${item.label.toLowerCase()}`;
    this.querySelector('[data-objectives]').textContent = `SSE: one line ${fmt(sample.simpler.objective)} → two lines ${fmt(sample.larger.objective)} · gain ΔQ = ${fmt(Math.max(0, sample.simpler.objective - sample.larger.objective))}`;
    this.querySelector('[data-play]').textContent = this.reduced.matches ? 'Show 199 trials (reduced motion)' : this.running ? 'Pause replay' : this.count === total ? 'Replay 199 trials' : this.count ? 'Continue replay' : 'Play 199 noise trials';
    this.querySelector('[data-next]').disabled = this.count === total;
    this.querySelector('[data-all]').disabled = this.count === total;
    const gains = item.improvements.slice(0, this.count), k = gains.filter(value => value >= item.improvement).length;
    this.querySelector('[data-progress]').textContent = `${this.count} / ${total} trials shown · ${k} gains at least as large as observed. Observed gain: ${fmt(item.improvement)}.`;
    const result = this.querySelector('[data-result]'); result.replaceChildren();
    if (this.count === total) {
      const borderline = item.interval[0] <= .05 && item.interval[1] >= .05;
      const title = document.createElement('strong'); title.textContent = borderline ? 'Borderline: run more simulations.' : item.p < .05 ? 'The extra line earns its flexibility in this example.' : 'Noise explains gains this large often enough; no clear support for the extra line.';
      const p = document.createElement('p'); p.textContent = `Simulation p = (${item.exceedances} + 1) / (${total} + 1) = ${item.p} · 95% Monte Carlo interval ${item.interval[0].toFixed(3)}–${item.interval[1].toFixed(3)}.`;
      const meaning = document.createElement('p'); meaning.textContent = borderline ? 'The interval crosses 0.05, so this run is not precise enough for a clear decision at that threshold.' : item.p < .05 ? 'This is evidence against one line plus the assumed noise; the physical interpretation still needs checking.' : 'This does not prove the extra intensity is exactly zero in an unknown sample.';
      result.append(title, p, meaning);
    } else result.textContent = 'Finish all 199 trials to display this replay’s p-value and Monte Carlo interval.';
    this.spectrum(sample, animate); this.histogram(gains);
  }
  spectrum(sample, animate) {
    cancelAnimationFrame(this.frame);
    const svg = this.querySelector('.lesson-spectrum'), w = Math.max(290, Math.round(svg.clientWidth || this.clientWidth || 600)), h = 292;
    chart(svg, w, h, 'One-line and two-line fits', this.count ? 'The selected trial was generated from the simpler fitted model, although the larger model can lower its fitting error.' : 'A synthetic observed spectrum with one-line and two-line fits.');
    const xs = this.data.points, y = sample.y, left = 49, right = w - 16, top = 15, bottom = 250;
    const min = Math.floor(Math.min(...this.case.y, ...y) / 20) * 20 - 5, max = Math.ceil(Math.max(...this.case.y, ...y) / 10) * 10 + 2;
    const px = v => left + (v + 4) / 8 * (right - left), py = v => bottom - (v - min) / (max - min) * (bottom - top);
    for (let i = 0; i <= 3; i++) {
      const value = min + (max - min) * i / 3;
      svg.append(element('line', { x1: left, x2: right, y1: py(value), y2: py(value), class: 'lesson-grid' }), element('text', { x: left - 7, y: py(value) + 4, 'text-anchor': 'end' }, Math.round(value).toLocaleString('en-US')));
    }
    for (const v of [-4, -2, 0, 2, 4]) svg.append(element('text', { x: px(v), y: bottom + 18, 'text-anchor': 'middle' }, String(v)));
    svg.append(element('text', { x: (left + right) / 2, y: h - 4, 'text-anchor': 'middle' }, 'Velocity (mm/s)'), element('text', { x: left, y: 11 }, 'Intensity (a.u.)'));
    xs.forEach((v, i) => svg.append(element('circle', { cx: px(v), cy: py(y[i]), r: 1.9, class: 'lesson-data-point' })));
    const profile = (v, line) => { const half = line.width / 2; return 1 / (Math.PI * half * (1 + ((v - line.center) / half) ** 2)); };
    const dense = Array.from({ length: 241 }, (_, i) => -4 + i / 30);
    const curves = [sample.simpler, sample.larger].map(f => dense.map(v => f.parameters[0] - this.data.lines.reduce((sum, line, i) => sum + (f.parameters[i + 1] ?? 0) * profile(v, line), 0)));
    const paths = curves.map((values, i) => { const node = element('path', { class: i ? 'lesson-fit lesson-fit-extra' : 'lesson-fit', fill: 'none' }); svg.append(node); return node; });
    const previous = this.previousCurves, duration = animate && !this.reduced.matches && previous ? 100 : 0;
    const draw = fraction => paths.forEach((path, i) => path.setAttribute('d', curves[i].map((value, j) => `${j ? 'L' : 'M'}${px(dense[j]).toFixed(2)},${py(duration ? previous[i][j] + (value - previous[i][j]) * fraction : value).toFixed(2)}`).join(' ')));
    if (duration) {
      const start = performance.now();
      const step = time => { const t = Math.min(1, (time - start) / duration); draw(t); if (t < 1) this.frame = requestAnimationFrame(step); };
      draw(0); this.frame = requestAnimationFrame(step);
    } else draw(1);
    this.previousCurves = curves;
  }
  histogram(gains) {
    const item = this.case, svg = this.querySelector('.lesson-histogram'), w = Math.max(290, Math.round(svg.clientWidth || this.clientWidth || 600)), h = 218;
    chart(svg, w, h, 'Improvements produced by noise alone', `${gains.length} simulated gains; the vertical line marks observed improvement ${fmt(item.improvement)}. The highlighted bars count gains at least that large.`);
    const max = Math.max(...item.improvements, item.improvement, 1) * 1.14, left = 43, right = w - 16, top = 35, bottom = h - 42;
    const bins = binImprovements(gains, item.improvement, max), full = binImprovements(item.improvements, item.improvement, max);
    const ymax = Math.max(...full.map(b => b.ordinary + b.extreme), 1), bw = (right - left) / bins.length;
    const px = v => left + v / max * (right - left), py = count => bottom - count / ymax * (bottom - top);
    for (const count of [0, Math.ceil(ymax / 2), ymax]) svg.append(element('line', { x1: left, x2: right, y1: py(count), y2: py(count), class: 'lesson-grid' }), element('text', { x: left - 7, y: py(count) + 4, 'text-anchor': 'end' }, String(count)));
    for (let i = 0; i < bins.length; i++) {
      const bin = bins[i], x = left + i * bw;
      svg.append(element('rect', { x, y: py(bin.ordinary), width: Math.max(1, bw - 1), height: bottom - py(bin.ordinary), class: 'lesson-bar' }), element('rect', { x, y: py(bin.ordinary + bin.extreme), width: Math.max(1, bw - 1), height: py(bin.ordinary) - py(bin.ordinary + bin.extreme), class: 'lesson-bar lesson-bar-tail' }));
    }
    const observedX = px(item.improvement), anchor = observedX > w * .7 ? 'end' : 'start';
    svg.append(element('line', { x1: observedX, x2: observedX, y1: top - 4, y2: bottom, class: 'lesson-observed-marker' }), element('text', { x: observedX + (anchor === 'end' ? -4 : 4), y: 21, 'text-anchor': anchor }, `Observed ${fmt(item.improvement)}`));
    for (let i = 0; i <= 4; i++) svg.append(element('text', { x: px(max * i / 4), y: bottom + 18, 'text-anchor': 'middle' }, fmt(max * i / 4)));
    svg.append(element('text', { x: left, y: 11 }, 'Number of trials'), element('text', { x: (left + right) / 2, y: h - 3, 'text-anchor': 'middle' }, 'Gain in fit: ΔQ = SSE₀ − SSE₁'));
  }
}
customElements.define('f-ratio-lesson', FRatioLesson);
customElements.define('site-comparison-lesson', SiteComparisonLesson);
