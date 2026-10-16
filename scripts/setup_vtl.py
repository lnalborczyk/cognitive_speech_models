#!/usr/bin/env python3
"""Find or install the native VocalTractLab C API for Cognitive Speech.

macOS / Linux, Python standard library only. No system-wide or sudo install.

    python3 scripts/setup_vtl.py --check   # inspect current installation
    python3 scripts/setup_vtl.py           # install when missing
    source scripts/vtl-env.sh              # activate for current shell
    python3 -m server.app

The installer builds TUD-STKS/VocalTractLabBackend-dev and obtains a JD3
speaker from TUD-STKS/VocalTractLab-dev when no matching speaker is found.
This is a development API, NOT an official stable release.
"""
from __future__ import annotations

import argparse
import ctypes
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys

PROJECT = Path(__file__).resolve().parents[1]
BACKEND_REPO = "https://github.com/TUD-STKS/VocalTractLabBackend-dev.git"
GUI_REPO = "https://github.com/TUD-STKS/VocalTractLab-dev.git"
LIBRARIES = {
    "libvocaltractlabapi.so", "vocaltractlabapi.so",
    "libvocaltractlabapi.dylib", "vocaltractlabapi.dylib",
    "vocaltractlabapi.dll", "libvocaltractlabapi.dll",
}
SKIP_DIRS = {
    ".git", ".cache", ".venv", "venv", "node_modules", ".npm",
    "__pycache__", "site-packages", "Caches", "DerivedData",
    "Pictures", "Music", "Movies", "Videos", "Applications Support",  # typo harmless
}
REQUIRED_SYMBOLS = ("vtlInitialize", "vtlClose", "vtlGetConstants", "vtlTractToTube", "vtlSynthBlock")


def candidate_roots(prefix: Path) -> list[tuple[Path, int]]:
    home = Path.home()
    return [
        (prefix, 8), (PROJECT, 7),
        (home / "Downloads", 5), (home / "Documents", 5),
        (home / "Desktop", 4), (home / "Developer", 6),
        (home / "code", 6), (home / "Projects", 6),
        (home / "src", 6), (home / ".local", 6),
        (home / "Applications", 5),
        (Path("/opt/homebrew/lib"), 3), (Path("/opt/local/lib"), 3),
        (Path("/usr/local/lib"), 4), (Path("/usr/local/share"), 4),
        (Path("/opt"), 5), (Path("/Applications"), 4),
    ]


def discover(prefix: Path) -> tuple[list[Path], list[Path]]:
    """Search known roots (not an exhaustive scan of the entire disk)."""
    libs, speakers = set(), set()
    env_lib = os.environ.get("VTL_LIBRARY")
    env_speaker = os.environ.get("VTL_SPEAKER")
    for path, target in ((env_lib, libs), (env_speaker, speakers)):
        if path and Path(path).expanduser().is_file():
            target.add(Path(path).expanduser().resolve())

    # Prefer explicitly configured installation when available.
    for root, max_depth in candidate_roots(prefix):
        if not root.exists():
            continue
        if root.is_file():
            continue
        for base, dirs, files in os.walk(root, followlinks=False):
            basepath = Path(base)
            depth = len(basepath.relative_to(root).parts)
            if depth >= max_depth:
                dirs[:] = []
            else:
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".git")]
            for filename in files:
                low = filename.lower()
                if low in LIBRARIES:
                    libs.add((basepath / filename).resolve())
                elif low.endswith(".speaker") and ("jd3" in low or "jd2" in low):
                    speakers.add((basepath / filename).resolve())
    return sorted(libs), sorted(speakers)


def library_loadable(path: Path) -> tuple[bool, str]:
    """Load in a subprocess so a faulty native binary cannot crash the installer."""
    script = (
        "import ctypes,sys; x=ctypes.CDLL(sys.argv[1]); "
        "[getattr(x,k) for k in sys.argv[2:]]"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", script, str(path), *REQUIRED_SYMBOLS],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=12,
        )
        if result.returncode == 0:
            return True, "C API symbols load successfully"
        return False, result.stderr.strip().splitlines()[-1] if result.stderr.strip() else f"exit {result.returncode}"
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)


def pick_pair(libs: list[Path], speakers: list[Path]) -> tuple[Path | None, Path | None]:
    preferred = os.environ.get("VTL_LIBRARY")
    ordered = sorted(libs, key=lambda p: (str(p) != str(Path(preferred).expanduser().resolve()) if preferred else True, str(p)))
    for lib in ordered:
        ok, reason = library_loadable(lib)
        print(f"  {'[OK]' if ok else '[UNUSABLE]'} Library: {lib}")
        if not ok:
            print(f"         {reason}")
            continue
        # Prefer a speaker in the same installation tree, then JD3.
        def rank(s: Path):
            common = len(os.path.commonpath([str(lib), str(s)]))
            return (-common, s.name.lower() != "jd3.speaker", str(s))
        speaker = min(speakers, key=rank) if speakers else None
        if speaker:
            print(f"  [OK] Speaker: {speaker}")
        return lib, speaker
    return None, None


def run(command: list[str]):
    print("+", shlex.join(command), flush=True)
    subprocess.run(command, check=True)


