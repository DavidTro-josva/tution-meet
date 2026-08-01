"""
serial_service.py

Core non-blocking hardware communication engine for Tuition Meet.
Provides a thread-safe singleton `SerialService` that:
- Opens and manages pyserial connections
- Runs a continuous background daemon thread (`_reader_loop`) to read incoming data
  without blocking web server threads
- Maintains a thread-safe circular buffer (`deque`) of recent messages
- Automatically detects hardware disconnects (`SerialException` / `OSError`) and
  initiates an automatic background reconnection loop (`_reconnect_loop`)
- Prevents duplicate/multiple connections to the same COM port
- Logs connection state transitions, errors, and reconnect attempts
"""

import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
import serial
import serial.tools.list_ports

from config import (
    SERIAL_DEFAULT_BAUD,
    SERIAL_READ_TIMEOUT,
    SERIAL_RECONNECT_INTERVAL,
    SERIAL_MAX_HISTORY,
)
from utils import setup_logger, validate_port, validate_baud_rate

logger = setup_logger(__name__)


class MockSerial:
    """
    Virtual Hardware Simulator for testing PySerial without physical devices.
    Simulates RFID Card Scans, Arduino Sensor Readings, and Command ACKs.
    """
    def __init__(self, port: str, baudrate: int):
        self.port = port
        self.baudrate = baudrate
        self.is_open = True
        self._count = 0
        self._lock = threading.Lock()
        self._cmd_queue = deque()

    def readline(self) -> bytes:
        if not self.is_open:
            return b""
        time.sleep(2.0)  # Simulate 2-second interval between sensor readings
        if not self.is_open:
            return b""
        with self._lock:
            if self._cmd_queue:
                cmd = self._cmd_queue.popleft()
                return f"ARDUINO_ACK: Received Command -> [{cmd}]\r\n".encode("utf-8")
            self._count += 1
            if self._count % 3 == 1:
                return f"RFID_READ: Student Check-in Authorized | Card ID [A4-B9-8E-{self._count:02d}]\r\n".encode("utf-8")
            elif self._count % 3 == 2:
                return f"ARDUINO_SENSOR: TEMP=25.{self._count % 9} C | HUMIDITY=58% | LED=ON\r\n".encode("utf-8")
            else:
                return f"BARCODE_SCAN: 978-0-13-235088-{self._count % 9} (Textbook Verified)\r\n".encode("utf-8")

    def write(self, data: bytes) -> int:
        if not self.is_open:
            raise Exception("Port is closed")
        try:
            cmd_str = data.decode("utf-8", errors="replace").strip()
            with self._lock:
                self._cmd_queue.append(cmd_str)
        except Exception:
            pass
        return len(data)

    def flush(self):
        pass

    def reset_input_buffer(self):
        pass

    def reset_output_buffer(self):
        pass

    def close(self):
        self.is_open = False


