"""
Neo4j client for knowledge graph storage and retrieval.

Provides a simple interface for connecting to Neo4j and performing
basic operations on the knowledge graph.
"""

from neo4j import GraphDatabase
from typing import List, Dict, Any, Optional
import os
from config import config


class Neo4jClient:
    """
    Client for interacting with Neo4j database.
    
    Manages connection and provides methods for querying and updating
    the knowledge graph.
    """
    
    def __init__(
        self,
        uri: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None
    ):
        """
        Initialize Neo4j client.
        
        Args:
            uri: Neo4j connection URI (default: from env or localhost)
            user: Database username (default: from env or 'neo4j')
            password: Database password (default: from env)
        """
        self.uri = uri or os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.getenv("NEO4J_USER", "neo4j")
        self.password = password or os.getenv("NEO4J_PASSWORD", "password")
        
        self.driver = None
        self._connect()
    
    def _connect(self):
        """Establish connection to Neo4j database."""
        try:
            self.driver = GraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password)
            )
            # Test connection
            self.driver.verify_connectivity()
        except Exception as e:
            print(f"Failed to connect to Neo4j: {e}")
            self.driver = None
    
    def close(self):
        """Close the database connection."""
        if self.driver:
            self.driver.close()
    
    def get_graph_data(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all nodes and relationships from the graph.
        
        Returns:
            Dictionary with 'nodes' and 'edges' lists formatted for visualization
        """
        if not self.driver:
            return {"nodes": [], "edges": []}
        
        with self.driver.session() as session:
            # Get all nodes
            nodes_result = session.run(
                "MATCH (n) RETURN id(n) as id, labels(n) as labels, properties(n) as properties LIMIT 100"
            )
            nodes = [
                {
                    "id": record["id"],
                    "label": record["labels"][0] if record["labels"] else "Node",
                    "properties": record["properties"]
                }
                for record in nodes_result
            ]
            
            # Get all relationships
            edges_result = session.run(
                "MATCH (a)-[r]->(b) RETURN id(a) as from, id(b) as to, type(r) as type LIMIT 100"
            )
            edges = [
                {
                    "from": record["from"],
                    "to": record["to"],
                    "label": record["type"]
                }
                for record in edges_result
            ]
            
            return {"nodes": nodes, "edges": edges}
    
    def add_entity(self, name: str, entity_type: str, properties: Dict[str, Any] = None):
        """
        Add an entity node to the graph.
        
        Args:
            name: Entity name
            entity_type: Entity type (e.g., 'Person', 'Organization')
            properties: Additional properties for the entity
        """
        if not self.driver:
            return
        
        with self.driver.session() as session:
            props = properties or {}
            props["name"] = name
            
            session.run(
                f"CREATE (n:{entity_type} $props)",
                props=props
            )
    
    def add_relation(self, from_name: str, to_name: str, relation_type: str):
        """
        Add a relationship between two entities.
        
        Args:
            from_name: Source entity name
            to_name: Target entity name
            relation_type: Type of relationship
        """
        if not self.driver:
            return
        
        with self.driver.session() as session:
            session.run(
                f"""
                MATCH (a {{name: $from_name}})
                MATCH (b {{name: $to_name}})
                CREATE (a)-[r:{relation_type}]->(b)
                """,
                from_name=from_name,
                to_name=to_name
            )


# Singleton instance
neo4j_client = Neo4jClient()

