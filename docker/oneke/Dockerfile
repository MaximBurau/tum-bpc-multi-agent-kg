FROM zjunlp/oneke:v4

# Clone OneKE source (the base image only has model weights, not the code)
RUN apt-get update && apt-get install -y git && \
    git clone https://github.com/zjunlp/OneKE.git /app/OneKE-src && \
    pip install -r /app/OneKE-src/requirements.txt && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy our wrapper
COPY src/baselines/oneke_wrapper.py /app/wrapper.py

# Install FastAPI and uvicorn
RUN pip install fastapi uvicorn

# Set working directory
WORKDIR /app

# Expose port
EXPOSE 9000

# Run the wrapper
CMD ["uvicorn", "wrapper:app", "--host", "0.0.0.0", "--port", "9000"]
