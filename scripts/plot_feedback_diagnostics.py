#!/usr/bin/env python3
"""Plot one paired, VTL-derived feedback experiment exported by the web app.

Use: python3 scripts/plot_feedback_diagnostics.py paired_f1_ahold_*.csv -o diagnostic.png

Requires matplotlib; does not assume unresolved F1 values are zero.
"""
import argparse
import csv
import math
from pathlib import Path


def number(x):
    try:
        a = float(x)
        return a if math.isfinite(a) else float('nan')
    except (TypeError, ValueError):
        return float('nan')


def plot(path, out):
    import matplotlib.pyplot as plt
    with Path(path).open(newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError('Empty experiment CSV')
    if 'feedback_status' not in rows[0]:
        raise ValueError('Requires the v1.4.0 feedback diagnostic CSV columns')
    sample = [r for r in rows if r['observer_update'] == '1']
    onset = number(rows[0].get('onset_s'))
    times = [number(r['time_s']) for r in sample]
    all_times = [number(r['time_s']) for r in rows]
    fig, ax = plt.subplots(4, 1, figsize=(10, 10), sharex=True, constrained_layout=True)
    ax[0].plot(times, [number(r['baseline_F1_Hz']) for r in sample], label='Baseline VTL F1')
    ax[0].plot(times, [number(r['shifted_F1_Hz']) for r in sample], label='Perturbed VTL F1')
    ax[0].plot(times, [number(r['target_F1_Hz']) for r in sample], label='Current VTL target F1', ls=':')
    ax[0].set_ylabel('Predicted F1 (Hz)')
    ax[0].legend(loc='best')
    ax[1].plot(times, [number(r['delta_produced_F1_Hz']) for r in sample], label='Perturbed − baseline')
    ax[1].axhline(0, ls=':', lw=1)
    ax[1].set_ylabel('Δ produced F1 (Hz)')
    ax[2].plot(all_times,[1 if r.get('feedback_valid_F1')=='true' else 0 for r in rows],
               label='F1 valid at delayed observer')
    ax[2].plot(all_times,[number(r.get('feedback_applied_shift_Hz'))/150 for r in rows],
               label='Heard F1 shift / 150 Hz', alpha=.8)
    ax[2].set_yticks([0, 1]); ax[2].set_ylabel('Validity and shift')
    ax[2].legend(loc='best')
    ax[3].plot(all_times,[number(r.get('delta_auditory_command_RMS')) for r in rows],
               label='Changed auditory motor command')
    ax[3].plot(all_times,[number(r.get('motor_divergence_RMS')) for r in rows],
               label='Articulatory divergence', alpha=.8)
    ax[3].set_ylabel('RMS (different units)')
    ax[3].set_xlabel('Time (s)')
    ax[3].legend(loc='best')
    for axis in ax:
        if math.isfinite(onset):
            axis.axvline(onset, color='0.4', ls='--', lw=1)
        axis.grid(alpha=.18)
    fig.suptitle(f"VTL feedback audit · {rows[0].get('phrase', '')} · "
                 f"shift {rows[0].get('shift_hz', '')} Hz")
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('csv', type=Path)
    ap.add_argument('-o', '--output', type=Path, default=Path('vtl-feedback-audit.png'))
    args = ap.parse_args()
    print(plot(args.csv, args.output))


if __name__ == '__main__':
    main()
