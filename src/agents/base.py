# src/agents/base.py

from typing import Optional, Type
from pydantic import BaseModel

from ..llm import LLMClient


class BaseAgent:
    """
    Minimal agent interface: takes a prompt string and returns something.

    Real subclasses decide:
      - how to build the final prompt
      - whether they use structured or unstructured LLM calls
    """

    name: str = "base-agent"
    description: str = "Base agent"
    system_prompt: str = ""
    default_model: str = "meta-llama/Llama-3.1-8B-Instruct"
    default_temperature: float = 0.0

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm = llm_client or LLMClient()

    def build_prompt(self, user_prompt: str) -> tuple[Optional[str], str]:
        """
        Hook for subclasses to reformat things.

        Returns:
          (system_prompt, final_user_prompt)
        """
        return self.default_system_prompt, user_prompt

    def run(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
    ):
        """
        Base run: subclasses override this to call LLM in the way they want.
        """
        raise NotImplementedError

class TextAgent(BaseAgent):
    """
    Simple agent that returns plain text.
    """

    def run(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
    ) -> str:
        sys_default, user_prompt = self.build_prompt(prompt)

        sys_final = system_prompt if system_prompt is not None else sys_default
        model_final = model if model is not None else self.default_model
        temp_final = temperature if temperature is not None else self.default_temperature

        return self.llm.get_completion(
            prompt=user_prompt,
            system_prompt=sys_final,
            model=model_final,
            temperature=temp_final,
        )

class StructuredAgent(BaseAgent):
    """
    Agent that returns a Pydantic model via LLM structured output.
    Subclasses MUST set `response_model`.
    """

    response_model: Type[BaseModel] = BaseModel  # override in subclass

    def run(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
    ) -> BaseModel:
        model_final = model if model is not None else self.default_model
        temp_final = temperature if temperature is not None else self.default_temperature

        result = self.llm.get_structured_output(
            prompt=prompt,
            response_model=self.response_model,
            system_prompt=self.system_prompt,
            model=model_final,
            temperature=temp_final,
        )
        return result