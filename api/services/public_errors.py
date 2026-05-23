import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)

def public_http_error(
    *,
    status_code: int,
    public_detail: str,
    exc: Exception | None = None,
    log_context: str = "",
) -> HTTPException:
    if exc is not None:
        logger.exception("%s: %s", log_context or public_detail, exc)
    return HTTPException(status_code=status_code, detail=public_detail)