class SerialService:
    """
    Thread-safe PySerial Service manager for serial hardware communication.
    Implemented as a singleton pattern so all routes interact with the same device state.
    """
    _instance: Optional["SerialService"] = None
    _singleton_lock: threading.Lock = threading.Lock()

    def __new__(cls, *args, **kwargs) -> "SerialService":
        with cls._singleton_lock:
            if cls._instance is None:
                cls._instance = super(SerialService, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True

        # Reentrant lock to prevent concurrent connect/disconnect race conditions
        self._lock: threading.RLock = threading.RLock()

        # Serial port instance
        self._serial: Optional[serial.Serial] = None
        self._port_name: Optional[str] = None
        self._baud_rate: int = SERIAL_DEFAULT_BAUD

        # State flags
        self._is_connected: bool = False
        self._is_reconnecting: bool = False
        self._stop_reader: bool = False
        self._stop_reconnector: bool = False

        # Status and diagnostics
        self._last_error: Optional[str] = None
        self._last_received_time: Optional[str] = None
        self._total_messages_received: int = 0

        # Circular buffer for real-time data history
        self._data_buffer: deque = deque(maxlen=SERIAL_MAX_HISTORY)

        # Worker threads
        self._reader_thread: Optional[threading.Thread] = None
        self._reconnect_thread: Optional[threading.Thread] = None

        logger.info("SerialService initialized (non-blocking background mode)")

    @property
    def is_connected(self) -> bool:
        """Returns True if the serial port is currently open and connected."""
        with self._lock:
            return self._is_connected and (self._serial is not None) and self._serial.is_open

    def connect(self, port: str, baud_rate: int = SERIAL_DEFAULT_BAUD) -> Tuple[bool, str]:
        """
        Opens a serial connection to the specified COM port and starts the background reader.

        Args:
            port (str): COM port name (e.g., 'COM3', '/dev/ttyUSB0').
            baud_rate (int): Desired baud rate (e.g., 9600, 115200).

        Returns:
            Tuple[bool, str]: (success, message)
        """
        with self._lock:
            # Validate Port
            valid_port, port_err = validate_port(port, check_exists=False)
            if not valid_port:
                logger.warning(f"Connect failed - Invalid port '{port}': {port_err}")
                return False, port_err

            # Validate Baud Rate
            valid_baud, baud_err = validate_baud_rate(baud_rate)
            if not valid_baud:
                logger.warning(f"Connect failed - Invalid baud rate {baud_rate}: {baud_err}")
                return False, baud_err

            port_clean = port.strip()

            # Requirement 8: Prevent multiple connections to the same serial port
            if self.is_connected:
                if self._port_name == port_clean:
                    msg = f"Already connected to port '{port_clean}' at {self._baud_rate} bps"
                    logger.info(msg)
                    return True, msg
                else:
                    # Disconnect existing port before switching ports
                    logger.info(
                        f"Disconnecting active port '{self._port_name}' "
                        f"before connecting to '{port_clean}'"
                    )
                    self._close_connection_unlocked()

            # Stop any ongoing auto-reconnect loop when user initiates manual connect
            self._stop_reconnector = True

            try:
                logger.info(f"Opening serial port '{port_clean}' at {baud_rate} bps...")
                if port_clean.upper().startswith("SIMULATOR"):
                    self._serial = MockSerial(port_clean, baud_rate)
                else:
                    self._serial = serial.Serial(
                        port=port_clean,
                        baudrate=baud_rate,
                        timeout=SERIAL_READ_TIMEOUT,
                        write_timeout=3.0,
                    )
                self._port_name = port_clean
                self._baud_rate = baud_rate
                self._is_connected = True
                self._is_reconnecting = False
                self._last_error = None
                self._stop_reader = False

                # Launch non-blocking background reader thread
                self._reader_thread = threading.Thread(
                    target=self._reader_loop,
                    name=f"SerialReader-{port_clean}",
                    daemon=True,
                )
                self._reader_thread.start()

                success_msg = f"Successfully connected to {port_clean} at {baud_rate} bps"
                logger.info(success_msg)
                return True, success_msg

            except serial.SerialException as se:
                self._last_error = str(se)
                logger.error(f"SerialException opening port '{port_clean}': {se}")
                self._close_connection_unlocked()
                return False, f"Failed to open serial port '{port_clean}': {se}"
            except Exception as e:
                self._last_error = str(e)
                logger.error(f"Unexpected error opening port '{port_clean}': {e}", exc_info=True)
                self._close_connection_unlocked()
                return False, f"Unexpected error opening port '{port_clean}': {e}"

    def disconnect(self) -> Tuple[bool, str]:
        """
        Safely closes the active serial connection and stops background threads.

        Returns:
            Tuple[bool, str]: (success, message)
        """
        with self._lock:
            if not self.is_connected and not self._is_reconnecting:
                msg = "No active serial connection to disconnect"
                logger.info(msg)
                return True, msg

            old_port = self._port_name or "Unknown Port"
            self._stop_reconnector = True
            self._close_connection_unlocked()
            msg = f"Successfully disconnected from {old_port}"
            logger.info(msg)
            return True, msg

    def _close_connection_unlocked(self):
        """Internal helper to close serial port without re-acquiring lock."""
        self._stop_reader = True
        self._is_connected = False
        self._is_reconnecting = False

        if self._serial is not None:
            try:
                if self._serial.is_open:
                    self._serial.close()
            except Exception as e:
                logger.warning(f"Error closing serial port handle: {e}")
            finally:
                self._serial = None

    def _reader_loop(self):
        """
        Background daemon thread loop that reads serial data continuously.
        Handles unexpected disconnects and triggers automatic reconnection.
        """
        logger.info(f"Reader loop started for port '{self._port_name}'")

        while not self._stop_reader:
            try:
                with self._lock:
                    serial_handle = self._serial

                if serial_handle is None or not serial_handle.is_open:
                    break

                # Read line or raw bytes from hardware
                raw_bytes = serial_handle.readline()
                if raw_bytes and len(raw_bytes) > 0:
                    timestamp_iso = datetime.now(timezone.utc).isoformat()
                    try:
                        ascii_str = raw_bytes.decode("utf-8", errors="replace").strip()
                    except Exception:
                        ascii_str = str(raw_bytes)

                    hex_str = raw_bytes.hex(" ")

                    message_entry = {
                        "timestamp": timestamp_iso,
                        "raw": ascii_str,
                        "hex": hex_str,
                        "length": len(raw_bytes),
                    }

                    with self._lock:
                        self._data_buffer.append(message_entry)
                        self._last_received_time = timestamp_iso
                        self._total_messages_received += 1

            except (serial.SerialException, OSError) as disconnect_err:
                # Unexpected device disconnect (unplugged USB/Arduino)
                logger.error(
                    f"Unexpected disconnect on port '{self._port_name}': {disconnect_err}"
                )
                with self._lock:
                    self._last_error = f"Device unplugged / disconnect: {disconnect_err}"
                    self._is_connected = False
                    self._serial = None
                    # Trigger automatic reconnect loop
                    if not self._stop_reconnector:
                        self._start_reconnect_loop_unlocked()
                break
            except Exception as e:
                logger.error(f"Error in background serial reader loop: {e}", exc_info=True)
                time.sleep(0.1)

        logger.info(f"Reader loop terminated for port '{self._port_name}'")

    def _start_reconnect_loop_unlocked(self):
        """Initiates background thread to auto-reconnect when device reappears."""
        if self._is_reconnecting or not self._port_name:
            return

        self._is_reconnecting = True
        self._stop_reconnector = False

        self._reconnect_thread = threading.Thread(
            target=self._reconnect_loop,
            name=f"SerialReconnector-{self._port_name}",
            daemon=True,
        )
        self._reconnect_thread.start()
        logger.warning(
            f"Auto-reconnect enabled for '{self._port_name}' "
            f"(interval: {SERIAL_RECONNECT_INTERVAL}s)"
        )

    def _reconnect_loop(self):
        """
        Daemon loop that periodically checks system COM ports and attempts
        reconnection until successful or cancelled.
        """
        target_port = self._port_name
        target_baud = self._baud_rate

        while not self._stop_reconnector and not self.is_connected:
            logger.info(f"Attempting auto-reconnect to '{target_port}' at {target_baud} bps...")

            # Check if port is present in OS enumeration
            from utils import list_available_ports
            available_ports = [p["port"] for p in list_available_ports()]
            if target_port in available_ports:
                try:
                    with self._lock:
                        if self._stop_reconnector:
                            break
                        if target_port.upper().startswith("SIMULATOR"):
                            self._serial = MockSerial(target_port, target_baud)
                        else:
                            self._serial = serial.Serial(
                                port=target_port,
                                baudrate=target_baud,
                                timeout=SERIAL_READ_TIMEOUT,
                                write_timeout=3.0,
                            )
                        self._is_connected = True
                        self._is_reconnecting = False
                        self._last_error = None
                        self._stop_reader = False

                        self._reader_thread = threading.Thread(
                            target=self._reader_loop,
                            name=f"SerialReader-{target_port}",
                            daemon=True,
                        )
                        self._reader_thread.start()

                    logger.info(f"Auto-reconnect SUCCESS to '{target_port}'")
                    return
                except Exception as reconnect_err:
                    logger.warning(
                        f"Port '{target_port}' found but open failed: {reconnect_err}"
                    )
            else:
                logger.debug(f"Port '{target_port}' not yet detected by OS...")

            time.sleep(SERIAL_RECONNECT_INTERVAL)

        logger.info(f"Reconnect loop exited for '{target_port}'")

    def get_status(self) -> Dict[str, Any]:
        """
        Returns a dictionary summarizing the current serial connection status.
        """
        with self._lock:
            return {
                "connected": self.is_connected,
                "port": self._port_name,
                "baud_rate": self._baud_rate,
                "reconnecting": self._is_reconnecting,
                "error": self._last_error,
                "last_received_time": self._last_received_time,
                "total_messages_received": self._total_messages_received,
                "buffer_size": len(self._data_buffer),
            }

    def get_latest_data(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Returns the latest `limit` received serial data packets from history.

        Args:
            limit (int): Maximum number of entries to return (default 50).

        Returns:
            List[Dict[str, Any]]: List of message dictionaries ordered chronologically.
        """
        with self._lock:
            buffer_list = list(self._data_buffer)
            return buffer_list[-limit:] if limit > 0 else buffer_list

    def write_data(self, payload: str, is_hex: bool = False) -> Tuple[bool, str]:
        """
        Transmits data to the connected serial hardware device.

        Args:
            payload (str): The ASCII or HEX string to transmit.
            is_hex (bool): If True, interprets payload as a hex string.

        Returns:
            Tuple[bool, str]: (success, message)
        """
        with self._lock:
            if not self.is_connected or self._serial is None:
                return False, "Cannot write: No active serial connection"

            try:
                if is_hex:
                    data_bytes = bytes.fromhex(payload.replace(" ", ""))
                else:
                    data_bytes = payload.encode("utf-8")

                bytes_written = self._serial.write(data_bytes)
                self._serial.flush()
                logger.debug(f"Transmitted {bytes_written} byte(s) to '{self._port_name}'")
                return True, f"Successfully sent {bytes_written} byte(s)"
            except Exception as e:
                self._last_error = f"Write error: {e}"
                logger.error(f"Error transmitting to '{self._port_name}': {e}")
                return False, f"Write error: {e}"

    def inject_message(self, message: str) -> bool:
        """
        Injects a software message directly into the live data buffer for pure software testing.
        """
        timestamp_iso = datetime.now(timezone.utc).isoformat()
        raw_bytes = message.encode("utf-8")
        hex_str = raw_bytes.hex(" ")
        message_entry = {
            "timestamp": timestamp_iso,
            "raw": message,
            "hex": hex_str,
            "length": len(raw_bytes),
        }
        with self._lock:
            self._data_buffer.append(message_entry)
            self._last_received_time = timestamp_iso
            self._total_messages_received += 1
        return True
