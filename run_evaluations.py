import requests
import time

API_URL = "http://localhost:8000"

runs = [
    {
        "task_type": "qa",
        "limit": 20,
        "model": "meta-llama/Llama-3.1-8B-Instruct",
        "system_prompt": "You are a precise legal QA assistant. Answer questions based only on the provided knowledge graph triples. Be concise and accurate.",
        "tags": ["baseline", "llama-3.1", "legal-domain"]
    },
    {
        "task_type": "qa",
        "limit": 20,
        "model": "openai/gpt-4o-mini",
        "system_prompt": "You are an expert in EU law. Use the knowledge graph triples to provide accurate, citation-backed answers. If information is insufficient, state this clearly.",
        "tags": ["gpt-4o-mini", "expert-prompt", "legal-domain"]
    },
    {
        "task_type": "qa",
        "limit": 15,
        "model": "meta-llama/Llama-3.1-8B-Instruct",
        "system_prompt": "Answer the question using ONLY the facts in the knowledge graph. Do not infer or add information. Keep answers under 10 words.",
        "tags": ["ultra-concise", "llama-3.1", "strict-mode"]
    },
    {
        "task_type": "ner",
        "limit": 50,
        "model": "meta-llama/Llama-3.1-8B-Instruct",
        "system_prompt": "Extract named entities with high precision. Only tag entities you are confident about. Prefer precision over recall.",
        "tags": ["baseline", "ner", "high-precision"]
    },
    {
        "task_type": "ner",
        "limit": 50,
        "model": "openai/gpt-4o-mini",
        "system_prompt": "You are a named entity recognition expert. Extract ALL entities of types PER, ORG, LOC, MISC. Be comprehensive and capture every entity mention.",
        "tags": ["gpt-4o-mini", "ner", "high-recall"]
    }
]

print("Starting evaluation runs...\n")

for i, run_config in enumerate(runs, 1):
    print(f"Run {i}/5: {run_config['task_type'].upper()} with {run_config['model'].split('/')[-1]}")
    print(f"  Tags: {', '.join(run_config['tags'])}")
    print(f"  System prompt: {run_config['system_prompt'][:60]}...")
    
    try:
        response = requests.post(
            f"{API_URL}/api/pipeline/run",
            json=run_config,
            timeout=300
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"  ✓ Completed in {result['duration_seconds']:.2f}s")
            print(f"  Metrics: {result['metrics']}")
        else:
            print(f"  ✗ Failed: {response.text}")
    except Exception as e:
        print(f"  ✗ Error: {e}")
    
    print()
    time.sleep(1)

print("All runs completed!")
