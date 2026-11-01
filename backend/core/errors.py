class DomainError(Exception):
    """Base class; the API layer maps subclasses to HTTP status codes."""


class NotFound(DomainError):
    pass


class PermissionDenied(DomainError):
    pass


class Invalid(DomainError):
    pass
