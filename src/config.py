import os
from dotenv import load_dotenv

class Config:
    def __init__(self):
        load_dotenv()
        self.openrouter_api_key = os.getenv("MAXIM_OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY")
        self.neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD")
    
    def validate(self):
        if not self.openrouter_api_key:
            raise ValueError("OPENROUTER_API_KEY not set in .env file")

config = Config()

