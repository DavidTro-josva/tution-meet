"""
utils.py

Utility functions for the Python PySerial microservice.
Provides helpers for:
- Logging configuration (console + file logger with standardized timestamps)
- COM Port enumeration (wrapping `serial.tools.list_ports`)
- Input validation (COM port name and baud rate checks)
- JSON response envelope formatting for REST API endpoints
"""

import logging
import sys
from datetime import datetime, timezone
from typing import Optional, Any, Tuple, List, Dict
from flask import jsonify, Response
import serial.tools.list_ports
from config import LOG_LEVEL, LOG_FILE, SERIAL_ALLOWED_BAUD_RATES


def setup_logger(name: str) -> logging.Logger:
    """
    Configures and returns a logger instance with console and file handlers.

    Args:
        name (str): Name of the logger module.

    Returns:
        logging.Logger: Configured logger instance.
    """
    logger = logging.getLogger(name)
    logger.setLevel(LOG_LEVEL)

    # Avoid duplicate handlers if setup_logger is called repeatedly
    if not logger.handlers:
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        # File handler
        try:
            file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except Exception as e:
            logger.warning(f"Could not initialize file logger '{LOG_FILE}': {e}")

    return logger


# Initialize module logger
logger = setup_logger(__name__)


def list_available_ports() -> List[Dict[str, str]]:
    """
    Automatically detects available COM ports on the system.

    Returns:
        List[Dict[str, str]]: A list of dictionaries representing detected serial ports,
        including 'port', 'description', 'hwid', and 'manufacturer'.
    """
    ports_list: List[Dict[str, str]] = []
    try:
        detected = serial.tools.list_ports.comports()
        # Prepend Virtual Hardware Simulator port for zero-config testing
        ports_list.append({
            "port": "SIMULATOR (Virtual Arduino / RFID Loopback)",
            "description": "Virtual Hardware Simulator (No Physical USB Required)",
            "hwid": "VIRTUAL-SIM-001",
            "manufacturer": "Tuition Meet PySerial Simulator"
        })
        for p in detected:
            ports_list.append({
                "port": str(p.device),
                "description": str(p.description) if p.description else "Unknown Device",
                "hwid": str(p.hwid) if p.hwid else "N/A",
                "manufacturer": str(getattr(p, "manufacturer", "Unknown")) or "Unknown"
            })
        logger.info(f"Detected {len(ports_list)} serial COM port(s) (including simulator)")
    except Exception as e:
        logger.error(f"Error enumerating serial ports: {e}", exc_info=True)
    return ports_list


def validate_port(port: str, check_exists: bool = False) -> Tuple[bool, str]:
    """
    Validates a COM port string.

    Args:
        port (str): The serial port name (e.g., 'COM3', '/dev/ttyUSB0').
        check_exists (bool): If True, verifies that the port exists in system enumeration.

    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    if not port or not isinstance(port, str):
        return False, "Port name must be a non-empty string"

    port_clean = port.strip()
    if len(port_clean) == 0:
        return False, "Port name cannot be blank"

    if check_exists:
        available = [p["port"] for p in list_available_ports()]
        if port_clean not in available:
            return False, f"Port '{port_clean}' is not available on this system. Detected: {available}"

    return True, ""


def validate_baud_rate(baud: Any) -> Tuple[bool, str]:
    """
    Validates that a baud rate is a valid integer and supported.

    Args:
        baud (Any): The requested baud rate.

    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        baud_int = int(baud)
    except (ValueError, TypeError):
        return False, "Baud rate must be an integer value"

    if baud_int <= 0:
        return False, "Baud rate must be a positive integer"

    if baud_int not in SERIAL_ALLOWED_BAUD_RATES:
        return False, (
            f"Baud rate {baud_int} is not in the allowed standard rates: "
            f"{SERIAL_ALLOWED_BAUD_RATES}"
        )

    return True, ""


def format_json_response(
    success: bool,
    data: Any = None,
    error: Optional[str] = None,
    status_code: int = 200
) -> Tuple[Response, int]:
    """
    Formats a consistent JSON response envelope for REST endpoints.

    Args:
        success (bool): Whether the request succeeded.
        data (Any): Payload data to include.
        error (Optional[str]): Error message if success is False.
        status_code (int): HTTP status code.

    Returns:
        Tuple[Response, int]: Flask JSON response tuple with status code.
    """
    payload = {
        "success": success,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    if data is not None:
        payload["data"] = data

    if error is not None:
        payload["error"] = str(error)

    return jsonify(payload), status_code
