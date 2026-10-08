#!/usr/bin/env python3
"""Upload Overture Broward records over verified GitHub OIDC, without static secrets.

The Supabase Edge Function independently validates GitHub's short-lived signed
token, the source workflow identity, and every imported record's bounds.
Requires id-token write permission on a trusted GitHub Actions runner.
"""
import argparse
import base64
import importlib.util
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

FUNCTION_URL = "https://ehuzjfmcrhetvgpdqpwu.supabase.co/functions/v1/loop-overture-import"
AUDIENCE = "loop-overture-import"
BATCH_SIZE = 150
MAX_REGION_RECORDS = 150000

spec = importlib.util.spec_from_file_location(
    "overture_importer", Path(__file__).with_name("import_overture_places.py"))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

class GithubIdentity:
    def __init__(self):
        self.request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "")
        self.request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "")
        self.jwt, self.fetched_at = "", 0
        if not self.request_url or not self.request_token:
            raise RuntimeError("GitHub OIDC is unavailable; this workflow requires id-token: write")

    def get(self, refresh=False):
        if not refresh and self.jwt and time.monotonic() - self.fetched_at < 120:
            return self.jwt
        separator = "&" if "?" in self.request_url else "?"
        url = self.request_url + separator + "audience=" + quote(AUDIENCE)
        request = Request(url, headers={"Authorization": "bearer " + self.request_token})
        with urlopen(request, timeout=20) as response:
            token = json.load(response).get("value")
        if not isinstance(token, str) or token.count(".") != 2:
            raise RuntimeError("Unable to acquire signed GitHub import identity")
        self.jwt = token
        self.fetched_at = time.monotonic()
        return token

def edge_request(identity, body):
    payload = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(payload) > 240000:
        raise RuntimeError("Safety stop: payload too large")
    for attempt in range(5):
        token = identity.get(refresh=attempt > 0)
        req = Request(FUNCTION_URL, data=payload, method="POST",
                      headers={"Authorization": "Bearer " + token,
                               "Content-Type": "application/json"})
        try:
            with urlopen(req, timeout=28) as response:
                result = json.load(response)
                if not isinstance(result, dict):
                    raise RuntimeError("Unexpected importer response")
                return result
        except HTTPError as exc:
            detail = exc.read(250).decode("utf-8", "replace")
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise RuntimeError(f"Import stopped (HTTP {exc.code}): {detail}") from exc
        except (URLError, TimeoutError):
            if attempt == 4:
                raise
        time.sleep(min(2 ** attempt, 10))
    raise RuntimeError("Import retries exceeded")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--preflight", action="store_true")
    args = parser.parse_args()
    identity = GithubIdentity()
    if os.environ.get("GITHUB_REPOSITORY") != "jamiesonlsmith-blip/Loop-alpha":
        raise RuntimeError("Wrong GitHub repository")
    if os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise RuntimeError("Import must run from the main branch")
    # Diagnostic: inspect only public workflow identity claims; NEVER log the
    # signed token or the runner's OIDC request bearer secret.
    token = identity.get()
    claims_raw = token.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(claims_raw + "=" * (-len(claims_raw) % 4)))
    safe_fields = ("iss", "aud", "sub", "repository", "repository_id",
                   "ref", "workflow_ref", "event_name", "runner_environment")
    print("BROWARD_PUBLIC_IDENTITY_CLAIMS",
          json.dumps({field: claims.get(field) for field in safe_fields}), flush=True)
    check = edge_request(identity, {"mode": "preflight"})
    if check.get("authenticated") is not True:
        raise RuntimeError("Supabase gateway refused trusted GitHub OIDC identity")
    print("AUTHORIZED_BROWARD_IMPORT database_bytes=",
          check.get("databaseBytes"), "max_bytes=", check.get("maxDatabaseBytes"), flush=True)
    if args.preflight:
        return 0
    if not args.input or not args.input.is_file():
        raise RuntimeError("Downloaded Overture GeoJSONSeq input missing")
    release = importer.latest_release()
    bbox = importer.REGIONS["broward"]

    # Two-pass validation prevents accidental import of an unexpectedly large
    # release. Every batch is idempotent and a retry is safe.
    total = sum(1 for _ in importer.records(args.input, bbox, release, 0.55))
    print("BROWARD_IMPORT_SOURCE", release, "accepted=", total, flush=True)
    if not (100000 <= total <= MAX_REGION_RECORDS):
        raise RuntimeError("Safety stop: record count outside expected 100k-150k range")

    batch, imported = [], 0
    for row in importer.records(args.input, bbox, release, 0.55):
        batch.append(row)
        if len(batch) >= BATCH_SIZE:
            result = edge_request(identity, {"items": batch})
            if result.get("imported") != len(batch):
                raise RuntimeError("Unexpected response count; stopping import")
            imported += len(batch)
            batch.clear()
            if imported % (BATCH_SIZE * 20) == 0:
                print("BROWARD_IMPORT_PROGRESS", imported, "/", total, flush=True)
    if batch:
        result = edge_request(identity, {"items": batch})
        if result.get("imported") != len(batch):
            raise RuntimeError("Unexpected final response count")
        imported += len(batch)
    if imported != total:
        raise RuntimeError("Unexpected final import count")
    print("BROWARD_IMPORT_FINISHED", imported, "release", release, flush=True)
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("BROWARD_IMPORT_STOPPED", str(exc), file=sys.stderr)
        sys.exit(1)
