"""
test_serial_api.py

Automated unit and integration test suite for the PySerial REST Service.
Uses the Flask test client to verify:
- Health check endpoint (/health)
- COM port enumeration (/serial/ports)
- Status reporting (/serial/status)
- Data history query (/serial/latest-data)
- Input validation (rejecting invalid port names or unsupported baud rates)
- Safe disconnect handling (/serial/disconnect)
"""

import unittest
import json
import sys
import os

# Add parent directory to path to import modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import create_app
from serial_service import SerialService


class TestSerialServiceAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def test_01_health_check(self):
        """Verify GET /health returns online status and correct service metadata."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))
        self.assertEqual(data["data"]["status"], "online")
        print("[PASS] TEST 01 PASS: GET /health")

    def test_02_get_ports(self):
        """Verify GET /serial/ports returns a valid list of detected COM ports."""
        res = self.client.get("/serial/ports")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))
        self.assertIn("ports", data["data"])
        self.assertIsInstance(data["data"]["ports"], list)
        print(f"[PASS] TEST 02 PASS: GET /serial/ports (detected {len(data['data']['ports'])} ports)")

    def test_03_get_status_initial(self):
        """Verify GET /serial/status initially reports disconnected state."""
        res = self.client.get("/serial/status")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))
        status = data["data"]["status"]
        self.assertFalse(status["connected"])
        self.assertFalse(status["reconnecting"])
        print("[PASS] TEST 03 PASS: GET /serial/status reports disconnected state correctly")

    def test_04_get_latest_data_empty(self):
        """Verify GET /serial/latest-data returns empty messages list initially."""
        res = self.client.get("/serial/latest-data?limit=10")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))
        self.assertEqual(data["data"]["count"], 0)
        self.assertEqual(data["data"]["limit"], 10)
        print("[PASS] TEST 04 PASS: GET /serial/latest-data")

    def test_05_invalid_port_validation(self):
        """Verify POST /serial/connect rejects blank/invalid COM port names with HTTP 400."""
        res = self.client.post(
            "/serial/connect",
            data=json.dumps({"port": "", "baud_rate": 9600}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        data = json.loads(res.data)
        self.assertFalse(data.get("success"))
        self.assertIn("Port name", data.get("error", ""))
        print("[PASS] TEST 05 PASS: Blank port name correctly rejected with HTTP 400")

    def test_06_invalid_baud_rate_validation(self):
        """Verify POST /serial/connect rejects unsupported baud rates with HTTP 400."""
        res = self.client.post(
            "/serial/connect",
            data=json.dumps({"port": "COM3", "baud_rate": 99999999}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        data = json.loads(res.data)
        self.assertFalse(data.get("success"))
        self.assertIn("Baud rate", data.get("error", ""))
        print("[PASS] TEST 06 PASS: Unsupported baud rate correctly rejected with HTTP 400")

    def test_07_write_when_disconnected(self):
        """Verify POST /serial/write returns HTTP 400 when serial is disconnected."""
        res = self.client.post(
            "/serial/write",
            data=json.dumps({"payload": "TEST_DATA\n", "is_hex": False}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        data = json.loads(res.data)
        self.assertFalse(data.get("success"))
        self.assertIn("No active serial connection", data.get("error", ""))
        print("[PASS] TEST 07 PASS: POST /serial/write safely fails when disconnected")

    def test_08_safe_disconnect(self):
        """Verify POST /serial/disconnect handles disconnected state gracefully."""
        res = self.client.post("/serial/disconnect")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))
        self.assertIn("No active serial connection", data["data"]["message"])
        print("[PASS] TEST 08 PASS: POST /serial/disconnect succeeds gracefully when already closed")


if __name__ == "__main__":
    print("=========================================================")
    print("  Running PySerial Microservice Automated Tests")
    print("=========================================================")
    unittest.main(verbosity=2)
