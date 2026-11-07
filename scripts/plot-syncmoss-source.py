"""Original plot of the pinned supplied source in MossA response convention."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'manual/public/tutorial-data/syncmoss/source-profile.json').read_text())
x = np.linspace(-1.2, 1.2, 1601)
curves = [g['weight'] * np.sqrt(4 * np.log(2) / np.pi) / g['fwhm'] * np.exp(-4 * np.log(2) * ((x - g['center']) / g['fwhm']) ** 2)
          for g in source['mossaCenteredComponents']]
for dark in (False, True):
    bg, text, grid = ('#181818', '#eeeeee', '#454545') if dark else ('white', '#242b30', '#d9dfe2')
    with plt.rc_context({'font.family': 'DejaVu Sans', 'font.size': 13, 'axes.facecolor': bg, 'figure.facecolor': bg,
                         'text.color': text, 'axes.labelcolor': text, 'xtick.color': text, 'ytick.color': text, 'axes.edgecolor': grid}):
        fig, ax = plt.subplots(figsize=(12.8, 7.2), dpi=100)
        ax.plot(x, sum(curves), color='#58c9b9' if dark else '#168a87', lw=3, label='Complete supplied response')
        for i, (curve, color) in enumerate(zip(curves, ['#c47735', '#8261a9', '#5684b3']), 1):
            ax.plot(x, curve, color=color, ls='--', lw=1.8, label=f'Gaussian {i}, weighted contribution')
        ax.axvline(0, lw=1, color=grid)
        ax.set(xlim=(-1.2, 1.2), ylim=(0, None), xlabel='Response offset (mm/s)', ylabel='Probability density (mm/s)⁻¹')
        ax.spines[['top', 'right']].set_visible(False); ax.grid(alpha=.35, color=grid)
        ax.legend(frameon=False, labelcolor=text)
        fig.suptitle('SYNCmoss supplied SMS source response', x=.085, ha='left', y=.95, fontsize=21)
        fig.text(.085, .865, 'Three positive Gaussians, normalized to unit area and shifted to zero weighted centroid.', fontsize=13)
        fig.text(.085, .06, 'Original calculation from Standard_SMS.dat · Sergey Yaroslavtsev / ESRF · MIT-licensed repository\nMossA response convention; the asymmetric source is reflected before centering. No source fit is performed here.', fontsize=11)
        fig.subplots_adjust(left=.085, right=.97, bottom=.20, top=.77)
        path = ROOT / ('manual/public/screenshots/dark/syncmoss-source-response.jpg' if dark else 'manual/src/assets/screenshots/syncmoss-source-response.png')
        fig.savefig(path, dpi=100, facecolor=bg); plt.close(fig)
