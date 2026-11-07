"""Original teaching figure: the same scalar integral and its thin expansion.

Run with Python numpy/matplotlib. This is a calculation, not measured data or
an app screenshot. Source and absorber widths are illustrative, in mm/s.
"""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
step = .0025
v = np.arange(-5., 5. + step / 2, step)
absorber_width, source_width = .15, .20
source = np.exp(-4 * np.log(2) * (v / source_width) ** 2)
source /= source.sum() * step
for dark in (False, True):
    background, text, grid = ('#181818', '#eeeeee', '#454545') if dark else ('#ffffff', '#242b30', '#d9dfe2')
    with plt.rc_context({'font.family': 'DejaVu Sans', 'font.size': 13, 'axes.facecolor': background,
                         'figure.facecolor': background, 'text.color': text, 'axes.labelcolor': text,
                         'xtick.color': text, 'ytick.color': text, 'axes.edgecolor': grid}):
        fig, axes = plt.subplots(1, 2, figsize=(12.8, 7.2), dpi=100, sharex=True, sharey=True)
        for ax, peak in zip(axes, (.1, 2.0)):
            tau = peak / (1 + (2 * v / absorber_width) ** 2)
            full = 1 + np.convolve(np.expm1(-tau), source, mode='same') * step
            thin = 1 - np.convolve(tau, source, mode='same') * step
            view = abs(v) < .7
            ax.plot(v[view], full[view], color='#168a87' if not dark else '#58c9b9', lw=2.5, label='Full scalar integral')
            ax.plot(v[view], thin[view], color='#bf7436' if not dark else '#efaa69', lw=2, ls='--', label='Thin expansion')
            ax.set(title=f'Peak optical depth = {peak:g}', xlabel='Scan velocity (mm/s)', xlim=(-.7, .7), ylim=(-.3, 1.04))
            ax.axhline(0, color=grid, lw=1)
            ax.grid(alpha=.4, color=grid)
            ax.spines[['top', 'right']].set_visible(False)
        axes[0].set_ylabel('Normalized transmitted intensity')
        axes[0].legend(frameon=False, loc='lower left', labelcolor=text)
        fig.suptitle('When does the thin approximation work?', fontsize=21, x=.075, ha='left', y=.95)
        fig.text(.075, .865, 'The source response is convolved with transmission after exponentiating optical depth.', fontsize=13)
        fig.text(.075, .07, 'Lorentzian absorber: width 0.15 mm/s · Gaussian source: FWHM 0.20 mm/s\nCalculated illustration; no fitted parameters or measured observations.', fontsize=11)
        fig.subplots_adjust(left=.075, right=.98, bottom=.20, top=.75, wspace=.1)
        path = ROOT / ('manual/public/screenshots/dark/physics-transmission.jpg' if dark else 'manual/src/assets/screenshots/physics-transmission.png')
        fig.savefig(path, dpi=100, facecolor=background)
        plt.close(fig)
