"""
Azure AI Content Safety guardrails helper.

Provides category-based content analysis for input and output texts.
The guardrail checks score Hate, Violence, Sexual content, and SelfHarm
using Azure AI Content Safety and compare the severity scores against
configured thresholds.

Usage
-----
config = GuardrailsConfig.from_setting(global_defaults, setting)
client = GuardrailsClient(config)

# Before sending to the model:
result = client.check_input(user_text)
if result.blocked:
    ...

# After getting the model response:
result = client.check_output(response_text)
if result.blocked:
    ...
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


_CONTENT_CATEGORIES = ("hate", "violence", "sexual", "self_harm")
_DEFAULT_THRESHOLDS = {cat: 2 for cat in _CONTENT_CATEGORIES}  # 0-6 scale; 2 = low


@dataclass
class GuardrailsConfig:
    enabled: bool = False
    endpoint: str = ""
    api_version: str = "2024-09-01"
    input_check: bool = True
    output_check: bool = True
    prompt_shield: bool = True
    thresholds: dict[str, int] = field(default_factory=lambda: dict(_DEFAULT_THRESHOLDS))

    @classmethod
    def from_setting(cls, global_defaults: dict, setting: dict) -> "GuardrailsConfig":
        raw_global = global_defaults.get("guardrails", {})
        raw_setting = setting.get("guardrails", {})

        # Setting-level overrides global.
        merged = {**raw_global, **raw_setting}

        if not merged:
            return cls(enabled=False)

        global_thresholds = raw_global.get("thresholds", {})
        setting_thresholds = raw_setting.get("thresholds", {})
        thresholds = {**_DEFAULT_THRESHOLDS, **global_thresholds, **setting_thresholds}

        endpoint = (
            merged.get("endpoint")
            or os.getenv("AZURE_CONTENT_SAFETY_ENDPOINT")
            or ""
        )

        return cls(
            enabled=bool(endpoint),
            endpoint=endpoint.rstrip("/"),
            api_version=merged.get("api_version", "2024-09-01"),
            input_check=bool(merged.get("input_check", True)),
            output_check=bool(merged.get("output_check", True)),
            prompt_shield=bool(merged.get("prompt_shield", True)),
            thresholds=thresholds,
        )


@dataclass
class CategoryScore:
    category: str
    severity: int  # 0–6
    threshold: int
    blocked: bool


@dataclass
class GuardrailsResult:
    blocked: bool
    reason: str
    prompt_shield: dict | None = None
    category_scores: list[CategoryScore] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict:
        result: dict = {
            "blocked": self.blocked,
            "reason": self.reason,
        }
        if self.prompt_shield is not None:
            result["prompt_shield"] = self.prompt_shield
        if self.category_scores:
            result["category_scores"] = [
                {
                    "category": cs.category,
                    "severity": cs.severity,
                    "threshold": cs.threshold,
                    "blocked": cs.blocked,
                }
                for cs in self.category_scores
            ]
        if self.error:
            result["error"] = self.error
        return result


class GuardrailsClient:
    def __init__(self, config: GuardrailsConfig) -> None:
        self._config = config
        self._client = None
        self._shield_client = None

        if config.enabled:
            from azure.ai.contentsafety import ContentSafetyClient
            from azure.core.credentials import AzureKeyCredential

            key = os.getenv("AZURE_CONTENT_SAFETY_API_KEY") or os.getenv("AZURE_OPENAI_API_KEY")
            if not key:
                raise ValueError(
                    "AZURE_CONTENT_SAFETY_API_KEY not found in environment. "
                    "Set it or disable guardrails in chat-settings.json."
                )
            credential = AzureKeyCredential(key)
            self._client = ContentSafetyClient(config.endpoint, credential)

    def check_input(self, text: str) -> GuardrailsResult:
        return self._check(text, is_input=True)

    def check_output(self, text: str) -> GuardrailsResult:
        return self._check(text, is_input=False)

    def _check(self, text: str, is_input: bool) -> GuardrailsResult:
        config = self._config
        if not config.enabled:
            return GuardrailsResult(blocked=False, reason="guardrails_disabled")

        skip_condition = (is_input and not config.input_check) or (
            not is_input and not config.output_check
        )
        if skip_condition:
            return GuardrailsResult(blocked=False, reason="check_skipped_by_config")

        try:
            shield_result = None
            if is_input and config.prompt_shield:
                shield_result = self._run_prompt_shield(text)
                if shield_result.get("blocked"):
                    return GuardrailsResult(
                        blocked=True,
                        reason="prompt_shield_blocked",
                        prompt_shield=shield_result,
                    )

            category_scores = self._run_content_analysis(text)
            blocked_categories = [cs for cs in category_scores if cs.blocked]

            blocked = len(blocked_categories) > 0
            reason = (
                "content_policy_violation: "
                + ", ".join(cs.category for cs in blocked_categories)
                if blocked
                else "passed"
            )

            return GuardrailsResult(
                blocked=blocked,
                reason=reason,
                prompt_shield=shield_result,
                category_scores=category_scores,
            )
        except Exception as err:
            return GuardrailsResult(
                blocked=False,
                reason="guardrails_error",
                error=str(err),
            )

    def _run_prompt_shield(self, text: str) -> dict:
        try:
            from azure.ai.contentsafety.models import ShieldPromptOptions
        except ImportError as err:
            return {
                "blocked": False,
                "jailbreak_detected": False,
                "supported": False,
                "error": str(err),
            }

        response = self._client.shield_prompt(
            ShieldPromptOptions(user_prompt=text, documents=[])
        )
        jailbreak = getattr(response, "user_prompt_analysis", None)
        attack_detected = getattr(jailbreak, "attack_detected", False) if jailbreak else False

        return {
            "blocked": bool(attack_detected),
            "jailbreak_detected": bool(attack_detected),
            "supported": True,
        }

    def _run_content_analysis(self, text: str) -> list[CategoryScore]:
        from azure.ai.contentsafety.models import AnalyzeTextOptions

        category_map = {
            "hate": "Hate",
            "violence": "Violence",
            "sexual": "Sexual",
            "self_harm": "SelfHarm",
        }

        request = AnalyzeTextOptions(
            text=text,
            categories=list(category_map.values()),
        )
        response = self._client.analyze_text(request)

        scores: list[CategoryScore] = []

        # Prefer explicit attribute lookup first
        for internal_name, azure_name in category_map.items():
            attr_name = f"{azure_name.lower()}_result"
            if azure_name == "SelfHarm":
                attr_name = "self_harm_result"

            category_result = getattr(response, attr_name, None)

            # Fallback for SDKs that expose a categories_analysis list
            if category_result is None and hasattr(response, "categories_analysis"):
                for item in response.categories_analysis:
                    if str(item.category) == azure_name:
                        category_result = item
                        break

            if category_result is not None:
                severity = int(getattr(category_result, "severity", 0))
                threshold = self._config.thresholds.get(internal_name, 2)
                scores.append(
                    CategoryScore(
                        category=internal_name,
                        severity=severity,
                        threshold=threshold,
                        blocked=severity >= threshold,
                    )
                )

        return scores