def require_build_tools():
    if platform.system() not in ("Darwin", "Linux"):
        raise RuntimeError("Automatic source builds supported on macOS and Linux only. For Windows use the official VTL 2.4 ZIP.")
    missing = [command for command in ("git", "cmake", "c++") if not shutil.which(command)]
    if not missing:
        return
    advice = (
        "macOS: xcode-select --install ; brew install cmake git\n"
        "Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y build-essential cmake git"
    )
    raise RuntimeError(f"Missing build tools: {', '.join(missing)}\n{advice}")


def ensure_clone(url: str, dest: Path):
    if (dest / ".git").is_dir():
        print(f"Reusing source checkout: {dest}")
        return
    if dest.exists():
        raise RuntimeError(f"Expected an empty source directory: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "--depth", "1", url, str(dest)])


def build_backend(prefix: Path) -> Path:
    require_build_tools()
    source = prefix / "VocalTractLabBackend-dev"
    ensure_clone(BACKEND_REPO, source)
    build = source / "out"
    run(["cmake", "-S", str(source), "-B", str(build), "-DCMAKE_BUILD_TYPE=Release"])
    run([
        "cmake", "--build", str(build), "--config", "Release",
        "--target", "VocalTractLabApi", "--parallel", str(min(4, os.cpu_count() or 2)),
    ])
    libs, _ = discover(prefix)
    built_libs = [p for p in libs if source in p.parents]
    lib, _ = pick_pair(built_libs, [])
    if lib is None:
        raise RuntimeError("CMake finished, but a loadable VTL API library was not found under the source tree")
    return lib


def obtain_speaker(prefix: Path) -> Path:
    _, speakers = discover(prefix)
    # Prefer existing JD3, and preserve an installed speaker if there is one.
    if speakers:
        return next((s for s in speakers if s.name.lower() == "jd3.speaker"), speakers[0])
    if not shutil.which("git"):
        raise RuntimeError("Git is required to retrieve the JD3.speaker model")
    source = prefix / "VocalTractLab-dev"
    ensure_clone(GUI_REPO, source)  # GUI does NOT need to be compiled
    speaker_files = list(source.rglob("*.speaker"))
    if not speaker_files:
        raise RuntimeError("The GUI repository has no .speaker files. Download a speaker from the official VTL website.")
    return next((s for s in speaker_files if s.name.lower() == "jd3.speaker"), speaker_files[0]).resolve()


def write_env(lib: Path, speaker: Path, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    contents = (
        "# Generated by scripts/setup_vtl.py; use: source scripts/vtl-env.sh\n"
        f"export VTL_LIBRARY={shlex.quote(str(lib))}\n"
        f"export VTL_SPEAKER={shlex.quote(str(speaker))}\n"
    )
    path.write_text(contents, encoding="utf-8")
    print(f"\nConfiguration saved to {path}")
    print("Activate with: source scripts/vtl-env.sh")


def smoke_test(lib: Path, speaker: Path) -> tuple[bool, str]:
    """Actually initialize the selected speaker with the project's ctypes bridge."""
    script = (
        "import sys; sys.path.insert(0,sys.argv[1]); "
        "from server.vtl import VocalTractLab; "
        "v=VocalTractLab(sys.argv[2],sys.argv[3]); "
        "print('Sample rate:',v.rate,'Hz; tract parameters:',v.ntract); v.close()"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", script, str(PROJECT), str(lib), str(speaker)],
            capture_output=True, text=True, timeout=30,
        )
        return result.returncode == 0, (result.stdout + result.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="Detect existing VTL and exit without installing")
    parser.add_argument("--prefix", type=Path, default=Path.home() / ".local/share/cognitive-speech/vtl",
                        help="User-owned directory for building and storing VTL sources")
    parser.add_argument("--env-file", type=Path, default=PROJECT / "scripts/vtl-env.sh",
                        help="Shell exports file used to start Cognitive Speech")
    args = parser.parse_args()
    prefix = args.prefix.expanduser().resolve()
    print("Checking for a compatible VTL C API and speaker file...")
    libs, speakers = discover(prefix)
    lib, speaker = pick_pair(libs, speakers)
    if args.check:
        if lib and speaker:
            ok, diagnostics = smoke_test(lib, speaker)
            print("[FOUND] Library and speaker:", "COMPATIBLE" if ok else "INITIALIZATION FAILED")
            if diagnostics:
                print(diagnostics)
            print(f"VTL_LIBRARY={lib}\nVTL_SPEAKER={speaker}")
            return 0 if ok else 2
        print("[NOT FOUND] No complete usable VTL library + speaker pair in the locations searched")
        return 1
    try:
        if not lib:
            print("\nNo loadable VTL C API found. Building the official development backend locally...")
            lib = build_backend(prefix)
        else:
            print("\nReusing the existing shared library (no rebuild).")
        if not speaker:
            print("\nNo speaker model found. Obtaining speaker resources...")
            speaker = obtain_speaker(prefix)
        if not speaker.is_file():
            raise RuntimeError("Speaker file missing after download")
        write_env(lib, speaker, args.env_file.expanduser().resolve())
        ok, diagnostics = smoke_test(lib, speaker)
        print("\nVTL initialization test:", "PASSED" if ok else "FAILED")
        if diagnostics:
            print(diagnostics)
        if not ok:
            print("The library loads, but the speaker and the application's API may be incompatible.", file=sys.stderr)
            return 2
        print("\nNext: source scripts/vtl-env.sh && python3 -m server.app")
        return 0
    except (RuntimeError, subprocess.CalledProcessError, OSError) as exc:
        print(f"\nVTL setup failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
