"""
serial_routes.py

REST API Blueprint for the PySerial hardware service.
Exposes JSON-formatted endpoints for managing hardware communication:
- GET  /serial/ports         -> Enumerate detected COM ports on the system
- POST /serial/connect       -> Open a non-blocking serial connection
- POST /serial/disconnect    -> Safely disconnect from the active COM port
- GET  /serial/status        -> Retrieve connection health and auto-reconnect state
- GET  /serial/latest-data    -> Query recently received hardware messages
- POST /serial/write         -> Transmit ASCII or HEX commands to the hardware
"""

from flask import Blueprint, request
from serial_service import SerialService
from utils import (
    setup_logger,
    list_available_ports,
    validate_port,
    validate_baud_rate,
    format_json_response,
)
from config import SERIAL_DEFAULT_BAUD

logger = setup_logger(__name__)
serial_bp = Blueprint("serial", __name__, url_prefix="/serial")


@serial_bp.route("/ports", methods=["GET"])
def get_ports():
    """
    GET /serial/ports

    Automatically detects and returns all available COM ports on the host system.
    """
    try:
        ports = list_available_ports()
        return format_json_response(success=True, data={"ports": ports})
    except Exception as e:
        logger.error(f"Error in GET /serial/ports: {e}", exc_info=True)
        return format_json_response(success=False, error=str(e), status_code=500)


@serial_bp.route("/connect", methods=["POST"])
def connect_serial():
    """
    POST /serial/connect

    Opens a connection to the specified COM port at the requested baud rate.
    JSON Body:
    {
        "port": "COM3",
        "baud_rate": 9600
    }
    """
    try:
        body = request.get_json(silent=True) or {}
        port = body.get("port", "").strip()
        baud_rate = body.get("baud_rate", SERIAL_DEFAULT_BAUD)

        # Validate COM port name
        valid_port, port_err = validate_port(port, check_exists=False)
        if not valid_port:
            return format_json_response(success=False, error=port_err, status_code=400)

        # Validate baud rate value
        valid_baud, baud_err = validate_baud_rate(baud_rate)
        if not valid_baud:
            return format_json_response(success=False, error=baud_err, status_code=400)

        service = SerialService()
        success, message = service.connect(port=port, baud_rate=int(baud_rate))

        status_code = 200 if success else 400
        return format_json_response(
            success=success,
            data={"message": message, "status": service.get_status()},
            error=None if success else message,
            status_code=status_code,
        )
    except Exception as e:
        logger.error(f"Error in POST /serial/connect: {e}", exc_info=True)
        return format_json_response(success=False, error=str(e), status_code=500)


@serial_bp.route("/disconnect", methods=["POST"])
def disconnect_serial():
    """
    POST /serial/disconnect

    Safely terminates the active serial port connection and cancels auto-reconnect.
    """
    try:
        service = SerialService()
        success, message = service.disconnect()
        return format_json_response(
            success=success,
            data={"message": message, "status": service.get_status()},
            status_code=200 if success else 400,
        )
    except Exception as e:
        logger.error(f"Error in POST /serial/disconnect: {e}", exc_info=True)
        return format_json_response(success=False, error=str(e), status_code=500)


@serial_bp.route("/status", methods=["GET"])
def get_serial_status():
    """
    GET /serial/status

    Returns real-time connection status, port, baud rate, and error state.
    """
    try:
        service = SerialService()
        status = service.get_status()
        return format_json_response(success=True, data={"status": status})
    except Exception as e:
        logger.error(f"Error in GET /serial/status: {e}", exc_info=True)
        return format_json_response(success=False, error=str(e), status_code=500)


@serial_bp.route("/latest-data", methods=["GET"])
def get_latest_data():
    """
    GET /serial/latest-data?limit=50

    Retrieves recently received serial data messages from circular buffer.
    Query Parameters:
        limit (int): Maximum messages to return (default 50, max 500).
    """
    try:
        limit_param = request.args.get("limit", default=50, type=int)
        limit_clamped = max(1, min(limit_param, 500))

        service = SerialService()
        messages = service.get_latest_data(limit=limit_clamped)

        return format_json_response(
            success=True,
            data={
                "messages": messages,
                "count": len(messages),
                "limit": limit_clamped,
            },
        )
    except Exception as e:
        logger.error(f"Error in GET /serial/latest-data: {e}", exc_info=True)
        return format_json_response(success=False, error=str(e), status_code=500)


@serial_bp.route("/write", methods=["POST"])
def write_serial():
    """
    POST /serial/write

    Transmits string or HEX command data to the connected serial hardware.
    JSON Body:
    {
        "payload": "HELLO\\n",
        "is_hex": false
    }
    """
    try:
        body = request.get_json(silent=True) or {}
        payload = body.get("payload", "")
        is_hex = bool(body.get("is_hex", False))

        if not isinstance(payload, str) or len(payload) == 0:
            return format_json_response(
                success=False,
                error="Payload must be a non-empty string",
                status_code=400,
            )

        service = SerialService()
        success, message = service.write_data(payload=payload, is_hex=is_hex)

        status_code = 200 if success else 400
        return format_json_response(
            success=success,
            data={"message": message} if success else None,
            error=None if success else message,
            status_code=status_code,
        )
    except Exception as e:
        logger.error(f"Error in POST /serial/write: {e}", exc_info=True)
        return format_json_response(success=False, error=str(e), status_code=500)


@serial_bp.route("/inject", methods=["POST"])
def inject_serial():
    """
    POST /serial/inject

    Injects a simulated software message directly into the live data stream.
    Requires JSON body:
    {
        "message": "RFID_READ: Student ID #1002 Checked In"
    }
    """
    try:
        body = request.get_json(silent=True) or {}
        message = body.get("message", "")
        if not isinstance(message, str) or len(message) == 0:
            return format_json_response(
                success=False,
                error="Message must be a non-empty string",
                status_code=400,
            )
        service = SerialService()
        service.inject_message(message=message)
        return format_json_response(
            success=True,
            data={"message": f"Successfully injected message into live console"},
            status_code=200,
        )
    except Exception as e:
        logger.error(f"Error in POST /serial/inject: {e}", exc_info=True)
        return format_json_response(success=False, error=str(e), status_code=500)

