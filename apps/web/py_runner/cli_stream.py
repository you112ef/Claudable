#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


def print_ndjson(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def build_variants(cli: str, instruction: str, model: str | None):
    variants = []
    if cli == 'claude':
        # Prefer simple forms first; append flagged forms for broader compatibility
        variants.append(['claude', 'chat', instruction])
        if model:
            variants.append(['claude', 'chat', '--model', model, instruction])
        variants.append(['claude', instruction])
        if model:
            variants.append(['claude', '--model', model, instruction])
        # Fallback variants that may not exist on some versions
        if model:
            variants.append(['claude', 'chat', '--model', model, '--message', instruction, '--stream'])
        variants.append(['claude', 'chat', '--message', instruction, '--stream'])
    else:
        # cursor-agent prefers stream-json
        if model:
            variants.append(['cursor-agent', 'run', '--model', model, '--stream-json', instruction])
        variants.append(['cursor-agent', 'run', '--stream-json', instruction])
        if model:
            variants.append(['cursor-agent', 'run', '--model', model, instruction])
        variants.append(['cursor-agent', 'run', instruction])
    return variants


def run_stream(cli: str, instruction: str, model: str | None):
    # For Claude, prefer Python SDK like main branch
    if cli == 'claude':
        try:
            from claude_code_sdk import ClaudeSDKClient, ClaudeCodeOptions  # type: ignore
            client = ClaudeSDKClient()
            # Minimal options; main has more sophisticated settings
            opts = ClaudeCodeOptions(model=model) if model else None
            full = ""
            # The SDK provides a streaming iterator; we try common names
            # Strategy: try method names and fall back gracefully
            stream = None
            for name in ('stream_chat', 'chat_stream', 'generate_stream', 'stream'):
                if hasattr(client, name):
                    stream = getattr(client, name)
                    break
            if stream is None:
                raise RuntimeError('ClaudeSDKClient has no streaming method')
            iterator = stream(instruction, options=opts) if opts else stream(instruction)
            for event in iterator:
                # Try to normalize event payloads
                text = None
                if isinstance(event, str):
                    text = event
                elif isinstance(event, dict):
                    text = event.get('delta') or event.get('text') or event.get('content')
                elif hasattr(event, 'delta'):
                    text = getattr(event, 'delta')
                elif hasattr(event, 'text'):
                    text = getattr(event, 'text')
                if text:
                    full += str(text)
                    print_ndjson({"type": "chunk", "data": {"text": str(text), "content": full}})
            print_ndjson({"type": "complete", "data": {"text": full}})
            return 0
        except ImportError:
            print_ndjson({"type": "error", "message": "claude-code-sdk is not installed. Install with: pip install claude-code-sdk"})
            return 1
        except Exception as e:
            print_ndjson({"type": "error", "message": f"Claude SDK error: {e}"})
            return 1

    variants = build_variants(cli, instruction, model)
    tried = 0
    while tried < len(variants):
        args = variants[tried]
        tried += 1
        try:
            proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except FileNotFoundError:
            continue

        had_output = False
        full = ""
        # Stream stdout lines
        assert proc.stdout is not None
        for line in proc.stdout:
            s = line.strip('\r\n')
            if not s:
                continue
            had_output = True
            try:
                obj = json.loads(s)
                if isinstance(obj, dict) and 'delta' in obj:
                    full += str(obj['delta'])
                    print_ndjson({"type": "chunk", "data": {"text": obj['delta'], "content": full}})
                elif isinstance(obj, dict) and 'text' in obj:
                    full += str(obj['text'])
                    print_ndjson({"type": "chunk", "data": {"text": obj['text'], "content": full}})
                else:
                    # Unknown JSON event; surface minimally
                    print_ndjson({"type": "event", "data": obj})
            except json.JSONDecodeError:
                full += s + "\n"
                print_ndjson({"type": "chunk", "data": {"text": s + "\n", "content": full}})

        # Drain stderr as informational chunks
        assert proc.stderr is not None
        err_text = proc.stderr.read() or ""
        if err_text.strip():
            had_output = True
            print_ndjson({"type": "stderr", "data": err_text})
            full += err_text

        code = proc.wait()
        if had_output:
            if code == 0:
                print_ndjson({"type": "complete", "data": {"text": full}})
            else:
                print_ndjson({"type": "error", "message": f"CLI exited with code {code}", "data": full})
            return 0
        # else try next variant

    print_ndjson({"type": "error", "message": f"{cli} not available or produced no output. Ensure it's installed and you are logged in."})
    return 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cli', choices=['claude', 'cursor'], required=True)
    parser.add_argument('--instruction', required=True)
    parser.add_argument('--model', default=None)
    args = parser.parse_args()
    return run_stream(args.cli, args.instruction, args.model)


if __name__ == '__main__':
    sys.exit(main())
