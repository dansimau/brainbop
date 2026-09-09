.PHONY: out
out:
	(sleep 1 && open http://localhost:8765/index.html) &
	python3 -m http.server 8765
