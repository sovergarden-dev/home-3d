"""Summarize measured P10 samples; never synthesize or remove outliers."""
import json
import math
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1])

def load(name):
    return json.loads((root / name).read_text(encoding="utf-8"))

def stats(values):
    ordered = sorted(values)
    if not ordered:
        return None
    return {"n": len(ordered), "p50": round(statistics.median(ordered), 3),
            "p95": round(ordered[math.ceil(.95 * len(ordered)) - 1], 3),
            "max": round(max(ordered), 3)}

before, after, soak = load("before-raw.json"), load("after-raw.json"), load("soak-raw.json")
rows = after["raw"]
latency = load("latency-raw.json")
environments = {name: data.get("environment") for name, data in
                [("before", before), ("after", after), ("latency", latency), ("soak", soak)]}
observed = [value for value in environments.values() if value]
comparison_keys = ["renderer", "rendererClass", "driverVersion", "browserVersion", "dpr", "viewport", "headed"]
if observed and any(any(row.get(key) != observed[0].get(key) for key in comparison_keys)
                    for row in observed[1:]):
    raise ValueError("BENCHMARK_ENVIRONMENT_MISMATCH")
complete_environment = len(observed) == len(environments)
physical_gpu = complete_environment and all(
    row.get("rendererClass") == "REAL_GPU" and row.get("headed") is True
    and row.get("driverVersion") not in [None, "NOT_VERIFIED"] for row in observed)
mutations = [item for row in latency["raw"] for item in row["samples"]]
captures = [item for row in rows for item in row["captures"]]
frames = {
    "before": stats([value for row in before["results"] for value in row["raw"]]),
    "after3": stats([value for row in rows for value in row["baseline"]]),
    "tour300": stats([value for row in rows for value in row["with300"]]),
}

def column(section, key):
    return [row[section].get(key) for row in rows]

cycles = soak["raw"]
resources = {}
for key in ["urls", "bitmap", "idb", "raf", "audio"]:
    values = [row["counts"][key] for row in cycles]
    resources[key] = {"first": values[0], "last": values[-1], "max": max(values)}
for key in ["memoryTextures", "memoryGeometries", "memoryRenderTargets"]:
    values = [int(row["scene"].get(key, -1)) for row in cycles]
    resources[key] = {"first": values[0], "last": values[-1], "min": min(values), "max": max(values)}
for key in ["documents", "nodes", "jsEventListeners"]:
    resources[key] = [row["dom"][key] for row in cycles]
heap = [row["heap"]["used"] for row in cycles if row.get("heap")]
summary = {
    "syntheticOnly": True,
    "measuredRenderer": (after.get("environment") or {}).get("renderer", after.get("renderer", "NOT_VERIFIED")),
    "environments": environments,
    "environmentComparison": "MATCHED" if complete_environment else "NOT_VERIFIED_LEGACY_OR_INCOMPLETE",
    "viewport": after.get("viewport"),
    "dpr": after.get("dpr"),
    "fixture": "local-preview synthetic demo; source revisions, camera, time, viewport, DPR and warm-up are recorded in the raw inputs",
    "framesMs": frames,
    "frameMeaning": "requestAnimationFrame intervals, all slow frames retained; idle/demand cadence is NOT a physical-GPU FPS claim. Tour300 is a different active phase, not a matched main comparison.",
    "beforeScene": [{key: row["scene"].get(key) for key in ["drawCalls", "triangles", "worldMode", "lifeAgents"]} for row in before["results"]],
    "after3Scene": [{key: row["before"]["scene"].get(key) for key in ["drawCalls", "triangles", "memoryPins", "lifeAgents"]} for row in rows],
    "stationary300Scene": [{key: row["stationary300"].get(key) for key in ["drawCalls", "triangles", "memoryPins"]} for row in rows],
    "mutationUpperBoundMs": {"all": stats([item["ms"] for item in mutations]), **{kind: stats([item["ms"] for item in mutations if item["kind"] == kind]) for kind in ["add", "delete"]}},
    "mutationGoalMs": 100,
    "mutationsOverGoal": sum(item["ms"] >= 100 for item in mutations),
    "mutationMeaning": "latency-raw.json: real saveMemory/deleteMemory, mounted Memories dock, 299→300→299, five seconds settling after bulk population; two RAF upper bound including React/compositor cadence. after-raw mutations restore via Undo and are calibration only. No slow samples discarded.",
    "mutationCpuMs": stats([item["cpuMs"] for item in mutations]),
    "image12MpMs": stats([value for row in rows for value in row["images"]]),
    "postcards": {str(width): {"timeMs": stats([item["ms"] for item in captures if item["width"] == width]), "estimatedCpuPeakPixelBytes": max([item["estimatedCpuPixelBytes"] for item in captures if item["width"] == width], default=0), "degraded": [item["degraded"] for item in captures if item["width"] == width]} for width in [3840, 2048]},
    "memoryMeaning": "width*height*16 estimates four RGBA CPU pixel buffers only; heap and texture counters are NOT GPU memory measurements.",
    "soak": {"complete": soak.get("complete", False), "elapsedMs": soak["elapsedMs"], "cycles": soak["cycles"], "meetsDuration": soak["elapsedMs"] >= 1200000, "meetsCycles": soak["cycles"] >= 20, "resources": resources, "heapBytes": {"first": heap[0], "last": heap[-1], "min": min(heap), "max": max(heap)} if heap else None, "errors": soak["errors"]},
    "benchmarkErrors": after["errors"],
    "notVerified": ([] if physical_gpu else ["physical GPU"]) + ["physical GPU memory", "native Safari", "real iOS/Android device", "real-world geometry/location"],
}
(root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, ensure_ascii=True, indent=2))
