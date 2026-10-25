FROM python:3.12-slim
RUN pip install --no-cache-dir modal==1.5.2 google-cloud-firestore==2.21.0
WORKDIR /app
COPY sync_modal_budget.py /app/sync_modal_budget.py
USER nobody
ENV HOME=/tmp PYTHONUNBUFFERED=1
ENTRYPOINT ["python", "/app/sync_modal_budget.py"]
