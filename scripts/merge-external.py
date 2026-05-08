#!/usr/bin/env python3
"""
Merge external Twitter/X block list sources into accounts.json.

Sources:
  - ammar-faifi/xblocker (data.json, data.txt)
  
Usage:
  python3 scripts/merge-external.py data/accounts.json
"""

import json
import re
import sys
import os
from datetime import datetime, timezone
from urllib.request import urlopen, Request

EXTERNAL_SOURCES = [
    # xblocker - list of spam/porn bot accounts on X
    # Format: array of {handle, reason} or array of strings in data.txt
    {
        "name": "ammar-faifi/xblocker",
        "urls": [
            "https://raw.githubusercontent.com/ammar-faifi/xblocker/main/data.json",
            "https://raw.githubusercontent.com/ammar-faifi/xblocker/main/data.txt",
        ],
        "source_label": "xblocker"
    },
]


def normalize_handle(handle):
    """Normalize a Twitter/X handle to @lowercase format."""
    match = re.match(r"@?([A-Za-z0-9_]{1,15})", str(handle).strip(), re.IGNORECASE)
    return f"@{match.group(1).lower()}" if match else None


def fetch_url(url):
    """Fetch a URL with timeout."""
    req = Request(url, headers={"User-Agent": "x-block-merge/1.0"})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def parse_xblocker_json(text):
    """Parse xblocker data.json format."""
    data = json.loads(text)
    accounts = []
    
    # data.json is an array of objects with handle, reason, etc.
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                handle = normalize_handle(item.get("handle") or item.get("screenName") or item.get("username") or "")
                if handle:
                    accounts.append({
                        "handle": handle,
                        "displayName": item.get("displayName", ""),
                        "reasons": [item.get("reason", "")] if item.get("reason") else [],
                        "sources": ["xblocker"],
                        "firstSeen": datetime.now(timezone.utc).isoformat(),
                        "lastSeen": datetime.now(timezone.utc).isoformat(),
                    })
            elif isinstance(item, str):
                handle = normalize_handle(item)
                if handle:
                    accounts.append({
                        "handle": handle,
                        "displayName": "",
                        "reasons": [],
                        "sources": ["xblocker"],
                        "firstSeen": datetime.now(timezone.utc).isoformat(),
                        "lastSeen": datetime.now(timezone.utc).isoformat(),
                    })
    return accounts


def parse_xblocker_txt(text):
    """Parse xblocker data.txt format (one handle per line, or JSON array)."""
    accounts = []
    text = text.strip()
    
    # Try JSON first
    try:
        data = json.loads(text)
        if isinstance(data, list):
            for item in data:
                handle = normalize_handle(str(item))
                if handle:
                    accounts.append({
                        "handle": handle,
                        "displayName": "",
                        "reasons": [],
                        "sources": ["xblocker"],
                        "firstSeen": datetime.now(timezone.utc).isoformat(),
                        "lastSeen": datetime.now(timezone.utc).isoformat(),
                    })
            return accounts
    except (json.JSONDecodeError, ValueError):
        pass
    
    # Line by line
    for line in text.split("\n"):
        line = line.strip()
        if line and not line.startswith("#"):
            # Try JSON object
            try:
                item = json.loads(line)
                if isinstance(item, dict):
                    handle = normalize_handle(item.get("handle") or item.get("screenName") or "")
                    if handle:
                        accounts.append({
                            "handle": handle,
                            "displayName": item.get("displayName", ""),
                            "reasons": [item.get("reason", "")] if item.get("reason") else [],
                            "sources": ["xblocker"],
                            "firstSeen": datetime.now(timezone.utc).isoformat(),
                            "lastSeen": datetime.now(timezone.utc).isoformat(),
                        })
                    continue
            except (json.JSONDecodeError, ValueError):
                pass
            
            handle = normalize_handle(line)
            if handle:
                accounts.append({
                    "handle": handle,
                    "displayName": "",
                    "reasons": [],
                    "sources": ["xblocker"],
                    "firstSeen": datetime.now(timezone.utc).isoformat(),
                    "lastSeen": datetime.now(timezone.utc).isoformat(),
                })
    return accounts


def merge_accounts(existing, incoming):
    """Merge incoming accounts into existing dict, deduplicating by handle."""
    for account in incoming:
        handle = account["handle"]
        if handle in existing:
            # Merge: keep earliest firstSeen, latest lastSeen
            old = existing[handle]
            old["firstSeen"] = min(old.get("firstSeen", account["firstSeen"]), account["firstSeen"])
            old["lastSeen"] = max(old.get("lastSeen", account["lastSeen"]), account["lastSeen"])
            old["reasons"] = list(set(old.get("reasons", []) + account.get("reasons", [])))
            old["sources"] = list(set(old.get("sources", []) + account.get("sources", [])))
            if account.get("displayName") and not old.get("displayName"):
                old["displayName"] = account["displayName"]
        else:
            existing[handle] = account
    return existing


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "data/accounts.json"
    
    # Load existing database
    if os.path.exists(db_path):
        with open(db_path) as f:
            db = json.load(f)
    else:
        db = {"version": 1, "updatedAt": "", "accounts": {}}
    
    # Normalize existing accounts to dict
    existing = {}
    if isinstance(db.get("accounts"), dict):
        existing = db["accounts"]
    elif isinstance(db.get("accounts"), list):
        for acc in db["accounts"]:
            existing[acc["handle"]] = acc
    
    total_added = 0
    
    for source in EXTERNAL_SOURCES:
        print(f"Fetching {source['name']}...")
        for url in source["urls"]:
            try:
                text = fetch_url(url)
                if "data.json" in url:
                    accounts = parse_xblocker_json(text)
                else:
                    accounts = parse_xblocker_txt(text)
                
                before_count = len(existing)
                existing = merge_accounts(existing, accounts)
                new_count = len(existing) - before_count
                total_added += new_count
                print(f"  {url}: {len(accounts)} found, {new_count} new")
            except Exception as e:
                print(f"  {url}: ERROR - {e}")
    
    # Convert back to sorted array
    db["accounts"] = sorted(existing.values(), key=lambda a: a["handle"])
    db["updatedAt"] = datetime.now(timezone.utc).isoformat()
    
    # Write output
    with open(db_path, "w") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
    
    print(f"\nDone! Total accounts: {len(db['accounts'])} (added {total_added})")
    print(f"Written to {db_path}")


if __name__ == "__main__":
    main()
