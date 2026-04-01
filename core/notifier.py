import subprocess
import platform


def notify(title: str, message: str, sound: bool = True):
    """Send a macOS notification."""
    if platform.system() != "Darwin":
        return

    sound_part = 'sound name "Glass"' if sound else ""
    script = (
        f'display notification "{_escape(message)}" '
        f'with title "{_escape(title)}" {sound_part}'
    )
    try:
        subprocess.Popen(
            ["osascript", "-e", script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass


def _escape(text: str) -> str:
    """Escape special characters for AppleScript strings."""
    return text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
