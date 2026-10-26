"""Deploy the private model worker with an explicitly selected verified base image."""
import os
from pathlib import Path

import modal
from narration_worker import NarrationWorker as WorkerClass

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
base_id = os.environ.get('BETTERPPTX_NARRATION_BASE_IMAGE_ID', '')
if not base_id.startswith('im-'):
    raise RuntimeError('Select an approved immutable model image before deployment.')
image = (modal.Image.from_id(base_id)
         .pip_install('numpy==1.26.4', 'scipy==1.13.1', 'pyloudnorm==0.1.1', 'future==1.0.0')
         .add_local_file(REPO / 'deploy/docker/chatterbox_http_runtime.py', '/app/runtime.py', copy=True)
         .add_local_file(REPO / 'deploy/docker/speech_loudness.py', '/app/speech_loudness.py', copy=True)
         .add_local_file(ROOT / 'narration_worker.py', '/root/narration_worker.py', copy=True)
         .env({'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'TQDM_DISABLE': '1',
               'PYTHONDONTWRITEBYTECODE': '1', 'OMP_NUM_THREADS': '2', 'MKL_NUM_THREADS': '2'}))
app = modal.App(os.environ.get('BETTERPPTX_NARRATION_MODAL_APP', 'betterpptx-narration-modal'))
NarrationWorker = app.cls(image=image, gpu='T4', cpu=(2, 2), memory=(16384, 16384),
                         max_containers=1, min_containers=0, buffer_containers=0,
                         scaledown_window=60, timeout=900, startup_timeout=300,
                         retries=0, include_source=False)(modal.concurrent(max_inputs=1)(WorkerClass))
