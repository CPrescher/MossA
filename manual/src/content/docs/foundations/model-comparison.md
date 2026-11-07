---
title: More sites? Understanding the F-test
description: A step-by-step explanation of fit improvement, the classical F statistic, simulation p-values, and whether an extra Mössbauer component earns its flexibility.
banner:
  content: "Preview.16 development manual. The public app may be older; check its footer. Some features and project formats are unavailable in older versions."
---

**An extra site usually lowers the fitting error—even when that site is absent from the sample.** It gives the model more freedom to follow random fluctuations. The useful question is:

> If the simpler model and its noise assumptions were sufficient, how often would the extra flexibility improve the fit this much?

The classical extra-sum-of-squares **F-test** asks that question using an F distribution. **MossA uses a simulation test for added sites**, because disappearing spectral components can violate the classical assumptions. It reports the F statistic as a description of the improvement, and uses a simulated p-value for the decision.

This page develops the idea before the procedure. For the actual buttons and input requirements, see [Comparing models](/MossA/manual/guides/comparing-models/).

## 1. A closer curve is only the starting point

Imagine fitting the same observations with one doublet and then two doublets. The two-doublet model can reproduce the one-doublet model by giving its extra doublet zero intensity. This makes the models **nested**: the simpler model is a special case of the larger one.

If both optimizations find the best available fit under the same constraints, the larger model cannot have a higher minimum squared error. It can leave its added intensity at zero. A lower error is therefore expected even when the extra site only follows noise.

Two things must be considered together: **how much error disappears** and **how much additional freedom was used**. A smoother-looking residual or a smaller reduced objective alone does not decide the question. If the larger nested model fits worse, resolve the optimization problem first.

## 2. What the F statistic measures

Let a residual be $r_i=y_i-\hat y_i$, where $y_i$ is an observation and $\hat y_i$ is the calculated count or intensity. For ordinary unweighted fitting, the squared fitting error is

$$
Q=\mathrm{SSE}=\sum_{i=1}^{N}r_i^2.
$$

Use subscript 0 for the simpler model and 1 for the larger model:

| Symbol | Meaning |
| --- | --- |
| $N$ | Number of observations being fitted; after folding, count the folded points |
| $p_0$, $p_1$ | Numbers of **independent varying parameters**, including the background |
| $Q_0$, $Q_1$ | Squared fitting errors for the same observations and weighting |
| $\Delta Q=Q_0-Q_1$ | Error removed by the larger model |
| $d_1=p_1-p_0$ | Additional free parameters |
| $d_2=N-p_1$ | Residual degrees of freedom in the larger fit |

The extra-sum-of-squares F statistic is

$$
\boxed{F=\frac{(Q_0-Q_1)/(p_1-p_0)}{Q_1/(N-p_1)}.}
$$

Read the fraction as a sentence:

> **Error removed per additional parameter**, divided by **remaining error per residual degree of freedom**.

The numerator measures the gain. The denominator supplies a noise/error scale. More free parameters must earn more improvement. The same absolute error decrease is more impressive when the remaining scatter is small.

:::note[Parameters are not sites]
One extra doublet with free CS, QS, width, and intensity adds **four** parameters, not one. A fixed parameter adds none; a linked target is not an independent coordinate. Use the app's **Free parameters** counts. Its **Residual dof** already subtracts those parameters from the observations.
:::

### Try the arithmetic

Suppose $N=256$, $p_0=5$, $p_1=9$, $Q_0=300$, and $Q_1=290$. Then

$$
F=\frac{(300-290)/4}{290/247}\simeq2.13.
$$

The improvement is 10 error units, or 2.5 per extra parameter. The remaining error is about 1.17 per residual degree of freedom. If $Q_1$ falls to 210 instead, $F\simeq26.46$. Use the control to compare these two sizes of gain:

<f-ratio-lesson>
<p>The arithmetic example compares SSE 300 → 290 (F ≈ 2.13) with SSE 300 → 210 (F ≈ 26.46), for four additional parameters and 247 remaining degrees of freedom.</p>
</f-ratio-lesson>

