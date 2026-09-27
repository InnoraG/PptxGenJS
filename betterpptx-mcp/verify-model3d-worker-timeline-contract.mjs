import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const workerPath = path.join(here, 'deploy', 'model3d-worker', 'model3d_app.py')
const workerSource = await readFile(workerPath, 'utf8')

const pythonProbe = String.raw`
import ast, json, math, pathlib, sys

source_path = pathlib.Path(sys.argv[1])
tree = ast.parse(source_path.read_text(encoding="utf-8"), filename=str(source_path))
nodes = []
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "_EXPECTED_EMPIRICAL_TIMELINE_IDS" for target in node.targets):
        nodes.append(node)
    if isinstance(node, ast.FunctionDef) and node.name == "_validate_empirical_clip_timelines":
        nodes.append(node)
namespace = {"math": math}
exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source_path), "exec"), namespace)
validate = namespace["_validate_empirical_clip_timelines"]

def profile(keys=range(18), points=None):
    sample = points or [[0, 1.0, 2.0], [33, 1.1, 2.1], [66, 1.2, 2.2], [99, 1.3, 2.3], [132, 1.4, 2.4]]
    return {"probe": {"x": 0, "y": 0, "w": 5, "h": 5, "m": 1}, "timelines": {str(i): list(sample) for i in keys}}

accepted = validate(profile())
assert sorted(accepted["timelines"], key=int) == [str(i) for i in range(18)]

def rejects(value, marker):
    try:
        validate(value)
    except RuntimeError as error:
        if marker not in str(error):
            raise AssertionError(f"expected {marker!r}, got {error!r}")
        return True
    raise AssertionError(f"expected rejection containing {marker!r}")

missing = profile(keys=range(17))
extra = profile(keys=range(19))
unordered = profile(points=[[0, 1, 2], [66, 1, 2], [33, 1, 2], [99, 1, 2], [132, 1, 2]])
assert rejects(missing, "missing slots")
assert rejects(extra, "unexpected slots")
assert rejects(unordered, "timestamps are not ordered")
print(json.dumps({"acceptedSlots": len(accepted["timelines"]), "rejectedMissing": True, "rejectedExtra": True, "rejectedUnordered": True}))
`

const run = spawnSync('python', ['-c', pythonProbe, workerPath], { encoding: 'utf8' })
if (run.error) throw run.error
if (run.status !== 0) throw new Error(`worker timeline contract probe failed: ${run.stdout || ''}${run.stderr || ''}`)
const result = JSON.parse(String(run.stdout || '').trim())
assert.equal(result.acceptedSlots, 18)
assert.equal(result.rejectedMissing, true)
assert.equal(result.rejectedExtra, true)
assert.equal(result.rejectedUnordered, true)

console.log(JSON.stringify({
	 schemaVersion: 'betterpptx.model3d-worker-timeline-contract.v1',
	 status: 'PASS',
	 acceptedSlots: result.acceptedSlots,
	 rejectedMissing: result.rejectedMissing,
	 rejectedExtra: result.rejectedExtra,
	 rejectedUnordered: result.rejectedUnordered,
	 publicEnablementAllowed: false,
}))
