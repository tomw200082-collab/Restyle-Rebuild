# actionlint — recorded run

shellcheck 0.9.0 enabled; pyflakes absent (no Python steps in these workflows).

Re-run after `drift-weekly.yml` grew a multi-line `run:` block — the one place
in these workflows where shellcheck has real shell to read. [D-92]

```
$ actionlint -version
1.7.12

$ actionlint -verbose
verbose: Found total 0 errors in 0 ms for .github/workflows/claude.yml
verbose: Found total 0 errors in 889 ms for .github/workflows/ci.yml
verbose: Found total 0 errors in 862 ms for .github/workflows/drift-weekly.yml
verbose: Found total 0 errors in 888 ms for .github/workflows/release-gate.yml
verbose: Found 0 errors in 4 files
exit 0
```

## Proof the linter detects real errors

A deliberately broken workflow, fed on stdin:

```
<stdin>:5:14: label "ubuntu-lates" is unknown. available labels are …
  |
5 |     runs-on: ubuntu-lates
  |              ^~~~~~~~~~~~
<stdin>:7:24: property "nope" is not defined in object type {action: string; action_path: string; action_ref: string; action_repository: string; action_status: string; actor: string; actor_id: string; api_url: string; artifact_cache_size_limit: number; base_ref: string; env: string; event: object; event_name: string; event_path: string; graphql_url: string; head_ref: string; job: string; output: string; path: string; ref: string; ref_name: string; ref_protected: bool; ref_type: string; repository: string; repository_id: string; repository_owner: string; repository_owner_id: string; repository_visibility: string; repositoryurl: string; retention_days: number; run_attempt: string; run_id: string; run_number: string; secret_source: string; server_url: string; sha: string; state: string; step_summary: string; token: string; triggering_actor: string; workflow: string; workflow_ref: string; workflow_sha: string; workspace: string} [expression]
  |
7 |       - run: echo "${{ github.nope }}"
  |                        ^~~~~~~~~~~
exit 1
```

---

Re-run after `tag-release.yml` was added — the workflow with the most real shell
in the repository, so the shellcheck rule is the point of this run rather than a
formality. Recorded with the rule's state explicitly, because actionlint
*disables* shellcheck with a `verbose:` line and still exits 0 when the binary
is missing: a clean exit with the relevant rule switched off is the silent green
this project keeps finding. [D-71]

```
$ actionlint -version
1.7.7

$ shellcheck --version | head -2
ShellCheck - shell script analysis tool
version: 0.9.0

$ actionlint -verbose 2>&1 | grep -c 'Rule "shellcheck" was disabled'
0

$ actionlint -verbose
verbose: Found total 0 errors in 33 ms for .github/workflows/drift-weekly.yml
verbose: Found total 0 errors in 50 ms for .github/workflows/release-gate.yml
verbose: Found total 0 errors in 59 ms for .github/workflows/tag-release.yml
verbose: Found total 0 errors in 86 ms for .github/workflows/ci.yml
verbose: Found 0 errors in 5 files
exit 0
```
