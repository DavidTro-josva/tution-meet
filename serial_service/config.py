"""
config.py

Configuration module for the Python PySerial microservice.
Loads environment variables from `.env` using python-dotenv and provides
type-checked default configuration values for:
- HTTP REST API server binding (host, port)
- Serial hardware defaults (baud rate, allowed baud rates, read timeout)
- Reconnection parameters (reconnect interval in seconds)
- Circular buffer capacity for message history
- Logging setup (level and log filename)
"""

import os
from dotenv import load_dotenv

# Load environment variables from a local .env file if present
load_dotenv()

# REST API Network Binding
SERIAL_API_HOST: str = os.getenv("SERIAL_API_HOST", "0.0.0.0")
SERIAL_API_PORT: int = int(os.getenv("SERIAL_API_PORT", "5050"))

# Serial Hardware Communication Configuration
SERIAL_DEFAULT_PORT: str = os.getenv("SERIAL_DEFAULT_PORT", "")
SERIAL_DEFAULT_BAUD: int = int(os.getenv("SERIAL_DEFAULT_BAUD", "9600"))
SERIAL_READ_TIMEOUT: float = float(os.getenv("SERIAL_READ_TIMEOUT", "0.5"))

# Allowed Standard Baud Rates for input validation
SERIAL_ALLOWED_BAUD_RATES: list[int] = [
    1200, 2400, 4800, 9600, 14400, 19200, 38400,
    57600, 115200, 230400, 460800, 921600
]

# Auto-Reconnection & Resilience Settings
SERIAL_RECONNECT_INTERVAL: float = float(os.getenv("SERIAL_RECONNECT_INTERVAL", "5.0"))

# Circular Buffer Size for Received Data History
SERIAL_MAX_HISTORY: int = int(os.getenv("SERIAL_MAX_HISTORY", "200"))

# Logging Parameters
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FILE: str = os.getenv("LOG_FILE", "serial_service.log")
