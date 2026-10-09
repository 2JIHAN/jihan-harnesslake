#!/usr/bin/env python3
"""Refresh the public skill mirror from AgencI; never copy memory or settings."""
import argparse
from pathlib import Path
import shutil

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,default=Path.home()/'.agenci/harness/skills')
p.add_argument('--skill',action='append',default=[],help='Explicitly include a new skill in the public mirror')
a=p.parse_args()
source=a.source.expanduser().resolve(strict=True)
mirror=Path(__file__).resolve().parent/'skills'
names=a.skill or sorted(x.name for x in mirror.iterdir() if (x/'SKILL.md').is_file())
for name in names:
 if not name or Path(name).name!=name or name in ('.','..'):
  raise SystemExit('Invalid skill name: '+name)
 if not (source/name/'SKILL.md').is_file():raise SystemExit('Missing source skill: '+name)
for name in names:
 dest=mirror/name
 if dest.is_symlink():raise SystemExit('Mirror must own its files: '+str(dest))
 shutil.copytree(source/name,dest,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.DS_Store','__pycache__'))
print('Refreshed '+str(len(names))+' public skill mirrors. Review git diff before publishing.')
