# Padrão — 20 workers, todos segmentos e políticas
make stream

# Stress test — 50 workers
make stream-fast

# Focado no segmento young (enche experimento mais rápido)
make stream-young

# Throttle a 10 eventos/seg para observar em câmera lenta
make stream-slow

# Com opções customizadas:
uv run python scripts/event_stream.py --workers 30 --segment senior_high_edu
uv run python scripts/event_stream.py --rate 5 --policy contextual_thompson
uv run python scripts/event_stream.py --no-reward  # só decisions, sem reward