These are arithmetic examples, not measured fits or p-values. **F > 1 is not a universal rule for adding a site.** The reference distribution and its assumptions determine what counts as unusual. Also, this is not simply the ratio of two reduced squared errors.

## 3. When the classical F-test works—and where sites cause trouble

The standard exact F result applies to nested, full-rank **linear** regression with independent Gaussian errors of a common std and the appropriate unconstrained hypotheses. Under the simpler hypothesis,

$$
F\sim F_{d_1,d_2},\qquad
p_{\mathrm{classical}}=\Pr\!\left(F_{d_1,d_2}\geq F_{\mathrm{observed}}\mid H_0\right).
$$

Here $H_0$ means that the additional terms are unnecessary. See the [general linear-model derivation](https://seehuhn.github.io/MATH3714/S12-selection.html) and the [GraphPad explanation](https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_howtheftestworks.htm). Nonlinear fitting generally needs additional approximation and regularity arguments.

Adding a Mössbauer site introduces two particular difficulties:

- Its allowed intensity usually starts at **zero**, so the null hypothesis is on a parameter boundary.
- When its intensity is zero, changing its CS, QS, or width does nothing to the calculated curve. These parameters become **unidentified** at the null hypothesis.

As a result, inserting a site's F value into an ordinary F-distribution calculator can give a misleading p-value. This issue is established for added spectral components; see [Protassov et al. (2002), Section 3 and Appendix B](https://arxiv.org/html/astro-ph/0201547). Their proposed Bayesian posterior-predictive method and MossA's plug-in parametric bootstrap are different methods; the paper motivates the caution, not a claim that those procedures are identical.

Count-weighted fitting adds another distinction: MossA's objective is $Q=\sum r_i^2/y_i$, with weights from the observed counts. That is not the ordinary constant-variance Gaussian setting above. Use the same objective in both models and the simulation noise model appropriate to the observations. Do not mix an unweighted SSE with a weighted objective in the F formula.

## 4. Replace the theoretical noise benchmark by simulated spectra

MossA's **parametric bootstrap** follows these steps:

1. Refit the simpler and larger models to the observations. Record their actual improvement, $\Delta Q_{\mathrm{obs}}$.
2. Temporarily assume the **fitted simpler model** is the generating model.
3. Generate a new spectrum from that curve, adding noise from the selected process.
4. Fit **both models** to that simulated spectrum, using the same constraints as for the observations. Record $\Delta Q_b$.
5. Repeat. Count how often noise-only simulations earn an improvement at least as large as the observed one.

Each simulation contains no added site in its generating model. Yet its larger fitted model may still find a nonzero extra intensity and a lower error. Those improvements form the appropriate numerical benchmark for this procedure.

:::note[What is actually compared]
MossA compares **objective improvements $\Delta Q$** between observed and simulated spectra. It does not count simulated F statistics or obtain its p-value from an F table. The displayed F statistic is descriptive only.
:::

### Watch noise earn an improvement

Choose **No extra line** first, then **Play 199 noise trials**. Watch the two fits and the histogram of noise-only improvements. Pause or use **Next trial** to inspect one spectrum. **Show all 199** reveals the final result immediately. Reduced-motion settings replace playback with a static completion.

<site-comparison-lesson data-src="/MossA/manual/tutorial-data/site-comparison/replay.json">
<p>The interactive replay requires JavaScript. The worked results and downloadable projects below provide the same numerical examples.</p>
</site-comparison-lesson>

*These are synthetic singlet examples, not measured spectra. Positions and widths are held fixed so the role of noise is easy to see. Only the background and line areas vary: two parameters versus three. A nonnegative added area still puts the null hypothesis on a boundary. Each displayed trial replays fits from MossA's production numerical core; the controls do not generate a new analysis of your data.*

The three teaching observations use the same generated noise realization and different true extra intensities. **Every bootstrap spectrum is still generated from its own fitted one-line model**, including for the “Clear extra line” case. This keeps the reference question fixed: can the simpler model plus noise explain the observed gain?

## 5. Read the p-value as a conditional question

With $B$ simulations and $k$ simulated gains satisfying $\Delta Q_b\geq\Delta Q_{\mathrm{obs}}$, MossA reports

$$
p_{\mathrm{simulation}}=\frac{k+1}{B+1}.
$$

For example, if **7 of 199** simulated spectra improve at least this much, $p=(7+1)/(199+1)=0.04$. Under the fitted simpler model and chosen noise process, an improvement at least as large is estimated to occur about 4% of the time. This is **not a 4% probability that the simpler model is true**, or a 96% probability that the added site is real.

The +1 correction prevents a reported p-value of zero. With 199 trials the smallest possible value is 0.005. Zero exceedances mean “unusual at this simulation resolution,” not “impossible.”

### The worked teaching results

| Example | True extra line in the generator? | Gains ≥ observed | Simulation p | 95% Monte Carlo interval | Reading at a 5% threshold |
| --- | --- | ---: | ---: | --- | --- |
| No extra line | No | 55 / 199 | 0.28 | 0.219–0.342 | No clear support for adding the line |
| Weak extra line | Yes, small | 7 / 199 | 0.04 | 0.017–0.071 | Borderline: increase simulation count |
| Clear extra line | Yes, larger | 0 / 199 | 0.005 | 0–0.019 | Evidence for the extra line under these assumptions |

The **Monte Carlo interval** describes uncertainty from the finite number of simulations. It does not describe uncertainty in a mineral population or the probability that a site exists. The weak example's p-value is below 0.05, but its interval crosses 0.05. MossA therefore asks for more simulations rather than giving a clear preference.

The 5% threshold is a convention, not a physical constant. Choose a decision rule before exploring many models. Larger p-values indicate insufficient evidence for the added complexity; they do not establish an intensity of exactly zero. Weak real components can remain undetectable at the available noise level.

Download the [no-extra-line project](/MossA/manual/tutorial-data/site-comparison/absent.mossa), [weak-line project](/MossA/manual/tutorial-data/site-comparison/weak.mossa), or [clear-line project](/MossA/manual/tutorial-data/site-comparison/clear.mossa) to repeat the comparison in the app. Choose **Gaussian** noise, **199** simulations, and seed **12345**. [Generation details](/MossA/manual/tutorial-data/site-comparison/README.txt) and the full [no-extra](/MossA/manual/tutorial-data/site-comparison/absent-report.json), [weak](/MossA/manual/tutorial-data/site-comparison/weak-report.json), and [clear](/MossA/manual/tutorial-data/site-comparison/clear-report.json) reports retain the numerical evidence.

## 6. Turn a statistical preference into a scientific decision

A small simulated p-value supports the larger model **relative to the specified simpler model, noise process, bounds, and fitting procedure**. Then inspect whether the added component has plausible parameters and is stable to reasonable starting values and model choices. It can otherwise be compensating for an incorrect source response, background, calibration, texture, or relaxation model.

Keep four questions separate:

1. **Did both fits succeed?** A stalled optimization does not provide a valid comparison.
2. **Is the gain unusual under the null simulation?** Read the simulated p-value and its Monte Carlo interval.
3. **Are the noise and instrument assumptions adequate?** Correlated errors and source/calibration uncertainty are not covered by the current simulation.
4. **Does the component make physical sense?** A statistically useful spectral component does not identify a mineral or prove a particular number of crystallographic sites.

Testing many alternatives and reporting only the smallest p-value changes the false-positive risk. MossA's pairwise test does not automatically correct that search. Record which comparisons were attempted, retain the simpler alternatives, and report the conditions and limitations of the chosen result.

Continue with the [comparison workflow](/MossA/manual/guides/comparing-models/) for nesting checks, noise choices, fit diagnostics, and exporting the report.
