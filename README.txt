Cognitive Speech Models - GitHub Pages calibration-gate hotfix

Root cause: v1.3.2 changed the label "Pass" to "Repeatable", but the
browser smoke test still required "Pass". VTL synthesizes correctly.

Apply from your project root:
    unzip -o ~/Downloads/cognitive_speech_models_calibration_gate_hotfix.zip
    npm test
    git add scripts/check_browser_vtl.py test/test_browser_calibration.py
    git commit -m "Fix VTL calibration gate in Pages browser test"
    git push origin main

The test now accepts two repeatable vowel measurements with an incomplete
/i/ measurement, without hiding calibration shortcomings. It still
fails on invalid calibration rows or inconsistent measurements.
