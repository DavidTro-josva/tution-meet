"""
main.py

Application entry point for the Tuition Meet Python PySerial Hardware Service.
Initializes the Flask web application, configures CORS for cross-origin access
from the Tuition Meet frontend (port 5005), registers REST endpoints, and starts
the server.
"""

from flask import Flask, jsonify
from flask_cors import CORS
from config import SERIAL_API_HOST, SERIAL_API_PORT
from utils import setup_logger, format_json_response
from serial_routes import serial_bp
from serial_service import SerialService

logger = setup_logger(__name__)


def create_app() -> Flask:
    """
    Factory function that creates and configures the Flask application.

    Returns:
        Flask: Configured Flask application instance.
    """
    app = Flask(__name__)

    # Enable CORS for all routes under /serial so web frontend on 5005 can query it
    CORS(app, resources={r"/*": {"origins": "*"}})

    # Register serial blueprint
    app.register_blueprint(serial_bp)

    @app.route("/", methods=["GET"])
    def index():
        """
        GET /
        
        Root index endpoint returning service metadata and available API routes.
        """
        return format_json_response(
            success=True,
            data={
                "service": "Tuition Meet PySerial Hardware Service",
                "status": "online",
                "port": SERIAL_API_PORT,
                "endpoints": {
                    "health": "GET /health",
                    "ports": "GET /serial/ports",
                    "status": "GET /serial/status",
                    "connect": "POST /serial/connect",
                    "disconnect": "POST /serial/disconnect",
                    "latest_data": "GET /serial/latest-data",
                    "write": "POST /serial/write",
                },
                "documentation": "Use the Tuition Meet web interface on port 5005 (click 🔌 Hardware Serial button) or query the endpoints above.",
            },
        )

    @app.route("/favicon.ico", methods=["GET"])
    def favicon():
        return "", 204

    @app.route("/health", methods=["GET"])
    def health_check():
        """
        GET /health

        Simple health check endpoint to verify that the Serial Service is online.
        """
        return format_json_response(
            success=True,
            data={
                "service": "Tuition Meet PySerial Hardware Service",
                "status": "online",
                "port": SERIAL_API_PORT,
            },
        )

    @app.errorhandler(404)
    def not_found(error):
        return format_json_response(
            success=False,
            error="Endpoint not found",
            status_code=404,
        )

    @app.errorhandler(500)
    def server_error(error):
        logger.error(f"Unhandled Internal Server Error: {error}", exc_info=True)
        return format_json_response(
            success=False,
            error="Internal server error",
            status_code=500,
        )

    return app


if __name__ == "__main__":
    logger.info("=========================================================")
    logger.info("  Starting Tuition Meet PySerial Hardware Service")
    logger.info("=========================================================")
    logger.info(f"Binding to {SERIAL_API_HOST}:{SERIAL_API_PORT}")

    # Initialize SerialService singleton early
    _ = SerialService()

    app = create_app()
    app.run(
        host=SERIAL_API_HOST,
        port=SERIAL_API_PORT,
        debug=False,
        threaded=True,
    )
