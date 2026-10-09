#!/usr/bin/env python3
"""Idempotently add staging ingress to a production compose file; never alter API/DB."""
import pathlib, sys
p = pathlib.Path(sys.argv[1])
s = p.read_text()
if len(sys.argv) > 2 and sys.argv[2] == '--remove':
    s = s.replace('      staging_ingress: {ipv4_address: 172.30.51.3}\n', '')
    s = s.replace('\n  staging_ingress:\n    name: symbols_staging_frontend\n    external: true\n', '')
    p.write_text(s)
    print('Staging ingress removed from production compose')
    sys.exit(0)
if 'symbols_staging_frontend' in s:
    assert 'staging_ingress: {ipv4_address: 172.30.51.3}' in s
    print('Staging ingress already declared')
else:
    anchor = '      frontend: {ipv4_address: 172.30.41.3}\n'
    assert s.count(anchor) == 1, 'Unexpected Caddy networks; inspect manually'
    s = s.replace(anchor, anchor + '      staging_ingress: {ipv4_address: 172.30.51.3}\n')
    s += '\n  staging_ingress:\n    name: symbols_staging_frontend\n    external: true\n'
    p.write_text(s)
    print('Staging ingress declared in production compose')
