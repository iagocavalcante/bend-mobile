"""Run with a booted emulator: python3 tests/android-smoke.py (adb on PATH)."""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET

adb = os.environ.get("ADB", "adb")


def run(*args):
    return subprocess.check_output([adb, *args], timeout=30)


def screen(expected):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        dump = run("shell", "uiautomator", "dump", "/sdcard/bend-mobile-test.xml")
        if b"dumped" not in dump:
            time.sleep(0.25)
            continue
        root = ET.fromstring(run("exec-out", "cat", "/sdcard/bend-mobile-test.xml"))
        if any(node.get("text") == expected for node in root.iter("node")):
            return root
        time.sleep(0.25)
    raise AssertionError(f"Missing native text: {expected}")


def tap(root, label):
    button = next(node for node in root.iter("node") if node.get("text") == label)
    assert button.get("class") == "android.widget.Button"
    left, top, right, bottom = map(int, re.findall(r"\d+", button.get("bounds")))
    run("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))


run("shell", "input", "keyevent", "KEYCODE_WAKEUP")
run("shell", "wm", "dismiss-keyguard")
# Clear only this test app so assertions have a known initial state.
run("shell", "pm", "clear", "dev.bendmobile.counter")
run("shell", "am", "start", "-n", "dev.bendmobile.counter/dev.bendmobile.BendActivity")
root = screen("Count: 0")
field = next(node for node in root.iter("node") if node.get("class") == "android.widget.EditText")
left, top, right, bottom = map(int, re.findall(r"\d+", field.get("bounds")))
run("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
# Inject fresh events after each rendered edit; adb batch timestamps expire on slow emulators.
for index, letter in enumerate("Iago", 1):
    run("shell", "input", "text", letter)
    root = screen("Iago"[:index])
run("shell", "input", "keyevent", "KEYCODE_BACK")  # dismiss keyboard
root = screen("Iago")
tap(root, "Increment")
root = screen("Count: 1")
tap(root, "Details")
root = screen("Hello, Iago")
# A new process must restore both the model and current route.
run("shell", "am", "force-stop", "dev.bendmobile.counter")
run("shell", "am", "start", "-n", "dev.bendmobile.counter/dev.bendmobile.BendActivity")
root = screen("Hello, Iago")
for backend in ["CPU", "GPU"]:
    tap(root, "Run on " + backend)
    root = screen(backend + " complete")
    assert any(node.get("text") == "Result: [1,2,5,10,2]" for node in root.iter("node"))
run("shell", "input", "keyevent", "KEYCODE_BACK")
root = screen("Iago")
tap(root, "Reset")
screen("Count: 0")
run("shell", "rm", "/sdcard/bend-mobile-test.xml")
print("PASS: native text, route/back, process restoration, CPU and Vulkan results.")
