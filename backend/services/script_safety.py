"""Keep legacy destructive/demo utilities away from a live database."""
from urllib.parse import urlparse


def require_local_scratch_database(uri: str, name: str) -> None:
    parsed = urlparse(uri)
    if (parsed.scheme != "mongodb" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
            or not name.startswith(("ayushman_test", "ayushman_demo", "ayushman_load_"))):
        raise RuntimeError("This legacy utility is restricted to a localhost scratch database named ayushman_test*, ayushman_demo* or ayushman_load_*. Production migration requires a reviewed backup and migration procedure.")
