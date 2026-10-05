from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

import yaml
from dotenv import dotenv_values, set_key

from config import BASE_DIR, ConfigError, load_settings


ENV_FIELDS = {
    "telegram": ["TG_USER_ID"],
    "llm": [
        "LLM_PROVIDER", "LLM_MODEL", "LLM_TIMEOUT_SECONDS", "LLM_MAX_RETRIES",
        "LLM_TEMPERATURE", "LLM_MAX_OUTPUT_TOKENS", "LLM_MAX_REQUESTS_PER_DAY",
        "OLLAMA_URL", "MISTRAL_BASE_URL", "OPENAI_COMPATIBLE_BASE_URL",
        "OPENAI_COMPATIBLE_JSON_MODE", "OPENAI_COMPATIBLE_REASONING_ENABLED",
    ],
    "mode": ["APP_MODE", "ENABLE_REAL_APPLY"],
    "browser": ["BROWSER_BACKEND", "BROWSER_HEADLESS", "BROWSER_PROFILE_DIR"],
    "limits": [
        "CHECK_INTERVAL_MINUTES", "MAX_APPLICATIONS_PER_DAY", "MAX_VACANCIES_PER_QUERY",
        "MAX_PAGES_PER_QUERY", "MIN_SECONDS_BETWEEN_ACTIONS", "APPROVAL_TTL_MINUTES",
        "CAPTCHA_TIMEOUT_SECONDS", "CAPTCHA_MAX_ATTEMPTS", "CIRCUIT_BREAKER_MIN_SAMPLE",
        "CIRCUIT_BREAKER_UNKNOWN_RATIO", "CIRCUIT_BREAKER_PAGE_ERRORS",
    ],
    "auto_apply": [
        "AUTO_APPLY_ENABLED", "AUTO_APPLY_MIN_CONFIDENCE", "AUTO_APPLY_MIN_BATCH_SIZE",
        "AUTO_APPLY_MAX_BATCH_SIZE", "AUTO_APPLY_MIN_INTERVAL_HOURS",
        "AUTO_APPLY_MAX_INTERVAL_HOURS", "AUTO_APPLY_START_HOUR",
        "AUTO_APPLY_END_HOUR", "AUTO_APPLY_TIMEZONE",
    ],
}

SECRET_FIELDS = {
    "TG_BOT_TOKEN": "telegram_bot_token",
    "MISTRAL_API_KEY": "mistral_api_key",
    "MISTRAL_KEYS_MASTER_KEY": "mistral_keys_master_key",
    "OPENAI_COMPATIBLE_API_KEY": "openai_compatible_api_key",
}

PROFILE_SECTIONS = ("candidate", "hh", "cover_letter")


class SettingsStore:
    def __init__(
        self,
        env_path: Path | None = None,
        profile_path: Path | None = None,
    ) -> None:
        self.env_path = env_path or BASE_DIR / ".env"
        self.profile_path = profile_path or BASE_DIR / "profile.yaml"

    def _env(self) -> dict[str, str]:
        return {
            key: value
            for key, value in dotenv_values(self.env_path, encoding="utf-8").items()
            if value is not None
        } if self.env_path.exists() else {}

    def _profile(self) -> dict[str, Any]:
        if not self.profile_path.exists():
            return {}
        raw = yaml.safe_load(self.profile_path.read_text(encoding="utf-8")) or {}
        return raw if isinstance(raw, dict) else {}

    def public(self) -> dict[str, Any]:
        env = self._env()
        profile = self._profile()
        data: dict[str, Any] = {}
        for section, fields in ENV_FIELDS.items():
            data[section] = {field: env.get(field, "") for field in fields}
        data["secrets"] = {
            public_name: bool(env.get(env_key, "").strip())
            for env_key, public_name in SECRET_FIELDS.items()
        }
        for section in PROFILE_SECTIONS:
            value = profile.get(section, {})
            data[section] = value if isinstance(value, dict) else {}
        data["infrastructure"] = {
            "AGENT_API_ENABLED": env.get("AGENT_API_ENABLED", "false"),
            "AGENT_API_HOST": env.get("AGENT_API_HOST", "127.0.0.1"),
            "AGENT_API_PORT": env.get("AGENT_API_PORT", "8787"),
            "note": "Bootstrap connection settings stay local and are intentionally locked.",
        }
        return data

    def update(self, payload: dict[str, Any]) -> dict[str, Any]:
        current_env = self._env()
        current_profile = self._profile()

        with tempfile.TemporaryDirectory(prefix="hh-agent-settings-") as td:
            tmp_env = Path(td) / ".env"
            tmp_profile = Path(td) / "profile.yaml"
            if self.env_path.exists():
                shutil.copy2(self.env_path, tmp_env)
            else:
                tmp_env.write_text("", encoding="utf-8")

            for section, fields in ENV_FIELDS.items():
                incoming = payload.get(section)
                if not isinstance(incoming, dict):
                    continue
                for field in fields:
                    if field not in incoming:
                        continue
                    value = incoming[field]
                    if isinstance(value, bool):
                        value = "true" if value else "false"
                    elif value is None:
                        value = ""
                    else:
                        value = str(value).strip()
                    set_key(str(tmp_env), field, value, quote_mode="auto")

            incoming_secrets = payload.get("secret_values", {})
            if isinstance(incoming_secrets, dict):
                reverse = {public: env_key for env_key, public in SECRET_FIELDS.items()}
                for public_name, raw_value in incoming_secrets.items():
                    env_key = reverse.get(public_name)
                    if not env_key:
                        continue
                    value = str(raw_value or "").strip()
                    # Empty input means keep the existing secret.
                    if value:
                        set_key(str(tmp_env), env_key, value, quote_mode="always")

            merged_profile = dict(current_profile)
            for section in PROFILE_SECTIONS:
                incoming = payload.get(section)
                if isinstance(incoming, dict):
                    merged_profile[section] = incoming
            tmp_profile.write_text(
                yaml.safe_dump(merged_profile, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )

            try:
                load_settings(env_path=tmp_env, profile_path=tmp_profile, environ={})
            except (ConfigError, ValueError, TypeError) as exc:
                raise ValueError(str(exc)) from exc

            shutil.copy2(tmp_env, self.env_path)
            shutil.copy2(tmp_profile, self.profile_path)

        result = self.public()
        result["restart_required"] = True
        return result
