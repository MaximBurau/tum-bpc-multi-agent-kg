import time
from typing import Dict, Any, Type

from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableLambda

from src.agents.schema_builder import build_pydantic_model
from src.config import config


class KGAgent:
    """
    Base agent that loads configuration from DB and produces a runnable.
    
    The agent uses LangChain's structured output to enforce the schema
    defined in the database. All behavior comes from the config - subclasses
    are essentially empty and exist only for type differentiation.
    """
    
    def __init__(self, agent_config, model_cache: Dict[str, Type]):
        """
        Initialize agent from database configuration.
        
        Args:
            agent_config: AgentVersion row from database with:
                - agent_type.name: Agent type name
                - prompt: Prompt template with {placeholders}
                - schema_json: Dynamic schema definition
                - model_name: LLM model identifier
            model_cache: Shared cache for Pydantic models
        """
        self.name = agent_config.agent_type.name
        self.version = agent_config.version_number
        self.prompt_template = agent_config.prompt
        self.model_name = agent_config.model_name
        # deterministic temperature for all agents to keep flows stable
        self.temperature = 0.0
        self.schema_json = agent_config.schema_json
        
        self.llm = ChatOpenAI(
            model=self.model_name,
            temperature=self.temperature,
            base_url="https://openrouter.ai/api/v1",
            api_key=config.openrouter_api_key,
        )
        
        # dynamic Pydantic built schema from DB definition
        schema_name = f"{self.name}_v{self.version}_Output"
        self.OutputSchema = build_pydantic_model(
            schema_name,
            self.schema_json,
            model_cache
        )
        
        # structured LLM that outputs the built schema
        self.structured_llm = self.llm.with_structured_output(self.OutputSchema)
    
    def build_runnable(self) -> RunnableLambda:
        """
        Build a LangGraph-compatible runnable.
        
        Returns a runnable that:
        1. Takes a dict of inputs
        2. Formats the prompt template with those inputs
        3. Calls the LLM with structured output
        4. Returns {"output": result, "_trace": trace_info}
        """
        
        async def run(inputs: Dict[str, Any]) -> Dict[str, Any]:
            # convert outputted Pydantic models to dicts/JSON for prompt 
            serialized_inputs = {}
            for key, value in inputs.items():
                if value is None:
                    serialized_inputs[key] = ""
                elif hasattr(value, "model_dump"):
                    # Single Pydantic model
                    serialized_inputs[key] = str(value.model_dump())
                elif isinstance(value, list) and value and hasattr(value[0], "model_dump"):
                    # List of Pydantic models
                    serialized_inputs[key] = str([v.model_dump() for v in value])
                else:
                    # plain values
                    serialized_inputs[key] = value
            
            # Format prompt with serialized inputs
            try:
                rendered_prompt = self.prompt_template.format(**serialized_inputs)
            except KeyError as e:
                raise ValueError(f"Missing input for prompt placeholder: {e}")
            
            # Call LLM and measure time
            start_time = time.time()
            result = await self.structured_llm.ainvoke(rendered_prompt)
            duration = time.time() - start_time
            
            # result with trace info for debugging
            return {
                "output": result,
                "_trace": {
                    "agent": self.name,
                    "version": self.version,
                    "rendered_prompt": rendered_prompt,
                    "model": self.model_name,
                    "duration_seconds": round(duration, 3),
                }
            }
        
        return RunnableLambda(run)
    
    def __repr__(self):
        return f"<{self.__class__.__name__} {self.name}@{self.version}>"

