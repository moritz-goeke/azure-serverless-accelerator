import os
import sys
from openai import AzureOpenAI
from pathlib import Path
import json
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent))
from guardrails import GuardrailsConfig, GuardrailsClient

ROOT_DIR = Path(__file__).resolve().parents[1]
SETTINGS_FILE = ROOT_DIR / "azurefile" / "chat-settings.json"
REQUESTS_FILE = ROOT_DIR / "azurefile" / "chat-requests.json"
RESULTS_DIR = ROOT_DIR / "azurefile" / "chat-results-guardrails-enabled"


def safe_filename(value: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in value)
    return cleaned or "setting"


def parse_settings(payload: object) -> tuple[dict, list[dict]]:
    # Supports either a top-level {"settings": [...]} format or a legacy single-setting object.
    if isinstance(payload, dict) and "settings" in payload:
        settings = payload.get("settings")
        if not isinstance(settings, list):
            raise ValueError("settings in chat-settings.json must be an array")
        global_defaults = {k: v for k, v in payload.items() if k != "settings"}
        return global_defaults, settings

    if isinstance(payload, list):
        return {}, payload

    if isinstance(payload, dict):
        return {}, [payload]

    raise ValueError("azurefile/chat-settings.json must be an object or array")


def resolve_request_defaults(global_defaults: dict, setting: dict) -> dict:
    global_request_defaults = global_defaults.get("request_defaults", {})
    if not isinstance(global_request_defaults, dict):
        raise ValueError("Top-level request_defaults in chat-settings.json must be an object")

    global_parameters = global_defaults.get("parameters", {})
    if not isinstance(global_parameters, dict):
        raise ValueError("Top-level parameters in chat-settings.json must be an object")

    setting_request_defaults = setting.get("request_defaults", {})
    if not isinstance(setting_request_defaults, dict):
        raise ValueError("request_defaults must be an object")

    setting_parameters = setting.get("parameters", {})
    if not isinstance(setting_parameters, dict):
        raise ValueError("parameters must be an object")

    return {
        **global_request_defaults,
        **global_parameters,
        **setting_request_defaults,
        **setting_parameters,
    }


def build_effective_messages(
    request_messages: object,
    model_instructions: str,
    safety_system_message: str,
    past_messages_included: int | None,
) -> list:
    if not isinstance(request_messages, list):
        raise ValueError("messages must be an array")

    base_messages = request_messages
    if past_messages_included is not None:
        if not isinstance(past_messages_included, int) or past_messages_included < 0:
            raise ValueError("past_messages_included must be a non-negative integer")
        base_messages = base_messages[-past_messages_included:] if past_messages_included > 0 else []

    injected_messages = []
    if model_instructions:
        injected_messages.append({"role": "system", "content": model_instructions})
    if safety_system_message:
        injected_messages.append({"role": "system", "content": safety_system_message})

    return [*injected_messages, *base_messages]


def load_root_env():
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_root_env()

if not SETTINGS_FILE.exists():
    raise FileNotFoundError(f"Settings file not found: {SETTINGS_FILE}")
if not REQUESTS_FILE.exists():
    raise FileNotFoundError(f"Requests file not found: {REQUESTS_FILE}")

settings_payload = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
requests_payload = json.loads(REQUESTS_FILE.read_text(encoding="utf-8"))

if not isinstance(requests_payload, list):
    raise ValueError("azurefile/chat-requests.json must be a JSON array")

subscription_key = os.getenv("AZURE_OPENAI_API_KEY")
if not subscription_key:
    raise ValueError("AZURE_OPENAI_API_KEY not found in environment or root .env")

global_defaults, settings_list = parse_settings(settings_payload)
if not settings_list:
    raise ValueError("No settings found in azurefile/chat-settings.json")

RESULTS_DIR.mkdir(parents=True, exist_ok=True)
seen_ids = set()
total_settings = len(settings_list)
total_cases = len(requests_payload)

print(f"start: {total_settings} settings x {total_cases} requests")

