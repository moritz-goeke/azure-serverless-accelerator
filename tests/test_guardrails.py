import os
from pathlib import Path
from dotenv import load_dotenv

from guardrails import GuardrailsConfig, GuardrailsClient

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

print("ENV path:", ROOT_DIR / ".env")
print("Content Safety endpoint loaded:", bool(os.getenv("AZURE_CONTENT_SAFETY_ENDPOINT")))
print("OpenAI endpoint loaded:", bool(os.getenv("AZURE_OPENAI_ENDPOINT")))

global_defaults = {
    "guardrails": {
        "input_check": True,
        "output_check": True,
        "prompt_shield": True,
        "thresholds": {
            "hate": 2,
            "violence": 2,
            "sexual": 2,
            "self_harm": 2
        }
    }
}

setting = {}

config = GuardrailsConfig.from_setting(global_defaults, setting)

print("Guardrails enabled:", config.enabled)
print("Endpoint:", config.endpoint)
print("Thresholds:", config.thresholds)

if not config.enabled:
    raise ValueError("Guardrails are disabled. Check AZURE_CONTENT_SAFETY_ENDPOINT in .env.")

client = GuardrailsClient(config)

test_text = "I feel overwhelmed and hopeless."

result = client.check_input(test_text)

print("\nGuardrail result:")
print(result.to_dict())