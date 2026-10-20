#!/usr/bin/env python3
"""Analyze paired F1-response CSVs exported by Cognitive Speech Models.

Uses the nominal ~40-ms VTL observer samples, not repeated 5-ms frames, for
acoustic summaries. Samples are correlated within each simulation; average
results across *replicate seeds* before considering sampling uncertainty.

Usage:
    python3 scripts/analyze_perturbation.py results/*.csv --output results/summary.csv

Optionally plots results if matplotlib is installed.
"""
import argparse
import csv
import math
from pathlib import Path


def finite(value):
    try:
        v = float(value)
        return v if math.isfinite(v) else None
    except (ValueError, TypeError):
        return None


def mean(values):
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def analyze(path, min_late_samples=3):
    with Path(path).open(newline='', encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ValueError(f'Empty file: {path}')
    row0 = rows[0]
    for required in ['time_s', 'observer_update', 'shift_hz', 'onset_s',
                     'delta_produced_F1_Hz', 'motor_divergence_RMS']:
        if required not in row0:
            raise ValueError(f'Missing column {required} in {path}')
    onset = finite(row0['onset_s'])
    shift = finite(row0['shift_hz'])
    if onset is None or shift is None or shift == 0:
        raise ValueError('Expected a nonzero F1 perturbation and onset')
    # Restrict pre/late summaries to fresh VTL observer results, not repeated
    # values carried by intermediate motor frames.
    observations = [r for r in rows if r['observer_update'] == '1']
    vowel = 'i' if row0.get('phrase') == 'aia' else None
    if vowel:
        # For /a i a/ at rate 0.6, the central /i/ is the main test interval.
        # Avoid mixing distinct vowel categories in the late response.
        selected = [r for r in observations if r.get('phone') == vowel]
    else:
        selected = observations
    early = [r for r in observations if finite(r['time_s']) is not None
             and finite(r['time_s']) < onset]
    late = [r for r in selected if finite(r['time_s']) is not None
            and finite(r['time_s']) >= onset + 0.20]
    valid_late = [r for r in late if finite(r['delta_produced_F1_Hz']) is not None]
    delta = mean([finite(r['delta_produced_F1_Hz']) for r in valid_late])
    pre_motor = mean([finite(r['motor_divergence_RMS']) for r in early])
    pre_f1 = mean([finite(r['delta_produced_F1_Hz']) for r in early])
    late_target_error = mean([finite(r.get('baseline_error_Hz')) for r in valid_late])
    motor_onset = next((finite(r['time_s']) for r in rows
                       if finite(r['time_s']) is not None
                       and finite(r['time_s']) >= onset
                       and (finite(r['motor_divergence_RMS']) or 0) > 1e-5), None)
    return {
        'file': str(path), 'model': row0.get('model',''),
        'phrase': row0.get('phrase',''), 'seed': row0.get('seed',''),
        'feedback_gain': row0.get('feedback_gain',''), 'delay_ms': row0.get('delay_ms',''),
        'shift_hz': shift, 'onset_s': onset,
        'n_late_observer_samples': len(valid_late),
        'pre_motor_divergence_rms': pre_motor,
        'pre_delta_produced_f1_hz': pre_f1,
        'late_delta_produced_f1_hz': delta,
        'late_compensation_hz': -math.copysign(1, shift)*delta if delta is not None else None,
        'late_compensation_fraction': -delta/shift if delta is not None else None,
        'late_baseline_target_error_hz': late_target_error,
        'first_motor_divergence_s': motor_onset,
        'interpretation': ('insufficient late samples' if len(valid_late)<min_late_samples
            else 'opposite-direction response' if delta is not None and delta*shift<0
            else 'no opposite-direction response'),
    }, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--output', type=Path, default=Path('vtl-perturbation-summary.csv'))
    parser.add_argument('--plot', type=Path, default=None,
                        help='Optional time-course PNG (requires matplotlib)')
    args = parser.parse_args()
    summaries, series = [], []
    for path in args.files:
        row, samples = analyze(path)
        summaries.append(row)
        series.append((row, samples))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(summaries[0]))
        writer.writeheader(); writer.writerows(summaries)
    print(f'Wrote {len(summaries)} conditions to {args.output}')
    for r in summaries:
        fmt = lambda val: 'NA' if val is None else f'{val:.1f}'
        print(f"{Path(r['file']).name}: gain={r['feedback_gain']} "
              f"delay={r['delay_ms']}ms, late ΔF1={fmt(r['late_delta_produced_f1_hz'])} Hz, "
              f"compensation={fmt(r['late_compensation_fraction']*100 if r['late_compensation_fraction'] is not None else None)}%, "
              f"samples={r['n_late_observer_samples']}: {r['interpretation']}")
    if args.plot:
        try:
            import matplotlib.pyplot as plt
        except ImportError:
            print('Skipping plot: pip install matplotlib')
            return
        fig, ax = plt.subplots(figsize=(9, 4.5))
        for summary, samples in series:
            valid = [(finite(r['time_s']), finite(r['delta_produced_F1_Hz']))
                     for r in samples if r['observer_update'] == '1']
            valid = [(t, v) for t,v in valid if t is not None and v is not None]
            if valid:
                ax.plot([x[0] for x in valid],[x[1] for x in valid], marker='.',
                        label=f"g={summary['feedback_gain']}, d={summary['delay_ms']} ms, seed={summary['seed']}")
        ax.axhline(0, linewidth=1, linestyle=':')
        ax.axvline(summaries[0]['onset_s'], linestyle='--', label='F1 shift onset')
        ax.set(xlabel='Time (s)', ylabel='Shifted minus baseline produced F1 (Hz)',
               title='Paired VTL resonance estimates (nominal observer samples)')
        ax.legend(fontsize=8)
        fig.tight_layout()
        args.plot.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(args.plot, dpi=180)
        print('Plot:', args.plot)

if __name__ == '__main__':
    main()