for setting_index, setting in enumerate(settings_list, start=1):
    if not isinstance(setting, dict):
        raise ValueError("Each setting in chat-settings.json must be an object")

    setting_id = setting.get("id")
    if not setting_id or not isinstance(setting_id, str):
        raise ValueError("Each setting must include a string id")
    if setting_id in seen_ids:
        raise ValueError(f"Duplicate setting id found: {setting_id}")
    seen_ids.add(setting_id)

    endpoint = setting.get("endpoint") or global_defaults.get("endpoint") or os.getenv("AZURE_OPENAI_ENDPOINT")
    default_deployment = setting.get("deployment") or global_defaults.get("deployment")
    api_version = setting.get("api_version") or global_defaults.get("api_version") or "2024-12-01-preview"

    if not endpoint:
        raise ValueError(f"AZURE_OPENAI_ENDPOINT not found for setting: {setting_id}")
    if not default_deployment:
        raise ValueError(f"deployment not found for setting: {setting_id}")

    request_timeout_seconds = (
        setting.get("request_timeout_seconds")
        or global_defaults.get("request_timeout_seconds")
        or 60
    )
    max_retries = setting.get("max_retries")
    if max_retries is None:
        max_retries = global_defaults.get("max_retries", 1)

    if not isinstance(request_timeout_seconds, (int, float)) or request_timeout_seconds <= 0:
        raise ValueError(f"request_timeout_seconds must be a positive number for setting: {setting_id}")
    if not isinstance(max_retries, int) or max_retries < 0:
        raise ValueError(f"max_retries must be a non-negative integer for setting: {setting_id}")

    model_instructions = setting.get("model_instructions")
    if model_instructions is None:
        model_instructions = global_defaults.get("model_instructions")
    if model_instructions is None:
        model_instructions = ""
    if not isinstance(model_instructions, str):
        raise ValueError(f"model_instructions must be a string for setting: {setting_id}")

    safety_system_message = setting.get("safety_system_message")
    if safety_system_message is None:
        safety_system_message = global_defaults.get("safety_system_message")
    if safety_system_message is None:
        safety_system_message = ""
    if not isinstance(safety_system_message, str):
        raise ValueError(f"safety_system_message must be a string for setting: {setting_id}")

    past_messages_included = setting.get("past_messages_included")
    if past_messages_included is None:
        past_messages_included = global_defaults.get("past_messages_included")
    if past_messages_included is not None and (
        not isinstance(past_messages_included, int) or past_messages_included < 0
    ):
        raise ValueError(f"past_messages_included must be a non-negative integer for setting: {setting_id}")

    request_defaults = resolve_request_defaults(global_defaults, setting)
    client = AzureOpenAI(
        api_version=api_version,
        azure_endpoint=endpoint,
        api_key=subscription_key,
        max_retries=max_retries,
    )
    guardrails_config = GuardrailsConfig.from_setting(global_defaults, setting)
    guardrails_client = GuardrailsClient(guardrails_config)

    results = []
    if guardrails_config.enabled:
        print(
            f"  guardrails: ENABLED"
            f" | endpoint={guardrails_config.endpoint}"
            f" | input_check={guardrails_config.input_check}"
            f" | output_check={guardrails_config.output_check}"
            f" | prompt_shield={guardrails_config.prompt_shield}"
            f" | thresholds={guardrails_config.thresholds}"
        )
    else:
        print(f"  guardrails: DISABLED (set AZURE_CONTENT_SAFETY_ENDPOINT to enable)")
    print(
        f"setting [{setting_index}/{total_settings}] id={setting_id} "
        f"deployment={default_deployment} timeout={request_timeout_seconds}s retries={max_retries}"
    )

    for index, item in enumerate(requests_payload, start=1):
        if not isinstance(item, dict):
            results.append(
                {
                    "id": f"case_{index:03d}",
                    "error": "Each item in chat-requests.json must be an object",
                }
            )
            continue

        case_id = item.get("id") or f"case_{index:03d}"
        deployment = item.get("deployment") or default_deployment
        request_body = item.get("request", item)

        print(f"  run [{index}/{total_cases}] case={case_id} model={deployment}")

        if not isinstance(request_body, dict):
            results.append(
                {
                    "id": case_id,
                    "error": "request must be an object",
                }
            )
            continue

        merged_request = {**request_defaults, **request_body}
        if "messages" not in merged_request:
            results.append(
                {
                    "id": case_id,
                    "error": "messages are required in each request",
                }
            )
            continue

        effective_messages = build_effective_messages(
            merged_request.get("messages"),
            model_instructions=model_instructions,
            safety_system_message=safety_system_message,
            past_messages_included=past_messages_included,
        )
        merged_request["messages"] = effective_messages

        default_settings = {k: v for k, v in request_defaults.items() if k != "messages"}
        request_overrides = {k: v for k, v in request_body.items() if k != "messages"}
        effective_settings = {k: v for k, v in merged_request.items() if k != "messages"}
        request_settings_detail = {
            "setting_id": setting_id,
            "setting_index": setting_index,
            "api_version": api_version,
            "default_deployment": default_deployment,
            "model_instructions": model_instructions,
            "safety_system_message": safety_system_message,
            "past_messages_included": past_messages_included,
            "defaults": default_settings,
            "overrides": request_overrides,
            "effective": effective_settings,
            "message_count": len(merged_request.get("messages", [])),
        }
        request_detail = {
            "source": item,
            "request": request_body,
            "effective_request": merged_request,
        }

        # --- Pre-request guardrail: check user input ---
        user_text = next(
            (m.get("content", "") for m in reversed(effective_messages) if m.get("role") == "user"),
            "",
        )
        input_guardrail = guardrails_client.check_input(user_text)
        if input_guardrail.blocked:
            print(f"  block-input [{index}/{total_cases}] case={case_id}: {input_guardrail.reason}")
            results.append(
                {
                    "id": case_id,
                    "setting_id": setting_id,
                    "deployment": deployment,
                    "request_settings": request_settings_detail,
                    "request_detail": request_detail,
                    "guardrails": {
                        "input": input_guardrail.to_dict(),
                        "output": None,
                    },
                    "blocked_by_guardrails": True,
                    "block_stage": "input",
                }
            )
            continue

        try:
            response = client.chat.completions.create(
                **merged_request,
                model=deployment,
                timeout=float(request_timeout_seconds),
            )
            response_text = response.choices[0].message.content or ""

            # --- Post-response guardrail: check model output ---
            output_guardrail = guardrails_client.check_output(response_text)
            guardrails_detail = {
                "input": input_guardrail.to_dict(),
                "output": output_guardrail.to_dict(),
            }

            if output_guardrail.blocked:
                print(f"  block-output [{index}/{total_cases}] case={case_id}: {output_guardrail.reason}")
                results.append(
                    {
                        "id": case_id,
                        "setting_id": setting_id,
                        "deployment": deployment,
                        "request_settings": request_settings_detail,
                        "request_detail": request_detail,
                        "guardrails": guardrails_detail,
                        "blocked_by_guardrails": True,
                        "block_stage": "output",
                        "response": response_text,
                        "usage": {
                            "prompt_tokens": getattr(response.usage, "prompt_tokens", None),
                            "completion_tokens": getattr(response.usage, "completion_tokens", None),
                            "total_tokens": getattr(response.usage, "total_tokens", None),
                        },
                    }
                )
            else:
                results.append(
                    {
                        "id": case_id,
                        "setting_id": setting_id,
                        "deployment": deployment,
                        "request_settings": request_settings_detail,
                        "request_detail": request_detail,
                        "guardrails": guardrails_detail,
                        "blocked_by_guardrails": False,
                        "response": response_text,
                        "usage": {
                            "prompt_tokens": getattr(response.usage, "prompt_tokens", None),
                            "completion_tokens": getattr(response.usage, "completion_tokens", None),
                            "total_tokens": getattr(response.usage, "total_tokens", None),
                        },
                    }
                )
                print(f"  ok  [{index}/{total_cases}] case={case_id}")
        except Exception as error:
            results.append(
                {
                    "id": case_id,
                    "setting_id": setting_id,
                    "deployment": deployment,
                    "request_settings": request_settings_detail,
                    "request_detail": request_detail,
                    "guardrails": {"input": input_guardrail.to_dict(), "output": None},
                    "error": str(error),
                }
            )
            print(f"  err [{index}/{total_cases}] case={case_id}: {error}")

    output_file = RESULTS_DIR / f"{safe_filename(setting_id)}.json"
    output = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "setting_id": setting_id,
            "setting_index": setting_index,
            "settings_file": str(SETTINGS_FILE),
            "requests_file": str(REQUESTS_FILE),
            "result_file": str(output_file),
        },
        "setting": setting,
        "results": results,
    }

    output_file.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"done [{setting_id}]: {output_file}")

print("all done")