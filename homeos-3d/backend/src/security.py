from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

password_hasher = PasswordHasher()

def hash_password(password):
    return password_hasher.hash(password)

def verify_password(password_hash, password):
    try:
        return password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerifyMismatchError):
        return False

def new_session_token():
    return secrets.token_urlsafe(32)

def session_token_hash(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

def session_expiry(max_age_seconds):
    return datetime.now(UTC) + timedelta(seconds = max_age_seconds)

def set_display_cookie(response, settings, token):
    max_age = settings.display_cookie_max_age_seconds
    response.set_cookie(key = settings.display_cookie_name, value = token, max_age = max_age, expires = datetime.now(UTC) + timedelta(seconds = max_age), httponly = True, secure = settings.cookie_secure, samesite = 'lax', path = '/')
