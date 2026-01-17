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
                # Enhanced error message showing what's missing and what's available
                missing_key = str(e).strip("'\"")
                available_keys = list(serialized_inputs.keys())
                raise ValueError(
                    f"Missing input for prompt placeholder: '{missing_key}'\n"
                    f"Agent: {self.name}@{self.version}\n"
                    f"Available inputs: {available_keys}\n"
                    f"Check your flow's input mappings for this agent step."
                )
            
            # Call LLM and measure time
            start_time = time.time()
            try:
                result = await self.structured_llm.ainvoke(rendered_prompt)
            except Exception as e:
                # Enhanced error reporting for LLM calls
                error_type = type(e).__name__
                error_msg = str(e)
                
                # Print OpenRouter API error details if available
                if hasattr(e, 'response') and hasattr(e.response, 'json'):
                    try:
                        api_error = e.response.json()
                        print(f"OpenRouter API Error: {api_error}")
                    except:
                        pass
                
                # Try to get raw LLM response for JSON parsing errors
                raw_response = None
                if "json" in error_msg.lower() or "JSON" in error_msg:
                    try:
                        # Call LLM without structured output to see raw response
                        raw_response_obj = await self.llm.ainvoke(rendered_prompt)
                        if hasattr(raw_response_obj, 'content'):
                            raw_response = raw_response_obj.content
                        elif isinstance(raw_response_obj, str):
                            raw_response = raw_response_obj
                        else:
                            raw_response = str(raw_response_obj)
                    except Exception:
                        pass  # If we can't get raw response, continue without it
                
                print(f"\n{'='*80}")
                print(f"LLM Call Error for model: {self.model_name}")
                print(f"Error Type: {error_type}")
                print(f"Error Message: {error_msg}")
                print(f"Agent: {self.name}@{self.version}")
                
                # Show the rendered prompt (first 300 chars) to see what was sent
                print(f"\nRendered Prompt (first 300 chars):")
                print(rendered_prompt[:300])
                if len(rendered_prompt) > 300:
                    print(f"... (truncated, total length: {len(rendered_prompt)} chars)")
                
                if raw_response:
                    print(f"\nRaw LLM Response (first 1000 chars):")
                    print(raw_response[:1000])
                    if len(raw_response) > 1000:
                        print(f"... (truncated, total length: {len(raw_response)} chars)")
                    print(f"\nRaw LLM Response (last 200 chars):")
                    print(raw_response[-200:])
                else:
                    print(f"\n⚠️  Could not capture raw LLM response for debugging")
                
                print(f"{'='*80}\n")
                # Re-raise with context
                raise RuntimeError(
                    f"LLM call failed for model '{self.model_name}': {error_msg}"
                ) from e
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

