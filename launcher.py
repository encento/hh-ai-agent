from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

from dotenv import dotenv_values, set_key

from config import ConfigError, load_settings


BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
RESTART_EXIT_CODE = 75


def _env_values() -> dict[str, str]:
    values = {
        key: value
        for key, value in dotenv_values(ENV_PATH, encoding="utf-8").items()
        if value is not None
    } if ENV_PATH.exists() else {}
    values.update(os.environ)
    return values


def _ensure_bootstrap_env() -> dict[str, str]:
    values = _env_values()
    api_key = values.get("AGENT_API_KEY", "").strip()
    if not api_key:
        print()
        print("Первый запуск HH Job Agent.")
        print("Нужен только локальный API key для связи с dashboard.")
        api_key = input("AGENT_API_KEY: ").strip()
        if not api_key:
            raise SystemExit("AGENT_API_KEY не может быть пустым")
        if not ENV_PATH.exists():
            ENV_PATH.write_text("", encoding="utf-8")
        set_key(str(ENV_PATH), "AGENT_API_KEY", api_key, quote_mode="always")
    if not ENV_PATH.exists():
        ENV_PATH.write_text("", encoding="utf-8")
    defaults = {
        "AGENT_API_ENABLED": "true",
        "AGENT_API_HOST": "127.0.0.1",
        "AGENT_API_PORT": "8787",
    }
    for key, value in defaults.items():
        if not values.get(key, "").strip():
            set_key(str(ENV_PATH), key, value, quote_mode="never")
    return _env_values()


def _config_is_valid() -> tuple[bool, str]:
    try:
        load_settings()
        return True, ""
    except (ConfigError, ValueError, TypeError) as exc:
        return False, str(exc)


def _run_bootstrap(env: dict[str, str]) -> int:
    host = env.get("AGENT_API_HOST", "127.0.0.1")
    port = env.get("AGENT_API_PORT", "8787")
    print()
    print("Настройка агента ещё не завершена.")
    print(f"Запускаю config API на http://{host}:{port}")
    print("Остальные настройки заполни во фронте → Настройки.")
    code = (
        "import uvicorn; "
        "from bootstrap_api import create_bootstrap_app; "
        f"uvicorn.run(create_bootstrap_app(), host={host!r}, port={int(port)}, "
        "log_level='warning', access_log=False)"
    )
    child_env = dict(env)
    child_env["AGENT_SUPERVISED"] = "1"
    return subprocess.call([sys.executable, "-c", code], cwd=BASE_DIR, env=child_env)


def _run_agent(env: dict[str, str]) -> int:
    child_env = dict(env)
    child_env["AGENT_SUPERVISED"] = "1"
    return subprocess.call([sys.executable, "main.py"], cwd=BASE_DIR, env=child_env)


def main() -> int:
    while True:
        env = _ensure_bootstrap_env()
        valid, error = _config_is_valid()
        if valid:
            print("Конфигурация готова. Запускаю HH Job Agent...")
            code = _run_agent(env)
        else:
            print("Полная конфигурация пока не готова — это нормально.")
            if error:
                first_line = error.splitlines()[0]
                print(f"Причина: {first_line}")
            code = _run_bootstrap(env)

        if code != RESTART_EXIT_CODE:
            return code
        print("Перезапускаю с обновлёнными настройками...")
        time.sleep(0.8)


if __name__ == "__main__":
    raise SystemExit(main())
