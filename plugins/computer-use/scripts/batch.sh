#!/usr/bin/env bash
# Execute multiple usecomputer actions in sequence from JSON
# Usage: batch.sh '<json_actions>'
# Example: batch.sh '[{"action":"click","x":100,"y":200},{"action":"type","text":"hello"},{"action":"press","key":"enter"},{"action":"screenshot","path":"/tmp/s.png"}]'

set -euo pipefail

JSON="${1:?Usage: batch.sh '<json_array_of_actions>'}"

echo "$JSON" | python3 -c "
import json, subprocess, sys, time

actions = json.loads(sys.stdin.read())

for i, action in enumerate(actions):
    a = action.get('action', '')
    cmd = ['usecomputer']

    if a == 'screenshot':
        cmd += ['screenshot', action.get('path', '/tmp/batch-screen.png'), '--json']

    elif a in ('click', 'left_click'):
        cmd += ['click', '-x', str(action['x']), '-y', str(action['y'])]
        if 'button' in action: cmd += ['--button', action['button']]
        if 'count' in action: cmd += ['--count', str(action['count'])]
        if 'coord_map' in action: cmd += ['--coord-map', action['coord_map']]

    elif a == 'right_click':
        cmd += ['click', '-x', str(action['x']), '-y', str(action['y']), '--button', 'right']
        if 'coord_map' in action: cmd += ['--coord-map', action['coord_map']]

    elif a == 'double_click':
        cmd += ['click', '-x', str(action['x']), '-y', str(action['y']), '--count', '2']
        if 'coord_map' in action: cmd += ['--coord-map', action['coord_map']]

    elif a == 'type':
        cmd += ['type', action['text']]
        if 'delay' in action: cmd += ['--delay', str(action['delay'])]

    elif a in ('key', 'press'):
        cmd += ['press', action.get('key', action.get('text', ''))]
        if 'count' in action: cmd += ['--count', str(action['count'])]

    elif a == 'scroll':
        direction = action.get('direction', action.get('scroll_direction', 'down'))
        amount = action.get('amount', action.get('scroll_amount', 3))
        cmd += ['scroll', direction, str(amount)]
        if 'x' in action and 'y' in action:
            cmd += ['--at', f\"{action['x']},{action['y']}\"]

    elif a in ('hover', 'mouse_move'):
        cmd += ['hover', '-x', str(action['x']), '-y', str(action['y'])]
        if 'coord_map' in action: cmd += ['--coord-map', action['coord_map']]

    elif a == 'drag':
        fr = f\"{action['from_x']},{action['from_y']}\"
        to = f\"{action['to_x']},{action['to_y']}\"
        cmd += ['drag', fr, to]
        if 'duration' in action: cmd += ['--duration', str(action['duration'])]
        if 'coord_map' in action: cmd += ['--coord-map', action['coord_map']]

    elif a == 'wait':
        time.sleep(action.get('duration', 1))
        print(f'[{i+1}/{len(actions)}] wait {action.get(\"duration\", 1)}s')
        continue

    elif a == 'open_app':
        subprocess.run(['open', '-a', action['app']], check=True)
        print(f'[{i+1}/{len(actions)}] open_app {action[\"app\"]}')
        continue

    else:
        print(f'[{i+1}/{len(actions)}] unknown action: {a}', file=sys.stderr)
        continue

    result = subprocess.run(cmd, capture_output=True, text=True)
    print(f'[{i+1}/{len(actions)}] {a}: {result.stdout.strip() or \"ok\"}')
    if result.returncode != 0:
        print(f'  ERROR: {result.stderr.strip()}', file=sys.stderr)

    # Small delay between actions for stability
    if i < len(actions) - 1:
        time.sleep(0.1)
"
