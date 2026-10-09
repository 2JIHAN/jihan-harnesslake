# Jihan HarnessLake

Public distribution of reusable rules, Git hooks and agent skills.
**The AgencI owns the skill sources.** This repository's `skills/` directory is a
publishable mirror, so existing `npx skills` installations continue to work without
access to the private AgencI repository. Memory, credentials and runtime settings
are never mirrored.

## Structure

```text
rules/              # Reusable behavioral rules
hooks/              # Commit-message and pre-commit guards
skills/             # Public distribution mirror of selected AgencI skills
sync-agenci.py      # Refresh already-published skills from the canonical pool
install.sh          # Prefer installed AgencI sources; otherwise use this mirror
docs/               # Rules, skills and hooks architecture
```

The canonical sources live in `the-agenci/harness/skills`. The local AgencI
installation exposes them through `~/.agenci/harness/skills`. Edit skills there,
then refresh the public mirror before publishing:

```sh
./sync-agenci.py
# Or select a different source explicitly.
./sync-agenci.py --source /path/to/the-agenci/harness/skills
```

By default, only names already published in this repository are refreshed.
New private skills are not automatically included. To publish a new skill,
select it explicitly with `--skill NAME`, review its content and `git diff`, then
commit/push the mirror. Never put secrets in a skill or its supporting resources.

## Install

```sh
# Public skills stay compatible with the standard installer.
npx skills add 2JIHAN/jihan-harnesslake --skill delegate-to-aside

# For shared memory and one canonical pool, install through AgencI instead.
agenci skills add 2JIHAN/jihan-harnesslake --skill delegate-to-aside

# Install rules, hooks and skills into a project.
./install.sh /path/to/project
./install.sh --skills --link /path/to/project
./install.sh --rules /path/to/project
./install.sh --hooks /path/to/project
```

`install.sh` uses `~/.agenci/harness/skills` when available; set
`AGENCI_SKILLS_DIR` to choose another canonical pool. Without AgencI, the checked-in
public mirror is used. `--link` links to the chosen source, so a disposable
HarnessLake checkout is not needed when using installed AgencI sources.

## Skills

The [catalog](skills/INDEX.md) lists the published skills and their triggers:
Aside browser delegation, domain modeling, graph artifacts, planning interviews,
minimal implementation/review/audit/debt, systematic debugging and Korean writing.
Supporting scripts and references are shipped with each skill.

For Aside scripts:

```sh
cd ~/.agenci/harness/skills/delegate-to-aside/scripts
node 00-check-model.mjs u1
node 01-ensure-window.mjs u1
node 02-open-session.mjs 'Task Name' u1 'URL'
node 03-say.mjs 'Instruction' u1
```

Rules and hooks retain their existing [architecture](docs/index.md).
