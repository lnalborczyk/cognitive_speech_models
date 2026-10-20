Cognitive Speech Models — CI import hotfix

Problem: scripts/validate_live_feedback.py imports analyze_perturbation,
but scripts/analyze_perturbation.py was missing from the GitHub repository.

This patch ADDS:
  scripts/analyze_perturbation.py
  test/test_analysis_dependency.py

From the project root:
  unzip -o ~/Downloads/cognitive_speech_models_ci_import_hotfix.zip -d .
  python3 -m unittest discover -s test -p 'test_*.py'
  git add scripts/analyze_perturbation.py test/test_analysis_dependency.py
  git commit -m "Restore analysis dependency for live validation"
  git push origin main

If git status says the analyzer is ignored, check .gitignore first and then
use git add -f scripts/analyze_perturbation.py; this should not normally be needed.

This patch does not alter VTL, browser synthesis, or model controllers.
