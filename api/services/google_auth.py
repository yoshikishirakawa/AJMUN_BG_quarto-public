"""
Google OAuth Authentication Service
"""
import os
import json
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request

from api.services.runtime_config import is_production_env


# OAuth 2.0 scopes required
SCOPES = [
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
]


class GoogleAuthService:
    """Google OAuth authentication service."""
    
    def __init__(self):
        self.credentials: Optional[Credentials] = None
        self.user_info: Optional[dict] = None
        
        # Path to store credentials
        self.project_root = Path(__file__).parent.parent.parent.resolve()
        self.credentials_path = self._resolve_credentials_path()
        
        self.token_file = self.credentials_path / "token.json"
        self.client_secrets_file = self.credentials_path / "client_secret.json"
        
        # Load existing credentials if available
        self._load_credentials()

    def _resolve_credentials_path(self) -> Path:
        configured = os.getenv("GOOGLE_CREDENTIALS_DIR", "").strip()

        if configured:
            path = Path(configured).expanduser()
            if not path.is_absolute():
                path = self.project_root / path
        else:
            if is_production_env():
                raise RuntimeError("GOOGLE_CREDENTIALS_DIR is required in production")
            path = self.project_root / ".credentials"

        resolved = path.resolve()

        if is_production_env():
            try:
                resolved.relative_to(self.project_root)
            except ValueError:
                pass
            else:
                raise RuntimeError("GOOGLE_CREDENTIALS_DIR must be outside the repository in production")

        resolved.mkdir(parents=True, exist_ok=True)
        return resolved
    
    def _load_credentials(self):
        """Load credentials from file if available."""
        if self.token_file.exists():
            try:
                self.credentials = Credentials.from_authorized_user_file(
                    str(self.token_file),
                    SCOPES,
                )
            except Exception as e:
                print(f"Failed to load credentials: {e}")
    
    def _save_credentials(self):
        """Save credentials to file."""
        if self.credentials:
            with open(self.token_file, "w") as f:
                f.write(self.credentials.to_json())
            try:
                self.token_file.chmod(0o600)
            except OSError:
                pass

    def _extract_client_config(self, json_content: dict) -> dict:
        client_config = json_content.get("web") or json_content.get("installed")
        if not client_config:
            raise ValueError("Invalid client secrets file. It must be for a web or installed app.")

        required_fields = ["client_id", "client_secret", "token_uri"]
        missing_fields = [field for field in required_fields if not client_config.get(field)]
        if missing_fields:
            raise ValueError(
                "Client secrets file is missing required fields: " + ", ".join(missing_fields)
            )

        return client_config

    def save_client_secrets(self, json_content: dict):
        """
        Validate and save client secrets JSON.
        
        Args:
            json_content: The parsed JSON content of the client secrets file.
            
        Raises:
            ValueError: If the JSON structure is invalid.
        """
        self._extract_client_config(json_content)

        with open(self.client_secrets_file, "w") as f:
            json.dump(json_content, f, indent=2)
        try:
            self.client_secrets_file.chmod(0o600)
        except OSError:
            pass

    def _get_allowed_redirect_uris(self) -> list[str]:
        raw = os.getenv("ALLOWED_REDIRECT_URIS", "")
        allowed = [uri.strip() for uri in raw.split(",") if uri.strip()]
        if not allowed:
            raise ValueError("ALLOWED_REDIRECT_URIS is not configured")
        return allowed

    def _validate_redirect_uri(self, redirect_uri: str) -> None:
        if redirect_uri not in self._get_allowed_redirect_uris():
            raise ValueError(f"redirect_uri '{redirect_uri}' is not in allowed list")

    def _load_client_config(self) -> dict:
        if not self.client_secrets_file.exists():
            raise FileNotFoundError(
                f"Client secrets file not found at {self.client_secrets_file}. "
                "Please download it from Google Cloud Console and place it there."
            )

        json_content = json.loads(self.client_secrets_file.read_text(encoding="utf-8"))
        return self._extract_client_config(json_content)
    
    def get_auth_url(self, redirect_uri: str, state: str | None = None) -> str:
        """
        Generate OAuth authorization URL.
        
        Args:
            redirect_uri: The URI to redirect to after authorization.
            
        Returns:
            The authorization URL.
        """
        self._validate_redirect_uri(redirect_uri)

        if not self.client_secrets_file.exists():
            raise FileNotFoundError(
                f"Client secrets file not found at {self.client_secrets_file}. "
                "Please download it from Google Cloud Console and place it there."
            )

        flow = Flow.from_client_secrets_file(
            str(self.client_secrets_file),
            scopes=SCOPES,
            redirect_uri=redirect_uri,
        )
        
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        
        return auth_url
    
    async def exchange_code(self, code: str, redirect_uri: str) -> dict:
        """
        Exchange authorization code for tokens.
        
        Args:
            code: Authorization code from OAuth callback.
            redirect_uri: The same redirect URI used for authorization.
            
        Returns:
            Token information dictionary.
        """
        self._validate_redirect_uri(redirect_uri)

        flow = Flow.from_client_secrets_file(
            str(self.client_secrets_file),
            scopes=SCOPES,
            redirect_uri=redirect_uri,
        )
        
        flow.fetch_token(code=code)
        self.credentials = flow.credentials
        self._save_credentials()
        
        # Fetch user info
        await self._fetch_user_info()
        
        return {
            "access_token": self.credentials.token,
            "refresh_token": self.credentials.refresh_token,
            "expires_in": int((self.credentials.expiry - datetime.utcnow()).total_seconds()),
            "token_type": "Bearer",
        }
    
    async def refresh_token(self) -> dict:
        """
        Refresh the stored OAuth credentials.
            
        Returns:
            New token information dictionary.
        """
        client_config = self._load_client_config()
        if not self.credentials:
            self._load_credentials()
        if not self.credentials or not self.credentials.refresh_token:
            raise ValueError("Stored Google credentials do not include a refresh token")

        credentials = Credentials(
            token=self.credentials.token if self.credentials and self.credentials.token else None,
            refresh_token=self.credentials.refresh_token,
            token_uri=client_config["token_uri"],
            client_id=client_config["client_id"],
            client_secret=client_config["client_secret"],
            scopes=SCOPES,
        )

        credentials.refresh(Request())
        self.credentials = credentials
        self._save_credentials()

        await self._fetch_user_info()
        
        return {
            "access_token": self.credentials.token,
            "refresh_token": self.credentials.refresh_token,
            "expires_in": int((self.credentials.expiry - datetime.utcnow()).total_seconds()),
            "token_type": "Bearer",
        }
    
    async def _fetch_user_info(self):
        """Fetch user info from Google."""
        import httpx
        
        if not self.credentials or not self.credentials.token:
            return
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {self.credentials.token}"},
            )
            if response.status_code == 200:
                self.user_info = response.json()
    
    async def get_status(self) -> dict:
        """
        Get current authentication status.
        
        Returns:
            Dictionary with authentication status.
        """
        if not self.credentials:
            return {
                "authenticated": False,
                "configured": self.client_secrets_file.exists()
            }
        
        # Check if token is expired
        if self.credentials.expired:
            try:
                self.credentials.refresh(Request())
                self._save_credentials()
            except Exception:
                return {"authenticated": False}
        
        # Fetch user info if not available
        if not self.user_info:
            await self._fetch_user_info()
        
        return {
            "authenticated": True,
            "configured": self.client_secrets_file.exists(),
            "email": self.user_info.get("email") if self.user_info else None,
            "name": self.user_info.get("name") if self.user_info else None,
            "picture": self.user_info.get("picture") if self.user_info else None,
        }
    
    async def logout(self):
        """Logout and clear credentials."""
        self.credentials = None
        self.user_info = None
        
        if self.token_file.exists():
            self.token_file.unlink()
    
    def get_credentials(self) -> Optional[Credentials]:
        """
        Get current credentials for API calls.
        
        Returns:
            Credentials object or None if not authenticated.
        """
        if not self.credentials:
            return None
        
        # Refresh if expired
        if self.credentials.expired and self.credentials.refresh_token:
            self.credentials.refresh(Request())
            self._save_credentials()
        
        return self.credentials
