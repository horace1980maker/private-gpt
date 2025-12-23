# How to Run PrivateGPT on Windows (Step-by-Step)

Since your system currently has Python 3.13 and is missing `poetry` and `make`, follow these steps to set up a clean environment.

### 1. Create a Dedicated Environment
Open your terminal (PowerShell or Command Prompt) and run:
```powershell
conda create -n private-gpt python=3.11
conda activate private-gpt
```

### 2. Install Development Tools
With the environment active, install `poetry`:
```powershell
pip install poetry
```

### 3. Install Project Dependencies
Install the specific components needed for PrivateGPT (UI, Local LLM, and Vector Storage, and Reranking):
```powershell
# We add rerank-sentence-transformers to avoid the "PyTorch not found" warning later
poetry install --extras "ui llms-llama-cpp vector-stores-qdrant embeddings-huggingface rerank-sentence-transformers"
```

### 4. Setup Models
Download the necessary AI models (this will take some time and requires internet). 
**Note:** We must tell Python where the project folder is using `PYTHONPATH`.
```powershell
$env:PYTHONPATH="."
poetry run python scripts/setup
```

### 5. Run the Application
Finally, start the PrivateGPT server:
```powershell
$env:PGPT_PROFILES="local"
poetry run python -m private_gpt
```

Once running, you can access the interface at: **http://localhost:8001**

---

### Troubleshooting

#### ❌ Error: `No module named 'packaging.licenses'` or `Poetry incompatibility`
This is a "version lock" between the new Poetry (2.2.1) and older versions of internal libraries. 

**Definitive Fix:**
Follow these steps in your terminal (ensure `private-gpt` env is active):

1. **Satisfy Poetry first:**
   ```powershell
   pip install packaging==24.2
   ```

2. **Update the libraries that are causing the error:**
   ```powershell
   # Ensure rerank extra is there
   poetry install --extras "ui llms-llama-cpp vector-stores-qdrant embeddings-huggingface rerank-sentence-transformers"
   poetry run pip install -U huggingface_hub transformers
   ```

3. **Run the setup again (with PYTHONPATH):**
   ```powershell
   $env:PYTHONPATH="."
   poetry run python scripts/setup
   ```

---
> [!TIP]
> **Subsequent Runs:** Next time you want to run the project, you only need to run:
> 1. `conda activate private-gpt`
> 2. `$env:PGPT_PROFILES="local"`
> 3. `poetry run python -m private_gpt`
