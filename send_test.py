"""
Tuition Meet - Pure Software Serial Injection Script
------------------------------------------------------
This script injects simulated software messages directly into your Tuition Meet
PySerial service (http://localhost:5050/serial/inject).
No third-party virtual COM port driver is needed!
"""

import urllib.request
import json
import time

API_URL = "http://localhost:5050/serial/inject"

messages_to_send = [
    "RFID_READ: Student [David Josva] Checked In - Attendance Verified",
    "BARCODE_SCAN: Textbook [Advanced Full-Stack Engineering] Borrowed",
    "SOFTWARE_NOTIFY: Tuition Meet Pure Software Serial Test Successful!",
]

print("=" * 60)
print("  Tuition Meet Pure Software Serial Message Sender")
print("=" * 60)

for idx, msg in enumerate(messages_to_send, 1):
    print(f"[+] Sending Message {idx}/{len(messages_to_send)}: {msg}")
    try:
        req = urllib.request.Request(
            API_URL,
            data=json.dumps({"message": msg}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        res = urllib.request.urlopen(req, timeout=5)
        response_data = json.loads(res.read().decode())
        if response_data.get("success"):
            print("    -> [OK] Displaying in Live Data Console!")
        else:
            print(f"    -> [ERROR] {response_data.get('error')}")
    except Exception as e:
        print(f"    -> [ERROR] Could not connect to PySerial service on 5050: {e}")
    time.sleep(1.5)

print("\n[SUCCESS] All messages sent! Check your Tuition Meet browser window now!")
